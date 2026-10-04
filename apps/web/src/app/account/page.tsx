/** Account settings (FR-3, J-6, NFR-7): name, number, email, sign out, delete. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@wandr/db";
import { AppHeader } from "@/components/app/app-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFullOrRedirect } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { getAccount } from "@/server/account";
import { signOutAction } from "@/app/account-actions";
import { EmailForm, NameForm } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireFullOrRedirect(routes.account);
  const account = await getAccount(await getDb(), user.userId);
  if (!account) redirect(routes.signin(routes.account));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pb-16 pt-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Account</h1>

        <Card>
          <CardContent className="space-y-6 pt-5">
            <NameForm name={account.name} />
            <div>
              <p className="text-sm font-medium">Phone</p>
              <p className="mt-1">{account.phone ?? "No number yet"}</p>
              <p className="text-xs text-muted-foreground">Only you see this. Other people on your trips never do.</p>
            </div>
            <EmailForm email={account.email} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="text-sm text-muted-foreground">Signed in on this device.</p>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delete account</CardTitle>
            <p className="text-sm text-muted-foreground">
              Removes your number, email, name and saved ideas. Trips you own go to someone else first; money records stay so
              everyone&apos;s balances still add up.
            </p>
          </CardHeader>
          <CardContent>
            <Link href={routes.accountDelete} className={buttonVariants({ variant: "ghost", className: "text-destructive" })}>
              Delete my account…
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
