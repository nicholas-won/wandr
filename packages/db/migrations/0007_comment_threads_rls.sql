-- Threaded idea comments (FR-46). Hand-written; runs after 0007_comment_threads.sql.
--
-- Replaces app.guard_comments() from 0001_rls.sql, keeping every earlier rule
-- (author = caller, surprise list inherited from the idea/expense, provenance read-only,
-- only the author edits the body) and adding:
--   * one level of nesting: a reply's parent is a live top-level comment on the same item;
--   * body is 1–2000 characters of non-blank text;
--   * edited_at is set by the DB when the author changes the body;
--   * soft delete: only the author sets/clears deleted_at, and a deleted comment's body is
--     cleared in the DB, so other members can never read it back. Undo restores the body.
-- RLS policies are unchanged: personal-link sessions can read threads but not write (FR-5).

alter table public.comments
  add constraint comments_body_len check (char_length(body) <= 2000);

create index if not exists comments_parent_idx on public.comments (parent_id);

create or replace function app.guard_comments() returns trigger
language plpgsql set search_path = '' as $$
declare
  h uuid[];
  p record;
begin
  if not app.is_client() then
    if new.deleted_at is not null then new.body := ''; end if;
    return new;
  end if;
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
    -- FR-46: replies go one level deep, under a live comment the caller can see (RLS applies).
    if new.parent_id is not null then
      select c.idea_id, c.expense_id, c.parent_id, c.deleted_at into p
        from public.comments c where c.id = new.parent_id;
      if not found
         or p.idea_id is distinct from new.idea_id
         or p.expense_id is distinct from new.expense_id
         or p.parent_id is not null
         or p.deleted_at is not null then
        raise exception 'replies go under a top-level comment on the same item (FR-46)' using errcode = '23514';
      end if;
    end if;
    if btrim(new.body) = '' then
      raise exception 'comment is empty' using errcode = '23514';
    end if;
    new.member_id := app.my_member_id(new.trip_id);
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
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
  if (new.body <> old.body or new.deleted_at is distinct from old.deleted_at)
     and old.member_id is distinct from app.my_member_id(old.trip_id) then
    raise exception 'only the author can edit a comment' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    -- Deleted (or staying deleted): nothing readable is kept.
    new.body := '';
    new.edited_at := old.edited_at;
  else
    if btrim(new.body) = '' then
      raise exception 'comment is empty' using errcode = '23514';
    end if;
    if old.deleted_at is not null then
      -- Undo of a delete: restoring the text isn't an edit.
      new.edited_at := old.edited_at;
    elsif new.body <> old.body then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;
  return new;
end
$$;
