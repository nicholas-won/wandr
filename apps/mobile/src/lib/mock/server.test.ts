import { describe, expect, it } from "vitest";
import { ApiRequestError, createApiClient } from "@wandr/api-contract/client";
import { createMockFetch, MOCK_CODE } from "./server";

function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  let token: string | null = null;
  const api = createApiClient({
    baseUrl: "http://mock.local",
    getToken: () => token,
    fetchImpl: createMockFetch({ now: clock.now, processingMs: 1000 }),
  });
  const signIn = async () => {
    const { challenge, testMode } = await api("requestCode", { body: { channel: "sms", destination: "+15551230177" } });
    expect(testMode).toBe(true);
    const res = await api("verifyCode", { body: { challenge, code: MOCK_CODE } });
    token = res.token;
    return res;
  };
  return { api, clock, signIn, setToken: (v: string | null) => (token = v) };
}

describe("mock API (validated by the real contract client)", () => {
  it("signs in with the test code, then asks for a name", async () => {
    const { api, signIn } = setup();
    const res = await signIn();
    expect(res.me.needsName).toBe(true);
    const named = await api("setName", { body: { name: "Nick" } });
    expect(named.me.needsName).toBe(false);
  });

  it("rejects a wrong code and unauthenticated calls", async () => {
    const { api } = setup();
    const { challenge } = await api("requestCode", { body: { channel: "sms", destination: "5551230177" } });
    await expect(api("verifyCode", { body: { challenge, code: "123456" } })).rejects.toBeInstanceOf(ApiRequestError);
    await expect(api("me")).rejects.toMatchObject({ status: 401 });
  });

  it("serves one trip per size, most recent first", async () => {
    const { api, signIn } = setup();
    await signIn();
    const { trips } = await api("me");
    expect(trips.map((t) => t.size)).toEqual(["group", "duo", "solo"]);
  });

  it("keeps group votes blind until you vote, and never names a Pass (FR-41/42)", async () => {
    const { api, signIn } = setup();
    await signIn();
    const trip = await api("trip", { params: { tripId: "t-lisbon" } });
    const unvoted = trip.ideas.find((i) => i.id === "i-timeout")!;
    expect(unvoted.myVote).toBeNull();
    expect(unvoted.tallyLabel).toBeNull();
    expect(unvoted.namedVotes).toEqual([]);

    await api("vote", { params: { tripId: "t-lisbon", ideaId: "i-timeout" }, body: { value: "pass" } });
    const after = (await api("trip", { params: { tripId: "t-lisbon" } })).ideas.find((i) => i.id === "i-timeout")!;
    expect(after.tallyLabel).toBe("2 of 4 are in · 1 Must-do 🔥");
    expect(after.namedVotes.map((v) => v.label)).not.toContain("Pass");
    expect(after.namedVotes.some((v) => v.isMe)).toBe(false);
  });

  it("shows both duo votes, including a Pass", async () => {
    const { api, signIn } = setup();
    await signIn();
    const trip = await api("trip", { params: { tripId: "t-tokyo" } });
    const gg = trip.ideas.find((i) => i.id === "i-goldengai")!;
    expect(gg.namedVotes).toEqual(
      expect.arrayContaining([expect.objectContaining({ isMe: true, label: "Pass" }), expect.objectContaining({ name: "Sam", label: "Must-do" })]),
    );
  });

  it("adds an idea in a processing state that fills in later (FR-23)", async () => {
    const { api, clock, signIn } = setup();
    await signIn();
    const { ideaId } = await api("addIdea", { params: { tripId: "t-cdmx" }, body: { raw: "https://www.tiktok.com/@x/video/1" } });
    let idea = (await api("trip", { params: { tripId: "t-cdmx" } })).ideas.find((i) => i.id === ideaId)!;
    expect(idea.processing).toBe(true);
    clock.advance(1500);
    idea = (await api("trip", { params: { tripId: "t-cdmx" } })).ideas.find((i) => i.id === ideaId)!;
    expect(idea.processing).toBe(false);
    expect(idea.title).not.toMatch(/Finding/);
  });

  it("creates a solo trip, invites, shares into a trip or the library", async () => {
    const { api, signIn } = setup();
    await signIn();
    const { tripId } = await api("createTrip", { body: { destinations: ["Rome", "Florence"], startDate: "2027-05-01" } });
    const trip = await api("trip", { params: { tripId } });
    expect(trip.name).toBe("Rome & Florence");
    expect(trip.size).toBe("solo");
    expect((await api("me")).trips[0]!.id).toBe(tripId);

    const inv = await api("invite", { params: { tripId }, body: { name: "Sam", phone: "5551234567" } });
    expect(inv.link).toMatch(/^https:/);

    const toTrip = await api("shareIntake", { body: { raw: "https://vm.tiktok.com/abc", target: { type: "trip", tripId } } });
    expect(toTrip.ideaId).not.toBeNull();
    const before = (await api("library")).saves.length;
    const toLib = await api("shareIntake", { body: { raw: "look at this", target: { type: "library" } } });
    expect(toLib.destination).toBe("Your library");
    expect((await api("library")).saves.length).toBe(before + 1);
  });
});
