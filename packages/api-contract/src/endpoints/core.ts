/** Sign-in, trips, ideas feed, votes, invites, library, share sheet, push (the first app slice). */
import { z } from "zod";
import type { EndpointDef } from "../define";
import { Me, SaveCard, TripDetail, TripSummary, VoteValue } from "../shapes";

export const coreEndpoints = {
  requestCode: {
    method: "POST",
    path: "/api/v1/auth/code",
    body: z.object({ channel: z.enum(["sms", "email"]), destination: z.string().min(3).max(120) }),
    response: z.object({ challenge: z.string(), display: z.string(), testMode: z.boolean() }),
  },
  verifyCode: {
    method: "POST",
    path: "/api/v1/auth/verify",
    body: z.object({ challenge: z.string(), code: z.string().regex(/^\d{6}$/) }),
    response: z.object({ token: z.string(), me: Me }),
  },
  setName: {
    method: "POST",
    path: "/api/v1/me/name",
    body: z.object({ name: z.string().min(1).max(40) }),
    response: z.object({ me: Me }),
  },
  me: {
    method: "GET",
    path: "/api/v1/me",
    body: null,
    response: z.object({ me: Me, trips: z.array(TripSummary), savedCount: z.number() }),
  },
  createTrip: {
    method: "POST",
    path: "/api/v1/trips",
    body: z.object({
      name: z.string().max(80).optional(),
      destinations: z.array(z.string().max(60)).max(8).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    response: z.object({ tripId: z.string() }),
  },
  trip: {
    method: "GET",
    path: "/api/v1/trips/:tripId",
    body: null,
    response: TripDetail,
  },
  addIdea: {
    method: "POST",
    path: "/api/v1/trips/:tripId/ideas",
    body: z.object({ raw: z.string().min(1).max(4000) }),
    response: z.object({ ideaId: z.string() }),
  },
  vote: {
    method: "POST",
    path: "/api/v1/trips/:tripId/ideas/:ideaId/vote",
    body: z.object({ value: VoteValue.nullable() }),
    response: z.object({ ok: z.literal(true) }),
  },
  invite: {
    method: "POST",
    path: "/api/v1/trips/:tripId/invites",
    body: z.object({ name: z.string().min(1).max(40), phone: z.string().min(7).max(32) }),
    response: z.object({ link: z.string(), texted: z.boolean() }),
  },
  library: {
    method: "GET",
    path: "/api/v1/library",
    body: null,
    response: z.object({ saves: z.array(SaveCard) }),
  },
  saveToLibrary: {
    method: "POST",
    path: "/api/v1/library/saves",
    body: z.object({ raw: z.string().min(1).max(4000) }),
    response: z.object({ savedIdeaId: z.string() }),
  },
  /** Share sheet (FR-21): something shared into the app goes to a trip or the library. */
  shareIntake: {
    method: "POST",
    path: "/api/v1/share",
    body: z.object({
      raw: z.string().min(1).max(4000),
      target: z.discriminatedUnion("type", [
        z.object({ type: z.literal("trip"), tripId: z.string() }),
        z.object({ type: z.literal("library") }),
      ]),
    }),
    response: z.object({ ideaId: z.string().nullable(), savedIdeaId: z.string().nullable(), destination: z.string() }),
  },
  registerPush: {
    method: "POST",
    path: "/api/v1/push",
    body: z.object({ expoPushToken: z.string().min(10).max(200), platform: z.enum(["ios", "android"]) }),
    response: z.object({ ok: z.literal(true) }),
  },
  signOut: {
    method: "POST",
    path: "/api/v1/auth/sign-out",
    /**
     * Optional (added backward-compatibly): this device's push token, so a signed-out phone stops
     * getting the person's pushes (which can include their balance). Tokens are stateless, so this
     * is the only server-side effect of signing out.
     */
    body: z.object({ expoPushToken: z.string().min(10).max(200).optional() }),
    response: z.object({ ok: z.literal(true) }),
  },
} as const satisfies Record<string, EndpointDef>;
