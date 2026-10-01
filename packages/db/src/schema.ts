/**
 * Wandr data model (REQUIREMENTS.md §5).
 *
 * Conventions:
 * - Money is integer minor units (`*_minor`, bigint-as-number) + ISO 4217 `currency`. Never floats.
 * - Expense/payment history is append-only (FR-69, NFR-5): rows are never updated after lock;
 *   corrections are `expense_adjustments`.
 * - Phone numbers live only in `users.phone` and `member_contacts.phone`; RLS keeps both
 *   unreadable to other members.
 * - Surprise mode (FR-91): `hidden_from` holds member ids that must never see the row.
 *   RLS filters on it; see migrations/0001_rls.sql.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });
const hiddenFrom = () =>
  uuid("hidden_from").array().notNull().default(sql`'{}'::uuid[]`);

export const memberRole = pgEnum("member_role", ["owner", "organizer", "member"]);
export const memberStatus = pgEnum("member_status", [
  "invited",
  "pending",
  "active",
  "not_attending",
  "removed",
]);
export const stageKind = pgEnum("stage_kind", ["where", "when", "stay", "getting_around", "do"]);
export const stageStatus = pgEnum("stage_status", ["collecting", "voting", "set", "not_needed"]);
export const ideaStatus = pgEnum("idea_status", [
  "idea",
  "shortlisted",
  "planned",
  "done",
  "dropped",
]);
export const ideaCategory = pgEnum("idea_category", [
  "city",
  "stay",
  "transit",
  "food",
  "drink",
  "nightlife",
  "activity",
  "sight",
  "shopping",
  "other",
]);
export const extractionState = pgEnum("extraction_state", [
  "processing",
  "resolved",
  "needs_review",
  "not_a_place",
  "failed",
]);
export const voteValue = pgEnum("vote_value", ["must", "down", "pass"]);
export const tripSize = pgEnum("trip_size", ["solo", "duo", "group"]);
export const pollKind = pgEnum("poll_kind", ["ideas", "custom"]);
export const splitMethod = pgEnum("split_method", ["even", "itemized", "just_me"]);
export const expenseCategory = pgEnum("expense_category", [
  "lodging",
  "food_drink",
  "transport",
  "activities",
  "shopping",
  "other",
]);
export const sourceKind = pgEnum("source_kind", [
  "tiktok",
  "instagram",
  "youtube",
  "google_maps",
  "url",
  "screenshot",
  "text",
  "sms",
]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** A verified person. Created on first successful SMS/email code. */
export const users = pgTable("users", {
  id: id(),
  phone: text("phone").unique(), // E.164; private
  email: text("email").unique(), // private
  displayName: text("display_name").notNull(),
  smsOptedOut: boolean("sms_opted_out").notNull().default(false), // FR-85
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Trips, Stops, stages
// ---------------------------------------------------------------------------

export const trips = pgTable("trips", {
  id: id(),
  name: text("name").notNull(),
  /** Neutral name shown to pending/unknown people (J-7). */
  outsiderName: text("outsider_name"),
  coverImageUrl: text("cover_image_url"),
  createdBy: uuid("created_by").references(() => users.id),
  /** Group link token (FR-6); regenerate to revoke (FR-10). Stored hashed. */
  groupLinkHash: text("group_link_hash"),
  inviteListOnly: boolean("invite_list_only").notNull().default(false), // FR-7
  budgetCheckIn: boolean("budget_check_in").notNull().default(false), // FR-74
  bachMode: boolean("bach_mode").notNull().default(false), // §6.7
  pace: text("pace").notNull().default("balanced"), // FR-O9
  /** Last-known size, maintained on membership change (FR-T1). */
  size: tripSize("size").notNull().default("solo"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

export const stops = pgTable(
  "stops",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Lisbon"; "" for the hidden single-city Stop
    /** Hidden default Stop for single-city trips (§5). */
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
    startDate: date("start_date"),
    endDate: date("end_date"),
    nights: smallint("nights"),
    timezone: text("timezone"), // IANA, FR-O16
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Idea id of the decided lodging, if any (FR-O7). */
    lodgingIdeaId: uuid("lodging_idea_id"),
    createdAt: createdAt(),
  },
  (t) => [index("stops_trip_idx").on(t.tripId)],
);

export const tripStages = pgTable(
  "trip_stages",
  {
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    stage: stageKind("stage").notNull(),
    status: stageStatus("status").notNull().default("collecting"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.stage] })],
);

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const members = pgTable(
  "members",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    /** Null for invited-but-not-joined people and for managed members (FR-11). */
    userId: uuid("user_id").references(() => users.id),
    displayName: text("display_name").notNull(),
    role: memberRole("role").notNull().default("member"),
    status: memberStatus("status").notNull().default("invited"),
    isGuestOfHonor: boolean("is_guest_of_honor").notNull().default(false), // FR-90
    managedByMemberId: uuid("managed_by_member_id"), // FR-11
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    /** One-time notices already shown (FR-T3/T5/T6), e.g. ["duo_votes_visible"]. */
    noticesSeen: text("notices_seen").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index("members_trip_idx").on(t.tripId),
    index("members_user_idx").on(t.userId),
    uniqueIndex("members_trip_user_uq").on(t.tripId, t.userId),
  ],
);

/** Phone for invited members before they have a user row. Never readable by other members. */
export const memberContacts = pgTable("member_contacts", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  phone: text("phone"),
  email: text("email"),
});

/** Personal links (FR-4/5). Token is shown once; only its hash is stored. */
export const memberLinks = pgTable(
  "member_links",
  {
    id: id(),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Set on first *interactive* use (not on GET), so preview bots don't bind it (N-4). */
    boundDeviceHash: text("bound_device_hash"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("member_links_member_idx").on(t.memberId)],
);

export const stopAttendance = pgTable(
  "stop_attendance",
  {
    stopId: uuid("stop_id").notNull().references(() => stops.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    attending: boolean("attending").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.stopId, t.memberId] })],
);

// ---------------------------------------------------------------------------
// Ideas and votes
// ---------------------------------------------------------------------------

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    /** Null = "Unsorted / new city?" (FR-S3). */
    stopId: uuid("stop_id").references(() => stops.id, { onDelete: "set null" }),
    stage: stageKind("stage").notNull().default("do"),
    status: ideaStatus("status").notNull().default("idea"),
    extraction: extractionState("extraction").notNull().default("processing"),
    title: text("title").notNull(),
    category: ideaCategory("category").notNull().default("other"),
    summary: text("summary"),
    /** Google place id: the only Places field we may store long-term (FR-31). */
    placeId: text("place_id"),
    /** Short-lived display cache for Places fields; refresh on view. */
    placeCache: jsonb("place_cache"),
    placeCachedAt: timestamp("place_cached_at", { withTimezone: true }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    cityHint: text("city_hint"),
    priceLevel: smallint("price_level"),
    confidence: doublePrecision("confidence"), // 0..1; extraction confidence, not money
    permanentlyClosed: boolean("permanently_closed").notNull().default(false), // FR-33
    /** Listicle candidates awaiting the sharer's choice (FR-24). */
    candidates: jsonb("candidates"),
    createdByMemberId: uuid("created_by_member_id").references(() => members.id),
    hiddenFrom: hiddenFrom(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ideas_trip_idx").on(t.tripId),
    index("ideas_stop_idx").on(t.stopId),
    index("ideas_place_idx").on(t.tripId, t.placeId),
  ],
);

/** Each share of an idea (FR-22 "also shared by X", FR-26 keep source). */
export const ideaSources = pgTable(
  "idea_sources",
  {
    id: id(),
    ideaId: uuid("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    url: text("url"),
    normalizedUrl: text("normalized_url"),
    /** Raw untrusted caption text (C-21). Never interpolated into prompts as instructions. */
    caption: text("caption"),
    thumbnailUrl: text("thumbnail_url"),
    creatorHandle: text("creator_handle"), // §11: store from day one
    storagePath: text("storage_path"), // screenshots
    sharedByMemberId: uuid("shared_by_member_id").references(() => members.id),
    createdAt: createdAt(),
  },
  (t) => [index("idea_sources_idea_idx").on(t.ideaId)],
);

/**
 * One row per (idea, member). Raw rows are readable only by their owner (RLS);
 * reveals go through SECURITY DEFINER functions that apply FR-41/42 and §6.10.
 */
export const votes = pgTable(
  "votes",
  {
    ideaId: uuid("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    value: voteValue("value").notNull(),
    /** Trip size when last cast/changed. Group-cast votes stay anonymous forever (FR-T5). */
    castInSize: tripSize("cast_in_size").notNull(),
    /** Members who may see this vote individually even if it is a Pass (duo pair, FR-T4). */
    openTo: uuid("open_to").array().notNull().default(sql`'{}'::uuid[]`),
    changeCount: integer("change_count").notNull().default(0), // FR-43
    notMyPick: boolean("not_my_pick").notNull().default(false), // FR-50
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.memberId] }), index("votes_trip_idx").on(t.tripId)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id"),
    parentId: uuid("parent_id"),
    memberId: uuid("member_id").notNull().references(() => members.id),
    body: text("body").notNull(),
    hiddenFrom: hiddenFrom(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_idea_idx").on(t.ideaId)],
);

// ---------------------------------------------------------------------------
// Polls (FR-47/48, FR-S12)
// ---------------------------------------------------------------------------

export const polls = pgTable("polls", {
  id: id(),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  stopId: uuid("stop_id").references(() => stops.id, { onDelete: "cascade" }),
  stage: stageKind("stage"),
  kind: pollKind("kind").notNull(),
  question: text("question").notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  winningOptionId: uuid("winning_option_id"),
  createdByMemberId: uuid("created_by_member_id").references(() => members.id),
  sharedAt: timestamp("shared_at", { withTimezone: true }), // FR-80c fallback timer
  hiddenFrom: hiddenFrom(),
  createdAt: createdAt(),
});

export const pollOptions = pgTable("poll_options", {
  id: id(),
  pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  imageUrl: text("image_url"), // FR-92
  position: integer("position").notNull().default(0),
});

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    optionId: uuid("option_id").notNull().references(() => pollOptions.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    castInSize: tripSize("cast_in_size").notNull(),
    changeCount: integer("change_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.memberId] })],
);

// ---------------------------------------------------------------------------
// Money (§6.5). Append-only.
// ---------------------------------------------------------------------------

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id").references(() => stops.id),
    ideaId: uuid("idea_id").references(() => ideas.id),
    merchant: text("merchant").notNull(),
    spentOn: date("spent_on"),
    currency: text("currency").notNull(), // ISO 4217
    totalMinor: money("total_minor").notNull(),
    taxMinor: money("tax_minor").notNull().default(0),
    tipMinor: money("tip_minor").notNull().default(0),
    category: expenseCategory("category").notNull().default("other"),
    splitMethod: splitMethod("split_method").notNull().default("even"),
    paidByMemberId: uuid("paid_by_member_id").notNull().references(() => members.id),
    uploadedByMemberId: uuid("uploaded_by_member_id").notNull().references(() => members.id),
    receiptPath: text("receipt_path"),
    /** Refunds point at the expense they reverse (FR-72). */
    refundOfExpenseId: uuid("refund_of_expense_id"),
    lockedAt: timestamp("locked_at", { withTimezone: true }), // FR-69
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete only
    hiddenFrom: hiddenFrom(),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_trip_idx").on(t.tripId)],
);

export const expenseItems = pgTable("expense_items", {
  id: id(),
  expenseId: uuid("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  amountMinor: money("amount_minor").notNull(),
  quantity: integer("quantity").notNull().default(1),
  /** Unclaimed items the payer absorbed (FR-62). */
  absorbed: boolean("absorbed").notNull().default(false),
});

export const expenseItemClaims = pgTable(
  "expense_item_claims",
  {
    itemId: uuid("item_id").notNull().references(() => expenseItems.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id),
    /** Relative weight when an item is shared unevenly; default equal. */
    weight: integer("weight").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.memberId] })],
);

/** Who participates in an even split (and the computed share for every method). */
export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: uuid("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id),
    shareMinor: money("share_minor").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] })],
);

/** Corrections to locked expenses (FR-69): a signed delta per member. */
export const expenseAdjustments = pgTable("expense_adjustments", {
  id: id(),
  expenseId: uuid("expense_id").notNull().references(() => expenses.id),
  tripId: uuid("trip_id").notNull().references(() => trips.id),
  memberId: uuid("member_id").notNull().references(() => members.id),
  deltaMinor: money("delta_minor").notNull(),
  reason: text("reason").notNull(),
  createdByMemberId: uuid("created_by_member_id").notNull().references(() => members.id),
  createdAt: createdAt(),
});

export const payments = pgTable(
  "payments",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id),
    fromMemberId: uuid("from_member_id").notNull().references(() => members.id),
    toMemberId: uuid("to_member_id").notNull().references(() => members.id),
    currency: text("currency").notNull(),
    amountMinor: money("amount_minor").notNull(),
    recordedByMemberId: uuid("recorded_by_member_id").notNull().references(() => members.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_trip_idx").on(t.tripId)],
);

/** Private budget answers (FR-74). Only aggregates leave the DB. */
export const budgetAnswers = pgTable("budget_answers", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  currency: text("currency").notNull(),
  minMinor: money("min_minor").notNull(),
  maxMinor: money("max_minor").notNull(),
  /**
   * Members who may see this answer individually: the duo pair when answered in a duo (FR-T9),
   * else empty. Set by trigger, so answers given in a group stay private if the trip shrinks
   * (FR-T5) and a duo keeps seeing each other's answers after it grows (FR-T4).
   */
  openTo: uuid("open_to").array().notNull().default(sql`'{}'::uuid[]`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Plan (§6.11)
// ---------------------------------------------------------------------------

export const planItems = pgTable(
  "plan_items",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id").notNull().references(() => stops.id, { onDelete: "cascade" }),
    ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(), // Day 1 = 0, works without dates (FR-O13)
    startMinute: integer("start_minute"), // minutes after local midnight
    durationMinutes: integer("duration_minutes").notNull().default(90),
    travelMode: text("travel_mode"),
    travelMinutes: integer("travel_minutes"),
    locked: boolean("locked").notNull().default(false),
    attendeeMemberIds: uuid("attendee_member_ids").array(),
    reason: text("reason"),
    hiddenFrom: hiddenFrom(),
    createdAt: createdAt(),
  },
  (t) => [index("plan_items_stop_idx").on(t.stopId)],
);

// ---------------------------------------------------------------------------
// Messaging, auth throttles, audit, analytics
// ---------------------------------------------------------------------------

/** Every outbound text/email; drives throttling (FR-84) and the cost dashboard. */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: id(),
    tripId: uuid("trip_id").references(() => trips.id),
    memberId: uuid("member_id").references(() => members.id),
    channel: text("channel").notNull(), // sms | email
    kind: text("kind").notNull(), // invite | vote_nudge | owe | join_request | digest ...
    toAddress: text("to_address").notNull(),
    body: text("body").notNull(),
    timeSensitive: boolean("time_sensitive").notNull().default(false),
    providerId: text("provider_id"),
    costMicros: bigint("cost_micros", { mode: "number" }),
    createdAt: createdAt(),
  },
  (t) => [index("outbound_member_idx").on(t.toAddress, t.createdAt)],
);

/** The single open text question per person (FR-83, DN-23). */
export const smsOpenQuestions = pgTable("sms_open_questions", {
  phone: text("phone").primaryKey(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // vote | approve_join
  payload: jsonb("payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Undo window for text-in actions (FR-82). */
export const smsUndo = pgTable("sms_undo", {
  phone: text("phone").primaryKey(),
  payload: jsonb("payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const otpRequests = pgTable(
  "otp_requests",
  {
    id: id(),
    destination: text("destination").notNull(),
    ip: text("ip"),
    tripId: uuid("trip_id"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_dest_idx").on(t.destination, t.createdAt), index("otp_ip_idx").on(t.ip, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    tripId: uuid("trip_id").references(() => trips.id),
    actorMemberId: uuid("actor_member_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_trip_idx").on(t.tripId, t.createdAt)],
);

/** Commercial-intent + product events (§11, §12). Never used for ranking. */
export const events = pgTable(
  "events",
  {
    id: id(),
    tripId: uuid("trip_id"),
    memberId: uuid("member_id"),
    name: text("name").notNull(),
    props: jsonb("props"),
    tripSize: tripSize("trip_size"),
    createdAt: createdAt(),
  },
  (t) => [index("events_name_idx").on(t.name, t.createdAt)],
);

/** URL → extraction result cache (FR-34). Service-role only. */
export const extractionCache = pgTable("extraction_cache", {
  normalizedUrl: text("normalized_url").primaryKey(),
  result: jsonb("result").notNull(),
  createdAt: createdAt(),
});
