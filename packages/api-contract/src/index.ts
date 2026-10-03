/**
 * The JSON API shared by the native app (apps/mobile) and the web server (apps/web/src/app/api/v1).
 * D75: the native app talks only to these endpoints. Both sides import these schemas, so a change
 * here is a change to both. Privacy rules are unchanged: the server reads as the caller (RLS), and
 * responses carry only what the web app would show that person.
 *
 * Auth: `Authorization: Bearer <token>`. Sign-in is two calls (no cookies): request a code, which
 * returns an opaque `challenge`; verify the code with that challenge to get a long-lived `token`.
 */
import { z } from "zod";

export const API_VERSION = "v1";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export const VoteValue = z.enum(["must", "down", "pass"]);
export type VoteValue = z.infer<typeof VoteValue>;
export const TripSize = z.enum(["solo", "duo", "group"]);
export type TripSize = z.infer<typeof TripSize>;

export const ApiError = z.object({ error: z.string(), message: z.string() });
export type ApiError = z.infer<typeof ApiError>;

export const Me = z.object({
  id: z.string(),
  name: z.string(),
  /** Masked, e.g. "•••• 0177". The full number never leaves the server. */
  phone: z.string().nullable(),
  needsName: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const TripSummary = z.object({ id: z.string(), name: z.string(), size: TripSize });
export type TripSummary = z.infer<typeof TripSummary>;

export const IdeaCard = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  summary: z.string().nullable(),
  status: z.string(),
  stopId: z.string().nullable(),
  /** "Alfama, Lisbon · Food" */
  locationLabel: z.string().nullable(),
  /** Absolute URL of the card picture (place photo, source thumbnail) or null for an illustration. */
  imageUrl: z.string().nullable(),
  /** Required credit when imageUrl is a Google place photo. */
  imageCredit: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  processing: z.boolean(),
  needsReview: z.boolean(),
  notAPlace: z.boolean(),
  myVote: VoteValue.nullable(),
  /** Group: "5 of 6 are in · 2 Must-do 🔥"; null while blind (FR-41) and in duo/solo. */
  tallyLabel: z.string().nullable(),
  /** Duo/group names the viewer may see, e.g. { name: "Sam", label: "Down" }. */
  namedVotes: z.array(z.object({ name: z.string(), label: z.string(), isMe: z.boolean() })),
  splitOpinions: z.string().nullable(),
  rank: z.number().nullable(),
  commentCount: z.number(),
  hiddenFromNames: z.array(z.string()),
});
export type IdeaCard = z.infer<typeof IdeaCard>;

export const TripDetail = z.object({
  id: z.string(),
  name: z.string(),
  size: TripSize,
  me: z.object({ memberId: z.string(), role: z.enum(["owner", "organizer", "member"]), displayName: z.string() }),
  members: z.array(z.object({ id: z.string(), displayName: z.string(), role: z.string() })),
  stops: z.array(z.object({ id: z.string(), name: z.string() })),
  ideas: z.array(IdeaCard),
  /** Web URL of this trip, for "Open on the web" and sharing. */
  webUrl: z.string(),
});
export type TripDetail = z.infer<typeof TripDetail>;

export const SaveCard = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  summary: z.string().nullable(),
  country: z.string().nullable(),
  regionOrCity: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageCredit: z.string().nullable(),
  processing: z.boolean(),
  sourceUrl: z.string().nullable(),
});
export type SaveCard = z.infer<typeof SaveCard>;

// ---------------------------------------------------------------------------
// Endpoints: path, method, request body (or null), response
// ---------------------------------------------------------------------------

export const endpoints = {
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
} as const;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
export type BodyOf<K extends EndpointName> = Endpoints[K]["body"] extends z.ZodType ? z.infer<Endpoints[K]["body"]> : undefined;
export type ResponseOf<K extends EndpointName> = z.infer<Endpoints[K]["response"]>;

/** Fill ":param" segments. */
export function pathFor(template: string, params: Record<string, string> = {}): string {
  return template.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params[k];
    if (!v) throw new Error(`Missing path param ${k}`);
    return encodeURIComponent(v);
  });
}
