/**
 * Messaging slice against PGlite + RLS (§6.6 FR-80–FR-87, §6.10, FR-L2, N-5, LB-7).
 * Texts go to the console provider and are logged in outbound_messages (the throttle's source).
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  asService,
  expenses,
  expenseShares,
  ideas,
  ideaSources,
  memberContacts,
  members,
  notificationKeys,
  outboundMessages,
  pollOptions,
  polls,
  pollVotes,
  savedIdeas,
  shareCards,
  smsOpenQuestions,
  trips,
  users,
  votes,
  withSession,
  setDbForTests,
  type Db,
} from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import type { ResolvedIdea, resolveIdea } from "@wandr/ai";
import { handleInboundSms } from "@/lib/messaging/inbound";
import { createTrip } from "../trips";
import {
  runDailyDigest,
  runPollClosingNudges,
  runPollShareFallbacks,
  sendExpenseTexts,
  sendVoteQuestions,
} from "../notify";
import { createShare, getPublicShare, groupLinkFor, shareMoments } from "../share";
import { regenerateGroupLink } from "../membership";
import { handleTextedIdea, handleTextedReceipt, moveIdeaToLibrary, resolveSavedIdeaJob } from "../text-intake";

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

const sent = (d: Db) => asService(d, (tx) => tx.select().from(outboundMessages));

describe("vote questions for new ideas (FR-82/83/84)", () => {
  it("texts the other duo member a vote question, and a reply of 1 votes", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    const ideaId = await addIdea(d, t.tripId, t.ids.nick!, "Time Out Market");
    const r = await sendVoteQuestions(d, ideaId);
    expect(r.texted).toEqual([t.ids.sam]); // not the creator
    const msgs = await sent(d);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.body).toContain("Reply 1 Must-do, 2 Down, 3 Pass");
    expect(msgs[0]!.body).toContain("/l/[redacted]"); // personal link, never stored live (FR-81)

    const reply = await handleInboundSms({ from: PHONES.sam, body: "1", mediaUrls: [] });
    expect(reply).toContain("Must-do for Time Out Market");
    const [v] = await asService(d, (tx) => tx.select().from(votes).where(eq(votes.ideaId, ideaId)));
    expect(v).toMatchObject({ memberId: t.ids.sam, value: "must" });
  });

  it("holds one open question per person and the 1/day throttle", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    const a = await addIdea(d, t.tripId, t.ids.nick!, "Time Out Market");
    const b = await addIdea(d, t.tripId, t.ids.nick!, "Pasteis de Belem");
    expect((await sendVoteQuestions(d, a)).texted).toHaveLength(1);
    expect((await sendVoteQuestions(d, b)).texted).toHaveLength(0); // question still open
    // Answer the first; the second still can't go out today (1 text/person/day) and leaves no
    // dangling question that a later "1" could hit.
    await handleInboundSms({ from: PHONES.sam, body: "2", mediaUrls: [] });
    expect((await sendVoteQuestions(d, b)).texted).toHaveLength(0);
    const open = await asService(d, (tx) => tx.select().from(smsOpenQuestions));
    expect(open).toHaveLength(0);
    expect((await sent(d)).filter((m) => m.kind === "vote_question")).toHaveLength(1);
  });

  it("never texts someone a surprise idea is hidden from, and nothing in solo trips", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    const ideaId = await addIdea(d, t.tripId, t.ids.nick!, "Surprise dinner", { hiddenFrom: [t.ids.sam!] });
    expect((await sendVoteQuestions(d, ideaId)).texted).toEqual([t.ids.ana]);

    const d2 = await db();
    const s2 = await trip(d2, []);
    expect((await sendVoteQuestions(d2, await addIdea(d2, s2.tripId, s2.ids.nick!, "x"))).texted).toEqual([]);
  });
});

async function addPoll(
  d: Db,
  tripId: string,
  by: string,
  opts: { closesAt?: Date | null; createdAt?: Date; hiddenFrom?: string[] } = {},
) {
  return asService(d, async (tx) => {
    const [p] = await tx
      .insert(polls)
      .values({
        tripId,
        kind: "custom",
        question: "Saturday dinner",
        closesAt: opts.closesAt ?? null,
        createdByMemberId: by,
        hiddenFrom: opts.hiddenFrom ?? [],
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      })
      .returning({ id: polls.id });
    const opts2 = await tx
      .insert(pollOptions)
      .values([
        { pollId: p!.id, label: "Taberna", position: 0 },
        { pollId: p!.id, label: "Ramiro", position: 1 },
      ])
      .returning({ id: pollOptions.id });
    return { pollId: p!.id, options: opts2.map((o) => o.id) };
  });
}

describe("polls (FR-47, FR-80, FR-80c, N-5)", () => {
  it("nudges only non-voters, once, time-sensitive; nudge records stay service-only (FR-42)", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    const now = new Date();
    const p = await addPoll(d, t.tripId, t.ids.nick!, { closesAt: new Date(now.getTime() + 2 * 3_600_000) });
    await asService(d, (tx) =>
      tx.insert(pollVotes).values({ pollId: p.pollId, memberId: t.ids.sam!, optionId: p.options[0]!, tripId: t.tripId, castInSize: "group" }),
    );
    expect((await runPollClosingNudges(d, now)).texted).toBe(2); // Nick (owner, no vote) + Ana
    expect((await runPollClosingNudges(d, now)).texted).toBe(0); // no duplicates
    const msgs = (await sent(d)).filter((m) => m.kind === "poll_closing");
    expect(msgs.every((m) => m.timeSensitive)).toBe(true);
    expect(msgs.map((m) => m.toAddress).sort()).toEqual([PHONES.nick, PHONES.ana].sort());

    // Organizers can't read who was nudged (it would reveal non-voters).
    await expect(withSession(d, { sub: t.nick }, (tx) => tx.select().from(notificationKeys))).rejects.toThrow();
    await expect(withSession(d, { sub: t.nick }, (tx) => tx.select().from(shareCards))).rejects.toThrow();
  });

  it("falls back to personal texts when a poll isn't shared within ~12h (FR-80c)", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    const now = new Date();
    const old = await addPoll(d, t.tripId, t.ids.nick!, { createdAt: new Date(now.getTime() - 13 * 3_600_000) });
    const shared = await addPoll(d, t.tripId, t.ids.nick!, { createdAt: new Date(now.getTime() - 13 * 3_600_000) });
    const r = await createShare(d, { sub: t.nick }, { tripId: t.tripId, kind: "poll", subjectId: shared.pollId });
    expect(r.ok).toBe(true);
    const out = await runPollShareFallbacks(d, now);
    expect(out.texted).toBe(2); // Sam + Ana for the unshared poll; creator excluded
    const keys = await asService(d, (tx) => tx.select().from(notificationKeys));
    expect(keys.every((k) => k.key.startsWith(`poll_fallback:${old.pollId}:`))).toBe(true);
  });

  it("surprise polls go by personal text right away, never to the hidden person (FR-80d)", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    await addPoll(d, t.tripId, t.ids.nick!, { hiddenFrom: [t.ids.sam!] });
    await runPollShareFallbacks(d, new Date());
    const to = (await sent(d)).map((m) => m.toAddress);
    expect(to).toEqual([PHONES.ana]);
    // ...and can't be shared to the group chat.
    const polls2 = await asService(d, (tx) => tx.select().from(polls));
    const r = await createShare(d, { sub: t.nick }, { tripId: t.tripId, kind: "poll", subjectId: polls2[0]!.id });
    expect(r).toEqual({ ok: false, error: "surprise" });
  });
});

describe("daily digest (D43, §6.10)", () => {
  it("groups only, new ideas only, no surprise items; emails verified members once", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    await addIdea(d, t.tripId, t.ids.sam!, "Time Out Market");
    await addIdea(d, t.tripId, t.ids.nick!, "Secret party boat", { hiddenFrom: [t.ids.ana!] });
    const now = new Date();
    expect((await runDailyDigest(d, now)).trips).toEqual([t.tripId]);
    expect((await runDailyDigest(d, now)).trips).toEqual([]); // once per day
    const [card] = await asService(d, (tx) => tx.select().from(shareCards));
    expect(card!.snapshot).toMatchObject({ kind: "digest", count: 1, titles: ["Time Out Market"] });
    expect(JSON.stringify(card!.snapshot)).not.toContain("Secret");
    const emails = (await sent(d)).filter((m) => m.kind === "digest");
    expect(emails.map((m) => [m.channel, m.toAddress])).toEqual([["email", "nick@example.com"]]);
    // Organizer sees the prompt.
    const m = await shareMoments(d, { sub: t.nick }, t.tripId);
    expect(m!.prompts.map((p) => p.kind)).toContain("digest");
  });

  it("duo trips get no digest by default", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    await addIdea(d, t.tripId, t.ids.sam!, "Time Out Market");
    expect((await runDailyDigest(d)).trips).toEqual([]);
  });
});

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

describe("you owe / are owed (FR-80)", () => {
  async function expense(d: Db, tripId: string, payer: string, shares: [string, number][], hiddenFrom: string[] = []) {
    return asService(d, async (tx) => {
      const total = shares.reduce((s, [, v]) => s + v, 0);
      const [e] = await tx
        .insert(expenses)
        .values({ tripId, merchant: "Taberna", currency: "EUR", totalMinor: total, paidByMemberId: payer, uploadedByMemberId: payer, hiddenFrom })
        .returning({ id: expenses.id });
      await tx.insert(expenseShares).values(shares.map(([memberId, shareMinor]) => ({ expenseId: e!.id, memberId, shareMinor })));
      return e!.id;
    });
  }

  it("texts the other person their direction, never amounts, naming the duo partner", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    const id = await expense(d, t.tripId, t.ids.nick!, [[t.ids.nick!, 5000], [t.ids.sam!, 5000]]);
    expect((await sendExpenseTexts(d, t.tripId, id)).texted).toEqual([t.ids.sam]);
    const [m] = await sent(d);
    expect(m!.body).toContain("Now you owe Nick.");
    expect(m!.body).not.toMatch(/50|5000|€/);
  });

  it("never texts a member an expense is hidden from (FR-91)", async () => {
    const d = await db();
    const t = await trip(d, ["sam", "ana"]);
    const id = await expense(d, t.tripId, t.ids.nick!, [[t.ids.nick!, 3000], [t.ids.ana!, 3000]], [t.ids.sam!]);
    expect((await sendExpenseTexts(d, t.tripId, id)).texted).toEqual([t.ids.ana]);
  });
});

function fakeResolver(): typeof resolveIdea {
  return (async () =>
    ({
      state: "resolved",
      kind: "place",
      source: { kind: "tiktok", url: "https://www.tiktok.com/@a/video/9", normalizedUrl: "https://www.tiktok.com/@a/video/9", caption: null, title: null, thumbnailUrl: null, creatorHandle: "@a", fetchStatus: "ok" },
      places: [],
      primary: { name: "Time Out Market", category: "food", summary: "Food hall", cityHint: "Lisbon", country: "PT", regionOrCity: "Lisbon", placeId: "p1", display: null, location: null, priceLevel: 2, permanentlyClosed: false },
      confidence: 0.9,
      needsReview: false,
      isNonPlaceReason: null,
      fromCache: false,
    }) as unknown as ResolvedIdea) as unknown as typeof resolveIdea;
}

describe("texted-in links and receipts (FR-82/83, FR-L2, LB-7)", () => {
  it("files a texted link into the most recently active trip with a move link", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    const out = await handleTextedIdea(d, PHONES.nick, "https://www.tiktok.com/@a/video/9");
    expect(out.reply).toMatch(/^Saved to Lisbon\. .*\/move\//);
    expect(out.job?.name).toBe("wandr/idea.added");
    const rows = await asService(d, (tx) => tx.select().from(ideas).where(eq(ideas.tripId, t.tripId)));
    expect(rows[0]).toMatchObject({ extraction: "processing", createdByMemberId: t.ids.nick });

    // A link-only guest gets their personal link instead of a move link.
    const g = await handleTextedIdea(d, PHONES.sam, "https://www.tiktok.com/@a/video/10");
    expect(g.reply).toContain("/l/");
  });

  it("with no active trip, saves to the library and auto-sorts it", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    await asService(d, (tx) =>
      tx.update(trips).set({ lastActivityAt: sql`now() - interval '30 days'` }).where(eq(trips.id, t.tripId)),
    );
    const out = await handleTextedIdea(d, PHONES.nick, "https://www.tiktok.com/@a/video/9");
    expect(out.reply).toMatch(/^Saved to your library\..*\/move\/saved\//);
    const [save] = await asService(d, (tx) => tx.select().from(savedIdeas));
    expect(save).toMatchObject({ userId: t.nick, extraction: "processing" });
    await resolveSavedIdeaJob(d, save!.id, { resolver: fakeResolver() });
    const [after] = await asService(d, (tx) => tx.select().from(savedIdeas));
    expect(after).toMatchObject({ title: "Time Out Market", country: "PT", regionOrCity: "Lisbon", extraction: "resolved" });

    // Unknown number with no account: a plain reply, nothing saved.
    const u = await handleTextedIdea(d, "+12025550199", "https://www.tiktok.com/@a/video/9");
    expect(u.job).toBeNull();
  });

  it("moving to the library is refused once others voted (no silent vote loss)", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    const ideaId = await addIdea(d, t.tripId, t.ids.nick!, "Time Out Market");
    await asService(d, (tx) =>
      tx.insert(votes).values({ ideaId, memberId: t.ids.sam!, tripId: t.tripId, value: "must", castInSize: "duo" }),
    );
    expect(await moveIdeaToLibrary(d, t.nick, ideaId)).toEqual({ ok: false, error: "has_votes" });
    await asService(d, (tx) => tx.delete(votes).where(and(eq(votes.ideaId, ideaId))));
    const r = await moveIdeaToLibrary(d, t.nick, ideaId);
    expect(r.ok).toBe(true);
    expect(await asService(d, (tx) => tx.select().from(ideas))).toHaveLength(0);
    expect(await moveIdeaToLibrary(d, randomUUID(), ideaId)).toEqual({ ok: false, error: "not_found" });
  });

  it("stores a texted receipt and hands a draft to the expenses slice", async () => {
    const d = await db();
    const t = await trip(d, ["sam"]);
    const drafts: unknown[] = [];
    const r = await handleTextedReceipt(d, PHONES.sam, ["https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1"], {
      fetchMedia: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }),
      store: async (tripId) => `receipts/${tripId}/x.jpg`,
      onDraft: async (draft) => void drafts.push(draft),
    });
    expect(r.reply).toMatch(/^Got your receipt for Lisbon\. Tap to split it: .*\/l\//);
    expect(drafts).toEqual([expect.objectContaining({ tripId: t.tripId, memberId: t.ids.sam, storagePath: `receipts/${t.tripId}/x.jpg` })]);
  });
});
