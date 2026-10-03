-- 0012_account_recheck_rls.sql: recycled-number recheck, deleted accounts, and the money-only
-- view for removed members.
--
-- Hand-written, idempotent (create or replace). Runs as one file.
--   FR-16 / J-4  A verified user with a pending recheck (users.recheck_pending_at) keeps view +
--                vote, like a personal link, but is not a "full member": no money, approvals,
--                settings or edits until an email code or an organizer confirms it's them.
--   FR-3 / NFR-7 A deleted account (users.deleted_at) is never a full member either; its member
--                rows are already removed and anonymized by the deletion itself.
--   FR-9, M-1, M-2, P-8  A removed member keeps a read-only view of their own money in that trip
--                (their balance per currency, the expenses that involve them, adjustments and
--                payments) and can record a settle-up payment. Nothing else: no ideas, plan,
--                polls, people list, or other members' balances. This is NOT a table grant: it is
--                three SECURITY DEFINER functions that return only the caller's own ledger.
--                Surprise expenses hidden from them (FR-91) and other people's personal-only
--                expenses (Q23c) never appear.

/** FR-16 / J-4 / NFR-7: the verified caller still has to pass the recycled-number check, or their account is deleted. */
create or replace function app.recheck_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and exists (
    select 1 from public.users u
    where u.id = app.uid() and (u.recheck_pending_at is not null or u.deleted_at is not null)
  )
$$;

/** Member with a verified session (FR-5: money, approvals, settings, edits). FR-16: not while a recheck is pending. */
create or replace function app.is_full_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and not app.recheck_pending() and app.my_member_id(p_trip) is not null
$$;

/** Active owner/organizer with a verified session. JR3: live trips only. FR-16: not while a recheck is pending. */
create or replace function app.is_organizer(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null and app.trip_live(p_trip) and not app.recheck_pending() and exists (
    select 1 from public.members m
    where m.trip_id = p_trip and m.user_id = app.uid()
      and m.status = 'active' and m.role in ('owner', 'organizer')
  )
$$;

-- ---------------------------------------------------------------------------
-- Money-only view for removed members (FR-9, M-1, M-2)
-- ---------------------------------------------------------------------------

/** The caller's removed member row in a live trip (verified session, no pending recheck), else null. */
create or replace function app.my_former_member_id(p_trip uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.members m
  where m.trip_id = p_trip
    and m.status = 'removed'
    and app.uid() is not null
    and m.user_id = app.uid()
    and not app.recheck_pending()
    and app.trip_live(p_trip)
  limit 1
$$;

/** Expenses that involve a member (payer, share or payer part), excluding deleted, hidden (FR-91) and others' personal ones (Q23c). */
create or replace function app.former_expense_ids(p_trip uuid, p_me uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select e.id
  from public.expenses e
  where e.trip_id = p_trip
    and e.deleted_at is null
    and e.personal_member_id is null
    and not (p_me = any(e.hidden_from))
    and (
      e.paid_by_member_id = p_me
      or exists (select 1 from public.expense_shares s where s.expense_id = e.id and s.member_id = p_me)
      or exists (select 1 from public.expense_payers p where p.expense_id = e.id and p.member_id = p_me)
    )
$$;

/**
 * The people a former member may settle with: whoever appears with them on their own expenses
 * (payers of what they shared, sharers of what they paid) or payments. Never pending/invited rows.
 */
create or replace function app.former_counterparts(p_trip uuid, p_me uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct x.id from (
    select e.paid_by_member_id as id from public.expenses e where e.id in (select app.former_expense_ids(p_trip, p_me))
    union
    select p.member_id from public.expense_payers p where p.expense_id in (select app.former_expense_ids(p_trip, p_me))
    union
    select s.member_id from public.expense_shares s where s.expense_id in (select app.former_expense_ids(p_trip, p_me))
    union
    select case when pay.from_member_id = p_me then pay.to_member_id else pay.from_member_id end
    from public.payments pay
    where pay.trip_id = p_trip and p_me in (pay.from_member_id, pay.to_member_id)
  ) x
  join public.members m on m.id = x.id
  where x.id <> p_me and m.trip_id = p_trip and m.status in ('active', 'not_attending', 'removed')
$$;

/**
 * M-1/M-2: the caller's own ledger in a trip they were removed from, as jsonb; null otherwise.
 * {memberId, tripName, expenses[], adjustments[], payments[], people[]}. Amounts are integer
 * minor units; the balance is computed in @wandr/core (money.ownBalances).
 */
create or replace function app.former_member_ledger(p_trip uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := app.my_former_member_id(p_trip);
begin
  if me is null then return null; end if;
  return jsonb_build_object(
    'memberId', me,
    'tripName', (select t.name from public.trips t where t.id = p_trip),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'merchant', e.merchant,
        'spentOn', e.spent_on,
        'createdAt', e.created_at,
        'currency', e.currency,
        'totalMinor', e.total_minor,
        'isRefund', e.refund_of_expense_id is not null,
        'payerName', (select pm.display_name from public.members pm where pm.id = e.paid_by_member_id),
        'paidByMe', e.paid_by_member_id = me,
        'myShareMinor', coalesce((select s.share_minor from public.expense_shares s where s.expense_id = e.id and s.member_id = me), 0),
        'myPaidMinor', case
          when exists (select 1 from public.expense_payers p where p.expense_id = e.id)
            then coalesce((select p.paid_minor from public.expense_payers p where p.expense_id = e.id and p.member_id = me), 0)
          when e.paid_by_member_id = me then e.total_minor
          else 0 end
      ) order by e.created_at desc, e.id)
      from public.expenses e
      where e.id in (select app.former_expense_ids(p_trip, me))
    ), '[]'::jsonb),
    -- FR-69 corrections and FR-9 balance resolutions that move the caller's balance. Those on a
    -- hidden expense are kept only when they are about the caller's removal (no expense detail).
    'adjustments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'currency', e.currency,
        'deltaMinor', a.delta_minor,
        'reason', a.reason,
        'createdAt', a.created_at,
        'merchant', case when e.id in (select app.former_expense_ids(p_trip, me)) then e.merchant end
      ) order by a.created_at desc, a.id)
      from public.expense_adjustments a
      join public.expenses e on e.id = a.expense_id
      where a.trip_id = p_trip and a.member_id = me
        and e.personal_member_id is null
        and (e.id in (select app.former_expense_ids(p_trip, me)) or a.reason like 'member\_removed:%')
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pay.id,
        'currency', pay.currency,
        'amountMinor', pay.amount_minor,
        'fromMe', pay.from_member_id = me,
        'otherMemberId', case when pay.from_member_id = me then pay.to_member_id else pay.from_member_id end,
        'otherName', (select om.display_name from public.members om
                      where om.id = case when pay.from_member_id = me then pay.to_member_id else pay.from_member_id end),
        'note', pay.note,
        'createdAt', pay.created_at
      ) order by pay.created_at desc, pay.id)
      from public.payments pay
      where pay.trip_id = p_trip and me in (pay.from_member_id, pay.to_member_id)
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name) order by m.display_name, m.id)
      from public.members m
      where m.id in (select app.former_counterparts(p_trip, me))
    ), '[]'::jsonb)
  );
end
$$;

/** Trips the caller was removed from (live trips only), for "Former trips · settle up" on /trips. */
create or replace function app.my_former_trips()
returns table (trip_id uuid, trip_name text, member_id uuid, removed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, m.id, m.removed_at
  from public.members m
  join public.trips t on t.id = m.trip_id
  where app.uid() is not null
    and not app.recheck_pending()
    and m.user_id = app.uid()
    and m.status = 'removed'
    and t.deleted_at is null
  order by m.removed_at desc nulls last, t.id
$$;

/**
 * M-1/M-2: a former member records a settle-up with someone on their own ledger, in a currency
 * of their ledger. `p_i_paid` true = "I paid them", false = "they paid me". Append-only like
 * every payment (FR-71, NFR-5); locks the related expenses through the usual trigger (FR-69).
 */
create or replace function app.former_member_record_payment(
  p_trip uuid,
  p_other uuid,
  p_i_paid boolean,
  p_currency text,
  p_amount_minor bigint,
  p_note text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := app.my_former_member_id(p_trip);
  pid uuid;
begin
  if me is null then
    raise exception 'not a former member of this trip' using errcode = '42501';
  end if;
  if p_other is null or p_other not in (select app.former_counterparts(p_trip, me)) then
    raise exception 'pick someone from your expenses' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'payment amount must be positive' using errcode = '23514';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' or not (
    exists (select 1 from public.expenses e where e.id in (select app.former_expense_ids(p_trip, me)) and e.currency = p_currency)
    or exists (select 1 from public.payments pay where pay.trip_id = p_trip and me in (pay.from_member_id, pay.to_member_id) and pay.currency = p_currency)
  ) then
    raise exception 'currency is not on your ledger' using errcode = '23514';
  end if;
  insert into public.payments (trip_id, from_member_id, to_member_id, currency, amount_minor, recorded_by_member_id, note)
  values (
    p_trip,
    case when p_i_paid then me else p_other end,
    case when p_i_paid then p_other else me end,
    p_currency,
    p_amount_minor,
    me,
    nullif(left(btrim(coalesce(p_note, '')), 200), '')
  )
  returning id into pid;
  insert into public.audit_log (trip_id, actor_member_id, action, entity, entity_id)
  values (p_trip, me, 'payment.recorded_by_former_member', 'payment', pid);
  return pid;
end
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
