import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startClassicTripAction, startTripAction } from "@/app/actions";
import { cn } from "@/lib/utils";

const field =
  "h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none focus:ring-2 focus:ring-ring";

/** FR-1(b) classic setup. Every field optional (P1); the desktop planner's main way in. */
export function ClassicSetupForm({
  className,
  cta = "Start planning",
  idPrefix = "setup",
}: {
  className?: string;
  cta?: string;
  /** Unique per page: the landing page renders this form twice. */
  idPrefix?: string;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <form action={startClassicTripAction} className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <label htmlFor={id("destinations")} className="text-sm font-semibold">
          Where to?
        </label>
        <input id={id("destinations")} name="destinations" placeholder="Lisbon, Porto" autoComplete="off" className={field} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={id("start")} className="text-sm font-semibold">
            From <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input id={id("start")} name="start" type="date" className={field} />
        </div>
        <div className="space-y-1">
          <label htmlFor={id("end")} className="text-sm font-semibold">
            To
          </label>
          <input id={id("end")} name="end" type="date" className={field} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={id("name")} className="text-sm font-semibold">
          Trip name <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id={id("name")} name="name" placeholder="Sam's 30th" autoComplete="off" className={field} />
      </div>
      <Button type="submit" size="lg" block>
        {cta} <ArrowRight aria-hidden />
      </Button>
      <p className="text-center text-xs text-muted-foreground">No sign-up needed. Free to plan with friends.</p>
    </form>
  );
}

/** FR-1(a): paste anything to start. The phone's main way in. */
export function PasteStartForm({
  className,
  label = "Paste a TikTok or link to start",
  idPrefix = "paste",
  defaultValue,
}: {
  className?: string;
  label?: string;
  idPrefix?: string;
  defaultValue?: string;
}) {
  const inputId = `${idPrefix}-raw`;
  return (
    <form action={startTripAction} className={cn("space-y-2", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-full border border-input bg-card p-1.5 pl-4 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Link2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          id={inputId}
          defaultValue={defaultValue}
          name="raw"
          autoComplete="off"
          placeholder="https://www.tiktok.com/…"
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm">
          Go
        </Button>
      </div>
    </form>
  );
}
