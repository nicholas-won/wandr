import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { getSession } from "@/lib/auth/session";
import { countMySaves } from "./library";

/** What the app header needs: who's signed in, and whether the library is worth showing (P2). */
export const loadAppNav = cache(async () => {
  const session = await getSession();
  const user = session.user;
  if (!user) return { user: null, savedCount: 0 };
  const db = await getDb();
  const [u] = await asService(db, (tx) =>
    tx.select({ name: users.displayName }).from(users).where(eq(users.id, user.userId)),
  );
  return {
    user: { name: (u?.name ?? "").trim(), provisional: !!user.provisional },
    savedCount: await countMySaves(db, user.userId),
  };
});
