import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { asService, getDb, users } from "@wandr/db";
import { Brand } from "@/components/brand";
import { getSession } from "@/lib/auth/session";
import { pendingChallenge } from "@/lib/auth/signin";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/http";
import { routes } from "@/lib/routes";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined, routes.home);
  const session = await getSession();
  let needsName = false;
  // A provisional (zero-setup) creator hasn't verified anything yet: start at the phone step.
  if (session.user && !session.user.provisional) {
    const db = await getDb();
    const [me] = await asService(db, (tx) =>
      tx.select({ name: users.displayName }).from(users).where(eq(users.id, session.user!.userId)).limit(1),
    );
    needsName = !!me && me.name.trim() === "";
    if (me && !needsName) redirect(session.user.needsRecheck ? routes.recheck(next) : next);
  }

  const pending = needsName ? null : await pendingChallenge();
  // Local/test only: without Twilio Verify, codes go to the server console and 000000 works.
  const e = env();
  const devCodeHint = e.NODE_ENV !== "production" && !(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID);
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
          devCodeHint={devCodeHint}
          signup={next.startsWith(routes.start)}
        />
      </div>
    </main>
  );
}
