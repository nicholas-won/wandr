-- 0007_founder_decisions.sql (idempotent)
--   Q1/Q37  member_links.name_confirmed_at: the person confirmed their name / accepted the invite
--   JR3     trips.deleted_at: owner soft-deletes a trip; RLS hides it everywhere (NFR-5/NFR-7 keep money rows)
--   JR11    organizers act for managed members whose manager left or was removed
ALTER TABLE "member_links" ADD COLUMN IF NOT EXISTS "name_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Links already opened before this change don't ask again.
UPDATE "member_links" SET "name_confirmed_at" = "created_at"
  WHERE "name_confirmed_at" IS NULL AND "bound_device_hash" IS NOT NULL;--> statement-breakpoint
/** JR3: is the trip live (not soft-deleted)? */
create or replace function app.trip_live(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips t where t.id = p_trip and t.deleted_at is null)
$$;--> statement-breakpoint
/** The caller's member row in a trip with read access (active or not_attending, M-9). JR3: live trips only. */
create or replace function app.my_member_id(p_trip uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.members m
  where m.trip_id = p_trip
    and m.status in ('active', 'not_attending')
    and (
      (app.uid() is not null and m.user_id = app.uid())
      or (app.link_member() is not null and m.id = app.link_member())
    )
    and app.trip_live(p_trip)
  limit 1
$$;--> statement-breakpoint
/** Active owner/organizer with a verified session. JR3: live trips only. */
create or replace function app.is_organizer(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and app.trip_live(p_trip) and exists (
    select 1 from public.members m
    where m.trip_id = p_trip and m.user_id = app.uid()
      and m.status = 'active' and m.role in ('owner', 'organizer')
  )
$$;--> statement-breakpoint
/**
 * Can the caller act as this member? Self (any scope), a managed member (FR-11, full scope), or,
 * for organizers, a managed member whose manager is no longer active (JR11).
 */
create or replace function app.can_act_as(p_member uuid, p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member and m.trip_id = p_trip and m.status = 'active'
      and (
        m.id = app.my_active_member_id(p_trip)
        or (app.uid() is not null and m.managed_by_member_id = app.my_active_member_id(p_trip))
        or (
          m.managed_by_member_id is not null
          and app.is_organizer(p_trip)
          and not exists (
            select 1 from public.members mgr
            where mgr.id = m.managed_by_member_id and mgr.status = 'active'
          )
        )
      )
  )
$$;--> statement-breakpoint
-- JR3: your own member row of a deleted trip is hidden too.
drop policy if exists members_select on public.members;--> statement-breakpoint
create policy members_select on public.members for select to authenticated using (
  (app.is_member(trip_id) and (status in ('active', 'not_attending', 'removed') or app.is_organizer(trip_id)))
  or (app.uid() is not null and user_id = app.uid() and app.trip_live(trip_id))
  or (id = app.link_member() and app.trip_live(trip_id))
);--> statement-breakpoint
grant execute on function app.trip_live(uuid) to authenticated, service_role;
