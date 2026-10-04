/** Shapes shared across endpoint areas. */
import { z } from "zod";

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

