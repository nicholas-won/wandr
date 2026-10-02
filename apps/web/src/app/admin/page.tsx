import { notFound } from "next/navigation";
import { getDb } from "@wandr/db";
import { bookingDecisionGate, metricsBySize, type Rate, type SegmentMetrics } from "@wandr/core";
import { getSession } from "@/lib/auth/session";
import { isAdmin, loadTripMetrics, COST_ASSUMPTIONS } from "@/server/metrics";

export const metadata = { title: "Metrics" };

const pct = (r: Rate) => (r.value === null ? "–" : `${Math.round(r.value * 100)}%`);
const usd = (micros: number | null) => (micros === null ? "–" : `$${(micros / 1_000_000).toFixed(2)}`);

const ROWS: { label: string; target?: string; get: (m: SegmentMetrics) => string }[] = [
  { label: "Trips", get: (m) => String(m.trips) },
  { label: "Invited members who join", target: "> 60%", get: (m) => pct(m.inviteJoinRate) },
  { label: "Ideas per trip", target: "> 10", get: (m) => (m.ideasPerTrip === null ? "–" : m.ideasPerTrip.toFixed(1)) },
  { label: "Ideas resolved by AI without a fix", target: "> 70%", get: (m) => pct(m.aiResolvedWithoutFix) },
  { label: "Members who vote at least once", target: "> 60%", get: (m) => pct(m.memberVoteRate) },
  { label: "Polls decided by the deadline", target: "> 70%", get: (m) => pct(m.pollsDecidedByDeadline) },
  { label: "Trips with at least 1 receipt", target: "> 50%", get: (m) => pct(m.tripsWithReceipt) },
  { label: "Decided Stays bookable via commission site", target: "gate 30%", get: (m) => pct(m.bookableStayShare) },
  { label: "Variable cost per trip", get: (m) => usd(m.avgCostMicros) },
  { label: "Revenue per trip", get: (m) => usd(m.avgRevenueMicros) },
  { label: "Contribution per trip", get: (m) => usd(m.avgContributionMicros) },
];

/** §11 NFR: internal dashboard of cost vs. revenue per trip; §12 metrics by trip size (FR-T12). */
export default async function AdminPage() {
  const session = await getSession();
  if (!isAdmin(session.user?.userId)) notFound();
  const by = metricsBySize(await loadTripMetrics(await getDb()));
  const cols = ["solo", "duo", "group", "all"] as const;
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 lg:px-8">
      <h1 className="font-display text-3xl font-extrabold">POC metrics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Segmented by trip size. AI cost assumed at {usd(COST_ASSUMPTIONS.aiImportMicros)} per import. Booking gate:{" "}
        <strong>{bookingDecisionGate(by.all.bookableStayShare).replaceAll("_", " ")}</strong>.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Metric</th>
              <th className="p-3">Target</th>
              {cols.map((c) => (
                <th key={c} className="p-3 capitalize">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td className="p-3 font-medium">{r.label}</td>
                <td className="p-3 text-muted-foreground">{r.target ?? ""}</td>
                {cols.map((c) => (
                  <td key={c} className="p-3 tabular-nums">
                    {r.get(by[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
