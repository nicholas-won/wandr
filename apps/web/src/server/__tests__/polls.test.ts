/** Polls against PGlite + RLS (FR-47, FR-48, FR-S12, FR-92, FR-T7, V-7, V-8, V-12, S-4). */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asService, members, polls, stopAttendance, users, type Db } from "@wandr/db";
import { createPglite } from "@wandr/db/pglite";
import { createTrip } from "../trips";
import {
  closeDuePolls,
  closePollEarly,
  createPoll,
  decidePoll,
  extendPoll,
  getPoll,
  listPolls,
  runoffPoll,
  setPollPaused,
  votePoll,
} from "../polls";

const H = 3_600_000;

async function setup(n: 1 | 2 | 3 | 4 = 3) {
  const { db } = await createPglite();
  const d = db as unknown as Db;
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const names = ["Ana", "Ben", "Cy", "Dee"];
  await asService(d, (tx) => tx.insert(users).values(ids.map((id, i) => ({ id, displayName: names[i]! }))));
  const { tripId, memberId: ana, stopId } = await createTrip(d, { userId: ids[0]!, ownerName: "Ana", name: "Bach", city: "Austin" });
  const rest =
    n > 1
      ? await asService(d, (tx) =>
          tx
            .insert(members)
            .values(ids.slice(1, n).map((id, i) => ({ tripId, userId: id, displayName: names[i + 1]!, status: "active" as const })))
            .returning({ id: members.id }),
        )
      : [];
  return {
    d,
    tripId,
    stopId,
    m: [ana, ...rest.map((r) => r.id)],
    s: ids.map((id) => ({ sub: id })),
  };
}

const opts = (...labels: string[]) => labels.map((label) => ({ label }));

describe("polls", () => {
  it("organizers create; blind until you vote; counts only in groups (FR-47, FR-41/42)", async () => {
    const t = await setup(3);
    await expect(
      createPoll(t.d, t.s[1]!, { tripId: t.tripId, question: "Theme?", kind: "custom", options: opts("Disco", "Cowboy") }),
    ).rejects.toThrow("organizers_only");
    await expect(
      createPoll(t.d, t.s[0]!, { tripId: t.tripId, question: "Theme?", kind: "custom", options: opts("Disco") }),
    ).rejects.toThrow("too_few_options");
    const pollId = await createPoll(t.d, t.s[0]!, {
      tripId: t.tripId,
      question: "Theme?",
      kind: "custom",
      closesAt: new Date(Date.now() + 2 * H),
      options: [
        { label: "Disco", imageUrl: "https://img.test/disco.jpg" },
        { label: "Cowboy", imageUrl: "https://img.test/cowboy.jpg" },
      ],
    });
    let [p] = await listPolls(t.d, t.s[1]!, t.tripId);
    expect(p!.status).toBe("open");
    expect(p!.options.map((o) => [o.label, o.imageUrl, o.count])).toEqual([
      ["Disco", "https://img.test/disco.jpg", null],
      ["Cowboy", "https://img.test/cowboy.jpg", null],
    ]);
    await votePoll(t.d, t.s[1]!, { tripId: t.tripId, pollId, optionId: p!.options[0]!.id });
    // Personal-link sessions may vote (FR-5).
    await votePoll(t.d, { link_member: t.m[2]! }, { tripId: t.tripId, pollId, optionId: p!.options[1]!.id });
    [p] = await listPolls(t.d, t.s[1]!, t.tripId);
    expect(p!.myOptionId).toBe(p!.options[0]!.id);
    expect(p!.options.map((o) => o.count)).toEqual([1, 1]);
    expect(p!.options.every((o) => o.voters === null)).toBe(true); // no names in groups
    const [org] = await listPolls(t.d, t.s[0]!, t.tripId);
    expect(org!.options[0]!.count).toBeNull(); // organizer hasn't voted: still blind
    expect(org!.turnout).toEqual({ voted: 2, eligible: 3 });
  });

  it("closes at the deadline; ties need the organizer → run-off (FR-48, V-7)", async () => {
    const t = await setup(4);
    const now = new Date();
    const pollId = await createPoll(t.d, t.s[0]!, {
      tripId: t.tripId,
      question: "Dinner?",
      kind: "custom",
      closesAt: new Date(now.getTime() + H),
      options: opts("Tacos", "BBQ", "Sushi"),
    });
    const p0 = (await getPoll(t.d, t.s[0]!, t.tripId, pollId))!;
    const [tacos, bbq] = p0.options;
    await votePoll(t.d, t.s[0]!, { tripId: t.tripId, pollId, optionId: tacos!.id });
    await votePoll(t.d, t.s[1]!, { tripId: t.tripId, pollId, optionId: tacos!.id });
    await votePoll(t.d, t.s[2]!, { tripId: t.tripId, pollId, optionId: bbq!.id });
    await votePoll(t.d, t.s[3]!, { tripId: t.tripId, pollId, optionId: bbq!.id });
    // Time passes (move the deadline into the past, as the service).
    await asService(t.d, (tx) => tx.update(polls).set({ closesAt: new Date(now.getTime() - 1000) }).where(eq(polls.id, pollId)));
    expect(await closeDuePolls(t.d)).toBe(1);
    expect(await closeDuePolls(t.d)).toBe(0); // idempotent
    await expect(votePoll(t.d, t.s[0]!, { tripId: t.tripId, pollId, optionId: bbq!.id })).rejects.toThrow("not_open");
    const closed = (await getPoll(t.d, t.s[1]!, t.tripId, pollId))!;
    expect(closed.status).toBe("needs_decision");
    expect(closed.resultText).toBe("Tie between Tacos and BBQ. 4 of 4 voted.");
    expect(closed.decisionActions).toEqual([]); // members can't decide
    const org = (await getPoll(t.d, t.s[0]!, t.tripId, pollId))!;
    expect(org.decisionActions).toEqual(["pick", "runoff", "extend"]);
    expect(org.pickable).toEqual([tacos!.id, bbq!.id]);
    await expect(decidePoll(t.d, t.s[0]!, { tripId: t.tripId, pollId, optionId: p0.options[2]!.id })).rejects.toThrow("not_allowed");

    const runoffId = await runoffPoll(t.d, t.s[0]!, { tripId: t.tripId, pollId });
    const r = (await getPoll(t.d, t.s[0]!, t.tripId, runoffId))!;
    expect(r.question).toBe("Run-off: Dinner?");
    expect(r.options.map((o) => o.label)).toEqual(["Tacos", "BBQ"]);
    expect(r.runoffOfPollId).toBe(pollId);
    expect((await getPoll(t.d, t.s[0]!, t.tripId, pollId))!.runoffPollId).toBe(runoffId);

    await decidePoll(t.d, t.s[0]!, { tripId: t.tripId, pollId, optionId: bbq!.id });
    const decided = (await getPoll(t.d, t.s[2]!, t.tripId, pollId))!;
    expect(decided.status).toBe("decided");
    expect(decided.resultText).toBe("Decided: BBQ. 4 of 4 voted.");
  });

  it("a clear winner closes itself; low turnout can be extended (V-8, V-12)", async () => {
    const t = await setup(4);
    const pollId = await createPoll(t.d, t.s[0]!, { tripId: t.tripId, question: "Bar?", kind: "custom", options: opts("A", "B") });
    const [a] = (await getPoll(t.d, t.s[0]!, t.tripId, pollId))!.options;
    await votePoll(t.d, t.s[1]!, { tripId: t.tripId, pollId, optionId: a!.id });
    await closePollEarly(t.d, t.s[0]!, { tripId: t.tripId, pollId });
    let p = (await getPoll(t.d, t.s[1]!, t.tripId, pollId))!;
    expect(p.status).toBe("needs_decision");
    expect(p.resultText).toBe("No decision, too few votes. Closed early by Ana, 1 of 4 voted.");
    await extendPoll(t.d, t.s[0]!, { tripId: t.tripId, pollId });
    p = (await getPoll(t.d, t.s[1]!, t.tripId, pollId))!;
    expect(p.status).toBe("open");
    await votePoll(t.d, t.s[2]!, { tripId: t.tripId, pollId, optionId: a!.id });
    await closePollEarly(t.d, t.s[0]!, { tripId: t.tripId, pollId });
    p = (await getPoll(t.d, t.s[1]!, t.tripId, pollId))!;
    expect(p.status).toBe("decided");
    expect(p.winningOptionId).toBe(a!.id);
    expect(p.resultText).toBe("A won. Closed early by Ana, 2 of 4 voted.");
  });

  it("only people attending the Stop vote (FR-47, S-12)", async () => {
    const t = await setup(3);
    await asService(t.d, (tx) => tx.insert(stopAttendance).values({ stopId: t.stopId, memberId: t.m[2]!, attending: false }));
    const pollId = await createPoll(t.d, t.s[0]!, {
      tripId: t.tripId,
      question: "Brunch?",
      kind: "custom",
      stopId: t.stopId,
      options: opts("A", "B"),
    });
    const p = (await getPoll(t.d, t.s[2]!, t.tripId, pollId))!;
    expect(p.eligible).toBe(false);
    await expect(votePoll(t.d, t.s[2]!, { tripId: t.tripId, pollId, optionId: p.options[0]!.id })).rejects.toThrow("not_eligible");
    expect((await getPoll(t.d, t.s[0]!, t.tripId, pollId))!.turnout).toEqual({ voted: 0, eligible: 2 });
  });

  it("paused polls take no votes and keep their remaining time (S-4)", async () => {
    const t = await setup(3);
    const now = new Date();
    const pollId = await createPoll(t.d, t.s[0]!, {
      tripId: t.tripId,
      question: "Q?",
      kind: "custom",
      closesAt: new Date(now.getTime() + 2 * H),
      options: opts("A", "B"),
    });
    await setPollPaused(t.d, t.s[0]!, { tripId: t.tripId, pollId, paused: true }, now);
    const p = (await getPoll(t.d, t.s[1]!, t.tripId, pollId))!;
    expect(p.status).toBe("paused");
    await expect(votePoll(t.d, t.s[1]!, { tripId: t.tripId, pollId, optionId: p.options[0]!.id })).rejects.toThrow("not_open");
    await setPollPaused(t.d, t.s[0]!, { tripId: t.tripId, pollId, paused: false }, new Date(now.getTime() + H));
    const [row] = await asService(t.d, (tx) => tx.select().from(polls).where(eq(polls.id, pollId)));
    expect(row!.closesAt!.getTime()).toBe(now.getTime() + 3 * H);
  });

  it("duo: a 1–1 tie goes to the owner, names shown (FR-T7); solo: no polls", async () => {
    const t = await setup(2);
    // Ben is promoted to organizer: still can't break a duo tie.
    await asService(t.d, (tx) => tx.update(members).set({ role: "organizer" }).where(eq(members.id, t.m[1]!)));
    const pollId = await createPoll(t.d, t.s[0]!, { tripId: t.tripId, question: "Hotel?", kind: "custom", options: opts("X", "Y") });
    const [x, y] = (await getPoll(t.d, t.s[0]!, t.tripId, pollId))!.options;
    await votePoll(t.d, t.s[0]!, { tripId: t.tripId, pollId, optionId: x!.id });
    await votePoll(t.d, t.s[1]!, { tripId: t.tripId, pollId, optionId: y!.id });
    const open = (await getPoll(t.d, t.s[0]!, t.tripId, pollId))!;
    expect(open.options.map((o) => o.voters)).toEqual([["You"], ["Ben"]]);
    await closePollEarly(t.d, t.s[0]!, { tripId: t.tripId, pollId });
    expect((await getPoll(t.d, t.s[1]!, t.tripId, pollId))!.decisionActions).toEqual([]);
    await expect(decidePoll(t.d, t.s[1]!, { tripId: t.tripId, pollId, optionId: x!.id })).rejects.toThrow("not_allowed");
    expect((await getPoll(t.d, t.s[0]!, t.tripId, pollId))!.decisionActions).toContain("pick");
    await decidePoll(t.d, t.s[0]!, { tripId: t.tripId, pollId, optionId: y!.id });

    const solo = await setup(1);
    await expect(
      createPoll(solo.d, solo.s[0]!, { tripId: solo.tripId, question: "Q?", kind: "custom", options: opts("A", "B") }),
    ).rejects.toThrow("not_available_for_trip_size");
  });
});
