/**
 * Illustrative product mock for the landing page (static markup, clearly an example: no real
 * people, reviews or numbers presented as facts).
 */
const VOTES = [
  { label: "🔥 Must-do", on: true },
  { label: "👍 Down", on: false },
  { label: "🙅 Pass", on: false },
];

export function ProductPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm select-none">
      <div className="absolute -inset-6 -z-10 rotate-3 rounded-[2rem] bg-accent" />
      <div className="space-y-3 rounded-[1.75rem] border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Lisbon + Porto</span>
          <span>4 friends</span>
        </div>
        <div className="flex gap-1 text-[11px] font-semibold">
          {["Where ✅", "When ✅", "Stay 🗳", "Do 💡"].map((c) => (
            <span key={c} className="rounded-full bg-muted px-2 py-1">
              {c}
            </span>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex gap-3 p-3">
            <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-[#f59e0b] text-2xl">
              🍽️
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold leading-tight">Rooftop seafood spot</p>
              <p className="text-xs text-muted-foreground">Food · Alfama · from a TikTok</p>
              <p className="mt-1 text-xs font-semibold text-primary">3 of 4 are in · 2 Must-do 🔥</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 border-t p-2">
            {VOTES.map((v) => (
              <span
                key={v.label}
                className={
                  v.on
                    ? "rounded-full bg-vote-must py-1.5 text-center text-xs font-semibold text-vote-foreground"
                    : "rounded-full border py-1.5 text-center text-xs font-semibold"
                }
              >
                {v.label}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-3 text-xs">
          <p className="font-semibold">💬 Text from the trip</p>
          <p className="mt-1 text-muted-foreground">New idea for your trip: Rooftop seafood spot. Reply 1 Must-do, 2 Down, 3 Pass.</p>
        </div>
      </div>
    </div>
  );
}
