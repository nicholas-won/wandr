-- 0001_rls.sql: roles, grants, Row Level Security, privacy-preserving reveal functions.
--
-- Hand-written. Runs as one file (no drizzle breakpoints).
--
-- Privacy is enforced HERE, not in the UI (CLAUDE.md "Non-negotiable rules"):
--   NFR-3   phone numbers, Pass votes, non-voters, budget answers and surprise items never leak
--   FR-5    personal-link sessions (claim `link_member`) may view and vote only
--   FR-41/42 blind voting; Pass is a count; non-voters are never revealed
--   FR-T4/T5 votes cast under anonymity are never revealed when the trip changes size
--   FR-91   surprise items are invisible to hidden members, including in counts
--   FR-68/69/71, NFR-5 money is append-only; locked expenses change only via adjustments
--
-- Session model (src/session.ts): `request.jwt.claims` JSON with `sub` (verified user, full
-- scope) or `link_member` (member id from a personal link, view + vote only), under role
-- `authenticated` (or `anon`). Service code runs as the table owner and bypasses RLS.
--
-- Conventions:
--   * Helpers that read other tables are SECURITY DEFINER (avoids policy recursion) with a pinned
--     empty search_path; everything is schema-qualified.
--   * Guard triggers are SECURITY INVOKER so `current_user` tells a client (authenticated/anon)
--     apart from service code and from our own SECURITY DEFINER functions (app.is_client()).

-- ---------------------------------------------------------------------------
-- Roles (Supabase already has these)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- One owner per trip (FR-2).
create unique index if not exists members_one_owner_uq on public.members (trip_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------
create or replace function app.claims() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

/** Verified user id (full scope), or null. */
create or replace function app.uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(app.claims() ->> 'sub', '')::uuid
$$;

/** Member id from a personal link (view + vote scope). Ignored when a verified `sub` is present. */
create or replace function app.link_member() returns uuid
language sql stable set search_path = '' as $$
  select case when app.uid() is null then nullif(app.claims() ->> 'link_member', '')::uuid end
$$;

/** True for client sessions; false for service code and inside our SECURITY DEFINER functions. */
create or replace function app.is_client() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon')
$$;

/** The caller's member row in a trip with read access (active or not_attending, M-9). */
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
  limit 1
$$;

/** The caller's member row only if status = 'active' (can vote, counts toward size). */
create or replace function app.my_active_member_id(p_trip uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.id = app.my_member_id(p_trip) and m.status = 'active'
$$;

create or replace function app.is_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.my_member_id(p_trip) is not null
$$;

/** Member with a verified session (FR-5: needed for money, approvals, settings, edits). */
create or replace function app.is_full_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and app.my_member_id(p_trip) is not null
$$;

/** Active owner/organizer with a verified session. */
create or replace function app.is_organizer(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and exists (
    select 1 from public.members m
    where m.trip_id = p_trip and m.user_id = app.uid()
      and m.status = 'active' and m.role in ('owner', 'organizer')
  )
$$;

/** Ids of active members (managed members included), for size and duo pairs (§6.10). */
create or replace function app.active_member_ids(p_trip uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.id order by m.id), '{}')
  from public.members m where m.trip_id = p_trip and m.status = 'active'
$$;

/** Trip size from active members (FR-T1), unguarded. Internal: used by triggers. */
create or replace function app.size_of(p_trip uuid) returns public.trip_size
language sql stable security definer set search_path = '' as $$
  select (case cardinality(app.active_member_ids(p_trip))
            when 0 then 'solo' when 1 then 'solo' when 2 then 'duo' else 'group' end)::public.trip_size
$$;

/** Trip size from active members (FR-T1). Null for clients who aren't in the trip. */
create or replace function app.trip_size(p_trip uuid) returns public.trip_size
language sql stable security definer set search_path = '' as $$
  select case
    when current_setting('role', true) in ('authenticated', 'anon') and not app.is_member(p_trip) then null
    else app.size_of(p_trip)
  end
$$;

/** Row visibility for surprise mode (FR-91): member of the trip and not in hidden_from. */
create or replace function app.can_see(p_trip uuid, p_hidden uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  -- Note: `null = any('{}')` is false, so the membership test must be explicit.
  select me is not null and not (me = any(p_hidden))
  from (select app.my_member_id(p_trip) as me) s
$$;

/** Can the caller act as this member? Self (any scope), or a managed member (FR-11, full scope). */
create or replace function app.can_act_as(p_member uuid, p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member and m.trip_id = p_trip and m.status = 'active'
      and (
        m.id = app.my_active_member_id(p_trip)
        or (app.uid() is not null and m.managed_by_member_id = app.my_active_member_id(p_trip))
      )
  )
$$;

/** Is this member (any status) part of the trip? */
create or replace function app.member_in_trip(p_member uuid, p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = p_member and m.trip_id = p_trip)
$$;

create or replace function app.idea_trip(p_idea uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select trip_id from public.ideas where id = p_idea
$$;

create or replace function app.stop_trip(p_stop uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select trip_id from public.stops where id = p_stop
$$;

create or replace function app.poll_trip(p_poll uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select trip_id from public.polls where id = p_poll
$$;

create or replace function app.expense_trip(p_expense uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select trip_id from public.expenses where id = p_expense
$$;

/** Money is full scope only (FR-5); and surprise expenses are hidden (FR-91). */
create or replace function app.can_see_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense and app.is_full_member(e.trip_id) and app.can_see(e.trip_id, e.hidden_from)
  )
$$;

/** Uploader, organizers and the owner manage an expense (FR-68). Lock is checked by triggers. */
create or replace function app.can_manage_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense
      and app.is_full_member(e.trip_id) and app.can_see(e.trip_id, e.hidden_from)
      and (e.uploaded_by_member_id = app.my_member_id(e.trip_id) or app.is_organizer(e.trip_id))
  )
$$;

create or replace function app.item_expense(p_item uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select expense_id from public.expense_items where id = p_item
$$;

/** Is an audit entry about a row that is hidden from the caller? (keeps FR-91 for organizers) */
create or replace function app.audit_entity_hidden(p_entity text, p_id uuid, p_trip uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.my_member_id(p_trip); h uuid[];
begin
  if p_id is null then return false; end if;
  case p_entity
    when 'idea' then select hidden_from into h from public.ideas where id = p_id;
    when 'expense' then select hidden_from into h from public.expenses where id = p_id;
    when 'poll' then select hidden_from into h from public.polls where id = p_id;
    when 'plan_item' then select hidden_from into h from public.plan_items where id = p_id;
    when 'comment' then select hidden_from into h from public.comments where id = p_id;
    else return false;
  end case;
  return coalesce(me = any(h), false);
end
$$;

/** Minor units per major unit for an ISO 4217 code (budget band rounding). */
create or replace function app.minor_per_major(p_currency text) returns bigint
language sql immutable set search_path = '' as $$
  select case
    when upper(p_currency) in ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX',
                               'UYI','VND','VUV','XAF','XOF','XPF') then 1
    when upper(p_currency) in ('BHD','IQD','JOD','KWD','LYD','OMR','TND') then 1000
    else 100
  end::bigint
$$;

-- ---------------------------------------------------------------------------
-- Guard triggers (SECURITY INVOKER; service code and our definer functions pass through)
-- ---------------------------------------------------------------------------

/** hidden_from can only be set or changed by organizers (FR-91). */
create or replace function app.guard_hidden_from() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if (tg_op = 'INSERT' and cardinality(new.hidden_from) > 0)
     or (tg_op = 'UPDATE' and new.hidden_from is distinct from old.hidden_from) then
    if not app.is_organizer(new.trip_id) then
      raise exception 'only organizers can hide items (FR-91)' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

/** Members: role/status changes are organizer-only; the owner changes only by transfer (FR-2). */
create or replace function app.guard_members() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      raise exception 'owner is set only when creating a trip or by transfer (FR-2)' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id
     or new.user_id is distinct from old.user_id
     or new.managed_by_member_id is distinct from old.managed_by_member_id
     or new.joined_at is distinct from old.joined_at
     or new.created_at <> old.created_at then
    raise exception 'member identity fields are read-only' using errcode = '42501';
  end if;
  if new.role <> old.role or new.status <> old.status
     or new.is_guest_of_honor <> old.is_guest_of_honor
     or new.removed_at is distinct from old.removed_at then
    if not app.is_organizer(old.trip_id) then
      raise exception 'only organizers can change roles or membership (FR-2, FR-9)' using errcode = '42501';
    end if;
    if old.role = 'owner' and (new.role <> old.role or new.status <> old.status) then
      raise exception 'the owner cannot be removed or demoted; transfer ownership instead (FR-2)'
        using errcode = '42501';
    end if;
    if new.role = 'owner' then
      raise exception 'use app.transfer_ownership (FR-2)' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

/** Ideas: status changes are organizer-only (FR-49); provenance is read-only. */
create or replace function app.guard_ideas() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by_member_id := app.my_member_id(new.trip_id);
    new.created_at := now();
    if new.status <> 'idea' and not app.is_organizer(new.trip_id) then
      raise exception 'only organizers can change an idea''s status (FR-49)' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id
     or new.created_by_member_id is distinct from old.created_by_member_id
     or new.created_at <> old.created_at then
    raise exception 'idea provenance is read-only' using errcode = '42501';
  end if;
  if new.status <> old.status and not app.is_organizer(old.trip_id) then
    raise exception 'only organizers can change an idea''s status (FR-49)' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function app.guard_idea_sources() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.is_client() then
    new.shared_by_member_id := app.my_member_id(app.idea_trip(new.idea_id));
    new.created_at := now();
  end if;
  return new;
end
$$;

/**
 * Votes: server-owned fields can't be spoofed (FR-43, FR-T4/T5).
 * cast_in_size/open_to are only recomputed when the value actually changes, so re-submitting
 * an unchanged vote never re-labels a group-era (anonymous) vote as a duo one.
 */
create or replace function app.vote_fields() returns trigger
language plpgsql set search_path = '' as $$
declare t uuid; sz public.trip_size; h uuid[];
begin
  if not app.is_client() then return new; end if;
  select i.trip_id, i.hidden_from into t, h from public.ideas i where i.id = new.idea_id;
  if t is null or new.member_id = any(h) or not app.can_see(t, h) then
    raise exception 'idea not found' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.idea_id <> old.idea_id or new.member_id <> old.member_id) then
    raise exception 'vote identity is read-only' using errcode = '42501';
  end if;
  new.trip_id := t;
  if tg_op = 'INSERT' or new.value <> old.value then
    sz := app.size_of(t);
    new.cast_in_size := sz;
    new.open_to := case when sz = 'duo' then app.active_member_ids(t) else '{}'::uuid[] end;
  else
    new.cast_in_size := old.cast_in_size;
    new.open_to := old.open_to;
  end if;
  if tg_op = 'INSERT' then
    new.change_count := 0;
    new.created_at := now();
  else
    new.change_count := old.change_count + (case when new.value <> old.value then 1 else 0 end);
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create or replace function app.poll_vote_fields() returns trigger
language plpgsql set search_path = '' as $$
declare t uuid; h uuid[]; closed timestamptz; closes timestamptz;
begin
  if not app.is_client() then return new; end if;
  select p.trip_id, p.hidden_from, p.closed_at, p.closes_at into t, h, closed, closes
  from public.polls p where p.id = new.poll_id;
  if t is null or new.member_id = any(h) or not app.can_see(t, h) then
    raise exception 'poll not found' using errcode = '42501';
  end if;
  if closed is not null or (closes is not null and closes <= now()) then
    raise exception 'poll is closed' using errcode = '42501';
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

/** Comments: author is the caller; idea comments inherit the idea's surprise list (FR-91). */
create or replace function app.guard_comments() returns trigger
language plpgsql set search_path = '' as $$
declare h uuid[];
begin
  if not app.is_client() then return new; end if;
  -- Organizer-only check runs on the client-supplied list, before inheriting the parent's (FR-91).
  if (tg_op = 'INSERT' and cardinality(new.hidden_from) > 0)
     or (tg_op = 'UPDATE' and new.hidden_from is distinct from old.hidden_from) then
    if not app.is_organizer(coalesce(app.idea_trip(new.idea_id), app.expense_trip(new.expense_id), new.trip_id)) then
      raise exception 'only organizers can hide items (FR-91)' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.idea_id is not null then
      select i.trip_id, i.hidden_from into new.trip_id, h from public.ideas i where i.id = new.idea_id;
      new.hidden_from := array(select distinct x from unnest(new.hidden_from || coalesce(h, '{}')) x);
    elsif new.expense_id is not null then
      select e.trip_id, e.hidden_from into new.trip_id, h from public.expenses e where e.id = new.expense_id;
      new.hidden_from := array(select distinct x from unnest(new.hidden_from || coalesce(h, '{}')) x);
    end if;
    new.member_id := app.my_member_id(new.trip_id);
    new.created_at := now();
    if new.member_id is null then
      raise exception 'not a member' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.trip_id <> old.trip_id or new.member_id <> old.member_id
     or new.idea_id is distinct from old.idea_id or new.expense_id is distinct from old.expense_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'comment provenance is read-only' using errcode = '42501';
  end if;
  if new.body <> old.body and old.member_id <> app.my_member_id(old.trip_id) then
    raise exception 'only the author can edit a comment' using errcode = '42501';
  end if;
  return new;
end
$$;

/** Expenses: no edits after lock (FR-69); never hard-deleted by clients (NFR-5). */
create or replace function app.guard_expenses() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if app.is_client() then
      raise exception 'expenses are never deleted; use deleted_at (NFR-5)' using errcode = '42501';
    end if;
    return old;
  end if;
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    new.uploaded_by_member_id := app.my_member_id(new.trip_id);
    new.locked_at := null;
    new.deleted_at := null;
    new.created_at := now();
    if not app.member_in_trip(new.paid_by_member_id, new.trip_id) then
      raise exception 'payer is not in this trip' using errcode = '42501';
    end if;
    if new.refund_of_expense_id is not null
       and app.expense_trip(new.refund_of_expense_id) is distinct from new.trip_id then
      raise exception 'refund must reference an expense in this trip' using errcode = '42501';
    end if;
    if new.stop_id is not null and app.stop_trip(new.stop_id) is distinct from new.trip_id then
      raise exception 'stop is not in this trip' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.locked_at is not null then
    raise exception 'expense is locked after a payment; add an adjustment instead (FR-69)'
      using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'expense was deleted' using errcode = '42501';
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id
     or new.uploaded_by_member_id <> old.uploaded_by_member_id
     or new.locked_at is distinct from old.locked_at
     or new.created_at <> old.created_at then
    raise exception 'expense provenance and lock state are read-only' using errcode = '42501';
  end if;
  if not app.member_in_trip(new.paid_by_member_id, new.trip_id) then
    raise exception 'payer is not in this trip' using errcode = '42501';
  end if;
  return new;
end
$$;

/** Share/claim/adjustment rows must name a member of the expense's trip. */
create or replace function app.guard_expense_member() returns trigger
language plpgsql set search_path = '' as $$
declare t uuid;
begin
  if not app.is_client() then return new; end if;
  if tg_table_name = 'expense_item_claims' then
    t := app.expense_trip(app.item_expense(new.item_id));
  else
    t := app.expense_trip(new.expense_id);
  end if;
  if t is null or not app.member_in_trip(new.member_id, t) then
    raise exception 'member is not in this trip' using errcode = '42501';
  end if;
  if tg_table_name = 'expense_adjustments' then
    new.trip_id := t;
    new.created_by_member_id := app.my_member_id(t);
    new.created_at := now();
  end if;
  return new;
end
$$;

/** Items, claims and shares of a locked or deleted expense are frozen (FR-69). */
create or replace function app.guard_expense_child() returns trigger
language plpgsql set search_path = '' as $$
declare r record; eid uuid; j jsonb;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if not app.is_client() then return r; end if;
  -- Rows of the three tables differ in shape; read the parent key generically.
  foreach j in array case when tg_op = 'UPDATE' then array[to_jsonb(new), to_jsonb(old)] else array[to_jsonb(r)] end loop
    eid := coalesce((j ->> 'expense_id')::uuid, app.item_expense((j ->> 'item_id')::uuid));
    if exists (select 1 from public.expenses e where e.id = eid and (e.locked_at is not null or e.deleted_at is not null)) then
      raise exception 'expense is locked after a payment; add an adjustment instead (FR-69)' using errcode = '42501';
    end if;
  end loop;
  return r;
end
$$;

/** Append-only tables (FR-69, FR-71, NFR-5): no UPDATE/DELETE/TRUNCATE for any role. */
create or replace function app.append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only (NFR-5)', tg_table_name using errcode = '42501';
end
$$;

create or replace function app.guard_payments() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.recorded_by_member_id := app.my_member_id(new.trip_id);
  new.created_at := now();
  if new.from_member_id = new.to_member_id then
    raise exception 'payment must be between two different members' using errcode = '23514';
  end if;
  if new.amount_minor <= 0 then
    raise exception 'payment amount must be positive' using errcode = '23514';
  end if;
  if not app.member_in_trip(new.from_member_id, new.trip_id)
     or not app.member_in_trip(new.to_member_id, new.trip_id) then
    raise exception 'payer and payee must be in this trip' using errcode = '42501';
  end if;
  return new;
end
$$;

/**
 * FR-69: recording a payment locks every unlocked expense in that trip and currency, created
 * at or before the payment, where the payer or a share-holder is either party of the payment.
 */
create or replace function app.lock_expenses_on_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.expenses e
  set locked_at = now()
  where e.trip_id = new.trip_id
    and e.currency = new.currency
    and e.locked_at is null
    and e.created_at <= new.created_at
    and (
      e.paid_by_member_id in (new.from_member_id, new.to_member_id)
      or exists (
        select 1 from public.expense_shares s
        where s.expense_id = e.id and s.member_id in (new.from_member_id, new.to_member_id)
      )
    );
  return null;
end
$$;

/**
 * Budget answers (FR-74, FR-T9): trip_id comes from the member; open_to is the duo pair when
 * answered in a duo, else empty. Only recomputed when the answer changes, so re-saving a
 * group-era answer in a duo never exposes it (FR-T5).
 */
create or replace function app.guard_budget() returns trigger
language plpgsql set search_path = '' as $$
declare t uuid; sz public.trip_size;
begin
  if not app.is_client() then return new; end if;
  select m.trip_id into t from public.members m where m.id = new.member_id;
  if tg_op = 'UPDATE' and (new.member_id <> old.member_id or t <> old.trip_id) then
    raise exception 'budget answer identity is read-only' using errcode = '42501';
  end if;
  new.trip_id := t;
  new.updated_at := now();
  if not exists (select 1 from public.trips where id = t and budget_check_in) then
    raise exception 'budget check-in is off for this trip (FR-74)' using errcode = '42501';
  end if;
  if new.min_minor < 0 or new.max_minor < new.min_minor then
    raise exception 'invalid budget range' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.min_minor <> old.min_minor or new.max_minor <> old.max_minor
     or new.currency <> old.currency then
    sz := app.size_of(t);
    new.open_to := case when sz = 'duo' then app.active_member_ids(t) else '{}'::uuid[] end;
  else
    new.open_to := old.open_to;
  end if;
  return new;
end
$$;

/**
 * After any membership change: keep trips.size current (FR-T1) and, on solo → duo, open the
 * first member's solo priorities to the pair (FR-T3: solo priorities carry over as votes).
 */
create or replace function app.on_membership_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t uuid := coalesce(new.trip_id, old.trip_id); old_sz public.trip_size; new_sz public.trip_size;
begin
  select size into old_sz from public.trips where id = t;
  if old_sz is null then return null; end if; -- trip being deleted
  new_sz := app.size_of(t);
  if new_sz is distinct from old_sz then
    update public.trips set size = new_sz where id = t;
    if new_sz = 'duo' and old_sz = 'solo' then
      update public.votes v set open_to = app.active_member_ids(t)
      where v.trip_id = t and v.cast_in_size = 'solo' and cardinality(v.open_to) = 0;
    end if;
  end if;
  return null;
end
$$;

/** Audit trail for member role/status changes and expense edits (FR-68, NFR-4). */
create or replace function app.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := app.my_member_id(new.trip_id);
  if tg_table_name = 'members' then
    if new.role = old.role and new.status = old.status and new.is_guest_of_honor = old.is_guest_of_honor then
      return null;
    end if;
    insert into public.audit_log (trip_id, actor_member_id, action, entity, entity_id, data)
    values (new.trip_id, actor, 'update', 'member', new.id, jsonb_build_object(
      'role', jsonb_build_array(old.role, new.role),
      'status', jsonb_build_array(old.status, new.status),
      'is_guest_of_honor', jsonb_build_array(old.is_guest_of_honor, new.is_guest_of_honor)));
  else
    insert into public.audit_log (trip_id, actor_member_id, action, entity, entity_id, data)
    values (new.trip_id, actor,
            case when tg_op = 'INSERT' then 'create'
                 when new.deleted_at is not null and old.deleted_at is null then 'delete'
                 when new.locked_at is not null and old.locked_at is null then 'lock'
                 else 'update' end,
            'expense', new.id,
            case when tg_op = 'INSERT' then to_jsonb(new) else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) end);
  end if;
  return null;
end
$$;

-- Attach triggers ------------------------------------------------------------
create trigger members_guard before insert or update on public.members
  for each row execute function app.guard_members();
create trigger members_size after insert or update of status or delete on public.members
  for each row execute function app.on_membership_change();
create trigger members_audit after update on public.members
  for each row execute function app.audit_change();

create trigger ideas_guard before insert or update on public.ideas
  for each row execute function app.guard_ideas();
create trigger ideas_hidden before insert or update on public.ideas
  for each row execute function app.guard_hidden_from();
create trigger idea_sources_guard before insert on public.idea_sources
  for each row execute function app.guard_idea_sources();

create trigger votes_fields before insert or update on public.votes
  for each row execute function app.vote_fields();
create trigger poll_votes_fields before insert or update on public.poll_votes
  for each row execute function app.poll_vote_fields();

create trigger comments_guard before insert or update on public.comments
  for each row execute function app.guard_comments();
create trigger polls_hidden before insert or update on public.polls
  for each row execute function app.guard_hidden_from();
create trigger plan_items_hidden before insert or update on public.plan_items
  for each row execute function app.guard_hidden_from();

create trigger expenses_guard before insert or update or delete on public.expenses
  for each row execute function app.guard_expenses();
create trigger expenses_hidden before insert or update on public.expenses
  for each row execute function app.guard_hidden_from();
create trigger expenses_audit after insert or update on public.expenses
  for each row execute function app.audit_change();
create trigger expense_shares_member before insert or update on public.expense_shares
  for each row execute function app.guard_expense_member();
create trigger expense_item_claims_member before insert or update on public.expense_item_claims
  for each row execute function app.guard_expense_member();
create trigger expense_items_lock before insert or update or delete on public.expense_items
  for each row execute function app.guard_expense_child();
create trigger expense_item_claims_lock before insert or update or delete on public.expense_item_claims
  for each row execute function app.guard_expense_child();
create trigger expense_shares_lock before insert or update or delete on public.expense_shares
  for each row execute function app.guard_expense_child();
create trigger expense_adjustments_member before insert on public.expense_adjustments
  for each row execute function app.guard_expense_member();
create trigger expense_adjustments_append_only before update or delete on public.expense_adjustments
  for each row execute function app.append_only();
create trigger expense_adjustments_no_truncate before truncate on public.expense_adjustments
  for each statement execute function app.append_only();

create trigger payments_guard before insert on public.payments
  for each row execute function app.guard_payments();
create trigger payments_lock after insert on public.payments
  for each row execute function app.lock_expenses_on_payment();
create trigger payments_append_only before update or delete on public.payments
  for each row execute function app.append_only();
create trigger payments_no_truncate before truncate on public.payments
  for each statement execute function app.append_only();

create trigger budget_guard before insert or update on public.budget_answers
  for each row execute function app.guard_budget();

-- ---------------------------------------------------------------------------
-- Grants. Default-deny: revoke everything, then grant per table. RLS on every table.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant all on all tables in schema public to service_role;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end
$$;

grant select, update (display_name, sms_opted_out) on public.users to authenticated;
grant select, update (name, outsider_name, cover_image_url, invite_list_only, budget_check_in, bach_mode, pace)
  on public.trips to authenticated;
grant select, insert, update, delete on public.stops to authenticated;
grant select, insert, update on public.trip_stages to authenticated;
grant select, insert, update (display_name, notices_seen, role, status, is_guest_of_honor, removed_at)
  on public.members to authenticated;
grant select, insert, update, delete on public.stop_attendance to authenticated;
grant select, insert, update, delete on public.ideas to authenticated;
grant select, insert on public.idea_sources to authenticated;
grant select, insert, update, delete on public.votes to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, update, delete on public.polls to authenticated;
grant select, insert, update, delete on public.poll_options to authenticated;
grant select, insert, update, delete on public.poll_votes to authenticated;
grant select, insert, update, delete on public.plan_items to authenticated;
grant select, insert, update on public.expenses to authenticated;
grant select, insert, update, delete on public.expense_items to authenticated;
grant select, insert, update, delete on public.expense_item_claims to authenticated;
grant select, insert, update, delete on public.expense_shares to authenticated;
grant select, insert on public.expense_adjustments to authenticated;
grant select, insert on public.payments to authenticated;
grant select, insert, update on public.budget_answers to authenticated;
grant select on public.audit_log to authenticated;
-- No grants (service only): member_contacts (NFR-3 phones), member_links, otp_requests,
-- outbound_messages, sms_open_questions, sms_undo, extraction_cache, events.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- users: own row only.
create policy users_self_select on public.users for select to authenticated using (id = app.uid());
create policy users_self_update on public.users for update to authenticated
  using (id = app.uid()) with check (id = app.uid());

-- trips: members read; organizers edit settings (full scope). Creation is a service action.
create policy trips_member_select on public.trips for select to authenticated using (app.is_member(id));
create policy trips_organizer_update on public.trips for update to authenticated
  using (app.is_organizer(id)) with check (app.is_organizer(id));

-- members
create policy members_select on public.members for select to authenticated using (
  (app.is_member(trip_id) and (status in ('active', 'not_attending', 'removed') or app.is_organizer(trip_id)))
  or (app.uid() is not null and user_id = app.uid())
  or id = app.link_member()
);
create policy members_insert on public.members for insert to authenticated with check (
  user_id is null and role = 'member' and (
    (app.is_organizer(trip_id) and status = 'invited' and managed_by_member_id is null)
    -- FR-11 managed member, added by any verified member who then acts for them
    or (app.is_full_member(trip_id) and status = 'active'
        and managed_by_member_id = app.my_active_member_id(trip_id))
  )
);
create policy members_update on public.members for update to authenticated
  using (app.is_organizer(trip_id) or id = app.my_member_id(trip_id))
  with check (app.is_organizer(trip_id) or id = app.my_member_id(trip_id));

-- stops / stages / attendance
create policy stops_select on public.stops for select to authenticated using (app.is_member(trip_id));
create policy stops_write on public.stops for all to authenticated
  using (app.is_organizer(trip_id)) with check (app.is_organizer(trip_id));
create policy trip_stages_select on public.trip_stages for select to authenticated using (app.is_member(trip_id));
create policy trip_stages_write on public.trip_stages for all to authenticated
  using (app.is_organizer(trip_id)) with check (app.is_organizer(trip_id));
create policy stop_attendance_select on public.stop_attendance for select to authenticated
  using (app.is_member(app.stop_trip(stop_id)));
create policy stop_attendance_write on public.stop_attendance for all to authenticated
  using (
    app.is_organizer(app.stop_trip(stop_id))
    or (app.uid() is not null and app.can_act_as(member_id, app.stop_trip(stop_id)))
  )
  with check (
    app.is_organizer(app.stop_trip(stop_id))
    or (app.uid() is not null and app.can_act_as(member_id, app.stop_trip(stop_id)))
  );

-- ideas (FR-21/23/49/91)
create policy ideas_select on public.ideas for select to authenticated
  using (app.can_see(trip_id, hidden_from));
create policy ideas_insert on public.ideas for insert to authenticated
  with check (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
              and (stop_id is null or app.stop_trip(stop_id) = trip_id));
create policy ideas_update on public.ideas for update to authenticated
  using (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from))
  with check (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
              and (stop_id is null or app.stop_trip(stop_id) = trip_id));
create policy ideas_delete on public.ideas for delete to authenticated
  using (app.is_organizer(trip_id) and app.can_see(trip_id, hidden_from));

create policy idea_sources_select on public.idea_sources for select to authenticated
  using (exists (select 1 from public.ideas i where i.id = idea_id));
create policy idea_sources_insert on public.idea_sources for insert to authenticated
  with check (app.is_full_member(app.idea_trip(idea_id)) and exists (select 1 from public.ideas i where i.id = idea_id));

-- votes: raw rows are private to their owner (and a managed member's manager). FR-42.
create policy votes_select on public.votes for select to authenticated
  using (member_id = app.my_member_id(trip_id) or app.can_act_as(member_id, trip_id));
create policy votes_insert on public.votes for insert to authenticated
  with check (app.can_act_as(member_id, trip_id) and exists (select 1 from public.ideas i where i.id = idea_id));
create policy votes_update on public.votes for update to authenticated
  using (app.can_act_as(member_id, trip_id))
  with check (app.can_act_as(member_id, trip_id) and exists (select 1 from public.ideas i where i.id = idea_id));
create policy votes_delete on public.votes for delete to authenticated
  using (app.can_act_as(member_id, trip_id));

-- comments (full scope to write; FR-5)
create policy comments_select on public.comments for select to authenticated using (
  app.can_see(trip_id, hidden_from)
  and (idea_id is null or exists (select 1 from public.ideas i where i.id = idea_id))
  and (expense_id is null or app.can_see_expense(expense_id))
);
create policy comments_insert on public.comments for insert to authenticated with check (
  app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
  and (idea_id is null or exists (select 1 from public.ideas i where i.id = idea_id))
  and (expense_id is null or app.can_see_expense(expense_id))
);
create policy comments_update on public.comments for update to authenticated
  using (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
         and (member_id = app.my_member_id(trip_id) or app.is_organizer(trip_id)))
  with check (app.can_see(trip_id, hidden_from));
create policy comments_delete on public.comments for delete to authenticated
  using (app.is_full_member(trip_id) and member_id = app.my_member_id(trip_id));

-- polls (organizers write; FR-47) and options
create policy polls_select on public.polls for select to authenticated using (app.can_see(trip_id, hidden_from));
create policy polls_write on public.polls for all to authenticated
  using (app.is_organizer(trip_id) and app.can_see(trip_id, hidden_from))
  with check (app.is_organizer(trip_id) and app.can_see(trip_id, hidden_from));
create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id));
create policy poll_options_write on public.poll_options for all to authenticated
  using (app.is_organizer(app.poll_trip(poll_id)) and exists (select 1 from public.polls p where p.id = poll_id))
  with check (app.is_organizer(app.poll_trip(poll_id)) and exists (select 1 from public.polls p where p.id = poll_id));

create policy poll_votes_select on public.poll_votes for select to authenticated
  using (member_id = app.my_member_id(trip_id) or app.can_act_as(member_id, trip_id));
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (app.can_act_as(member_id, trip_id));
create policy poll_votes_update on public.poll_votes for update to authenticated
  using (app.can_act_as(member_id, trip_id)) with check (app.can_act_as(member_id, trip_id));
create policy poll_votes_delete on public.poll_votes for delete to authenticated
  using (app.can_act_as(member_id, trip_id));

-- plan items (§6.11; organizers / the optimizer write)
create policy plan_items_select on public.plan_items for select to authenticated
  using (app.can_see(trip_id, hidden_from));
create policy plan_items_write on public.plan_items for all to authenticated
  using (app.is_organizer(trip_id) and app.can_see(trip_id, hidden_from))
  with check (app.is_organizer(trip_id) and app.can_see(trip_id, hidden_from));

-- money: full scope only (FR-5), surprise-aware (FR-91)
create policy expenses_select on public.expenses for select to authenticated
  using (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from));
create policy expenses_update on public.expenses for update to authenticated
  using (app.can_manage_expense(id))
  with check (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from));

create policy expense_items_select on public.expense_items for select to authenticated
  using (app.can_see_expense(expense_id));
create policy expense_items_write on public.expense_items for all to authenticated
  using (app.can_manage_expense(expense_id)) with check (app.can_manage_expense(expense_id));

-- FR-62: anyone on the trip claims their own items; the uploader/organizers assign any.
create policy expense_item_claims_select on public.expense_item_claims for select to authenticated
  using (app.can_see_expense(app.item_expense(item_id)));
create policy expense_item_claims_write on public.expense_item_claims for all to authenticated
  using (
    app.can_manage_expense(app.item_expense(item_id))
    or (app.can_see_expense(app.item_expense(item_id))
        and app.can_act_as(member_id, app.expense_trip(app.item_expense(item_id))))
  )
  with check (
    app.can_manage_expense(app.item_expense(item_id))
    or (app.can_see_expense(app.item_expense(item_id))
        and app.can_act_as(member_id, app.expense_trip(app.item_expense(item_id))))
  );

create policy expense_shares_select on public.expense_shares for select to authenticated
  using (app.can_see_expense(expense_id));
create policy expense_shares_write on public.expense_shares for all to authenticated
  using (app.can_manage_expense(expense_id)) with check (app.can_manage_expense(expense_id));

create policy expense_adjustments_select on public.expense_adjustments for select to authenticated
  using (app.can_see_expense(expense_id));
create policy expense_adjustments_insert on public.expense_adjustments for insert to authenticated
  with check (
    app.can_see_expense(expense_id) and exists (
      select 1 from public.expenses e where e.id = expense_id
        and (e.uploaded_by_member_id = app.my_member_id(e.trip_id) or app.is_organizer(e.trip_id))
    )
  );

create policy payments_select on public.payments for select to authenticated
  using (app.is_full_member(trip_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (app.is_full_member(trip_id));

-- budget answers: own row only (FR-74, NFR-3); aggregates via app.budget_view
create policy budget_answers_own on public.budget_answers for all to authenticated
  using (app.uid() is not null and member_id = app.my_member_id(trip_id))
  with check (app.uid() is not null and member_id = app.my_active_member_id(trip_id));

-- audit log: organizers of the trip, minus entries about rows hidden from them
create policy audit_log_organizer_select on public.audit_log for select to authenticated
  using (app.is_organizer(trip_id) and not app.audit_entity_hidden(entity, entity_id, trip_id));

-- ---------------------------------------------------------------------------
-- Read functions (SECURITY DEFINER). The only way aggregates/other people's votes leave the DB.
-- ---------------------------------------------------------------------------

/**
 * What a pending/invited person may see about a trip (FR-6, J-7): the outsider name (or the
 * trip name if none was set) and the owner's display name. Members get the real name.
 */
create or replace function app.trip_public(p_trip uuid)
returns table (trip_id uuid, display_name text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select t.id,
         case when me.status in ('active', 'not_attending') then t.name
              else coalesce(nullif(t.outsider_name, ''), t.name) end,
         (select o.display_name from public.members o where o.trip_id = t.id and o.role = 'owner')
  from public.trips t
  join public.members me on me.trip_id = t.id
  where t.id = p_trip
    and me.status in ('invited', 'pending', 'active', 'not_attending')
    and ((app.uid() is not null and me.user_id = app.uid())
         or (app.link_member() is not null and me.id = app.link_member()))
  limit 1
$$;

/**
 * Per-idea vote reveal for the caller (FR-41/42/44, §6.10, FR-T4/T5, FR-91).
 * - Only ideas visible to the caller; only votes of active members attending the idea's Stop
 *   (no stop_attendance row = attending; ideas without a Stop count everyone).
 * - solo:  own vote only; counts null.
 * - group: blind until the caller has voted on that idea (counts and voters null); then all
 *          counts, Must-do/Down names, and Pass names only where the caller is in open_to.
 * - duo:   always open; Pass votes the caller isn't in open_to for (group-era or another pair's)
 *          are left out of every count and the voter list.
 * Non-voters never appear. Voters are sorted by name (no timing signal, V-2).
 */
create or replace function app.idea_reveals(p_trip uuid)
returns table (
  idea_id uuid, viewer_voted boolean, must_count int, down_count int, pass_count int,
  voter_count int, voters jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.my_member_id(p_trip); sz public.trip_size;
begin
  if me is null then return; end if;
  sz := app.trip_size(p_trip);
  return query
  with vis as (
    select i.id, i.stop_id, i.hidden_from from public.ideas i
    where i.trip_id = p_trip and not (me = any(i.hidden_from))
  ),
  ev as (
    select v.idea_id, v.member_id, v.value, m.display_name,
           (v.value <> 'pass' or v.member_id = me or me = any(v.open_to)) as nameable
    from public.votes v
    join vis on vis.id = v.idea_id
    join public.members m on m.id = v.member_id and m.status = 'active'
    where v.trip_id = p_trip
      and not (v.member_id = any(vis.hidden_from))
      and (vis.stop_id is null or coalesce((
            select sa.attending from public.stop_attendance sa
            where sa.stop_id = vis.stop_id and sa.member_id = v.member_id), true))
  ),
  shown as (  -- votes that may appear by name; in duo also the only ones counted
    select * from ev where ev.nameable and (sz <> 'solo' or ev.member_id = me)
  ),
  counted as (
    select * from ev where sz = 'group' or ev.nameable
  )
  select vis.id,
         exists (select 1 from public.votes v where v.idea_id = vis.id and v.member_id = me),
         c.must, c.down, c.pass, c.total,
         s.voters
  from vis
  left join lateral (
    select count(*) filter (where counted.value = 'must')::int as must,
           count(*) filter (where counted.value = 'down')::int as down,
           count(*) filter (where counted.value = 'pass')::int as pass,
           count(*)::int as total
    from counted where counted.idea_id = vis.id
  ) c0 on true
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'member_id', shown.member_id, 'display_name', shown.display_name, 'value', shown.value)
             order by shown.display_name, shown.member_id), '[]'::jsonb) as voters
    from shown where shown.idea_id = vis.id
  ) s0 on true
  cross join lateral (
    select case when sz = 'solo' then null
                when sz = 'group' and not exists (
                  select 1 from public.votes v where v.idea_id = vis.id and v.member_id = me) then null
                else c0.must end as must,
           case when sz = 'solo' then null
                when sz = 'group' and not exists (
                  select 1 from public.votes v where v.idea_id = vis.id and v.member_id = me) then null
                else c0.down end as down,
           case when sz = 'solo' then null
                when sz = 'group' and not exists (
                  select 1 from public.votes v where v.idea_id = vis.id and v.member_id = me) then null
                else c0.pass end as pass,
           case when sz = 'solo' then null
                when sz = 'group' and not exists (
                  select 1 from public.votes v where v.idea_id = vis.id and v.member_id = me) then null
                else c0.total end as total
  ) c
  cross join lateral (
    select case when sz = 'group' and not exists (
                  select 1 from public.votes v where v.idea_id = vis.id and v.member_id = me) then null
                else s0.voters end as voters
  ) s
  order by vis.id;
end
$$;

/**
 * Poll results for the caller (FR-47/48, FR-T7). Blind until the caller voted or the poll closed.
 * Eligible = active members attending the poll's Stop. Group: counts only. Duo: names too, except
 * for votes cast while the trip was a group (FR-T5). Solo: own vote only.
 */
create or replace function app.poll_results(p_poll uuid)
returns table (option_id uuid, label text, "position" int, vote_count int, viewer_voted boolean, voters jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  t uuid; h uuid[]; st uuid; closed boolean; me uuid; sz public.trip_size; voted boolean;
begin
  select p.trip_id, p.hidden_from, p.stop_id,
         (p.closed_at is not null or (p.closes_at is not null and p.closes_at <= now()))
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

/**
 * Turnout for organizers (FR-42, FR-43, FR-48): numbers only, never who.
 * One row per open idea (idea/shortlisted) and open poll visible to the caller.
 */
create or replace function app.turnout(p_trip uuid)
returns table (kind text, item_id uuid, eligible_count int, voter_count int, changed_count int)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.my_member_id(p_trip);
begin
  if not app.is_organizer(p_trip) then return; end if;
  return query
  with elig as (
    select m.id as member_id from public.members m where m.trip_id = p_trip and m.status = 'active'
  )
  select 'idea'::text, i.id,
         (select count(*)::int from elig
          where not (elig.member_id = any(i.hidden_from))
            and (i.stop_id is null or coalesce((select sa.attending from public.stop_attendance sa
                   where sa.stop_id = i.stop_id and sa.member_id = elig.member_id), true))),
         (select count(*)::int from public.votes v join elig on elig.member_id = v.member_id
          where v.idea_id = i.id and not (v.member_id = any(i.hidden_from))
            and (i.stop_id is null or coalesce((select sa.attending from public.stop_attendance sa
                   where sa.stop_id = i.stop_id and sa.member_id = v.member_id), true))),
         (select count(*)::int from public.votes v join elig on elig.member_id = v.member_id
          where v.idea_id = i.id and v.change_count > 0 and not (v.member_id = any(i.hidden_from)))
  from public.ideas i
  where i.trip_id = p_trip and i.status in ('idea', 'shortlisted') and not (me = any(i.hidden_from))
  union all
  select 'poll'::text, p.id,
         (select count(*)::int from elig
          where not (elig.member_id = any(p.hidden_from))
            and (p.stop_id is null or coalesce((select sa.attending from public.stop_attendance sa
                   where sa.stop_id = p.stop_id and sa.member_id = elig.member_id), true))),
         (select count(*)::int from public.poll_votes pv join elig on elig.member_id = pv.member_id
          where pv.poll_id = p.id and not (pv.member_id = any(p.hidden_from))
            and (p.stop_id is null or coalesce((select sa.attending from public.stop_attendance sa
                   where sa.stop_id = p.stop_id and sa.member_id = pv.member_id), true))),
         (select count(*)::int from public.poll_votes pv join elig on elig.member_id = pv.member_id
          where pv.poll_id = p.id and pv.change_count > 0 and not (pv.member_id = any(p.hidden_from)))
  from public.polls p
  where p.trip_id = p_trip and p.closed_at is null and not (me = any(p.hidden_from));
end
$$;

/**
 * Budget check-in view (FR-74, FR-T4/T5/T9, NFR-3, V-5). Full scope only.
 * kind = 'own'    the caller's own answer
 *        'member' another active member's answer, only when it was given openly to the caller in
 *                 a duo AND the caller's own answer was given openly to them (both answered as a
 *                 duo, FR-T9). Survives growth to a group (FR-T4); group-era answers never qualify
 *                 (FR-T5).
 *        'band'   per currency, only with >= 3 answers from active members: min of mins rounded
 *                 down and max of maxes rounded up to 50 major units (FR-74, V-5)
 */
create or replace function app.budget_view(p_trip uuid)
returns table (kind text, member_id uuid, display_name text, currency text,
               min_minor bigint, max_minor bigint, answer_count int)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid; mine uuid[];
begin
  if not app.is_full_member(p_trip) then return; end if;
  me := app.my_member_id(p_trip);
  select b.open_to into mine from public.budget_answers b where b.member_id = me;

  return query
  select 'own'::text, b.member_id, m.display_name, b.currency, b.min_minor, b.max_minor, null::int
  from public.budget_answers b join public.members m on m.id = b.member_id
  where b.trip_id = p_trip and b.member_id = me;

  return query
  select 'member'::text, b.member_id, m.display_name, b.currency, b.min_minor, b.max_minor, null::int
  from public.budget_answers b join public.members m on m.id = b.member_id and m.status = 'active'
  where b.trip_id = p_trip and b.member_id <> me
    and me = any(b.open_to) and b.member_id = any(coalesce(mine, '{}'));

  return query
  select 'band'::text, null::uuid, null::text, b.currency,
         (floor(min(b.min_minor)::numeric / (50 * app.minor_per_major(b.currency)))
            * 50 * app.minor_per_major(b.currency))::bigint,
         (ceil(max(b.max_minor)::numeric / (50 * app.minor_per_major(b.currency)))
            * 50 * app.minor_per_major(b.currency))::bigint,
         count(*)::int
  from public.budget_answers b join public.members m on m.id = b.member_id and m.status = 'active'
  where b.trip_id = p_trip
  group by b.currency
  having count(*) >= 3;
end
$$;

/** Transfer ownership (FR-2). Only the current owner, to an active verified member. */
create or replace function app.transfer_ownership(p_trip uuid, p_to_member uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid;
begin
  select m.id into me from public.members m
  where m.trip_id = p_trip and m.user_id = app.uid() and m.role = 'owner' and m.status = 'active';
  if me is null then
    raise exception 'only the owner can transfer ownership (FR-2)' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.id = p_to_member and m.trip_id = p_trip
                 and m.status = 'active' and m.user_id is not null) then
    raise exception 'new owner must be an active verified member' using errcode = '42501';
  end if;
  update public.members set role = 'organizer' where id = me;
  update public.members set role = 'owner' where id = p_to_member;
end
$$;

-- Function privileges: clients may call helpers (policies evaluate them as the caller) and the
-- read functions above; trigger functions can't be called directly.
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
