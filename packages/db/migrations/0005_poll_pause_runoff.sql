-- Idempotent: an earlier local build applied this file as 0004_poll_pause_runoff before it was
-- renumbered after 0004_share_cards. Safe to run on databases that already have these columns.
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "closed_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "runoff_of_poll_id" uuid;--> statement-breakpoint
ALTER TABLE "polls" DROP CONSTRAINT IF EXISTS "polls_closed_by_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_closed_by_member_id_members_id_fk" FOREIGN KEY ("closed_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" DROP CONSTRAINT IF EXISTS "polls_runoff_of_poll_id_polls_id_fk";--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_runoff_of_poll_id_polls_id_fk" FOREIGN KEY ("runoff_of_poll_id") REFERENCES "public"."polls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
/**
 * Poll votes (FR-47, S-4, S-6): also reject votes on paused polls and from members who aren't
 * attending the poll's Stop (only attendees are eligible; no attendance row = attending, S-12).
 */
create or replace function app.poll_vote_fields() returns trigger
language plpgsql set search_path = '' as $$
declare t uuid; h uuid[]; closed timestamptz; closes timestamptz; paused timestamptz; st uuid;
begin
  if not app.is_client() then return new; end if;
  select p.trip_id, p.hidden_from, p.closed_at, p.closes_at, p.paused_at, p.stop_id
    into t, h, closed, closes, paused, st
  from public.polls p where p.id = new.poll_id;
  if t is null or new.member_id = any(h) or not app.can_see(t, h) then
    raise exception 'poll not found' using errcode = '42501';
  end if;
  if closed is not null or (paused is null and closes is not null and closes <= now()) then
    raise exception 'poll is closed' using errcode = '42501';
  end if;
  if paused is not null then
    raise exception 'poll is paused' using errcode = '42501';
  end if;
  if st is not null and not coalesce((
       select sa.attending from public.stop_attendance sa
       where sa.stop_id = st and sa.member_id = new.member_id), true) then
    raise exception 'only people attending this Stop vote in its polls (FR-47)' using errcode = '42501';
  end if;
  if not exists (select 1 from public.poll_options o where o.id = new.option_id and o.poll_id = new.poll_id) then
    raise exception 'option does not belong to this poll' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.poll_id <> old.poll_id or new.member_id <> old.member_id) then
    raise exception 'vote identity is read-only' using errcode = '42501';
  end if;
  new.trip_id := t;
  if tg_op = 'INSERT' or new.option_id <> old.option_id then
    new.cast_in_size := app.size_of(t);
  else
    new.cast_in_size := old.cast_in_size;
  end if;
  new.change_count := case when tg_op = 'INSERT' then 0
    else old.change_count + (case when new.option_id <> old.option_id then 1 else 0 end) end;
  new.updated_at := now();
  return new;
end
$$;
--> statement-breakpoint
/**
 * Poll results (FR-47/48, FR-T7). Same as 0001_rls.sql except that a paused poll is never
 * "closed" by its deadline, so it stays blind while paused (S-4, S-6).
 */
create or replace function app.poll_results(p_poll uuid)
returns table (option_id uuid, label text, "position" int, vote_count int, viewer_voted boolean, voters jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  t uuid; h uuid[]; st uuid; closed boolean; me uuid; sz public.trip_size; voted boolean;
begin
  select p.trip_id, p.hidden_from, p.stop_id,
         (p.closed_at is not null or (p.paused_at is null and p.closes_at is not null and p.closes_at <= now()))
    into t, h, st, closed
  from public.polls p where p.id = p_poll;
  if t is null then return; end if;
  me := app.my_member_id(t);
  if me is null or me = any(h) then return; end if;
  sz := app.trip_size(t);
  voted := exists (select 1 from public.poll_votes pv where pv.poll_id = p_poll and pv.member_id = me);
  return query
  with ev as (
    select pv.option_id, pv.member_id, pv.cast_in_size, m.display_name
    from public.poll_votes pv
    join public.members m on m.id = pv.member_id and m.status = 'active'
    where pv.poll_id = p_poll
      and not (pv.member_id = any(h))
      and (st is null or coalesce((
            select sa.attending from public.stop_attendance sa
            where sa.stop_id = st and sa.member_id = pv.member_id), true))
  )
  select o.id, o.label, o.position,
         case when sz = 'solo' or (not voted and not closed) then null
              else (select count(*)::int from ev where ev.option_id = o.id) end,
         voted,
         case when sz = 'group' or (sz = 'duo' and not voted and not closed) then null
              else (select coalesce(jsonb_agg(jsonb_build_object('member_id', ev.member_id, 'display_name', ev.display_name)
                                  order by ev.display_name, ev.member_id), '[]'::jsonb)
                    from ev where ev.option_id = o.id
                      and (ev.member_id = me or (sz = 'duo' and ev.cast_in_size <> 'group'))) end
  from public.poll_options o
  where o.poll_id = p_poll
  order by o.position, o.id;
end
$$;
