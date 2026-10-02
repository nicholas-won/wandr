-- 0006_expenses_rls.sql: RLS for the expenses slice tables added in 0006_expenses.sql.
--
-- Hand-written. Runs as one file.
--   FR-5     money is full scope only (verified code), never a personal-link session
--   FR-60/61 receipt uploads belong to their uploader until they become an expense
--   E-31     a receipt photo is visible only to the people on that expense (payer, uploader,
--            anyone with a share), not to the whole trip
--   FR-12/13 late-joiner and drop-out decisions are organizer actions, append-only (NFR-5)
--   FR-91    surprise expenses stay hidden (can_see_expense covers hidden_from)

/** E-31: can the caller see this expense's receipt photo? */
create or replace function app.can_see_receipt(p_expense uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense
      and app.can_see_expense(e.id)
      and (
        e.uploaded_by_member_id = app.my_member_id(e.trip_id)
        or e.paid_by_member_id = app.my_member_id(e.trip_id)
        or exists (select 1 from public.expense_shares s
                   where s.expense_id = e.id and s.member_id = app.my_member_id(e.trip_id))
      )
  )
$$;

/** Receipt uploads: uploader is the caller; AI fields are written by the service only. */
create or replace function app.guard_receipt_uploads() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    new.uploaded_by_member_id := app.my_active_member_id(new.trip_id);
    new.status := 'reading';
    new.result := null;
    new.expense_id := null;
    new.created_at := now();
    return new;
  end if;
  if new.id <> old.id or new.trip_id <> old.trip_id
     or new.uploaded_by_member_id <> old.uploaded_by_member_id
     or new.storage_path <> old.storage_path or new.image_hash <> old.image_hash
     or new.content_type <> old.content_type or new.byte_size <> old.byte_size
     or new.status <> old.status or new.result is distinct from old.result
     or new.created_at <> old.created_at then
    raise exception 'receipt upload fields are read-only' using errcode = '42501';
  end if;
  if new.expense_id is not null and app.expense_trip(new.expense_id) is distinct from new.trip_id then
    raise exception 'expense is not in this trip' using errcode = '42501';
  end if;
  return new;
end
$$;

/** Decisions: decided_by is the caller; the member must be in the expense's trip. */
create or replace function app.guard_expense_member_decisions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.trip_id := app.expense_trip(new.expense_id);
  new.decided_by_member_id := app.my_member_id(new.trip_id);
  new.created_at := now();
  if not app.member_in_trip(new.member_id, new.trip_id)
     or (new.replaced_member_id is not null and not app.member_in_trip(new.replaced_member_id, new.trip_id)) then
    raise exception 'member is not in this trip' using errcode = '42501';
  end if;
  if not (
    (new.kind = 'late_join' and new.decision in ('include', 'skip', 'replaced'))
    or (new.kind = 'drop_out' and new.decision in ('keep', 'redistribute', 'refund_if_replaced'))
  ) then
    raise exception 'invalid decision' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger receipt_uploads_guard before insert or update on public.receipt_uploads
  for each row execute function app.guard_receipt_uploads();
create trigger expense_member_decisions_guard before insert on public.expense_member_decisions
  for each row execute function app.guard_expense_member_decisions();
create trigger expense_member_decisions_append_only before update or delete on public.expense_member_decisions
  for each row execute function app.append_only();
create trigger expense_member_decisions_no_truncate before truncate on public.expense_member_decisions
  for each statement execute function app.append_only();

-- Grants and RLS ------------------------------------------------------------------------------
revoke all on public.receipt_uploads, public.expense_member_decisions from anon, authenticated;
grant all on all tables in schema public to service_role;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end
$$;

grant select, insert, update (expense_id) on public.receipt_uploads to authenticated;
grant select, insert on public.expense_member_decisions to authenticated;

create policy receipt_uploads_select on public.receipt_uploads for select to authenticated using (
  app.is_full_member(trip_id)
  and (uploaded_by_member_id = app.my_member_id(trip_id)
       or (expense_id is not null and app.can_see_receipt(expense_id)))
);
create policy receipt_uploads_insert on public.receipt_uploads for insert to authenticated
  with check (app.is_full_member(trip_id) and uploaded_by_member_id = app.my_active_member_id(trip_id));
create policy receipt_uploads_update on public.receipt_uploads for update to authenticated
  using (app.is_full_member(trip_id) and uploaded_by_member_id = app.my_member_id(trip_id))
  with check (app.is_full_member(trip_id) and uploaded_by_member_id = app.my_member_id(trip_id)
              and (expense_id is null or app.can_manage_expense(expense_id)));

create policy expense_member_decisions_select on public.expense_member_decisions for select to authenticated
  using (app.is_organizer(trip_id) and app.can_see_expense(expense_id));
create policy expense_member_decisions_insert on public.expense_member_decisions for insert to authenticated
  with check (app.is_organizer(trip_id) and app.can_see_expense(expense_id));

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
