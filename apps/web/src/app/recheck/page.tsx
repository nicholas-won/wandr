/**
 * Recycled-number recheck (FR-16, J-4). A long-inactive number (or one reported WRONG) signed in:
 * prove it's the same person with a code to the account's email, or have an organizer confirm in
 * the app (D65: no texts). Until then: view + vote only, no money (RLS: app.recheck_pending).
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { Brand } from "@/components/brand";
import { getSession } from "@/lib/auth/session";
import { maskEmail } from "@/lib/auth/signin";
import { safeNextPath } from "@/lib/http";
import { routes } from "@/lib/routes";
import { recheckHasOrganizer } from "@/server/account";
import { AutoRefresh } from "@/components/trip/auto-refresh";
import { RecheckForm } from "./recheck-form";

export const metadata: Metadata = { title: "One more check" };

export default async function RecheckPage({ searchParams }: PageProps<"/recheck">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined, routes.home);
  const { user } = await getSession();
  if (!user || user.provisional) redirect(routes.signin(next));
  if (!user.needsRecheck) redirect(next);
  const db = await getDb();
  const [u] = await asService(db, (tx) =>
    tx.select({ name: users.displayName, email: users.email }).from(users).where(eq(users.id, user.userId)),
  );
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      <Brand />
      {/* Unlocks by itself once an organizer confirms. */}
      <AutoRefresh active everyMs={15_000} />
      <div className="flex flex-1 flex-col pt-10">
        <RecheckForm
          name={u?.name.trim() ?? ""}
          emailHint={u?.email ? maskEmail(u.email) : null}
          hasOrganizer={await recheckHasOrganizer(db, user.userId)}
          next={next}
        />
      </div>
    </main>
  );
}
