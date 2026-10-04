import { getDb } from "@wandr/db";
import { Landing } from "@/components/marketing/landing";
import { getSession } from "@/lib/auth/session";
import { countMySaves } from "@/server/library";
import { listMyTrips } from "@/server/trips";

/**
 * The website (D64). Always the marketing page; people who already use the app get "Open app"
 * instead of sign-up calls to action. The app's home is /trips.
 */
export default async function Home() {
  const session = await getSession();
  let appUser = false;
  if (session.user) {
    const db = await getDb();
    appUser =
      (await listMyTrips(db, session.user.userId)).length > 0 || (await countMySaves(db, session.user.userId)) > 0;
  }
  return <Landing appUser={appUser} />;
}
