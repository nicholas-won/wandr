/**
 * Idea library services (§6.12). Everything runs through `withSession` so Row Level Security
 * (migrations/0003_library_rls.sql) decides what the caller sees; only background resolution,
 * import logging and board-link minting run as the service, with their own checks.
 *
 *   FR-L1   save with no trip (paste / type), resolved in the background like trip ideas
 *   FR-L3   auto-sort (country → city/region → category) with user overrides
 *   FR-L4   listicles: save all or pick
 *   FR-L5   duplicates merge into one save, keeping every source
 *   FR-L8   custom boards; FR-L9 note + someday priority
 *   FR-L11  start a trip from a city/board; FR-L12 send to a trip (a COPY, LB-4)
 *   FR-L13  "Save for next time" from a trip idea (place only)
 *   FR-L14  shared boards through personal links (view + add; managing needs a code)
 *   FR-L22  only new AI extractions count as imports (logged, not capped: FR-L24)
 *   FR-L25  a library never shows up in trip views or counts
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  aiImports,
  asService,
  boardItems,
  boardMemberContacts,
  boardMembers,
  boards,
  ideas,
  ideaSources,
  members,
  savedIdeaNotes,
  savedIdeas,
  savedIdeaSources,
  savedIdeaTripSends,
  stops,
  trips,
  users,
  withSession,
  type Claims,
  type Db,
  type Tx,
} from "@wandr/db";
import { classifyInput, createClaudeModel, createPlacesClient, resolveIdea, type ResolvedIdea } from "@wandr/ai";
import { fileIdea, type VoteValue } from "@wandr/core";
import { effectiveSort, foldName, isPending, type LibraryCategory, type SaveLike } from "@wandr/core/library";
import { dbCache } from "./ideas";
import { createTrip } from "./trips";

type Category = LibraryCategory;
const CATEGORIES: readonly Category[] = [
  "city", "stay", "transit", "food", "drink", "nightlife", "activity", "sight", "shopping", "other",
];
export const isCategory = (c: unknown): c is Category => typeof c === "string" && (CATEGORIES as string[]).includes(c);

const own = (userId: string): Claims => ({ sub: userId });

function provisionalTitle(raw: string, kind: string): string {
  if (kind === "text") return raw.trim().split("\n")[0]!.slice(0, 120);
  return kind === "tiktok"
    ? "TikTok save"
    : kind === "instagram"
      ? "Instagram save"
      : kind === "youtube"
        ? "YouTube save"
        : kind === "google_maps"
          ? "Google Maps place"
          : "Saved link";
}

// ---------------------------------------------------------------------------
// Capture (FR-L1) and background resolution (FR-L3, FR-L5, FR-L22)
// ---------------------------------------------------------------------------

/**
 * FR-L1: save a pasted link or typed idea to the caller's own library. The save appears at once
 * ("processing"); call `resolveSavedIdeaJob` in the background to sort it.
 */
export async function saveToLibrary(db: Db, userId: string, args: { raw: string }): Promise<{ savedIdeaId: string }> {
  const raw = args.raw.trim().slice(0, 4000);
  if (!raw) throw new Error("empty");
  const c = classifyInput(raw);
  return withSession(db, own(userId), async (tx) => {
    const [row] = await tx
      .insert(savedIdeas)
      .values({ userId, title: provisionalTitle(raw, c.kind), extraction: "processing" })
      .returning({ id: savedIdeas.id });
    await tx.insert(savedIdeaSources).values({
      savedIdeaId: row!.id,
      kind: c.kind,
      url: c.url,
      caption: c.kind === "text" ? raw : c.text || null,
    });
    return { savedIdeaId: row!.id };
  });
}

/** Background job: resolve one save with no trip context and file it. Never throws. */
export async function resolveSavedIdeaJob(
  db: Db,
  savedIdeaId: string,
  deps: { resolver?: typeof resolveIdea } = {},
): Promise<void> {
  try {
    const ctx = await asService(db, async (tx) => {
      const [save] = await tx.select().from(savedIdeas).where(eq(savedIdeas.id, savedIdeaId));
      if (!save) return null;
      const [source] = await tx
        .select()
        .from(savedIdeaSources)
        .where(eq(savedIdeaSources.savedIdeaId, savedIdeaId))
        .orderBy(asc(savedIdeaSources.createdAt))
        .limit(1);
      return { save, source };
    });
    if (!ctx?.source) return;
    const raw = ctx.source.url
      ? [ctx.source.url, ctx.source.caption].filter(Boolean).join("\n")
      : (ctx.source.caption ?? ctx.save.title);
    const resolver = deps.resolver ?? resolveIdea;
    const actor = ctx.save.userId ?? ctx.save.createdByBoardMemberId ?? "anon";
    const result = await resolver(
      { raw, rateLimitKeys: [`library:${actor}`] },
      null, // FR-L1: no trip, no Stops
      { model: createClaudeModel(), places: createPlacesClient(), cache: dbCache(db) },
    );
    await applySavedResolution(db, savedIdeaId, result);
  } catch (err) {
    console.error("[resolveSavedIdeaJob]", savedIdeaId, err);
    await asService(db, (tx) =>
      tx.update(savedIdeas).set({ extraction: "failed" }).where(eq(savedIdeas.id, savedIdeaId)),
    );
  }
}

/** Person whose import allowance a save spends (D62): the library owner, or a verified board member. */
async function importUserFor(tx: Tx, save: { userId: string | null; createdByBoardMemberId: string | null }) {
  if (save.userId) return save.userId;
  if (!save.createdByBoardMemberId) return null;
  const [bm] = await tx
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(eq(boardMembers.id, save.createdByBoardMemberId));
  return bm?.userId ?? null;
}

/** Find an earlier save this one duplicates (FR-L5): same place or same link, same scope. */
async function findDuplicate(
  tx: Tx,
  save: { id: string; userId: string | null },
  placeId: string | null,
  normalizedUrl: string | null,
): Promise<string | null> {
  // Scope: the owner's library, or (board-only saves) the boards this save is on.
  const scope = save.userId
    ? eq(savedIdeas.userId, save.userId)
    : inArray(
        savedIdeas.id,
        tx
          .select({ id: boardItems.savedIdeaId })
          .from(boardItems)
          .where(
            inArray(
              boardItems.boardId,
              tx.select({ b: boardItems.boardId }).from(boardItems).where(eq(boardItems.savedIdeaId, save.id)),
            ),
          ),
      );
  if (placeId) {
    const [d] = await tx
      .select({ id: savedIdeas.id })
      .from(savedIdeas)
      .where(and(scope, ne(savedIdeas.id, save.id), eq(savedIdeas.placeId, placeId)))
      .orderBy(asc(savedIdeas.createdAt))
      .limit(1);
    if (d) return d.id;
  }
  if (normalizedUrl) {
    const [d] = await tx
      .select({ id: savedIdeas.id })
      .from(savedIdeaSources)
      .innerJoin(savedIdeas, eq(savedIdeas.id, savedIdeaSources.savedIdeaId))
      .where(and(scope, ne(savedIdeas.id, save.id), eq(savedIdeaSources.normalizedUrl, normalizedUrl)))
      .orderBy(asc(savedIdeas.createdAt))
      .limit(1);
    if (d) return d.id;
  }
  return null;
}

/** Merge `fromId` into `intoId`: keep every source and board membership, then drop `fromId`. */
async function mergeSaves(tx: Tx, fromId: string, intoId: string) {
  await tx.update(savedIdeaSources).set({ savedIdeaId: intoId }).where(eq(savedIdeaSources.savedIdeaId, fromId));
  const items = await tx.select().from(boardItems).where(eq(boardItems.savedIdeaId, fromId));
  if (items.length) {
    await tx
      .insert(boardItems)
      .values(items.map((i) => ({ ...i, savedIdeaId: intoId })))
      .onConflictDoNothing();
  }
  await tx.delete(savedIdeas).where(eq(savedIdeas.id, fromId));
}

/** Write a resolver result onto a save (as the service). Exported for tests. */
export async function applySavedResolution(db: Db, savedIdeaId: string, r: ResolvedIdea): Promise<{ mergedInto: string | null }> {
  return asService(db, async (tx) => {
    const [save] = await tx.select().from(savedIdeas).where(eq(savedIdeas.id, savedIdeaId));
    if (!save) return { mergedInto: null };
    const p = r.primary;
    await tx
      .update(savedIdeaSources)
      .set({
        normalizedUrl: r.source.normalizedUrl,
        caption: r.source.caption,
        thumbnailUrl: r.source.thumbnailUrl,
        creatorHandle: r.source.creatorHandle,
      })
      .where(eq(savedIdeaSources.savedIdeaId, savedIdeaId));

    const listicle = r.kind === "listicle" && r.places.length > 1;
    const target = listicle ? null : await findDuplicate(tx, save, p?.placeId ?? null, r.source.normalizedUrl);
    if (target) {
      await mergeSaves(tx, savedIdeaId, target);
    } else {
      const location = p?.location ?? p?.display?.location ?? null;
      await tx
        .update(savedIdeas)
        .set({
          title: (p?.display?.name ?? p?.name ?? r.source.title ?? save.title).slice(0, 120),
          category: p?.category ?? "other",
          summary: p?.summary ?? r.isNonPlaceReason ?? null,
          // A listicle card holds no place until the person picks (avoids a FR-L5 clash).
          placeId: listicle ? null : (p?.placeId ?? null),
          placeCache: p?.display ?? null,
          placeCachedAt: p?.display ? new Date() : null,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          priceLevel: p?.priceLevel ?? p?.display?.priceLevel ?? null,
          confidence: r.confidence,
          permanentlyClosed: p?.permanentlyClosed ?? false, // FR-L18, LB-9
          country: (p?.country ?? p?.display?.countryCode ?? null)?.toUpperCase() ?? null,
          regionOrCity: p?.regionOrCity ?? p?.display?.locality ?? p?.cityHint ?? null,
          extraction: r.state === "resolved" && r.needsReview ? "needs_review" : r.state,
          candidates: listicle ? r.places : null, // FR-L4
        })
        .where(eq(savedIdeas.id, savedIdeaId));
    }

    // FR-L22 / D62: log every attempt; the trigger sets `counted` (only new AI extractions).
    const userId = await importUserFor(tx, save);
    if (userId) {
      await tx.insert(aiImports).values({
        userId,
        savedIdeaId: target ?? savedIdeaId,
        kind:
          r.source.kind === "text" ? "text" : r.fromCache ? "cache_hit" : r.state === "failed" ? "failed" : "extraction",
        normalizedUrl: r.source.normalizedUrl,
      });
    }
    return { mergedInto: target };
  });
}

/** FR-L4: keep the picked listicle places; each becomes its own save (deduped, FR-L5). */
export async function pickSavedListicle(db: Db, userId: string, args: { savedIdeaId: string; indexes: number[] }) {
  return withSession(db, own(userId), async (tx) => {
    const [save] = await tx
      .select()
      .from(savedIdeas)
      .where(and(eq(savedIdeas.id, args.savedIdeaId), eq(savedIdeas.userId, userId)));
    if (!save?.candidates) return;
    const places = save.candidates as ResolvedIdea["places"];
    const picks = [...new Set(args.indexes)].map((i) => places[i]).filter((p): p is NonNullable<typeof p> => !!p);
    const [source] = await tx.select().from(savedIdeaSources).where(eq(savedIdeaSources.savedIdeaId, save.id));
    const existing = new Set(
      (
        await tx
          .select({ p: savedIdeas.placeId })
          .from(savedIdeas)
          .where(
            and(eq(savedIdeas.userId, userId), ne(savedIdeas.id, save.id), sql`${savedIdeas.placeId} is not null`),
          )
      ).map((r) => r.p),
    );
    const fields = (p: (typeof picks)[number]) => {
      const location = p.location ?? p.display?.location ?? null;
      return {
        title: (p.display?.name ?? p.name).slice(0, 120),
        category: p.category,
        summary: p.summary,
        placeId: p.placeId,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        country: (p.country ?? p.display?.countryCode ?? null)?.toUpperCase() ?? null,
        regionOrCity: p.regionOrCity ?? p.display?.locality ?? p.cityHint ?? null,
        confidence: p.confidence,
        permanentlyClosed: p.permanentlyClosed,
        extraction: (p.needsReview ? "needs_review" : "resolved") as "needs_review" | "resolved",
      };
    };
    const fresh = picks.filter((p) => {
      if (!p.placeId) return true;
      if (existing.has(p.placeId)) return false;
      existing.add(p.placeId);
      return true;
    });
    const [first, ...rest] = fresh;
    for (const p of rest) {
      const [row] = await tx.insert(savedIdeas).values({ userId, ...fields(p) }).returning({ id: savedIdeas.id });
      if (source) {
        await tx.insert(savedIdeaSources).values({
          savedIdeaId: row!.id,
          kind: source.kind,
          url: source.url,
          normalizedUrl: source.normalizedUrl,
          thumbnailUrl: source.thumbnailUrl,
          creatorHandle: source.creatorHandle,
        });
      }
    }
    if (!first) {
      // Nothing new picked (or all already saved): drop the listicle card itself.
      await tx.delete(savedIdeas).where(eq(savedIdeas.id, save.id));
      return;
    }
    await tx
      .update(savedIdeas)
      .set({ ...fields(first), candidates: null })
      .where(eq(savedIdeas.id, save.id));
  });
}

// ---------------------------------------------------------------------------
// Reading the library (FR-L6, FR-L7)
// ---------------------------------------------------------------------------

export interface SaveView extends SaveLike {
  id: string;
  title: string;
  summary: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  needsReview: boolean;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  creatorHandle: string | null;
  sourceCount: number;
  note: string | null;
  priority: VoteValue | null;
  listicle: { name: string; summary: string }[] | null;
  createdAt: Date;
}

type SaveRow = typeof savedIdeas.$inferSelect;
type SourceRow = typeof savedIdeaSources.$inferSelect;

function toView(s: SaveRow, sources: SourceRow[], note?: { note: string | null; somedayPriority: VoteValue | null }): SaveView {
  const first = [...sources].sort((a, b) => +a.createdAt - +b.createdAt)[0];
  const withThumb = sources.find((x) => x.thumbnailUrl);
  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    extraction: s.extraction,
    category: s.category,
    country: s.country,
    regionOrCity: s.regionOrCity,
    countryOverride: s.countryOverride,
    regionOrCityOverride: s.regionOrCityOverride,
    categoryOverride: s.categoryOverride,
    permanentlyClosed: s.permanentlyClosed,
    placeId: s.placeId,
    lat: s.lat,
    lng: s.lng,
    needsReview: s.extraction === "needs_review",
    thumbnailUrl: withThumb?.thumbnailUrl ?? null,
    sourceUrl: first?.url ?? null,
    sourceKind: first?.kind ?? null,
    creatorHandle: first?.creatorHandle ?? null,
    sourceCount: sources.length,
    note: note?.note ?? null,
    priority: note?.somedayPriority ?? null,
    listicle:
      Array.isArray(s.candidates) && s.candidates.length > 1
        ? (s.candidates as { name: string; summary: string }[]).map((c) => ({ name: c.name, summary: c.summary }))
        : null,
    createdAt: s.createdAt,
  };
}

async function loadViews(tx: Tx, rows: SaveRow[], withNotes: boolean): Promise<SaveView[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const sources = await tx.select().from(savedIdeaSources).where(inArray(savedIdeaSources.savedIdeaId, ids));
  const notes = withNotes
    ? await tx.select().from(savedIdeaNotes).where(inArray(savedIdeaNotes.savedIdeaId, ids))
    : [];
  const bySave = new Map<string, SourceRow[]>();
  for (const s of sources) bySave.set(s.savedIdeaId, [...(bySave.get(s.savedIdeaId) ?? []), s]);
  const noteBy = new Map(notes.map((n) => [n.savedIdeaId, n]));
  return rows.map((r) => toView(r, bySave.get(r.id) ?? [], noteBy.get(r.id)));
}

/**
 * The caller's own library (newest first). Filters to `user_id = me`: RLS also lets board
 * members see other people's board items, which are not part of this person's library.
 */
export async function listMySaves(db: Db, userId: string): Promise<SaveView[]> {
  return withSession(db, own(userId), async (tx) => {
    const rows = await tx
      .select()
      .from(savedIdeas)
      .where(eq(savedIdeas.userId, userId))
      .orderBy(desc(savedIdeas.createdAt));
    return loadViews(tx, rows, true);
  });
}

/** P2: show the Library entry only once the person has saves. */
export async function countMySaves(db: Db, userId: string): Promise<number> {
  return withSession(db, own(userId), async (tx) => {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(savedIdeas)
      .where(eq(savedIdeas.userId, userId));
    return r?.n ?? 0;
  });
}

export interface SaveDetail extends SaveView {
  sources: { id: string; kind: string; url: string | null; creatorHandle: string | null }[];
  /** Boards the caller can add to, and whether this save is on each (FR-L8). */
  boards: { id: string; name: string; on: boolean; shared: boolean }[];
  /** Trips it was sent to (provenance only; the trip holds a copy, LB-4). */
  sentTo: { tripId: string; tripName: string }[];
}

export async function getSave(db: Db, userId: string, savedIdeaId: string): Promise<SaveDetail | null> {
  return withSession(db, own(userId), async (tx) => {
    const [row] = await tx
      .select()
      .from(savedIdeas)
      .where(and(eq(savedIdeas.id, savedIdeaId), eq(savedIdeas.userId, userId)));
    if (!row) return null;
    const [view] = await loadViews(tx, [row], true);
    const sources = await tx
      .select()
      .from(savedIdeaSources)
      .where(eq(savedIdeaSources.savedIdeaId, savedIdeaId))
      .orderBy(asc(savedIdeaSources.createdAt));
    const myBoards = await listMyBoardsTx(tx, userId);
    const on = new Set(
      (await tx.select({ b: boardItems.boardId }).from(boardItems).where(eq(boardItems.savedIdeaId, savedIdeaId))).map(
        (r) => r.b,
      ),
    );
    const sent = await tx
      .select({ tripId: savedIdeaTripSends.tripId, tripName: trips.name })
      .from(savedIdeaTripSends)
      .innerJoin(trips, eq(trips.id, savedIdeaTripSends.tripId))
      .where(eq(savedIdeaTripSends.savedIdeaId, savedIdeaId));
    return {
      ...view!,
      sources: sources.map((s) => ({ id: s.id, kind: s.kind, url: s.url, creatorHandle: s.creatorHandle })),
      boards: myBoards.map((b) => ({ id: b.id, name: b.name, on: on.has(b.id), shared: b.memberCount > 1 })),
      sentTo: [...new Map(sent.map((s) => [s.tripId, s])).values()],
    };
  });
}

// ---------------------------------------------------------------------------
// Editing saves (§5 overrides, FR-L9)
// ---------------------------------------------------------------------------

/** §5: override the auto-sort. `null` clears an override (back to the AI's value). */
export async function updateSaveSort(
  db: Db,
  userId: string,
  args: { savedIdeaId: string; country?: string | null; city?: string | null; category?: Category | null; title?: string },
) {
  const country = args.country === undefined ? undefined : args.country?.trim().toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) throw new Error("bad_country");
  return withSession(db, own(userId), (tx) =>
    tx
      .update(savedIdeas)
      .set({
        ...(country !== undefined ? { countryOverride: country } : {}),
        ...(args.city !== undefined ? { regionOrCityOverride: args.city?.trim().slice(0, 80) || null } : {}),
        ...(args.category !== undefined ? { categoryOverride: args.category } : {}),
        ...(args.title?.trim()
          ? { title: args.title.trim().slice(0, 120), extraction: "resolved" as const, confidence: 1 }
          : {}),
      })
      .where(and(eq(savedIdeas.id, args.savedIdeaId), eq(savedIdeas.userId, userId)))
      .returning({ id: savedIdeas.id }),
  );
}

/** FR-L9: personal note and someday priority (Must-do / Maybe / Skip). Owner only. */
export async function setSaveNote(
  db: Db,
  userId: string,
  args: { savedIdeaId: string; note?: string | null; priority?: VoteValue | null },
) {
  return withSession(db, own(userId), async (tx) => {
    const set = {
      ...(args.note !== undefined ? { note: args.note?.trim().slice(0, 1000) || null } : {}),
      ...(args.priority !== undefined ? { somedayPriority: args.priority } : {}),
      updatedAt: new Date(),
    };
    await tx
      .insert(savedIdeaNotes)
      .values({ savedIdeaId: args.savedIdeaId, userId, note: null, somedayPriority: null, ...set })
      .onConflictDoUpdate({ target: savedIdeaNotes.savedIdeaId, set });
  });
}

/** Delete a save. Trip copies are untouched (LB-4). */
export async function deleteSave(db: Db, userId: string, savedIdeaId: string) {
  return withSession(db, own(userId), (tx) =>
    tx.delete(savedIdeas).where(and(eq(savedIdeas.id, savedIdeaId), eq(savedIdeas.userId, userId))),
  );
}

// ---------------------------------------------------------------------------
// Boards (FR-L8, FR-L14, FR-L15, LB-6)
// ---------------------------------------------------------------------------

export interface BoardSummary {
  id: string;
  name: string;
  isOwner: boolean;
  memberCount: number;
  itemCount: number;
}

async function listMyBoardsTx(tx: Tx, userId: string): Promise<BoardSummary[]> {
  // RLS returns boards I own or am an active member of.
  const rows = await tx.select().from(boards).orderBy(asc(boards.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((b) => b.id);
  const mc = await tx
    .select({ b: boardMembers.boardId, n: sql<number>`count(*)::int` })
    .from(boardMembers)
    .where(and(inArray(boardMembers.boardId, ids), eq(boardMembers.status, "active")))
    .groupBy(boardMembers.boardId);
  const ic = await tx
    .select({ b: boardItems.boardId, n: sql<number>`count(*)::int` })
    .from(boardItems)
    .where(inArray(boardItems.boardId, ids))
    .groupBy(boardItems.boardId);
  const mcm = new Map(mc.map((r) => [r.b, r.n]));
  const icm = new Map(ic.map((r) => [r.b, r.n]));
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    isOwner: b.ownerUserId === userId,
    memberCount: mcm.get(b.id) ?? 1,
    itemCount: icm.get(b.id) ?? 0,
  }));
}

export async function listMyBoards(db: Db, userId: string): Promise<BoardSummary[]> {
  return withSession(db, own(userId), (tx) => listMyBoardsTx(tx, userId));
}

export async function createBoard(db: Db, userId: string, name: string): Promise<{ boardId: string }> {
  const n = name.trim().slice(0, 80);
  if (!n) throw new Error("empty");
  return withSession(db, own(userId), async (tx) => {
    const [b] = await tx.insert(boards).values({ name: n, ownerUserId: userId }).returning({ id: boards.id });
    return { boardId: b!.id };
  });
}

/** Owner only (RLS). Returns false if nothing changed. */
export async function renameBoard(db: Db, userId: string, args: { boardId: string; name: string }) {
  const n = args.name.trim().slice(0, 80);
  if (!n) throw new Error("empty");
  const r = await withSession(db, own(userId), (tx) =>
    tx.update(boards).set({ name: n }).where(eq(boards.id, args.boardId)).returning({ id: boards.id }),
  );
  return r.length > 0;
}

export async function deleteBoard(db: Db, userId: string, boardId: string) {
  const r = await withSession(db, own(userId), (tx) =>
    tx.delete(boards).where(eq(boards.id, boardId)).returning({ id: boards.id }),
  );
  return r.length > 0;
}

/** FR-L8: put own saves on a board (RLS: only your own saves, only boards you're on). */
export async function addToBoard(db: Db, userId: string, args: { boardId: string; savedIdeaIds: string[] }) {
  if (args.savedIdeaIds.length === 0) return;
  return withSession(db, own(userId), (tx) =>
    tx
      .insert(boardItems)
      .values(args.savedIdeaIds.map((savedIdeaId) => ({ boardId: args.boardId, savedIdeaId })))
      .onConflictDoNothing(),
  );
}

/** Owner removes any item; a verified member removes what they added (RLS). */
export async function removeFromBoard(db: Db, claims: Claims, args: { boardId: string; savedIdeaId: string }) {
  const r = await withSession(db, claims, (tx) =>
    tx
      .delete(boardItems)
      .where(and(eq(boardItems.boardId, args.boardId), eq(boardItems.savedIdeaId, args.savedIdeaId)))
      .returning({ id: boardItems.savedIdeaId }),
  );
  return r.length > 0;
}

export interface BoardView {
  board: { id: string; name: string };
  /** The caller's board_members row. */
  me: { boardMemberId: string | null; isOwner: boolean; viaLink: boolean };
  /** Names only, never phones (FR-L26). */
  members: { id: string; displayName: string; role: string; isMe: boolean }[];
  items: (SaveView & {
    addedBy: string | null;
    addedByMe: boolean;
    /** In the caller's own library (links to its detail page). */
    inMyLibrary: boolean;
  })[];
}

/**
 * A board as the caller sees it (verified user or board-link session). Returns null if the
 * caller isn't on it. Shows ONLY this board's saves (FR-L14); owner notes stay private.
 */
export async function getBoardView(db: Db, claims: Claims, boardId: string): Promise<BoardView | null> {
  return withSession(db, claims, async (tx) => {
    const [board] = await tx.select().from(boards).where(eq(boards.id, boardId));
    if (!board) return null;
    const memberRows = await tx
      .select()
      .from(boardMembers)
      .where(eq(boardMembers.boardId, boardId))
      .orderBy(asc(boardMembers.createdAt));
    const meRow = memberRows.find(
      (m) => m.status === "active" && (claims.sub ? m.userId === claims.sub : m.id === claims.board_link),
    );
    const isOwner = !!claims.sub && board.ownerUserId === claims.sub;
    if (!meRow && !isOwner) return null;
    const items = await tx
      .select({ save: savedIdeas, addedBy: boardItems.addedByBoardMemberId })
      .from(boardItems)
      .innerJoin(savedIdeas, eq(savedIdeas.id, boardItems.savedIdeaId))
      .where(eq(boardItems.boardId, boardId))
      .orderBy(desc(boardItems.createdAt));
    // Notes are owner-private (RLS returns only the caller's own anyway).
    const views = await loadViews(
      tx,
      items.map((i) => i.save),
      !!claims.sub,
    );
    const byId = new Map(memberRows.map((m) => [m.id, m]));
    return {
      board: { id: board.id, name: board.name },
      me: { boardMemberId: meRow?.id ?? null, isOwner, viaLink: !claims.sub },
      members: memberRows
        .filter((m) => m.status === "active")
        .map((m) => ({ id: m.id, displayName: m.displayName, role: m.role, isMe: m.id === meRow?.id })),
      items: views.map((v, i) => {
        const by = items[i]!.addedBy ? byId.get(items[i]!.addedBy!) : undefined;
        return {
          ...v,
          // LB-6: items from people who left stay, marked "former member".
          addedBy: by ? (by.status === "active" ? by.displayName : `${by.displayName} (former member)`) : null,
          addedByMe: !!meRow && items[i]!.addedBy === meRow.id,
          inMyLibrary: !!claims.sub && items[i]!.save.userId === claims.sub,
        };
      }),
    };
  });
}

/**
 * FR-L14: add a pasted link or typed idea to a board. The owner's saves go to their own library
 * (and onto the board); anyone else's is a board-only save, so it never enters a library they
 * didn't choose (LB-6). Resolve it in the background with `resolveSavedIdeaJob`.
 */
export async function addToBoardFromPaste(
  db: Db,
  claims: Claims,
  args: { boardId: string; raw: string },
): Promise<{ savedIdeaId: string }> {
  const raw = args.raw.trim().slice(0, 4000);
  if (!raw) throw new Error("empty");
  const c = classifyInput(raw);
  return withSession(db, claims, async (tx) => {
    const [board] = await tx.select().from(boards).where(eq(boards.id, args.boardId));
    if (!board) throw new Error("not_found");
    const isOwner = !!claims.sub && board.ownerUserId === claims.sub;
    let createdByBoardMemberId: string | null = null;
    if (!isOwner) {
      const [me] = await tx
        .select({ id: boardMembers.id })
        .from(boardMembers)
        .where(
          and(
            eq(boardMembers.boardId, args.boardId),
            eq(boardMembers.status, "active"),
            claims.sub ? eq(boardMembers.userId, claims.sub) : eq(boardMembers.id, claims.board_link ?? ""),
          ),
        );
      if (!me) throw new Error("not_a_member");
      createdByBoardMemberId = me.id;
    }
    const [row] = await tx
      .insert(savedIdeas)
      .values({
        userId: isOwner ? claims.sub! : null,
        createdByBoardMemberId,
        title: provisionalTitle(raw, c.kind),
        extraction: "processing",
      })
      .returning({ id: savedIdeas.id });
    await tx.insert(savedIdeaSources).values({
      savedIdeaId: row!.id,
      kind: c.kind,
      url: c.url,
      caption: c.kind === "text" ? raw : c.text || null,
    });
    await tx.insert(boardItems).values({ boardId: args.boardId, savedIdeaId: row!.id });
    return { savedIdeaId: row!.id };
  });
}

/**
 * FR-L14: the owner adds someone to a shared board. Returns the board member id; mint their
 * personal link with `createBoardLink` (service). Phone is optional and service-only (FR-L26).
 */
export async function addBoardMember(
  db: Db,
  userId: string,
  args: { boardId: string; name: string; phoneE164?: string | null },
): Promise<{ boardMemberId: string }> {
  const name = args.name.trim().slice(0, 40);
  if (!name) throw new Error("empty");
  const boardMemberId = await withSession(db, own(userId), async (tx) => {
    const [m] = await tx
      .insert(boardMembers)
      .values({ boardId: args.boardId, displayName: name, role: "member" })
      .returning({ id: boardMembers.id });
    return m!.id;
  });
  if (args.phoneE164) {
    await asService(db, (tx) =>
      tx.insert(boardMemberContacts).values({ boardMemberId, phone: args.phoneE164! }).onConflictDoNothing(),
    );
  }
  return { boardMemberId };
}

/** Owner removes a member (RLS + trigger enforce owner-only and that the owner stays). */
export async function removeBoardMember(db: Db, userId: string, args: { boardId: string; boardMemberId: string }) {
  const r = await withSession(db, own(userId), (tx) =>
    tx
      .update(boardMembers)
      .set({ status: "removed", removedAt: new Date() })
      .where(and(eq(boardMembers.id, args.boardMemberId), eq(boardMembers.boardId, args.boardId)))
      .returning({ id: boardMembers.id }),
  );
  return r.length > 0;
}

/** Is the caller (verified) the owner of this board? Used before minting links as the service. */
export async function isBoardOwner(db: Db, userId: string, boardId: string): Promise<boolean> {
  const [b] = await withSession(db, own(userId), (tx) =>
    tx.select({ id: boards.id }).from(boards).where(and(eq(boards.id, boardId), eq(boards.ownerUserId, userId))),
  );
  return !!b;
}

/** Board member row belongs to this board (service check before minting a link). */
export async function boardMemberOnBoard(db: Db, boardMemberId: string, boardId: string) {
  const [m] = await asService(db, (tx) =>
    tx
      .select({ id: boardMembers.id })
      .from(boardMembers)
      .where(
        and(eq(boardMembers.id, boardMemberId), eq(boardMembers.boardId, boardId), eq(boardMembers.status, "active")),
      ),
  );
  return !!m;
}

// ---------------------------------------------------------------------------
// Saves → trips (FR-L11, FR-L12, FR-L13; copies, LB-4)
// ---------------------------------------------------------------------------

export type SendResult = { sent: number; merged: number; skipped: number; ideaIds: string[] };

/**
 * FR-L12: copy saves into a trip the caller belongs to (verified session; RLS checks the trip
 * and that every save is the caller's own, LB-5). Each copy is filed to a Stop (FR-S6): by
 * location, else by city name, else Unsorted ("New city?"). A save whose place is already in the
 * trip adds its source links to that idea instead (FR-22). Never counts as an AI import (FR-L22).
 * Saves still being sorted are skipped.
 */
export async function sendSavesToTrip(
  db: Db,
  userId: string,
  args: { tripId: string; savedIdeaIds: string[]; boardId?: string | null },
): Promise<SendResult> {
  const out: SendResult = { sent: 0, merged: 0, skipped: 0, ideaIds: [] };
  if (args.savedIdeaIds.length === 0) return out;
  await withSession(db, own(userId), async (tx) => {
    const [me] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, args.tripId), eq(members.userId, userId), eq(members.status, "active")));
    if (!me) throw new Error("not_a_member");
    const tripStops = await tx
      .select({
        id: stops.id,
        name: stops.name,
        isDefault: stops.isDefault,
        position: stops.position,
        lat: stops.lat,
        lng: stops.lng,
      })
      .from(stops)
      .where(eq(stops.tripId, args.tripId));
    const mine = await tx
      .select()
      .from(savedIdeas)
      .where(and(inArray(savedIdeas.id, args.savedIdeaIds), eq(savedIdeas.userId, userId)));
    // FR-L15: on a board the caller owns, saves friends added (board-only, no library behind
    // them) can be copied too. They have no library to link back to (LB-4/LB-5).
    const boardOnly = args.boardId
      ? await tx
          .select({ s: savedIdeas })
          .from(boardItems)
          .innerJoin(boards, eq(boards.id, boardItems.boardId))
          .innerJoin(savedIdeas, eq(savedIdeas.id, boardItems.savedIdeaId))
          .where(
            and(
              eq(boardItems.boardId, args.boardId),
              eq(boards.ownerUserId, userId),
              isNull(savedIdeas.userId),
              inArray(savedIdeas.id, args.savedIdeaIds),
            ),
          )
      : [];
    const rows = [...mine, ...boardOnly.map((r) => r.s)];
    out.skipped += args.savedIdeaIds.length - rows.length;
    const sources = rows.length
      ? await tx.select().from(savedIdeaSources).where(inArray(savedIdeaSources.savedIdeaId, rows.map((r) => r.id)))
      : [];

    for (const s of rows) {
      if (isPending(s) || s.candidates) {
        out.skipped++;
        continue;
      }
      const e = effectiveSort(s);
      const srcs = sources.filter((x) => x.savedIdeaId === s.id);
      // FR-22: the place is already an idea in this trip → add the links there.
      const [dup] = s.placeId
        ? await tx
            .select({ id: ideas.id })
            .from(ideas)
            .where(and(eq(ideas.tripId, args.tripId), eq(ideas.placeId, s.placeId)))
            .limit(1)
        : [];
      let ideaId: string;
      if (dup) {
        ideaId = dup.id;
        out.merged++;
      } else {
        const filed = fileIdea(s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null, tripStops);
        let stopId = filed.kind === "stop" ? filed.stopId : null;
        if (!stopId && e.city) {
          const f = foldName(e.city);
          stopId = tripStops.find((st) => st.name && foldName(st.name) === f)?.id ?? null;
        }
        // A multi-Stop trip whose stops carry no coordinates: fileIdea falls back to the default
        // Stop; prefer a name match when the city is a different Stop.
        if (filed.kind === "stop" && filed.distanceKm == null && e.city && tripStops.length > 1) {
          const f = foldName(e.city);
          const named = tripStops.find((st) => st.name && foldName(st.name) === f);
          if (named) stopId = named.id;
        }
        const [idea] = await tx
          .insert(ideas)
          .values({
            tripId: args.tripId,
            stopId,
            title: s.title,
            category: e.category,
            summary: s.summary,
            placeId: s.placeId,
            placeCache: s.placeCache,
            placeCachedAt: s.placeCachedAt,
            lat: s.lat,
            lng: s.lng,
            cityHint: e.city,
            priceLevel: s.priceLevel,
            confidence: s.confidence,
            permanentlyClosed: s.permanentlyClosed,
            extraction: s.extraction,
            sourceSavedIdeaId: s.userId ? s.id : null,
          })
          .returning({ id: ideas.id });
        ideaId = idea!.id;
        out.sent++;
      }
      const toCopy = srcs.length ? srcs : [];
      if (toCopy.length) {
        await tx.insert(ideaSources).values(
          toCopy.map((x) => ({
            ideaId,
            kind: x.kind,
            url: x.url,
            normalizedUrl: x.normalizedUrl,
            caption: x.caption,
            thumbnailUrl: x.thumbnailUrl,
            creatorHandle: x.creatorHandle,
          })),
        );
      } else if (!dup) {
        // Trip cards expect a source row (FR-26); a place-only save becomes a "note" source.
        await tx.insert(ideaSources).values({ ideaId, kind: "text", caption: s.title });
      }
      if (s.userId) {
        await tx
          .insert(savedIdeaTripSends)
          .values({ savedIdeaId: s.id, tripId: args.tripId, ideaId, sentByUserId: userId })
          .onConflictDoNothing();
      }
      out.ideaIds.push(ideaId);
    }
  });
  if (out.sent + out.merged > 0) {
    await asService(db, (tx) => tx.update(trips).set({ lastActivityAt: new Date() }).where(eq(trips.id, args.tripId)));
  }
  return out;
}

/**
 * FR-L11 / FR-1a: one tap makes a trip with the city as its Stop and the chosen saves copied in.
 * The trip is then a normal solo trip; FR-L15 invites happen separately (`boardInvitees`).
 */
export async function startTripFromSaves(
  db: Db,
  args: {
    userId: string;
    ownerName: string;
    name: string;
    city: string | null;
    savedIdeaIds: string[];
    boardId?: string | null;
  },
): Promise<{ tripId: string } & SendResult> {
  const { tripId } = await createTrip(db, {
    userId: args.userId,
    ownerName: args.ownerName,
    name: args.name,
    city: args.city,
  });
  const r = await sendSavesToTrip(db, args.userId, { tripId, savedIdeaIds: args.savedIdeaIds, boardId: args.boardId });
  return { tripId, ...r };
}

/**
 * FR-L15: board members to invite to a trip made from a shared board, with a phone we can text.
 * Owner only (checked with RLS first); phones are read as the service and never returned to the
 * client, only handed to `inviteMember`.
 */
export async function boardInvitees(db: Db, userId: string, boardId: string) {
  if (!(await isBoardOwner(db, userId, boardId))) return [];
  return asService(db, async (tx) => {
    const rows = await tx
      .select({
        name: boardMembers.displayName,
        contactPhone: boardMemberContacts.phone,
        userPhone: users.phone,
        userId: boardMembers.userId,
      })
      .from(boardMembers)
      .leftJoin(boardMemberContacts, eq(boardMemberContacts.boardMemberId, boardMembers.id))
      .leftJoin(users, eq(users.id, boardMembers.userId))
      .where(
        and(eq(boardMembers.boardId, boardId), eq(boardMembers.status, "active"), eq(boardMembers.role, "member")),
      );
    return rows
      .map((r) => ({ name: r.name, phone: r.userPhone ?? r.contactPhone }))
      .filter((r): r is { name: string; phone: string } => !!r.phone);
  });
}

/**
 * FR-L13 "Save for next time": copy a trip idea's PLACE into the caller's own library. Never
 * votes, comments or who shared it. RLS decides whether the caller can see the idea (incl.
 * surprise items, FR-91). Returns the existing save if this place is already saved (FR-L5).
 */
export async function saveTripIdeaToLibrary(
  db: Db,
  userId: string,
  args: { tripId: string; ideaId: string },
): Promise<{ savedIdeaId: string; already: boolean } | null> {
  return withSession(db, own(userId), async (tx) => {
    const [idea] = await tx
      .select()
      .from(ideas)
      .where(and(eq(ideas.id, args.ideaId), eq(ideas.tripId, args.tripId)));
    if (!idea || idea.extraction === "processing" || idea.extraction === "queued") return null;
    if (idea.placeId) {
      const [have] = await tx
        .select({ id: savedIdeas.id })
        .from(savedIdeas)
        .where(and(eq(savedIdeas.userId, userId), eq(savedIdeas.placeId, idea.placeId)));
      if (have) return { savedIdeaId: have.id, already: true };
    }
    const cache = (idea.placeCache ?? null) as { countryCode?: string | null; locality?: string | null } | null;
    const [row] = await tx
      .insert(savedIdeas)
      .values({
        userId,
        title: idea.title,
        category: idea.category,
        summary: idea.summary,
        placeId: idea.placeId,
        placeCache: idea.placeCache,
        placeCachedAt: idea.placeCachedAt,
        lat: idea.lat,
        lng: idea.lng,
        priceLevel: idea.priceLevel,
        confidence: idea.confidence,
        permanentlyClosed: idea.permanentlyClosed,
        country: cache?.countryCode?.toUpperCase() ?? null,
        regionOrCity: idea.cityHint ?? cache?.locality ?? null,
        extraction: idea.extraction === "failed" ? "needs_review" : idea.extraction,
      })
      .returning({ id: savedIdeas.id });
    return { savedIdeaId: row!.id, already: false };
  });
}

/** Trips the caller can send saves to (active member, verified session). */
export async function sendableTrips(db: Db, userId: string) {
  return withSession(db, own(userId), (tx) =>
    tx
      .select({ id: trips.id, name: trips.name })
      .from(trips)
      .innerJoin(members, and(eq(members.tripId, trips.id), eq(members.userId, userId)))
      .where(eq(members.status, "active"))
      .orderBy(desc(trips.lastActivityAt)),
  );
}
