-- 0007_money_decisions_rls.sql: RLS and guards for the founder money decisions (2026-10-02).
--
-- Hand-written, idempotent (create or replace / drop-then-create). Runs as one file.
--   Q23c personal-only expenses are visible ONLY to their member (not organizers), never
--        split (just_me, paid by that member), never locked by payments, hidden from the
--        organizer audit view.
--   Q23a expense_payers: same visibility as the expense, frozen on lock (FR-69), and a payment
--        between two people locks expenses either of them paid part of.
--   Q21  expense_corrections: append-only snapshots, written with the adjustments.
--   Q24  expense_duplicate_reviews: organizer "keep both" decisions, append-only.
--   MT3  receipt photos are visible to everyone on the trip who can see the expense (the
--        surprise rule FR-91 and the personal rule still apply through can_see_expense).
-- Surprise-mode (hidden_from) rules are unchanged.

/** Personal-only expenses (Q23c): only their member sees them. */
create or replace function app.can_see_personal(p_trip uuid, p_personal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_personal is null or p_personal = app.my_member_id(p_trip)
$$;

/** Money is full scope only (FR-5); surprise expenses are hidden (FR-91); personal ones are private (Q23c). */
create or replace function app.can_see_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense and app.is_full_member(e.trip_id) and app.can_see(e.trip_id, e.hidden_from)
      and app.can_see_personal(e.trip_id, e.personal_member_id)
  )
$$;

/** Uploader, organizers and the owner manage an expense (FR-68); a personal one only its member. */
create or replace function app.can_manage_expense(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense
      and app.is_full_member(e.trip_id) and app.can_see(e.trip_id, e.hidden_from)
      and app.can_see_personal(e.trip_id, e.personal_member_id)
      and (e.uploaded_by_member_id = app.my_member_id(e.trip_id) or app.is_organizer(e.trip_id))
  )
$$;

/** MT3: everyone who can see the expense can see its receipt photo. */
create or replace function app.can_see_receipt(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_see_expense(p_expense)
$$;

/** Is an audit entry about a row that is hidden from the caller? (FR-91, and Q23c personal expenses) */
create or replace function app.audit_entity_hidden(p_entity text, p_id uuid, p_trip uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.my_member_id(p_trip); h uuid[]; pm uuid;
begin
  if p_id is null then return false; end if;
  case p_entity
    when 'idea' then select hidden_from into h from public.ideas where id = p_id;
    when 'expense' then select hidden_from, personal_member_id into h, pm from public.expenses where id = p_id;
    when 'poll' then select hidden_from into h from public.polls where id = p_id;
    when 'plan_item' then select hidden_from into h from public.plan_items where id = p_id;
    when 'comment' then select hidden_from into h from public.comments where id = p_id;
    else return false;
  end case;
  return coalesce(me = any(h), false) or (pm is not null and pm is distinct from me);
end
$$;

/** Personal expenses (Q23c): paid by and for that one member; the flag can't change later. */
create or replace function app.guard_personal_expense() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.personal_member_id is distinct from old.personal_member_id and app.is_client() then
    raise exception 'personal expenses stay personal' using errcode = '42501';
  end if;
  if new.personal_member_id is not null then
    if new.paid_by_member_id <> new.personal_member_id or new.split_method <> 'just_me'
       or new.refund_of_expense_id is not null then
      raise exception 'a personal expense is paid by and for one person' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and app.is_client()
       and new.personal_member_id is distinct from app.my_active_member_id(new.trip_id) then
      raise exception 'personal expenses are your own' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists expenses_personal on public.expenses;
create trigger expenses_personal before insert or update on public.expenses
  for each row execute function app.guard_personal_expense();

/**
 * FR-69: recording a payment locks every unlocked expense in that trip and currency, created at
 * or before the payment, where a payer (Q23a: any part-payer) or a share-holder is either party.
 * Personal expenses (Q23c) never lock.
 */
create or replace function app.lock_expenses_on_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.expenses e
  set locked_at = now()
  where e.trip_id = new.trip_id
    and e.currency = new.currency
    and e.locked_at is null
    and e.personal_member_id is null
    and e.created_at <= new.created_at
    and (
      e.paid_by_member_id in (new.from_member_id, new.to_member_id)
      or exists (
        select 1 from public.expense_shares s
        where s.expense_id = e.id and s.member_id in (new.from_member_id, new.to_member_id)
      )
      or exists (
        select 1 from public.expense_payers p
        where p.expense_id = e.id and p.member_id in (new.from_member_id, new.to_member_id)
      )
    );
  return null;
end
$$;

/** Corrections (Q21): trip, author and time come from the caller; members must be in the trip. */
create or replace function app.guard_expense_corrections() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.trip_id := app.expense_trip(new.expense_id);
  new.created_by_member_id := app.my_member_id(new.trip_id);
  new.created_at := now();
  if new.trip_id is null or not app.member_in_trip(new.paid_by_member_id, new.trip_id) then
    raise exception 'member is not in this trip' using errcode = '42501';
  end if;
  return new;
end
$$;

/** Duplicate reviews (Q24): an ordered pair in one trip; only "keep_both". */
create or replace function app.guard_expense_duplicate_reviews() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.trip_id := app.expense_trip(new.expense_id);
  new.decided_by_member_id := app.my_member_id(new.trip_id);
  new.created_at := now();
  if app.expense_trip(new.other_expense_id) is distinct from new.trip_id or new.expense_id >= new.other_expense_id then
    raise exception 'invalid duplicate pair' using errcode = '23514';
  end if;
  if new.decision <> 'keep_both' then
    raise exception 'invalid decision' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists expense_payers_member on public.expense_payers;
create trigger expense_payers_member before insert or update on public.expense_payers
  for each row execute function app.guard_expense_member();
drop trigger if exists expense_payers_lock on public.expense_payers;
create trigger expense_payers_lock before insert or update or delete on public.expense_payers
  for each row execute function app.guard_expense_child();

drop trigger if exists expense_corrections_guard on public.expense_corrections;
create trigger expense_corrections_guard before insert on public.expense_corrections
  for each row execute function app.guard_expense_corrections();
drop trigger if exists expense_corrections_append_only on public.expense_corrections;
create trigger expense_corrections_append_only before update or delete on public.expense_corrections
  for each row execute function app.append_only();
drop trigger if exists expense_corrections_no_truncate on public.expense_corrections;
create trigger expense_corrections_no_truncate before truncate on public.expense_corrections
  for each statement execute function app.append_only();

drop trigger if exists expense_duplicate_reviews_guard on public.expense_duplicate_reviews;
create trigger expense_duplicate_reviews_guard before insert on public.expense_duplicate_reviews
  for each row execute function app.guard_expense_duplicate_reviews();
drop trigger if exists expense_duplicate_reviews_append_only on public.expense_duplicate_reviews;
create trigger expense_duplicate_reviews_append_only before update or delete on public.expense_duplicate_reviews
  for each row execute function app.append_only();
drop trigger if exists expense_duplicate_reviews_no_truncate on public.expense_duplicate_reviews;
create trigger expense_duplicate_reviews_no_truncate before truncate on public.expense_duplicate_reviews
  for each statement execute function app.append_only();

-- Grants and RLS ------------------------------------------------------------------------------
revoke all on public.expense_payers, public.expense_corrections, public.expense_duplicate_reviews from anon, authenticated;
grant all on all tables in schema public to service_role;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end
$$;

grant select, insert, update, delete on public.expense_payers to authenticated;
grant select, insert on public.expense_corrections to authenticated;
grant select, insert on public.expense_duplicate_reviews to authenticated;

-- expenses: personal ones are private to their member (Q23c); surprise rule unchanged.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
         and app.can_see_personal(trip_id, personal_member_id));
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
              and app.can_see_personal(trip_id, personal_member_id));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (app.can_manage_expense(id))
  with check (app.is_full_member(trip_id) and app.can_see(trip_id, hidden_from)
              and app.can_see_personal(trip_id, personal_member_id));

drop policy if exists expense_payers_select on public.expense_payers;
create policy expense_payers_select on public.expense_payers for select to authenticated
  using (app.can_see_expense(expense_id));
drop policy if exists expense_payers_write on public.expense_payers;
create policy expense_payers_write on public.expense_payers for all to authenticated
  using (app.can_manage_expense(expense_id)) with check (app.can_manage_expense(expense_id));

drop policy if exists expense_corrections_select on public.expense_corrections;
create policy expense_corrections_select on public.expense_corrections for select to authenticated
  using (app.can_see_expense(expense_id));
drop policy if exists expense_corrections_insert on public.expense_corrections;
create policy expense_corrections_insert on public.expense_corrections for insert to authenticated
  with check (
    app.can_see_expense(expense_id) and exists (
      select 1 from public.expenses e where e.id = expense_id
        and (e.uploaded_by_member_id = app.my_member_id(e.trip_id) or app.is_organizer(e.trip_id))
    )
  );

drop policy if exists expense_duplicate_reviews_select on public.expense_duplicate_reviews;
create policy expense_duplicate_reviews_select on public.expense_duplicate_reviews for select to authenticated
  using (app.is_organizer(trip_id) and app.can_see_expense(expense_id) and app.can_see_expense(other_expense_id));
drop policy if exists expense_duplicate_reviews_insert on public.expense_duplicate_reviews;
create policy expense_duplicate_reviews_insert on public.expense_duplicate_reviews for insert to authenticated
  with check (app.is_organizer(trip_id) and app.can_see_expense(expense_id) and app.can_see_expense(other_expense_id));

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
