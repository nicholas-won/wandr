import { APP_NAME } from "@wandr/core/config";
import { cn } from "@/lib/utils";

/** Wordmark: a little postage-stamp mark plus the (placeholder) product name from config. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl font-extrabold tracking-tight", className)}>
      <svg aria-hidden viewBox="0 0 32 32" className="size-8">
        <rect x="2" y="2" width="28" height="28" rx="8" className="fill-primary" />
        <path
          d="M8 20.5c3-6 6.5-9 9.5-9 2.4 0 3.5 1.6 3.5 3.3 0 2.6-2.6 4.2-5 4.2"
          fill="none"
          strokeWidth="2.6"
          strokeLinecap="round"
          className="stroke-primary-foreground"
        />
        <circle cx="23.5" cy="10" r="2.2" className="fill-primary-foreground" />
      </svg>
      {APP_NAME}
    </span>
  );
}
