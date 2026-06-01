-- Scope presentations to their owning user.
--
-- 1. Add user_id column (defaults to auth.uid() on insert so the app
--    never needs to pass it explicitly).
-- 2. Replace the open MVP policies with per-user RLS.
-- 3. Update the list_presentations_lite RPC to filter by auth.uid().
--
-- Existing rows have no owner (user_id = NULL). The new policies use
-- auth.uid() = user_id, so those rows are no longer visible to any
-- authenticated user — they effectively become orphaned and harmless.

-- 1. Column
alter table presentations
  add column if not exists user_id uuid references auth.users(id) default auth.uid();

-- 2. RLS policies — drop the open MVP ones first
drop policy if exists "anon read"   on presentations;
drop policy if exists "anon insert" on presentations;
drop policy if exists "anon update" on presentations;
drop policy if exists "anon delete" on presentations;

create policy "users read own"
  on presentations for select
  using (auth.uid() = user_id);

create policy "users insert own"
  on presentations for insert
  with check (auth.uid() = user_id);

create policy "users update own"
  on presentations for update
  using (auth.uid() = user_id);

create policy "users delete own"
  on presentations for delete
  using (auth.uid() = user_id);

-- 3. RPC — add WHERE user_id = auth.uid() so the function respects auth context
create or replace function list_presentations_lite()
returns table (
  id          uuid,
  title       text,
  created_at  timestamptz,
  updated_at  timestamptz,
  slide_count integer,
  first_slide jsonb
)
language sql
stable
security invoker  -- runs with the caller's privileges so auth.uid() resolves correctly
as $$
  select
    p.id,
    p.title,
    p.created_at,
    p.updated_at,
    coalesce(jsonb_array_length(p.slides), 0)::integer as slide_count,
    p.slides -> 0                                       as first_slide
  from presentations p
  where p.user_id = auth.uid()
  order by p.updated_at desc;
$$;

grant execute on function list_presentations_lite() to anon, authenticated;
