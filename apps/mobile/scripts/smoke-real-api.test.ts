/**
 * End-to-end smoke test of the app's API calls against a running web server (not part of
 * `pnpm test`). Runs every endpoint the app uses, in app order, through the same contract client,
 * so schema drift shows up as a failure here.
 *
 *   pnpm dev   (repo root, or `npx next dev -p 3100` in apps/web)
 *   WANDR_API_URL=http://localhost:3000 pnpm --filter @wandr/mobile smoke
 */
import { describe, expect, it } from "vitest";
import { createApiClient } from "@wandr/api-contract/client";

const base = process.env.WANDR_API_URL ?? "http://localhost:3000";

describe(`real API at ${base}`, () => {
  it("runs the app's flows", async () => {
    let token: string | null = null;
    const api = createApiClient({ baseUrl: base, getToken: () => token });
    const phone = `+12062${String(Date.now()).slice(-6)}`;

    const code = await api("requestCode", { body: { channel: "sms", destination: phone } });
    expect(code.testMode).toBe(true);
    const verified = await api("verifyCode", { body: { challenge: code.challenge, code: "000000" } });
    token = verified.token;
    if (verified.me.needsName) await api("setName", { body: { name: "Smoke" } });

    const me = await api("me");
    expect(me.me.needsName).toBe(false);

    const { tripId } = await api("createTrip", { body: { destinations: ["Lisbon"], startDate: "2027-05-01", endDate: "2027-05-05" } });
    const added = await api("addIdea", { params: { tripId }, body: { raw: "https://www.tiktok.com/@lisbon/video/7300000000000000001" } });
    let trip = await api("trip", { params: { tripId } });
    expect(trip.size).toBe("solo");
    expect(trip.ideas.some((i) => i.id === added.ideaId)).toBe(true);

    await api("vote", { params: { tripId, ideaId: added.ideaId }, body: { value: "must" } });
    trip = await api("trip", { params: { tripId } });
    expect(trip.ideas.find((i) => i.id === added.ideaId)?.myVote).toBe("must");
    await api("vote", { params: { tripId, ideaId: added.ideaId }, body: { value: null } });

    const invite = await api("invite", { params: { tripId }, body: { name: "Sam", phone: `+13125${String(Date.now() + 7).slice(-6)}` } });
    expect(invite.link).toMatch(/^https?:\/\//);

    const toTrip = await api("shareIntake", { body: { raw: "Look https://maps.app.goo.gl/abc123", target: { type: "trip", tripId } } });
    expect(toTrip.ideaId).not.toBeNull();
    const toLib = await api("shareIntake", { body: { raw: "Pastéis de Belém, Lisbon", target: { type: "library" } } });
    expect(toLib.savedIdeaId).not.toBeNull();
    await api("saveToLibrary", { body: { raw: "https://www.instagram.com/reel/abc" } });
    const lib = await api("library");
    expect(lib.saves.length).toBeGreaterThanOrEqual(2);

    await api("registerPush", { body: { expoPushToken: "ExponentPushToken[smoke-test-0001]", platform: "ios" } });
    await api("signOut", { body: { expoPushToken: "ExponentPushToken[smoke-test-0001]" } });
  }, 120_000);
});
