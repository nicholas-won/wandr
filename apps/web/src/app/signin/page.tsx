import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { Brand } from "@/components/brand";
import { getSession } from "@/lib/auth/session";
import { pendingChallenge } from "@/lib/auth/signin";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/http";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const session = await getSession();
  let needsName = false;
  if (session.user) {
    const db = await getDb();
    const [me] = await asService(db, (tx) =>
      tx.select({ name: users.displayName }).from(users).where(eq(users.id, session.user!.userId)).limit(1),
    );
    needsName = !!me && me.name.trim() === "";
    if (me && !needsName && !session.user.needsRecheck) redirect(next);
  }

  const pending = needsName ? null : await pendingChallenge();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
      <Brand />
      <div className="flex flex-1 flex-col pt-10">
        <SignInForm
          initial={
            needsName
              ? { step: "name", channel: "sms", next }
              : pending
              ? { step: "code", channel: pending.channel, display: pending.display, next }
              : { step: "contact", channel: "sms", next }
          }
          turnstileSiteKey={env().NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
        />
      </div>
    </main>
  );
}
