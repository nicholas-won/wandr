/**
 * Place photos for idea and save cards (FR-31 display, FR-L6).
 *
 * Google terms: only place ids are stored long term. The photo resource name and author
 * credit live in the short-lived display cache (`place_cache`), refreshed by place id when
 * missing or older than 30 days. Photo bytes are streamed through, never stored; the browser
 * may keep them privately for an hour. The API key stays on the server.
 *
 * Visibility is the caller's: the item is read with withSession, so RLS (surprise mode,
 * trip membership, library ownership, boards) decides. Only the cache write runs as the service.
 */
import { eq } from "drizzle-orm";
import { asService, ideas, savedIdeas, withSession, type Claims, type Db } from "@wandr/db";
import { PlacesError, type PlaceDisplayCache, type PlacesClient } from "@wandr/ai";
import { isCacheStale, readCache, shortHash, type PhotoKind } from "@/lib/idea-visual";

export const PHOTO_CACHE_CONTROL = "private, max-age=3600";

export interface PhotoSubject {
  placeId: string | null;
  placeCache: unknown;
  placeCachedAt: Date | null;
}

/** The trip an idea belongs to (service lookup of the id only; nothing is returned to clients). */
export async function ideaTripId(db: Db, ideaId: string): Promise<string | null> {
  const [row] = await asService(db, (tx) => tx.select({ tripId: ideas.tripId }).from(ideas).where(eq(ideas.id, ideaId)));
  return row?.tripId ?? null;
}

/**
 * Load the item as the caller. `claims` are tried in order (e.g. a signed-in person, then
 * board-link grants); the first that can see the item wins. Null when none can.
 */
export async function loadPhotoSubject(db: Db, kind: PhotoKind, id: string, claims: Claims[]): Promise<PhotoSubject | null> {
  for (const c of claims) {
    const row = await withSession(db, c, async (tx) => {
      if (kind === "idea") {
        const [r] = await tx
          .select({ placeId: ideas.placeId, placeCache: ideas.placeCache, placeCachedAt: ideas.placeCachedAt })
          .from(ideas)
          .where(eq(ideas.id, id));
        return r ?? null;
      }
      const [r] = await tx
        .select({ placeId: savedIdeas.placeId, placeCache: savedIdeas.placeCache, placeCachedAt: savedIdeas.placeCachedAt })
        .from(savedIdeas)
        .where(eq(savedIdeas.id, id));
      return r ?? null;
    }).catch(() => null);
    if (row) return row;
  }
  return null;
}

async function writeCache(db: Db, kind: PhotoKind, id: string, cache: PlaceDisplayCache | Record<string, unknown>, at: Date) {
  await asService(db, (tx) =>
    kind === "idea"
      ? tx.update(ideas).set({ placeCache: cache, placeCachedAt: at }).where(eq(ideas.id, id))
      : tx.update(savedIdeas).set({ placeCache: cache, placeCachedAt: at }).where(eq(savedIdeas.id, id)),
  );
}

/**
 * Refresh the display cache by place id (Place Details). Returns the fresh cache. A place
 * Google no longer knows keeps its old cache with `photo: null`, stamped so we don't re-ask.
 */
export async function refreshDisplayCache(
  db: Db,
  places: PlacesClient,
  kind: PhotoKind,
  id: string,
  subject: PhotoSubject,
  now: Date,
): Promise<ReturnType<typeof readCache>> {
  const fresh = await places.getPlace(subject.placeId!);
  const old = subject.placeCache && typeof subject.placeCache === "object" ? (subject.placeCache as Record<string, unknown>) : {};
  const next: Record<string, unknown> = fresh ? { ...fresh.display } : { ...old, photo: null, fetchedAt: now.toISOString() };
  await writeCache(db, kind, id, next, now);
  return readCache(next);
}

const notFound = () =>
  new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });

/**
 * The photo response for a visible item. `v` is the photo-name hash the card was rendered
 * with: if the photo changed since, 404 so the card falls back instead of showing a photo
 * under the wrong author credit (the next render has the new one).
 */
export async function placePhotoResponse(args: {
  db: Db;
  places: PlacesClient | null;
  kind: PhotoKind;
  id: string;
  subject: PhotoSubject;
  v?: string | null;
  prime?: boolean;
  widthPx?: number;
  now?: Date;
}): Promise<Response> {
  const { db, places, kind, id, subject } = args;
  const now = args.now ?? new Date();
  if (!places || !subject.placeId) return notFound();
  const cached = readCache(subject.placeCache);
  let cache = cached;
  let refreshed = false;
  if (!subject.placeCache || !cached.hasPhotoField || isCacheStale(subject.placeCachedAt, now)) {
    try {
      cache = await refreshDisplayCache(db, places, kind, id, subject, now);
      refreshed = true;
    } catch (e) {
      console.error("[place-photo] refresh", kind, id, e instanceof Error ? e.message : e);
      if (!cached.photo) return notFound();
    }
  }
  if (args.prime) return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });
  // Serve the photo the card was rendered with (its credit is on screen): the fresh one, or
  // the one from the cache we just replaced while its name still works.
  const photo = args.v
    ? [cache.photo, cached.photo].find((p) => p && shortHash(p.name) === args.v)
    : cache.photo;
  if (!photo) return notFound();

  let media: Response;
  try {
    media = await places.fetchPhoto(photo.name, { maxWidthPx: args.widthPx ?? 640 });
  } catch (e) {
    // Photo names expire: refresh once so the next render gets a fresh name and credit.
    if (!refreshed && e instanceof PlacesError && e.status >= 400 && e.status < 500) {
      await refreshDisplayCache(db, places, kind, id, subject, now).catch(() => undefined);
    } else {
      console.error("[place-photo] media", kind, id, e instanceof Error ? e.message : e);
    }
    return notFound();
  }
  const type = media.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp|gif|avif)\b/i.test(type) || !media.body) return notFound();
  return new Response(media.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": PHOTO_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
