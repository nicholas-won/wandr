import Link from "next/link";
import { cookies } from "next/headers";
import { Sparkles } from "lucide-react";
import { routes } from "@/lib/routes";
import { tripContext } from "@/server/context";
import { isEmpty, whatsNew } from "@/server/whats-new";
import { seenCookieName } from "@/lib/whats-new-cookie";
import { MarkSeen } from "./whats-new-seen";

/** D65 / T3: the in-app replacement for the daily digest, shown on the trip's Ideas page. */
export async function WhatsNewCard({ tripId, myMemberId }: { tripId: string; myMemberId: string }) {
  const jar = await cookies();
  const raw = jar.get(seenCookieName(tripId))?.value;
  const since = raw && /^\d+$/.test(raw) ? new Date(Number(raw)) : null;
  const { db, claims } = await tripContext(tripId);
  const w = await whatsNew(db, claims, { tripId, myMemberId, since });
  return (
    <>
      <MarkSeen tripId={tripId} />
      {isEmpty(w) ? null : (
        <section aria-labelledby="whats-new-h" className="rounded-2xl border bg-card p-4">
          <h2 id="whats-new-h" className="flex items-center gap-2 font-display text-base font-bold">
            <Sparkles className="size-4 text-primary" aria-hidden /> What&apos;s new since your last visit
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {w!.newIdeas.count > 0 ? (
              <li>
                <span className="font-semibold">
                  {w!.newIdeas.count} new {w!.newIdeas.count === 1 ? "idea" : "ideas"}
                </span>{" "}
                <span className="text-muted-foreground">from {w!.newIdeas.by.slice(0, 3).join(", ")}</span>
              </li>
            ) : null}
            {w!.newPolls.map((p) => (
              <li key={p.id}>
                New poll:{" "}
                <Link href={`${routes.trip(tripId)}/polls/${p.id}`} className="font-semibold text-primary hover:underline">
                  {p.question}
                </Link>
              </li>
            ))}
            {w!.decided.map((p) => (
              <li key={p.id}>
                Decided:{" "}
                <Link href={`${routes.trip(tripId)}/polls/${p.id}`} className="font-semibold hover:underline">
                  {p.question}
                </Link>
              </li>
            ))}
            {w!.newComments > 0 ? (
              <li className="text-muted-foreground">
                {w!.newComments} new {w!.newComments === 1 ? "comment" : "comments"}
              </li>
            ) : null}
          </ul>
        </section>
      )}
    </>
  );
}
