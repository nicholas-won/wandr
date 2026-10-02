"use client";

/**
 * Deadlines are absolute instants shown in the viewer's own time zone (S-14), e.g.
 * "closes Fri 9 PM EDT". Rendered on the client; the server pass may differ, hence
 * suppressHydrationWarning.
 */
export function ClosesLabel({ at, prefix = "closes" }: { at: string; prefix?: string }) {
  const d = new Date(at);
  const text = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: d.getMinutes() ? "2-digit" : undefined,
    timeZoneName: "short",
  }).format(d);
  return (
    <time dateTime={at} suppressHydrationWarning>
      {prefix} {text}
    </time>
  );
}
