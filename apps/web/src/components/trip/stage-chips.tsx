import Link from "next/link";
import { STAGE_LABELS } from "@wandr/core";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { loadPlanning } from "@/server/planning-context";
import { ClosesLabel } from "./planning/local-time";

const EMOJI = { set: "✅", voting: "🗳", collecting: "💡", not_needed: "" } as const;

/**
 * FR-120 stage progress: "Where ✅ · When ✅ · Stay 🗳 closes Fri · Do 💡".
 * D68 (C-ST1): always shown, so everyone can see where planning stands from day one.
 * Server component; mount it in the sidebar (`vertical`) and under the phone title.
 */
export async function StageChips({ tripId, vertical = false }: { tripId: string; vertical?: boolean }) {
  const v = await loadPlanning(tripId);
  if (!v) return null;
  const href = `${routes.trip(tripId)}/stops`;
  if (v.chips.length === 0) return null;
  const closes = new Map(v.stages.map((s) => [s.kind, s.closesAt]));
  return (
    <Link
      href={href}
      aria-label="Planning stages"
      className={cn("group block rounded-lg focus-visible:outline-2", vertical ? "space-y-1" : "-mx-1 overflow-x-auto")}
    >
      <ol className={cn("flex gap-1.5 text-xs font-semibold", vertical ? "flex-col" : "flex-nowrap")}>
        {v.chips.map((c) => (
          <li
            key={c.kind}
            className={cn(
              "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1",
              c.status === "set" && "border-transparent bg-secondary text-secondary-foreground",
              c.status === "voting" && "border-primary text-primary",
              c.status === "collecting" && "text-muted-foreground",
            )}
          >
            <span>{STAGE_LABELS[c.kind]}</span>
            <span aria-hidden>{EMOJI[c.status]}</span>
            <span className="sr-only">{c.status === "set" ? "set" : c.status === "voting" ? "voting" : "collecting ideas"}</span>
            {c.status === "voting" && closes.get(c.kind) ? (
              <span className="font-normal">
                <ClosesLabel at={closes.get(c.kind)!} city={v.tripClock} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Link>
  );
}
