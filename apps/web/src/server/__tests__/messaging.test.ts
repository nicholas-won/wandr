/**
 * Messaging against PGlite + RLS (§6.6 as revised by D65): share cards, and an inbound number that
 * only honors STOP/START/HELP/WRONG.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  asService,
  ideas,
  ideaSources,
  memberContacts,
  members,
  savedIdeas,
  trips,
  users,
  votes,
  setDbForTests,
  type Db,
} from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { handleInboundSms } from "@/lib/messaging/inbound";
import { createTrip } from "../trips";
import { createShare, getPublicShare, groupLinkFor, shareMoments } from "../share";
import { regenerateGroupLink } from "../membership";

const PHONES = { nick: "+12025550101", sam: "+12025550102", ana: "+12025550103", ben: "+12025550104" };

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function db() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  setDbForTests(d);
  return d;
}

/** Owner Nick (verified, with email) + link-only guests (phone on the invite list). */
async function trip(d: Db, guests: string[], opts: { name?: string } = {}) {
  const nick = randomUUID();
  await asService(d, (tx) =>
    tx.insert(users).values({ id: nick, displayName: "Nick", phone: PHONES.nick, email: "nick@example.com" }),
  );
  const t = await createTrip(d, { userId: nick, ownerName: "Nick", name: opts.name ?? "Lisbon", city: "Lisbon" });
  const ids: Record<string, string> = { nick: t.memberId };
  for (const g of guests) {
    ids[g] = await asService(d, async (tx) => {
      const [m] = await tx
        .insert(members)
        .values({ tripId: t.tripId, displayName: g[0]!.toUpperCase() + g.slice(1), status: "active", joinedAt: new Date() })
        .returning({ id: members.id });
      await tx.insert(memberContacts).values({ memberId: m!.id, phone: PHONES[g as keyof typeof PHONES] });
      return m!.id;
    });
  }
  return { ...t, nick, ids };
}

async function addIdea(d: Db, tripId: string, by: string, title: string, extra: Partial<typeof ideas.$inferInsert> = {}) {
  return asService(d, async (tx) => {
    const [i] = await tx
      .insert(ideas)
      .values({ tripId, title, category: "food", extraction: "resolved", confidence: 0.9, createdByMemberId: by, ...extra })
      .returning({ id: ideas.id });
    await tx.insert(ideaSources).values({ ideaId: i!.id, kind: "tiktok", url: "https://www.tiktok.com/@x/video/1", sharedByMemberId: by });
    return i!.id;
  });
}

describe("share cards (FR-80a/b/d/e)", () => {
  it("freezes a group-safe snapshot and hides it if the idea later becomes a surprise", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    const ideaId = await addIdea(d, t.tripId, t.ids.nick!, "Time Out Market");
    await asService(d, (tx) =>
      tx.insert(votes).values({ ideaId, memberId: t.ids.sam!, tripId: t.tripId, value: "pass", castInSize: "group" }),
    );
    // A personal-link guest can share too (view-level action).
    const r = await createShare(d, { link_member: t.ids.ana! }, { tripId: t.tripId, kind: "idea", subjectId: ideaId });
    if (!r.ok) throw new Error(r.error);
    expect(r.message).toContain("Tap to vote");
    const pub = await getPublicShare(d, "idea", r.shareId);
    const json = JSON.stringify(pub!.snapshot);
    for (const leak of ["pass", "Pass", PHONES.sam, "Sam", "Ana"]) expect(json).not.toContain(leak);

    await asService(d, (tx) => tx.update(ideas).set({ hiddenFrom: [t.ids.ana!] }).where(eq(ideas.id, ideaId)));
    expect(await getPublicShare(d, "idea", r.shareId)).toBeNull();
    expect(await getPublicShare(d, "poll", r.shareId)).toBeNull(); // kind must match
  });

  it("strangers and hidden members can't create shares", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    const ideaId = await addIdea(d, t.tripId, t.ids.nick!, "Surprise", { hiddenFrom: [t.ids.sam!] });
    expect((await createShare(d, { sub: randomUUID() }, { tripId: t.tripId, kind: "idea", subjectId: ideaId })).ok).toBe(false);
    expect(await createShare(d, { link_member: t.ids.sam! }, { tripId: t.tripId, kind: "idea", subjectId: ideaId })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await createShare(d, { sub: t.nick }, { tripId: t.tripId, kind: "idea", subjectId: ideaId })).toEqual({
      ok: false,
      error: "surprise",
    });
  });

  it("Tap to vote routes outsiders through the live group link (FR-80b), not when invite-list only", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    expect(await groupLinkFor(d, t.tripId)).toBeNull();
    const url = await regenerateGroupLink(d, t.nick, t.tripId);
    expect(await groupLinkFor(d, t.tripId)).toBe(url);
    await asService(d, (tx) => tx.update(trips).set({ inviteListOnly: true }).where(eq(trips.id, t.tripId)));
    expect(await groupLinkFor(d, t.tripId)).toBeNull();
  });

  it("duo prompts read 'Send to Sam'; solo has none", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    expect((await shareMoments(d, { sub: t.nick }, t.tripId))!.label).toBe("Send to Sam");
    const d2 = await db();
    const s = await trip(d2, []);
    expect(await shareMoments(d2, { sub: s.nick }, s.tripId)).toBeNull();
  });
});


describe("inbound texts after D65", () => {
  it("doesn't vote, approve or file links by text; points people to the app; STOP still works", async () => {
    const d = await db();
    const nick = randomUUID();
    await asService(d, (tx) => tx.insert(users).values({ id: nick, displayName: "Nick", phone: PHONES.nick }));
    const t = await createTrip(d, { userId: nick, ownerName: "Nick", name: "Lisbon", city: "Lisbon" });
    await asService(d, (tx) => tx.insert(ideas).values({ tripId: t.tripId, title: "Bar", extraction: "resolved" }));

    for (const body of ["1", "Y", "https://www.tiktok.com/@x/video/1", "UNDO"]) {
      const reply = await handleInboundSms({ from: PHONES.nick, body, mediaUrls: [] });
      expect(reply).toMatch(/only sends invites and sign-in codes/);
    }
    expect(await asService(d, (tx) => tx.select().from(votes))).toEqual([]);
    expect(await asService(d, (tx) => tx.select().from(savedIdeas))).toEqual([]);

    expect(await handleInboundSms({ from: PHONES.nick, body: "STOP", mediaUrls: [] })).toMatch(/unsubscribed/);
    expect(await handleInboundSms({ from: PHONES.nick, body: "HELP", mediaUrls: [] })).toMatch(/invites and sign-in codes/);
  });
});
