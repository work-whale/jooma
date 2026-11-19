-- Jooma 4.5, Phase 2 (spec Steps 6 and 7).
--
--   1. profiles.last_seen_at   E10 ("after 14 days with no visit"). Set by the
--                              proxy at most once a UK day per browser.
--   2. profiles.job_role       The signup question on role. Optional.
--   3. profiles.school_name    The signup question on school. Optional, free
--                              text; Phase 3's weekly list of schools with 3+
--                              teachers groups on email domain plus this name.
--   4. lifecycle_ideas         The E10 idea list (and later E8's weekly ideas),
--                              editable in the admin console. Empty = the
--                              defaults in app/lib/e10-ideas.ts.
--   5. school_suggestions()    Names other teachers typed, for the signup box.
--                              A definer function returning names only, never
--                              rows or ids (a policy would grant whole rows),
--                              and only names typed by at least two accounts,
--                              so one person's free text never reaches anyone.
--
-- Additive only: nothing reads these before the Phase 2 code ships.

-- ── 1 to 3. Profile columns ──────────────────────────────────────────────────

alter table profiles add column if not exists last_seen_at timestamptz;

alter table profiles add column if not exists job_role text;
alter table profiles drop constraint if exists profiles_job_role_check;
alter table profiles add constraint profiles_job_role_check
  check (job_role is null or job_role in
    ('class_teacher', 'subject_teacher', 'senco', 'senior_leader', 'teaching_assistant', 'other'));

alter table profiles add column if not exists school_name text;
alter table profiles drop constraint if exists profiles_school_name_check;
alter table profiles add constraint profiles_school_name_check
  check (school_name is null or char_length(school_name) between 2 and 120);

-- The suggestion lookup groups on the cleaned name.
create index if not exists profiles_school_name_lower_idx
  on profiles (lower(btrim(school_name)))
  where school_name is not null;

-- ── 4. Ideas for E10 (and E8) ────────────────────────────────────────────────

create table if not exists lifecycle_ideas (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('e8', 'e10')),
  text       text not null check (char_length(text) between 3 and 200),
  tool_slug  text not null check (tool_slug ~ '^[a-z0-9-]{2,60}$'),
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table lifecycle_ideas is
  'Jooma 4.5: one-line ideas for E10 (and E8). Admin-edited; the lifecycle cron reads active rows by sort under the service role.';

create index if not exists lifecycle_ideas_kind_sort_idx on lifecycle_ideas (kind, sort) where active;

alter table lifecycle_ideas enable row level security;
revoke all on lifecycle_ideas from anon;

drop policy if exists "admins manage lifecycle ideas" on lifecycle_ideas;
create policy "admins manage lifecycle ideas" on lifecycle_ideas
  for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- ── 5. School name suggestions ───────────────────────────────────────────────

create or replace function school_suggestions(p_query text)
returns table (name text)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as v)
  select min(btrim(p.school_name)) as name
  from profiles p, q
  where char_length(q.v) >= 3
    and p.school_name is not null
    and lower(btrim(p.school_name)) like '%' || replace(replace(q.v, '%', ''), '_', '') || '%'
  group by lower(btrim(p.school_name))
  having count(*) >= 2
  order by count(*) desc, 1
  limit 8;
$$;

revoke execute on function school_suggestions(text) from public, anon;
grant execute on function school_suggestions(text) to authenticated;
