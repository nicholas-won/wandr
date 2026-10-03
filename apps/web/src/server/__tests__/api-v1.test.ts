/**
 * The native app's JSON API (/api/v1, D75): route handlers called directly with Request objects,
 * against PGlite + RLS. Background jobs are captured instead of run (no request scope here).
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { endpoints } from "@wandr/api-contract";
import { asService, ideas, members, pollVotes, pollOptions, polls, pushLog, pushTokens, setDbForTests, users, votes, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";

const enqueued: { name: string; data: Record<string, unknown> }[] = [];
vi.mock("@/server/jobs", () => ({
  enqueue: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
    enqueued.push(e);
  }),
}));

import { POST as requestCodeRoute } from "@/app/api/v1/auth/code/route";
import { POST as verifyRoute } from "@/app/api/v1/auth/verify/route";
import { POST as signOutRoute } from "@/app/api/v1/auth/sign-out/route";
import { GET as meRoute } from "@/app/api/v1/me/route";
import { POST as setNameRoute } from "@/app/api/v1/me/name/route";
import { POST as createTripRoute } from "@/app/api/v1/trips/route";
import { GET as tripRoute } from "@/app/api/v1/trips/[tripId]/route";
import { POST as addIdeaRoute } from "@/app/api/v1/trips/[tripId]/ideas/route";
import { POST as voteRoute } from "@/app/api/v1/trips/[tripId]/ideas/[ideaId]/vote/route";
import { POST as inviteRoute } from "@/app/api/v1/trips/[tripId]/invites/route";
import { GET as libraryRoute } from "@/app/api/v1/library/route";
import { POST as saveRoute } from "@/app/api/v1/library/saves/route";
import { POST as shareRoute } from "@/app/api/v1/share/route";
import { POST as pushRoute } from "@/app/api/v1/push/route";
import { issueApiToken } from "@/lib/auth/bearer";
import { balanceLine, notifyIdeaAdded, notifyPollsClosingSoon, PUSH_DAILY_CAP_PER_TRIP, sendPush, setPushSenderForTests, type ExpoMessage, type PushSender } from "../push";
import { setBachMode, setGuestOfHonor, setIdeaHiddenFrom } from "../surprise";
import { createTrip } from "../trips";

const BASE = "http://localhost:3000";

function req(method: string, path: string, opts: { token?: string | null; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as any;

async function json(res: Response) {
  expect(res.headers.get("cache-control")).toBe("no-store");
  return res.json();
}

/** A group trip: Ana (owner), Bea, Cy, each with an app token; one idea. */
async function setup() {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  setDbForTests(d);
  const u = { ana: randomUUID(), bea: randomUUID(), cy: randomUUID(), out: randomUUID() };
  await asService(d, (tx) =>
    tx.insert(users).values([
      { id: u.ana, displayName: "Ana", phone: "+12025550111" },
      { id: u.bea, displayName: "Bea", phone: "+12025550112" },
      { id: u.cy, displayName: "Cy", phone: "+12025550113" },
      { id: u.out, displayName: "Outsider", phone: "+12025550114" },
    ]),
  );
  const t = await createTrip(d, { userId: u.ana, ownerName: "Ana", name: "Bea's bach", city: "Nashville" });
  const ids = await asService(d, async (tx) => {
    const [bea, cy] = await tx
      .insert(members)
      .values([
        { tripId: t.tripId, userId: u.bea, displayName: "Bea", status: "active", joinedAt: new Date() },
        { tripId: t.tripId, userId: u.cy, displayName: "Cy", status: "active", joinedAt: new Date() },
      ])
      .returning({ id: members.id });
    const [idea] = await tx
      .insert(ideas)
      .values({ tripId: t.tripId, stopId: t.stopId, title: "Honky-tonk crawl", category: "nightlife", extraction: "resolved", confidence: 0.9, createdByMemberId: t.memberId })
      .returning({ id: ideas.id });
    return { bea: bea!.id, cy: cy!.id, ideaId: idea!.id };
  });
  const tok = {
    ana: await issueApiToken({ userId: u.ana, needsRecheck: false }),
    bea: await issueApiToken({ userId: u.bea, needsRecheck: false }),
    cy: await issueApiToken({ userId: u.cy, needsRecheck: false }),
    out: await issueApiToken({ userId: u.out, needsRecheck: false }),
  };
  return { d, u, tok, ...t, ...ids };
}

const sent: ExpoMessage[][] = [];
const fakeSender: PushSender = {
  async send(messages) {
    sent.push(messages);
    return messages.map(() => ({ status: "ok" as const }));
  },
};

beforeEach(() => {
  enqueued.length = 0;
  sent.length = 0;
  setPushSenderForTests(fakeSender);
});
afterEach(() => setPushSenderForTests(null));

describe("auth (bearer tokens)", () => {
  it("signs up end to end in test mode: code → verify → name → me", async () => {
    const { db } = await createPglite();
    setDbForTests(db as unknown as Db);

    const codeRes = await requestCodeRoute(req("POST", "/api/v1/auth/code", { body: { channel: "sms", destination: "(202) 555-0177" } }));
    expect(codeRes.status).toBe(200);
    const code = endpoints.requestCode.response.parse(await json(codeRes));
    expect(code.testMode).toBe(true);
    expect(code.display).toContain("0177");
    expect(code.display).not.toContain("202555"); // masked

    const wrong = await verifyRoute(req("POST", "/api/v1/auth/verify", { body: { challenge: code.challenge, code: "123456" } }));
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error).toBe("wrong_code");

    const ok = await verifyRoute(req("POST", "/api/v1/auth/verify", { body: { challenge: code.challenge, code: "000000" } }));
    expect(ok.status).toBe(200);
    const v = endpoints.verifyCode.response.parse(await json(ok));
    expect(v.me.needsName).toBe(true);
    expect(v.me.phone).toBe("•••• 0177");

    // A challenge works once.
    const replay = await verifyRoute(req("POST", "/api/v1/auth/verify", { body: { challenge: code.challenge, code: "000000" } }));
    expect(replay.status).toBe(400);

    const named = await setNameRoute(req("POST", "/api/v1/me/name", { token: v.token, body: { name: "Nick" } }));
    expect(endpoints.setName.response.parse(await json(named)).me).toMatchObject({ name: "Nick", needsName: false });

    const created = await createTripRoute(req("POST", "/api/v1/trips", { token: v.token, body: { destinations: ["Lisbon"] } }));
    expect(created.status).toBe(201);
    const { tripId } = endpoints.createTrip.response.parse(await json(created));

    const me = endpoints.me.response.parse(await json(await meRoute(req("GET", "/api/v1/me", { token: v.token }))));
    expect(me.me.name).toBe("Nick");
    expect(me.trips).toEqual([{ id: tripId, name: "Lisbon trip", size: "solo" }]);
    expect(me.savedCount).toBe(0);

    const out = await signOutRoute(req("POST", "/api/v1/auth/sign-out", { token: v.token, body: {} }));
    expect(await json(out)).toEqual({ ok: true });
  });

  it("locks a challenge after 5 wrong codes", async () => {
    const { db } = await createPglite();
    setDbForTests(db as unknown as Db);
    const code = await json(await requestCodeRoute(req("POST", "/api/v1/auth/code", { body: { channel: "email", destination: "sam@example.com" } })));
    let last: Response | null = null;
    for (let i = 0; i < 5; i++) {
      last = await verifyRoute(req("POST", "/api/v1/auth/verify", { body: { challenge: code.challenge, code: "111111" } }));
    }
    expect(last!.status).toBe(429);
    const after = await verifyRoute(req("POST", "/api/v1/auth/verify", { body: { challenge: code.challenge, code: "000000" } }));
    expect(after.status).toBe(429);
  });

  it("rejects bad input with 400", async () => {
    const r1 = await requestCodeRoute(req("POST", "/api/v1/auth/code", { body: { channel: "fax", destination: "x" } }));
    expect(r1.status).toBe(400);
    expect(await json(r1)).toMatchObject({ error: "bad_request" });
    const r2 = await requestCodeRoute(req("POST", "/api/v1/auth/code", { body: { channel: "sms", destination: "+44 20 7946 0958" } }));
    expect((await json(r2)).error).toBe("use_email"); // FR-14
  });

  it("401 without a token, with a junk token, or with a sign-in challenge as the token", async () => {
    const s = await setup();
    for (const token of [null, "not-a-real-token-at-all-xxxxxxxx"]) {
      const res = await meRoute(req("GET", "/api/v1/me", { token }));
      expect(res.status).toBe(401);
      expect(await json(res)).toMatchObject({ error: "unauthorized" });
    }
    const code = await json(await requestCodeRoute(req("POST", "/api/v1/auth/code", { body: { channel: "sms", destination: "2025550188" } })));
    expect((await tripRoute(req("GET", `/api/v1/trips/${s.tripId}`, { token: code.challenge }), ctx({ tripId: s.tripId }))).status).toBe(401);
    expect((await voteRoute(req("POST", "/x", { body: { value: "must" } }), ctx({ tripId: s.tripId, ideaId: s.ideaId }))).status).toBe(401);
  });
});

describe("trips", () => {
  it("reads as the caller: blind voting, no Pass names, surprises hidden, outsiders 404", async () => {
    const s = await setup();
    const trip = (token: string) => tripRoute(req("GET", `/api/v1/trips/${s.tripId}`, { token }), ctx({ tripId: s.tripId }));

    // Ana passes; Bea hasn't voted yet, so the tally stays blind for her (FR-41).
    await voteRoute(req("POST", "/x", { token: s.tok.ana, body: { value: "pass" } }), ctx({ tripId: s.tripId, ideaId: s.ideaId }));
    let bea = endpoints.trip.response.parse(await json(await trip(s.tok.bea)));
    expect(bea.size).toBe("group");
    expect(bea.ideas[0]!.tallyLabel).toBeNull();
    expect(bea.ideas[0]!.myVote).toBeNull();

    const voted = await voteRoute(req("POST", "/x", { token: s.tok.bea, body: { value: "must" } }), ctx({ tripId: s.tripId, ideaId: s.ideaId }));
    expect(await json(voted)).toEqual({ ok: true });
    bea = endpoints.trip.response.parse(await json(await trip(s.tok.bea)));
    expect(bea.ideas[0]!.myVote).toBe("must");
    // FR-42: Ana's Pass is never shown by name to anyone else.
    expect(bea.ideas[0]!.namedVotes.some((v) => v.name === "Ana" && /pass/i.test(v.label))).toBe(false);
    expect(JSON.stringify(bea)).not.toContain("+1202"); // no phone numbers anywhere

    // Surprise: hidden from Bea (guest of honor) → doesn't exist for her; Ana sees who it's hidden from.
    await setBachMode(s.d, { sub: s.u.ana }, { tripId: s.tripId, on: true });
    await setGuestOfHonor(s.d, { sub: s.u.ana }, { tripId: s.tripId, memberId: s.bea, on: true });
    const [secret] = await asService(s.d, (tx) =>
      tx.insert(ideas).values({ tripId: s.tripId, title: "Surprise limo", extraction: "resolved", createdByMemberId: s.memberId }).returning({ id: ideas.id }),
    );
    await setIdeaHiddenFrom(s.d, { sub: s.u.ana }, { ideaId: secret!.id, memberIds: [s.bea] });
    bea = endpoints.trip.response.parse(await json(await trip(s.tok.bea)));
    expect(bea.ideas.map((i) => i.title)).toEqual(["Honky-tonk crawl"]);
    expect(JSON.stringify(bea)).not.toContain("Surprise limo");
    const ana = endpoints.trip.response.parse(await json(await trip(s.tok.ana)));
    expect(ana.ideas.find((i) => i.id === secret!.id)!.hiddenFromNames).toEqual(["Bea"]);
    expect(ana.webUrl).toMatch(new RegExp(`/t/${s.tripId}$`));

    // Bea can't vote on what she can't see.
    const hiddenVote = await voteRoute(req("POST", "/x", { token: s.tok.bea, body: { value: "must" } }), ctx({ tripId: s.tripId, ideaId: secret!.id }));
    expect(hiddenVote.status).toBe(404);

    expect((await trip(s.tok.out)).status).toBe(404);
    expect((await tripRoute(req("GET", "/x", { token: s.tok.ana }), ctx({ tripId: "nope" }))).status).toBe(404);
  });

  it("votes: change, clear, validate", async () => {
    const s = await setup();
    const vote = (value: unknown) => voteRoute(req("POST", "/x", { token: s.tok.cy, body: { value } }), ctx({ tripId: s.tripId, ideaId: s.ideaId }));
    expect((await vote("down")).status).toBe(200);
    expect((await vote("must")).status).toBe(200);
    let rows = await asService(s.d, (tx) => tx.select().from(votes).where(eq(votes.memberId, s.cy)));
    expect(rows.map((r) => r.value)).toEqual(["must"]);
    expect((await vote(null)).status).toBe(200);
    rows = await asService(s.d, (tx) => tx.select().from(votes).where(eq(votes.memberId, s.cy)));
    expect(rows).toHaveLength(0);
    const bad = await vote("maybe");
    expect(bad.status).toBe(400);
    expect(await json(bad)).toMatchObject({ error: "bad_request" });
    const outsider = await voteRoute(req("POST", "/x", { token: s.tok.out, body: { value: "must" } }), ctx({ tripId: s.tripId, ideaId: s.ideaId }));
    expect(outsider.status).toBe(404);
  });

  it("adds an idea as a processing card and queues resolution", async () => {
    const s = await setup();
    const res = await addIdeaRoute(
      req("POST", "/x", { token: s.tok.bea, body: { raw: "https://vm.tiktok.com/ZMabc123/" } }),
      ctx({ tripId: s.tripId }),
    );
    expect(res.status).toBe(201);
    const { ideaId } = endpoints.addIdea.response.parse(await json(res));
    expect(enqueued).toEqual([{ name: "wandr/idea.added", data: { ideaId } }]);
    const view = endpoints.trip.response.parse(await json(await tripRoute(req("GET", "/x", { token: s.tok.bea }), ctx({ tripId: s.tripId }))));
    const card = view.ideas.find((i) => i.id === ideaId)!;
    expect(card.processing).toBe(true);
    expect(card.sourceUrl).toBe("https://vm.tiktok.com/ZMabc123/");

    const outsider = await addIdeaRoute(req("POST", "/x", { token: s.tok.out, body: { raw: "Ramen" } }), ctx({ tripId: s.tripId }));
    expect(outsider.status).toBe(404);
  });

  it("invites: organizers only", async () => {
    const s = await setup();
    const asMember = await inviteRoute(req("POST", "/x", { token: s.tok.cy, body: { name: "Dee", phone: "202-555-0199" } }), ctx({ tripId: s.tripId }));
    expect(asMember.status).toBe(403);
    const res = await inviteRoute(req("POST", "/x", { token: s.tok.ana, body: { name: "Dee", phone: "202-555-0199" } }), ctx({ tripId: s.tripId }));
    expect(res.status).toBe(201);
    const r = endpoints.invite.response.parse(await json(res));
    expect(r.link).toMatch(/\/l\/[A-Za-z0-9_-]{43}$/);
    const again = await inviteRoute(req("POST", "/x", { token: s.tok.ana, body: { name: "Dee", phone: "202-555-0199" } }), ctx({ tripId: s.tripId }));
    expect(again.status).toBe(409);
  });
});

describe("library and share sheet (FR-21)", () => {
  it("routes a share to a trip or the library with a human label", async () => {
    const s = await setup();
    const toTrip = await shareRoute(req("POST", "/api/v1/share", { token: s.tok.cy, body: { raw: "https://maps.app.goo.gl/xyz", target: { type: "trip", tripId: s.tripId } } }));
    expect(toTrip.status).toBe(201);
    const t = endpoints.shareIntake.response.parse(await json(toTrip));
    expect(t).toMatchObject({ savedIdeaId: null, destination: "Bea's bach trip" });
    expect(enqueued[0]).toEqual({ name: "wandr/idea.added", data: { ideaId: t.ideaId } });

    const toLib = await shareRoute(req("POST", "/api/v1/share", { token: s.tok.cy, body: { raw: "Sushi in Tokyo", target: { type: "library" } } }));
    const l = endpoints.shareIntake.response.parse(await json(toLib));
    expect(l).toMatchObject({ ideaId: null, destination: "Your library" });
    expect(enqueued[1]).toEqual({ name: "wandr/saved-idea.added", data: { savedIdeaId: l.savedIdeaId } });

    const notMine = await shareRoute(req("POST", "/api/v1/share", { token: s.tok.out, body: { raw: "x", target: { type: "trip", tripId: s.tripId } } }));
    expect(notMine.status).toBe(404);

    const saved = await saveRoute(req("POST", "/x", { token: s.tok.cy, body: { raw: "Onsen in Hakone" } }));
    expect(saved.status).toBe(201);
    const lib = endpoints.library.response.parse(await json(await libraryRoute(req("GET", "/x", { token: s.tok.cy }))));
    expect(lib.saves.map((x) => x.title).sort()).toEqual(["Onsen in Hakone", "Sushi in Tokyo"]);
    expect(lib.saves.every((x) => x.processing)).toBe(true);
    // Someone else's library is empty, not shared.
    const other = endpoints.library.response.parse(await json(await libraryRoute(req("GET", "/x", { token: s.tok.bea }))));
    expect(other.saves).toEqual([]);
  });
});

describe("push (FR-87)", () => {
  async function register(token: string, expo: string) {
    return pushRoute(req("POST", "/api/v1/push", { token, body: { expoPushToken: expo, platform: "ios" } }));
  }
  const tokensSent = () => sent.flat().map((m) => m.to).sort();

  it("registers tokens (upsert, moves between people) and unregisters on sign-out", async () => {
    const s = await setup();
    expect((await register(s.tok.ana, "not-an-expo-token")).status).toBe(400);
    expect(await json(await register(s.tok.ana, "ExponentPushToken[ana]"))).toEqual({ ok: true });
    expect((await register(s.tok.ana, "ExponentPushToken[ana]")).status).toBe(200);
    await register(s.tok.bea, "ExponentPushToken[shared]");
    await register(s.tok.cy, "ExponentPushToken[shared]");
    const rows = await asService(s.d, (tx) => tx.select().from(pushTokens));
    expect(rows.map((r) => [r.token, r.userId]).sort()).toEqual(
      [["ExponentPushToken[ana]", s.u.ana], ["ExponentPushToken[shared]", s.u.cy]].sort(),
    );
    await signOutRoute(req("POST", "/x", { token: s.tok.cy, body: { expoPushToken: "ExponentPushToken[shared]" } }));
    expect(await asService(s.d, (tx) => tx.select().from(pushTokens))).toHaveLength(1);
    expect((await register(null as unknown as string, "ExponentPushToken[x]")).status).toBe(401);
  });

  it("never pushes a new idea to the sharer or to members it's hidden from", async () => {
    const s = await setup();
    await register(s.tok.ana, "ExponentPushToken[ana]");
    await register(s.tok.bea, "ExponentPushToken[bea]");
    await register(s.tok.cy, "ExponentPushToken[cy]");
    await setIdeaHiddenFrom(s.d, { sub: s.u.ana }, { ideaId: s.ideaId, memberIds: [s.bea] });

    await notifyIdeaAdded(s.d, s.ideaId);
    expect(tokensSent()).toEqual(["ExponentPushToken[cy]"]);
    expect(sent[0]![0]!.body).toBe("Ana added Honky-tonk crawl. Vote on it.");
    expect(JSON.stringify(sent)).not.toMatch(/\+1202|555/);

    // Bach mode: guests of honor get no new-idea pushes at all (an idea may be hidden right after).
    sent.length = 0;
    await setIdeaHiddenFrom(s.d, { sub: s.u.ana }, { ideaId: s.ideaId, memberIds: [] });
    await setBachMode(s.d, { sub: s.u.ana }, { tripId: s.tripId, on: true });
    await setGuestOfHonor(s.d, { sub: s.u.ana }, { tripId: s.tripId, memberId: s.bea, on: true });
    await notifyIdeaAdded(s.d, s.ideaId);
    expect(tokensSent()).toEqual(["ExponentPushToken[cy]"]);
  });

  it("caps non-urgent pushes per person per trip per day and drops dead tokens", async () => {
    const s = await setup();
    await register(s.tok.cy, "ExponentPushToken[cy]");
    for (let i = 0; i < PUSH_DAILY_CAP_PER_TRIP + 2; i++) {
      await sendPush(s.d, [s.u.cy], { title: "t", body: "b", url: "u" }, { kind: "idea_added", tripId: s.tripId });
    }
    expect(sent).toHaveLength(PUSH_DAILY_CAP_PER_TRIP);
    // Time-sensitive pushes still go through.
    await sendPush(s.d, [s.u.cy], { title: "t", body: "b", url: "u" }, { kind: "join_request", tripId: s.tripId, timeSensitive: true });
    expect(sent).toHaveLength(PUSH_DAILY_CAP_PER_TRIP + 1);
    expect(await asService(s.d, (tx) => tx.select().from(pushLog))).toHaveLength(PUSH_DAILY_CAP_PER_TRIP + 1);

    setPushSenderForTests({ send: async (m) => m.map(() => ({ status: "error" as const, details: { error: "DeviceNotRegistered" } })) });
    await sendPush(s.d, [s.u.cy], { title: "t", body: "b", url: "u" }, { kind: "join_request", tripId: s.tripId, timeSensitive: true });
    expect(await asService(s.d, (tx) => tx.select().from(pushTokens))).toHaveLength(0);
  });

  it("reminds only non-voters a poll closes soon, once, never members it's hidden from", async () => {
    const s = await setup();
    await register(s.tok.ana, "ExponentPushToken[ana]");
    await register(s.tok.bea, "ExponentPushToken[bea]");
    await register(s.tok.cy, "ExponentPushToken[cy]");
    const now = new Date();
    await asService(s.d, async (tx) => {
      const [p] = await tx
        .insert(polls)
        .values({ tripId: s.tripId, kind: "custom", question: "Friday dinner?", closesAt: new Date(now.getTime() + 60 * 60 * 1000), hiddenFrom: [s.bea] })
        .returning({ id: polls.id });
      const [o] = await tx.insert(pollOptions).values({ pollId: p!.id, label: "Tacos" }).returning({ id: pollOptions.id });
      await tx.insert(pollVotes).values({ pollId: p!.id, memberId: s.memberId, optionId: o!.id, tripId: s.tripId, castInSize: "group" });
      // A poll closing later than 3 h: not yet.
      await tx.insert(polls).values({ tripId: s.tripId, kind: "custom", question: "Later?", closesAt: new Date(now.getTime() + 5 * 60 * 60 * 1000) });
    });
    expect(await notifyPollsClosingSoon(s.d, now)).toBe(1);
    expect(tokensSent()).toEqual(["ExponentPushToken[cy]"]);
    expect(sent[0]![0]!.body).toBe("Closing soon: Friday dinner?");
    expect(await notifyPollsClosingSoon(s.d, now)).toBe(0); // once per poll
  });

  it("balance lines are per currency", () => {
    expect(balanceLine([])).toBe("You're all square.");
    expect(
      balanceLine([
        { currency: "USD", direction: "you_owe", amountMinor: 1250 },
        { currency: "EUR", direction: "owes_you", amountMinor: 4000 },
      ]),
    ).toBe("You owe $12.50. You're owed €40.00.");
  });
});
