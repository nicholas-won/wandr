-- 0003_library_rls.sql: Row Level Security for the idea library (§6.12, FR-L14, FR-L25/L26).
--
-- Hand-written; runs as one file after 0002_idea_library.sql (generated tables).
--
--   FR-L25  A library is private to its owner. Trip members never see it; saves never appear in
--           trip views or counts unless sent (copied) to the trip (LB-4/LB-5).
--   FR-L14  Shared-board members (verified, or a `board_link` session) see ONLY that board's
--           saves, and can add to it. Managing the board needs a verified session (like FR-5).
--   FR-L26  Board members see each other's names, never phones.
--   FR-L22, D62  ai_imports.counted is computed in the database: every new AI extraction counts,
--           in any context; cache hits, failures and plain text never do. POC: no cap (FR-L24).
--
-- Same conventions as 0001_rls.sql: SECURITY DEFINER helpers with pinned search_path; guard
-- triggers are SECURITY INVOKER and let service code through via app.is_client().

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------

/** Board member id from a shared-board link (view + add). Ignored when another claim is present. */
create or replace function app.board_link_member() returns uuid
language sql stable set search_path = '' as $$
  select case when app.uid() is null and nullif(app.claims() ->> 'link_member', '') is null
              then nullif(app.claims() ->> 'board_link', '')::uuid end
$$;

/** The caller's active board_members row for a board (verified user or board link). */
create or replace function app.my_board_member_id(p_board uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select bm.id from public.board_members bm
  where bm.board_id = p_board and bm.status = 'active'
    and ((app.uid() is not null and bm.user_id = app.uid())
         or (app.board_link_member() is not null and bm.id = app.board_link_member()))
  limit 1
$$;

create or replace function app.is_board_member(p_board uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.my_board_member_id(p_board) is not null
$$;

/** Board owner with a verified session: the only one who manages the board. */
create or replace function app.is_board_owner(p_board uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null
     and exists (select 1 from public.boards b where b.id = p_board and b.owner_user_id = app.uid())
$$;

/** Is this board_members row the caller's own (active)? */
create or replace function app.is_my_board_member(p_board_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_board_member is not null and exists (
    select 1 from public.board_members bm
    where bm.id = p_board_member and bm.status = 'active'
      and app.my_board_member_id(bm.board_id) = bm.id
  )
$$;

/** Is this save on a board the caller is in (or owns)? */
create or replace function app.saved_idea_on_my_board(p_saved uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.board_items bi
                 where bi.saved_idea_id = p_saved
                   and (app.is_board_member(bi.board_id) or app.is_board_owner(bi.board_id)))
$$;

/** Can the caller see this save? Own library, own board-only save, or on a board they're in. */
create or replace function app.saved_idea_visible(p_saved uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.saved_ideas s
    where s.id = p_saved and (
      (app.uid() is not null and s.user_id = app.uid())
      or (s.user_id is null and app.is_my_board_member(s.created_by_board_member_id))
      or exists (select 1 from public.board_items bi
                 where bi.saved_idea_id = s.id
                   and (app.is_board_member(bi.board_id) or app.is_board_owner(bi.board_id)))
    )
  )
$$;

/**
 * Can the caller edit or delete this save? The library owner; for board-only saves (no library
 * behind them) also their creator and the owner of a board they're on.
 */
create or replace function app.saved_idea_editable(p_saved uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.saved_ideas s
    where s.id = p_saved and (
      (app.uid() is not null and s.user_id = app.uid())
      or (s.user_id is null and (
            app.is_my_board_member(s.created_by_board_member_id)
            or exists (select 1 from public.board_items bi
                       where bi.saved_idea_id = s.id and app.is_board_owner(bi.board_id))))
    )
  )
$$;

/** Saves in the caller's own library (verified session). */
create or replace function app.owns_saved_idea(p_saved uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.uid() is not null
     and exists (select 1 from public.saved_ideas s where s.id = p_saved and s.user_id = app.uid())
$$;

/**
 * Can the caller put this save on this board? They must be on the board (or own it) and the save
 * must be theirs: from their library, or a board-only save they created for this same board.
 * Nobody can put someone else's private save on a board (FR-L25).
 */
create or replace function app.can_add_to_board(p_saved uuid, p_board uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (app.is_board_member(p_board) or app.is_board_owner(p_board)) and exists (
    select 1 from public.saved_ideas s
    where s.id = p_saved and (
      (app.uid() is not null and s.user_id = app.uid())
      or (s.user_id is null and s.created_by_board_member_id is not null
          and s.created_by_board_member_id = app.my_board_member_id(p_board))
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function app.guard_saved_ideas() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  elsif new.user_id is distinct from old.user_id
     or new.created_by_board_member_id is distinct from old.created_by_board_member_id
     or new.created_at <> old.created_at then
    raise exception 'saved idea ownership is read-only' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end
$$;

create or replace function app.guard_saved_idea_sources() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.added_by_user_id := app.uid();
  new.added_by_board_member_id := app.board_link_member();
  new.created_at := now();
  return new;
end
$$;

create or replace function app.guard_saved_idea_notes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.user_id := app.uid();
  new.updated_at := now();
  return new;
end
$$;

create or replace function app.guard_board_items() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.added_by_board_member_id := app.my_board_member_id(new.board_id);
  new.created_at := now();
  return new;
end
$$;

/** Board members: owner row is fixed; members may rename themselves or leave (FR-L14, LB-6). */
create or replace function app.guard_board_members() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      raise exception 'the board owner is set when the board is created' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.board_id <> old.board_id or new.user_id is distinct from old.user_id
     or new.created_at <> old.created_at then
    raise exception 'board member identity is read-only' using errcode = '42501';
  end if;
  if new.role <> old.role then
    raise exception 'board roles cannot be changed' using errcode = '42501';
  end if;
  if new.status <> old.status or new.removed_at is distinct from old.removed_at then
    if old.role = 'owner' then
      raise exception 'the board owner cannot be removed' using errcode = '42501';
    end if;
    if not (app.is_board_owner(old.board_id)
            or (app.uid() is not null and old.user_id = app.uid() and new.status = 'removed')) then
      raise exception 'only the board owner manages members (FR-L14)' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

/** New board: its creator becomes the owner member (so names show on the board). */
create or replace function app.on_board_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.board_members (board_id, user_id, display_name, role, status)
  select new.id, u.id, u.display_name, 'owner', 'active' from public.users u where u.id = new.owner_user_id
  on conflict do nothing;
  return null;
end
$$;

/** Deleting a board deletes the board-only saves that lived only there. */
create or replace function app.on_board_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.saved_ideas s
  where s.user_id is null
    and not exists (select 1 from public.board_items bi where bi.saved_idea_id = s.id);
  return null;
end
$$;

create or replace function app.guard_boards() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_user_id := app.uid();
    new.created_at := now();
  elsif new.owner_user_id <> old.owner_user_id then
    raise exception 'board owner is read-only' using errcode = '42501';
  end if;
  return new;
end
$$;

/** "Sent to trips" rows: sender is the caller, idea must be in that trip (FR-L12). */
create or replace function app.guard_saved_idea_sends() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() then return new; end if;
  new.sent_by_user_id := app.uid();
  new.created_at := now();
  if app.idea_trip(new.idea_id) is distinct from new.trip_id then
    raise exception 'idea is not in that trip' using errcode = '42501';
  end if;
  return new;
end
$$;

/** ideas.source_saved_idea_id may only point at the caller's own save (LB-5). */
create or replace function app.guard_idea_source_saved() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.is_client() or new.source_saved_idea_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.source_saved_idea_id is not distinct from old.source_saved_idea_id then
    return new;
  end if;
  if not app.owns_saved_idea(new.source_saved_idea_id) then
    raise exception 'saved idea not found' using errcode = '42501';
  end if;
  return new;
end
$$;

/**
 * FR-L22, D62 (revised): every new AI extraction a person starts counts toward their cap, in any
 * context (library, solo or group trip); cache hits, failures and plain text never do. Computed
 * for every role, so no caller can set it.
 */
create or replace function app.ai_import_counted() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.counted := new.kind = 'extraction';
  return new;
end
$$;

create trigger saved_ideas_guard before insert or update on public.saved_ideas
  for each row execute function app.guard_saved_ideas();
create trigger saved_idea_sources_guard before insert on public.saved_idea_sources
  for each row execute function app.guard_saved_idea_sources();
create trigger saved_idea_notes_guard before insert or update on public.saved_idea_notes
  for each row execute function app.guard_saved_idea_notes();
create trigger board_items_guard before insert on public.board_items
  for each row execute function app.guard_board_items();
create trigger board_members_guard before insert or update on public.board_members
  for each row execute function app.guard_board_members();
create trigger boards_guard before insert or update on public.boards
  for each row execute function app.guard_boards();
create trigger boards_owner_member after insert on public.boards
  for each row execute function app.on_board_created();
create trigger boards_cleanup after delete on public.boards
  for each statement execute function app.on_board_deleted();
create trigger saved_idea_sends_guard before insert on public.saved_idea_trip_sends
  for each row execute function app.guard_saved_idea_sends();
create trigger ideas_source_saved_guard before insert or update on public.ideas
  for each row execute function app.guard_idea_source_saved();
create trigger ai_imports_counted before insert or update on public.ai_imports
  for each row execute function app.ai_import_counted();

-- ---------------------------------------------------------------------------
-- Grants and RLS (tables from 0002 were created after 0001's loop ran)
-- ---------------------------------------------------------------------------
-- Default-deny on the new tables (Supabase's default privileges may have granted them), then
-- enable RLS on every public table again (idempotent; catches anything created since 0001).
revoke all on public.boards, public.board_members, public.board_member_contacts, public.board_links,
  public.saved_ideas, public.saved_idea_notes, public.saved_idea_sources, public.board_items,
  public.saved_idea_trip_sends, public.ai_imports
  from anon, authenticated;
grant all on all tables in schema public to service_role;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end
$$;

grant select, insert, update (name), delete on public.boards to authenticated;
grant select, insert, update (display_name, status, removed_at) on public.board_members to authenticated;
grant select, insert, delete on public.board_items to authenticated;
grant select, insert, update, delete on public.saved_ideas to authenticated;
grant select, insert, update, delete on public.saved_idea_notes to authenticated;
grant select, insert, delete on public.saved_idea_sources to authenticated;
grant select, insert on public.saved_idea_trip_sends to authenticated;
grant select on public.ai_imports to authenticated;
-- No grants (service only): board_member_contacts (phones, FR-L26), board_links (token hashes).

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- saved ideas (FR-L1, FR-L25)
-- Uses the row's own columns (not app.saved_idea_visible) so INSERT ... RETURNING works: a STABLE
-- helper's snapshot can't see the row being inserted.
create policy saved_ideas_select on public.saved_ideas for select to authenticated using (
  (app.uid() is not null and user_id = app.uid())
  or (user_id is null and app.is_my_board_member(created_by_board_member_id))
  or app.saved_idea_on_my_board(id)
);
create policy saved_ideas_insert on public.saved_ideas for insert to authenticated with check (
  (app.uid() is not null and user_id = app.uid() and created_by_board_member_id is null)
  -- board-only save added through a shared board (FR-L14)
  or (user_id is null and app.is_my_board_member(created_by_board_member_id))
);
create policy saved_ideas_update on public.saved_ideas for update to authenticated
  using (app.saved_idea_editable(id)) with check (app.saved_idea_editable(id));
create policy saved_ideas_delete on public.saved_ideas for delete to authenticated
  using (app.saved_idea_editable(id));

-- personal note + someday priority: owner only, never board members (FR-L9)
create policy saved_idea_notes_owner on public.saved_idea_notes for all to authenticated
  using (app.uid() is not null and user_id = app.uid())
  with check (app.owns_saved_idea(saved_idea_id));

create policy saved_idea_sources_select on public.saved_idea_sources for select to authenticated
  using (app.saved_idea_visible(saved_idea_id));
create policy saved_idea_sources_insert on public.saved_idea_sources for insert to authenticated
  with check (app.saved_idea_editable(saved_idea_id));
create policy saved_idea_sources_delete on public.saved_idea_sources for delete to authenticated
  using (app.saved_idea_editable(saved_idea_id));

-- boards: owner manages (verified); members read
create policy boards_select on public.boards for select to authenticated
  using ((app.uid() is not null and owner_user_id = app.uid()) or app.is_board_member(id));
create policy boards_insert on public.boards for insert to authenticated
  with check (app.uid() is not null and owner_user_id = app.uid());
create policy boards_update on public.boards for update to authenticated
  using (app.is_board_owner(id)) with check (app.is_board_owner(id));
create policy boards_delete on public.boards for delete to authenticated
  using (app.is_board_owner(id));

-- board members: names visible to the board (FR-L26); owner invites; members rename/leave
create policy board_members_select on public.board_members for select to authenticated
  using (app.is_board_member(board_id) or app.is_board_owner(board_id));
create policy board_members_insert on public.board_members for insert to authenticated
  with check (app.is_board_owner(board_id) and role = 'member');
create policy board_members_update on public.board_members for update to authenticated
  using (app.is_board_owner(board_id) or id = app.my_board_member_id(board_id))
  with check (app.is_board_owner(board_id) or (app.uid() is not null and user_id = app.uid())
              or id = app.board_link_member());

-- board items: members see and add; owner (or the adder, verified) removes
create policy board_items_select on public.board_items for select to authenticated
  using (app.is_board_member(board_id) or app.is_board_owner(board_id));
create policy board_items_insert on public.board_items for insert to authenticated
  with check (app.can_add_to_board(saved_idea_id, board_id));
create policy board_items_delete on public.board_items for delete to authenticated
  using (app.is_board_owner(board_id)
         or (app.uid() is not null and added_by_board_member_id = app.my_board_member_id(board_id)));

-- sent to trips (FR-L12): the sender's own provenance rows
create policy saved_idea_sends_select on public.saved_idea_trip_sends for select to authenticated
  using (app.uid() is not null and sent_by_user_id = app.uid());
create policy saved_idea_sends_insert on public.saved_idea_trip_sends for insert to authenticated
  with check (app.owns_saved_idea(saved_idea_id) and app.is_full_member(trip_id));

-- import log: own rows only; written by the service
create policy ai_imports_own on public.ai_imports for select to authenticated
  using (app.uid() is not null and user_id = app.uid());

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
