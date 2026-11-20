-- Favourites on the Make page, and sharing a resource by public link.
--
-- 1. profiles.favourite_tools
--    The tools a teacher has starred (stars replaced the browser-only pins).
--    NULL means "never touched", and the app shows the defaults (Slides,
--    Worksheets, Comprehension). An empty array means the teacher unstarred
--    everything, and stays empty. Written by the teacher through the existing
--    "own profile update" policy; profiles_guard_privileged_columns() guards a
--    deny list, so a new column is self-editable by design. The check keeps it
--    to /tools/<slug> links, at most 50.
--
-- 2. resource_links
--    One unguessable token per shared resource, for /share/<token>. Every write
--    goes through a definer function; the table has one policy, the owner
--    reading their own rows. The public read is a definer function granted to
--    anon that returns named columns only, never a policy: a policy would grant
--    the whole tool_runs row, user_id and input included.
--
--    Classroom resources only. resource_link_slugs() is the allowlist, checked
--    on create AND on every public read, so taking a tool off the list kills
--    its existing links too. app/lib/resource-links.ts holds the same list, and
--    tests/unit/resource-links.spec.ts fails if the two differ.
--
-- Verified by scripts/verify-resource-links.mjs.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. FAVOURITES
-- ════════════════════════════════════════════════════════════════════════════
alter table profiles add column if not exists favourite_tools text[];

-- Each entry on its own. Joining the array and matching the string lets one
-- entry carrying the separator ('/tools/a,/tools/b') through.
create or replace function public.favourite_tools_valid(p text[])
returns boolean
language sql
immutable
as $$
  select p is null
      or (cardinality(p) <= 50
          and coalesce((select bool_and(x is not null and x ~ '^/tools/[a-z0-9-]+$') from unnest(p) as x), true));
$$;

alter table profiles drop constraint if exists profiles_favourite_tools_check;
alter table profiles add constraint profiles_favourite_tools_check
  check (public.favourite_tools_valid(favourite_tools));

comment on column profiles.favourite_tools is
  'Starred tools, as /tools/<slug> links in the order starred. NULL = never set (the app shows the defaults); empty = the teacher unstarred everything.';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. RESOURCE LINKS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists resource_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  user_id      uuid not null references auth.users (id) on delete cascade,
  tool_run_id  uuid not null references tool_runs (id) on delete cascade,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

-- One live link per resource. Turning it off and on again makes a new token,
-- so a link sent before it was turned off stays dead.
create unique index if not exists resource_links_one_live_idx
  on resource_links (tool_run_id) where revoked_at is null;
create index if not exists resource_links_user_idx on resource_links (user_id);

alter table resource_links enable row level security;
revoke all on resource_links from anon, authenticated;
grant select on resource_links to authenticated;

drop policy if exists "own resource links read" on resource_links;
create policy "own resource links read"
  on resource_links for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table resource_links is
  'Public share links for classroom resources (/share/<token>). Written only by create_resource_link() and revoke_resource_link(); read publicly only through public_resource_link().';


-- The allowlist. Keep in step with SHAREABLE_SLUGS in app/lib/resource-links.ts.
create or replace function public.resource_link_slugs()
returns text[]
language sql
immutable
as $$
  select array[
    'slideshow',
    'worksheet-generator',
    'comprehension-generator',
    'model-text-generator',
    'phonics-support',
    'sensory-activities',
    'quiz-generator',
    'exam-question-generator',
    'model-answer-generator',
    'homework-generator',
    'lesson-planner',
    'medium-term-planner',
    'topic-overview',
    'eyfs-planner',
    'cover-lesson',
    'assembly-planner'
  ]::text[];
$$;


-- ── Create (the owner, signed in) ────────────────────────────────────────────
-- Returns the live token, making one if there is none. Asking twice returns
-- the same token rather than a second link.
create or replace function public.create_resource_link(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_slug  text;
  v_token text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select tool_slug into v_slug from tool_runs where id = p_run_id and user_id = v_uid;
  if v_slug is null then
    raise exception 'resource not found' using errcode = 'P0002';
  end if;
  if not (v_slug = any (resource_link_slugs())) then
    raise exception 'this kind of resource cannot be shared by link' using errcode = '42501';
  end if;

  select token into v_token from resource_links where tool_run_id = p_run_id and revoked_at is null;
  if v_token is not null then
    return v_token;
  end if;

  v_token := translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_');
  begin
    insert into resource_links (token, user_id, tool_run_id) values (v_token, v_uid, p_run_id);
  exception when unique_violation then
    -- Two clicks at once: the other one made it. Return that.
    select token into v_token from resource_links where tool_run_id = p_run_id and revoked_at is null;
  end;
  return v_token;
end;
$$;
revoke execute on function public.create_resource_link(uuid) from public, anon;
grant execute on function public.create_resource_link(uuid) to authenticated;


-- ── Turn off (the owner) ─────────────────────────────────────────────────────
create or replace function public.revoke_resource_link(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  update resource_links
     set revoked_at = now()
   where tool_run_id = p_run_id
     and user_id = auth.uid()
     and revoked_at is null;
end;
$$;
revoke execute on function public.revoke_resource_link(uuid) from public, anon;
grant execute on function public.revoke_resource_link(uuid) to authenticated;


-- ── The live link, as one row of named columns ───────────────────────────────
-- Shared by the public read and the copy. A deck's slides come from its
-- presentation, and ONLY if that presentation belongs to the run's owner:
-- input is the teacher's own JSON, so without that check a run pointing at
-- someone else's presentation id would publish their deck.
--
-- Of the input, only what a quiz needs to draw its heading (topic, subject,
-- year, mixed, time limit). Anything else a form stored stays private.
create or replace function public.resource_link_row(p_token text)
returns table (
  run_id     uuid,
  owner_id   uuid,
  tool_slug  text,
  title      text,
  input      jsonb,
  output     text,
  slides     jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.user_id,
         r.tool_slug,
         coalesce(nullif(trim(r.title), ''), p.title),
         jsonb_strip_nulls(jsonb_build_object(
           'topic',     r.input -> 'topic',
           'subject',   r.input -> 'subject',
           'yearGroup', r.input -> 'yearGroup',
           'mixed',     r.input -> 'mixed',
           'timeLimit', r.input -> 'timeLimit'
         )),
         r.output,
         p.slides,
         l.created_at
    from resource_links l
    join tool_runs r on r.id = l.tool_run_id
    join profiles pr on pr.id = r.user_id
    left join presentations p
      on r.tool_slug = 'slideshow'
     -- CASE, not AND: Postgres does not promise to test the shape before the
     -- cast, and a bad id would otherwise fail the whole read.
     and p.id = case
                  when r.input ->> 'presentationId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                  then (r.input ->> 'presentationId')::uuid
                end
     and p.user_id = r.user_id
   where p_token ~ '^[A-Za-z0-9_-]{22}$'
     and l.token = p_token
     and l.revoked_at is null
     and r.tool_slug = any (resource_link_slugs())
     and pr.suspended_at is null
     and pr.deletion_scheduled_for is null
   limit 1;
$$;
revoke execute on function public.resource_link_row(text) from public, anon, authenticated;


-- ── Public read (anyone with the link) ───────────────────────────────────────
-- No owner id and no teacher name: the page says "Made with Jooma" and nothing
-- about who.
create or replace function public.public_resource_link(p_token text)
returns table (
  tool_slug  text,
  title      text,
  input      jsonb,
  output     text,
  slides     jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select tool_slug, title, input, output, slides, created_at
    from resource_link_row(p_token);
$$;
revoke execute on function public.public_resource_link(text) from public;
grant execute on function public.public_resource_link(text) to anon, authenticated;


-- ── Save a copy (signed in) ──────────────────────────────────────────────────
-- Into the caller's own library. A deck gets its own presentation, so editing
-- the copy never touches the original. Its pictures are the same Storage
-- objects, which storage_paths_in_use() already counts as in use by any
-- presentation that references them, so the original being deleted cannot
-- pull them out of the copy.
create or replace function public.save_resource_link_copy(p_token text)
returns table (run_id uuid, presentation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  record;
  v_pres uuid;
  v_run  uuid;
  v_n    int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into v_row from resource_link_row(p_token);
  if v_row.run_id is null then
    raise exception 'link not found' using errcode = 'P0002';
  end if;

  if v_row.tool_slug = 'slideshow' then
    if v_row.slides is null or jsonb_typeof(v_row.slides) <> 'array' or jsonb_array_length(v_row.slides) = 0 then
      raise exception 'this deck has no slides to copy' using errcode = 'P0002';
    end if;
    v_n := jsonb_array_length(v_row.slides);
    insert into presentations (user_id, title, slides)
      values (v_uid, coalesce(v_row.title, 'Untitled Slideshow'), v_row.slides)
      returning id into v_pres;
    insert into tool_runs (user_id, tool_slug, title, input, output)
      values (v_uid, 'slideshow', v_row.title,
              jsonb_build_object('presentationId', v_pres, 'slideCount', v_n),
              format('Generated a %s-slide deck.', v_n))
      returning id into v_run;
  else
    insert into tool_runs (user_id, tool_slug, title, input, output)
      values (v_uid, v_row.tool_slug, v_row.title, v_row.input, v_row.output)
      returning id into v_run;
  end if;

  return query select v_run, v_pres;
end;
$$;
revoke execute on function public.save_resource_link_copy(text) from public, anon;
grant execute on function public.save_resource_link_copy(text) to authenticated;


-- ── Verify after pushing ────────────────────────────────────────────────────
-- select count(*) from resource_links;                         -- 0, no error
-- select * from public_resource_link('AAAAAAAAAAAAAAAAAAAAAA'); -- empty, no error
-- select favourite_tools from profiles limit 1;                 -- null, no error
