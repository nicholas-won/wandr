/**
 * Loads per-trip rows for the internal dashboard (§11 NFR, §12). Service access: callers must
 * check `isAdmin` first. Aggregates only — no names, phones or individual votes leave here.
 */
import { sql } from "drizzle-orm";
import { asService, type Db } from "@wandr/db";
import { rowsOf } from "@wandr/db/reveals";
import { detectLodging } from "@wandr/ai";
import type { TripMetricsInput } from "@wandr/core";

/** Rough variable-cost assumptions until real invoices are wired (env-overridable). */
export const COST_ASSUMPTIONS = {
  aiImportMicros: Number(process.env.COST_AI_IMPORT_MICROS ?? 30_000), // ~$0.03 per extraction
};

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(userId);
}

export async function loadTripMetrics(db: Db): Promise<TripMetricsInput[]> {
  return asService(db, async (tx) => {
    const rows = await rowsOf<Record<string, unknown>>(
      tx,
      sql`
      select t.id as trip_id, t.size,
        (select count(*) from members m where m.trip_id = t.id and m.role <> 'owner'
           and (m.status = 'invited' or m.joined_at is not null)) as invited,
        (select count(*) from members m where m.trip_id = t.id and m.role <> 'owner' and m.status = 'active') as joined,
        (select count(*) from members m where m.trip_id = t.id and m.status = 'active') as active_members,
        (select count(distinct v.member_id) from votes v join members m on m.id = v.member_id
           where v.trip_id = t.id and m.status = 'active') as voters,
        (select count(*) from ideas i where i.trip_id = t.id) as ideas,
        (select count(*) from ideas i where i.trip_id = t.id and i.extraction in ('resolved','needs_review')) as ai_resolved,
        (select count(distinct e.props->>'ideaId') from events e where e.trip_id = t.id and e.name = 'idea_fixed') as ai_fixed,
        (select count(*) from polls p where p.trip_id = t.id and p.closed_at is not null) as polls_closed,
        (select count(*) from polls p where p.trip_id = t.id and p.closed_at is not null
           and p.winning_option_id is not null and (p.closes_at is null or p.closed_at <= p.closes_at + interval '1 minute')) as polls_on_time,
        (select count(*) from expenses x where x.trip_id = t.id and x.deleted_at is null) as receipts,
        (select coalesce(sum(o.cost_micros), 0) from outbound_messages o where o.trip_id = t.id) as sms_micros,
        (select count(*) from ai_imports a where a.trip_id = t.id and a.counted) as ai_imports,
        (select coalesce(json_agg(s.url), '[]'::json) from ideas i join idea_sources s on s.idea_id = i.id
           where i.trip_id = t.id and i.category = 'stay' and i.status in ('planned','done')) as stay_urls
      from trips t`,
    );
    return rows.map((r) => ({
      tripId: r.trip_id as string,
      size: r.size as TripMetricsInput["size"],
      invited: Number(r.invited),
      joined: Number(r.joined),
      activeMembers: Number(r.active_members),
      voters: Number(r.voters),
      ideas: Number(r.ideas),
      aiResolved: Number(r.ai_resolved),
      aiFixed: Number(r.ai_fixed),
      pollsClosed: Number(r.polls_closed),
      pollsDecidedByDeadline: Number(r.polls_on_time),
      receipts: Number(r.receipts),
      decidedStays: ((r.stay_urls as (string | null)[]) ?? []).map((u) => ({
        provider: (u && detectLodging(u)?.provider) || "direct",
      })),
      costMicros: Number(r.sms_micros) + Number(r.ai_imports) * COST_ASSUMPTIONS.aiImportMicros,
      revenueMicros: 0, // D51: the POC has no monetization
    }));
  });
}
