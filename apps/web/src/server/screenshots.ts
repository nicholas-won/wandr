/**
 * Serving uploaded screenshots (FR-20, FR-26 keep the source). The row is read as the viewer, so
 * RLS decides: trip members who can see the idea (personal links included, surprise items hidden
 * from hidden members, FR-91), or people who can see the save (owner, shared-board members).
 */
import { eq } from "drizzle-orm";
import { asService, ideas, ideaSources, savedIdeaSources, withSession, type Claims, type Db } from "@wandr/db";
import type { StoredObject } from "@/lib/storage/objects";
import { screenshotStorage, type ScreenshotStorage } from "@/lib/storage/screenshots";

/** The trip an idea source belongs to (service read; only used to pick the right claims). */
export async function screenshotTripId(db: Db, sourceId: string): Promise<string | null> {
  const [row] = await asService(db, (tx) =>
    tx
      .select({ tripId: ideas.tripId })
      .from(ideaSources)
      .innerJoin(ideas, eq(ideas.id, ideaSources.ideaId))
      .where(eq(ideaSources.id, sourceId)),
  );
  return row?.tripId ?? null;
}

/** Bytes of a screenshot the viewer may see under any of `claims`, else null. */
export async function openScreenshot(
  db: Db,
  kind: "idea" | "save",
  sourceId: string,
  claims: Claims[],
  storage: ScreenshotStorage = screenshotStorage(),
): Promise<StoredObject | null> {
  let path: string | null = null;
  // Anonymous viewers (no claims at all) never reach the database.
  for (const c of claims.filter((x) => Object.values(x).some(Boolean))) {
    const [row] = await withSession(db, c, (tx) =>
      kind === "idea"
        ? tx
            .select({ kind: ideaSources.kind, path: ideaSources.storagePath })
            .from(ideaSources)
            .where(eq(ideaSources.id, sourceId))
        : tx
            .select({ kind: savedIdeaSources.kind, path: savedIdeaSources.storagePath })
            .from(savedIdeaSources)
            .where(eq(savedIdeaSources.id, sourceId)),
    );
    if (row?.kind === "screenshot" && row.path) {
      path = row.path;
      break;
    }
  }
  if (!path) return null;
  return storage.get(path);
}
