/**
 * Idea capture (FR-20–26) and AI resolution (FR-30–35).
 *
 * addIdea inserts a "processing" card immediately as the caller (RLS decides whether they may
 * add ideas), then resolveIdeaJob fills it in the background as the service. Fetched captions
 * are stored as data only; the AI package treats them as untrusted (C-20/C-21).
 */
import { and, eq, ne, or } from "drizzle-orm";
import {
  aiImports,
  asService,
  extractionCache,
  ideas,
  ideaSources,
  members,
  stops,
  trips,
  withSession,
  type Claims,
  type Db,
} from "@wandr/db";
import {
  classifyInput,
  createClaudeModel,
  createPlacesClient,
  resolveIdea,
  type ResolveCache,
  type ResolvedIdea,
} from "@wandr/ai";
import { DEFAULT_TRIP_NAME } from "./trips";

/** First line of a typed idea becomes the title (FR-25 plain-text ideas). */
function provisionalTitle(raw: string, kind: string): string {
  if (kind === "text") return raw.trim().split("\n")[0]!.slice(0, 120);
  return kind === "tiktok"
    ? "TikTok idea"
    : kind === "instagram"
      ? "Instagram idea"
      : kind === "youtube"
        ? "YouTube idea"
        : kind === "google_maps"
          ? "Google Maps place"
          : "Link idea";
}

export async function addIdea(
  db: Db,
  claims: Claims,
  args: { tripId: string; memberId: string; raw: string },
): Promise<{ ideaId: string; needsResolve: boolean }> {
  const raw = args.raw.trim().slice(0, 4000);
  if (!raw) throw new Error("empty");
  const c = classifyInput(raw);
  return withSession(db, claims, async (tx) => {
    const [idea] = await tx
      .insert(ideas)
      .values({
        tripId: args.tripId,
        title: provisionalTitle(raw, c.kind),
        extraction: "processing",
        createdByMemberId: args.memberId,
      })
      .returning({ id: ideas.id });
    await tx.insert(ideaSources).values({
      ideaId: idea!.id,
      kind: c.kind,
      url: c.url,
      caption: c.kind === "text" ? raw : c.text || null,
      sharedByMemberId: args.memberId,
    });
    return { ideaId: idea!.id, needsResolve: true };
  });
}

/** extraction_cache-backed cache (FR-34). Values carry their own expiry. */
export function dbCache(db: Db): ResolveCache {
  return {
    async get(key) {
      const [row] = await asService(db, (tx) =>
        tx.select().from(extractionCache).where(eq(extractionCache.normalizedUrl, key)),
      );
      if (!row) return null;
      const v = row.result as { exp: number; value: unknown };
      return v.exp > Date.now() ? v.value : null;
    },
    async set(key, value, ttlSeconds) {
      const result = { exp: Date.now() + ttlSeconds * 1000, value };
      await asService(db, (tx) =>
        tx
          .insert(extractionCache)
          .values({ normalizedUrl: key, result })
          .onConflictDoUpdate({ target: extractionCache.normalizedUrl, set: { result, createdAt: new Date() } }),
      );
    },
  };
}

/** Background job: resolve one idea and file it. Never throws. */
export async function resolveIdeaJob(db: Db, ideaId: string, deps: { resolver?: typeof resolveIdea } = {}) {
  try {
    const ctx = await asService(db, async (tx) => {
      const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId));
      if (!idea) return null;
      const [source] = await tx.select().from(ideaSources).where(eq(ideaSources.ideaId, ideaId));
      const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, idea.tripId));
      const stopRows = await tx
        .select({ id: stops.id, name: stops.name, lat: stops.lat, lng: stops.lng })
        .from(stops)
        .where(eq(stops.tripId, idea.tripId));
      return { idea, source, tripName: trip?.name ?? null, stops: stopRows };
    });
    if (!ctx || !ctx.source) return;
    const raw = ctx.source.url
      ? [ctx.source.url, ctx.source.caption].filter(Boolean).join("\n")
      : (ctx.source.caption ?? ctx.idea.title);
    const resolver = deps.resolver ?? resolveIdea;
    const result = await resolver(
      { raw, rateLimitKeys: [`trip:${ctx.idea.tripId}`, `member:${ctx.source.sharedByMemberId}`] },
      { stops: ctx.stops, tripName: ctx.tripName },
      { model: createClaudeModel(), places: createPlacesClient(), cache: dbCache(db) },
    );
    await applyResolution(db, ideaId, ctx.idea.tripId, ctx.source.sharedByMemberId, ctx.stops, result);
  } catch (err) {
    console.error("[resolveIdeaJob]", ideaId, err);
    await asService(db, (tx) => tx.update(ideas).set({ extraction: "failed" }).where(eq(ideas.id, ideaId)));
  }
}

export async function applyResolution(
  db: Db,
  ideaId: string,
  tripId: string,
  sharedByMemberId: string | null,
  tripStops: { id: string; name: string }[],
  r: ResolvedIdea,
) {
  await asService(db, async (tx) => {
    const p = r.primary;
    // A single hidden Stop (one-city trip) takes everything that isn't clearly elsewhere.
    const defaultStop = tripStops.length === 1 ? tripStops[0]!.id : null;
    const stopId = p?.stopId ?? (p?.distanceToStopKm == null ? defaultStop : null);

    await tx
      .update(ideaSources)
      .set({
        normalizedUrl: r.source.normalizedUrl,
        caption: r.source.caption,
        thumbnailUrl: r.source.thumbnailUrl,
        creatorHandle: r.source.creatorHandle,
      })
      .where(eq(ideaSources.ideaId, ideaId));

    // FR-22: merge duplicates (same place, or same link) into the earlier card.
    const dupConds = [];
    if (p?.placeId) dupConds.push(eq(ideas.placeId, p.placeId));
    const dup = dupConds.length
      ? (
          await tx
            .select({ id: ideas.id })
            .from(ideas)
            .where(and(eq(ideas.tripId, tripId), ne(ideas.id, ideaId), or(...dupConds)))
            .limit(1)
        )[0]
      : undefined;
    const dupByUrl =
      !dup && r.source.normalizedUrl
        ? (
            await tx
              .select({ id: ideaSources.ideaId })
              .from(ideaSources)
              .innerJoin(ideas, eq(ideas.id, ideaSources.ideaId))
              .where(
                and(
                  eq(ideas.tripId, tripId),
                  ne(ideas.id, ideaId),
                  eq(ideaSources.normalizedUrl, r.source.normalizedUrl),
                ),
              )
              .limit(1)
          )[0]
        : undefined;
    const target = dup?.id ?? dupByUrl?.id;
    if (target) {
      await tx.update(ideaSources).set({ ideaId: target }).where(eq(ideaSources.ideaId, ideaId));
      await tx.delete(ideas).where(eq(ideas.id, ideaId));
    } else {
      const location = p?.location ?? p?.display?.location ?? null;
      await tx
        .update(ideas)
        .set({
          title: (p?.display?.name ?? p?.name ?? r.source.title ?? undefined)?.slice(0, 120),
          category: p?.category ?? "other",
          summary: p?.summary ?? r.isNonPlaceReason ?? null,
          placeId: p?.placeId ?? null,
          placeCache: p?.display ?? null,
          placeCachedAt: p?.display ? new Date() : null,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          cityHint: p?.regionOrCity ?? p?.cityHint ?? null,
          priceLevel: p?.priceLevel ?? p?.display?.priceLevel ?? null,
          confidence: r.confidence,
          permanentlyClosed: p?.permanentlyClosed ?? false,
          stopId,
          extraction:
            r.state === "resolved" && r.needsReview ? "needs_review" : r.state,
          // FR-24 / D26: listicles ask the sharer which places to add.
          candidates: r.kind === "listicle" && r.places.length > 1 ? r.places : null,
        })
        .where(eq(ideas.id, ideaId));
    }

    // FR-L20–L24 / D62: log every import attempt per person in every context. The trigger sets
    // `counted`; the POC enforces no cap (FR-L24).
    if (sharedByMemberId) {
      const [m] = await tx
        .select({ userId: members.userId })
        .from(members)
        .where(eq(members.id, sharedByMemberId));
      if (m?.userId) {
        await tx.insert(aiImports).values({
          userId: m.userId,
          tripId,
          ideaId: target ?? ideaId,
          kind: r.source.kind === "text" ? "text" : r.fromCache ? "cache_hit" : r.state === "failed" ? "failed" : "extraction",
          normalizedUrl: r.source.normalizedUrl,
        });
      }
    }
    await tx.update(trips).set({ lastActivityAt: new Date() }).where(eq(trips.id, tripId));

    // FR-1a: a trip started from a paste takes its name and city from the first idea.
    const [trip] = await tx.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId));
    const city = p?.regionOrCity ?? p?.cityHint ?? null;
    if (trip?.name === DEFAULT_TRIP_NAME && (r.suggestedTripName || city)) {
      await tx
        .update(trips)
        .set({ name: (r.suggestedTripName ?? `${city} trip`).slice(0, 80) })
        .where(eq(trips.id, tripId));
      if (city && tripStops.length === 1) {
        await tx.update(stops).set({ name: city }).where(eq(stops.id, tripStops[0]!.id));
      }
    }
  });
}

/** FR-24: the sharer picks which listicle places to add; each becomes its own card. */
export async function addListiclePicks(db: Db, claims: Claims, args: { ideaId: string; indexes: number[] }) {
  return withSession(db, claims, async (tx) => {
    const [idea] = await tx.select().from(ideas).where(eq(ideas.id, args.ideaId));
    if (!idea?.candidates) return;
    const places = idea.candidates as ResolvedIdea["places"];
    const [source] = await tx.select().from(ideaSources).where(eq(ideaSources.ideaId, idea.id));
    const picks = args.indexes.map((i) => places[i]).filter((p): p is NonNullable<typeof p> => !!p);
    for (const p of picks.slice(1)) {
      const location = p.location ?? p.display?.location ?? null;
      const [row] = await tx
        .insert(ideas)
        .values({
          tripId: idea.tripId,
          stopId: p.stopId ?? idea.stopId,
          title: (p.display?.name ?? p.name).slice(0, 120),
          category: p.category,
          summary: p.summary,
          placeId: p.placeId,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          cityHint: p.regionOrCity ?? p.cityHint,
          confidence: p.confidence,
          extraction: p.needsReview ? "needs_review" : "resolved",
          createdByMemberId: idea.createdByMemberId,
        })
        .returning({ id: ideas.id });
      if (source) {
        await tx.insert(ideaSources).values({
          ideaId: row!.id,
          kind: source.kind,
          url: source.url,
          normalizedUrl: source.normalizedUrl,
          thumbnailUrl: source.thumbnailUrl,
          creatorHandle: source.creatorHandle,
          sharedByMemberId: source.sharedByMemberId,
        });
      }
    }
    const first = picks[0];
    if (!first) {
      await tx.update(ideas).set({ extraction: "not_a_place", candidates: null }).where(eq(ideas.id, idea.id));
      return;
    }
    await tx
      .update(ideas)
      .set({
        title: (first.display?.name ?? first.name).slice(0, 120),
        category: first.category,
        summary: first.summary,
        placeId: first.placeId,
        cityHint: first.regionOrCity ?? first.cityHint,
        candidates: null,
      })
      .where(eq(ideas.id, idea.id));
  });
}

/** FR-23 "Is this right?" — any member signed in with a code can fix the details. */
export async function fixIdea(
  db: Db,
  claims: Claims,
  args: { ideaId: string; title: string; category?: string },
) {
  return withSession(db, claims, (tx) =>
    tx
      .update(ideas)
      .set({
        title: args.title.trim().slice(0, 120),
        ...(args.category ? { category: args.category as typeof ideas.$inferInsert.category } : {}),
        extraction: "resolved",
        confidence: 1,
      })
      .where(eq(ideas.id, args.ideaId)),
  );
}
