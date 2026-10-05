-- Guest tries from the landing page, and the "Made with Jooma" showcase.
--
-- TWO FEATURES, ONE FILE
--
--   1. A signed out visitor can make one Slides deck and one Comprehension a
--      day from /create. The output is kept against a signed guest cookie and
--      moved into their account when they sign up or log in, on whichever day
--      that happens. That needs somewhere to keep the work before there is a
--      user to own it: trial_generations.
--
--   2. After a generation a teacher is asked whether it can appear on the
--      landing page. A Yes queues it for an admin, and only approved items are
--      ever readable by anon: showcase_items plus four functions.
--
-- WHY THE GUEST STORE HAS NO POLICIES
--
-- Same arrangement as enquiry_rate and auth_rate. Every read and write goes
-- through a server route holding the service role, after that route has checked
-- the guest cookie's signature and the per IP throttle. A guest has no
-- auth.uid() for a policy to key on, so any policy granting anon access here
-- would be granting it to every visitor at once.


-- ════════════════════════════════════════════════════════════════════════════
-- 1. GUEST TRIES
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.trial_generations (
  id          uuid primary key default gen_random_uuid(),
  -- The id inside the signed jooma_guest cookie. Not a foreign key: there is
  -- no guest table, the cookie IS the guest.
  guest_id    uuid not null,
  tool        text not null check (tool in ('slideshow', 'comprehension-generator')),
  status      text not null default 'running'
              check (status in ('running', 'done', 'failed', 'claimed')),
  title       text,
  input       jsonb not null default '{}'::jsonb,
  -- Slides: { "slides": [...] }. Comprehension: { "text": "..." }.
  output      jsonb,
  -- Stamped on every token_usage / asset_cost row the run spends, so a claim
  -- can hand the spend to the new owner with one update per table.
  run_id      uuid not null,
  -- sha256 of the client IP with TRIAL_SECRET. Never the raw address.
  ip_hash     text not null,
  claimed_by  uuid references auth.users(id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists trial_generations_guest_idx
  on public.trial_generations (guest_id, created_at desc);
create index if not exists trial_generations_ip_idx
  on public.trial_generations (ip_hash, tool, created_at desc);
create index if not exists trial_generations_created_idx
  on public.trial_generations (created_at desc);

alter table public.trial_generations enable row level security;
revoke all on public.trial_generations from anon, authenticated;

comment on table public.trial_generations is
  'Free generations made from /create by signed out visitors. Service role only: the /api/try routes verify the signed guest cookie and throttle by IP before touching it. Claimed into presentations / tool_runs on sign in. Unclaimed rows are purged after 30 days.';


-- Throttle kinds for the guest chat and the slideshow wizard helpers. Same
-- table and same service role only arrangement as the password link throttle.
alter table public.auth_rate drop constraint if exists auth_rate_kind_check;
alter table public.auth_rate
  add constraint auth_rate_kind_check
  check (kind in ('ip', 'email', 'unsub_ip', 'guest_chat_ip', 'guest_helper_ip'));


-- The two switches an admin needs if guest spend runs away. Read by the server
-- through the service role, so they need no change to public_settings().
insert into public.app_settings (key, label, description, section, value, sort)
values
  ('trial_enabled', 'Free tries on the landing page',
   'Lets signed out visitors make one Slides deck and one Comprehension a day from the hero.',
   'landing', 'true'::jsonb, 20),
  ('trial_daily_cap', 'Free tries per day, all visitors',
   'Once this many free generations have started today, the hero asks visitors to sign up instead.',
   'landing', '300'::jsonb, 21)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. SHOWCASE
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.showcase_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null check (kind in ('slides', 'comprehension', 'worksheet')),
  presentation_id  uuid unique references public.presentations(id) on delete cascade,
  tool_run_id      uuid unique references public.tool_runs(id) on delete cascade,
  slug             text not null unique,
  title            text not null,
  subject          text,
  year_label       text,
  region           text,
  -- What the teacher answered. A No is kept so they are never asked twice
  -- about the same resource.
  consent          boolean not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'declined')),
  position         integer,
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((presentation_id is null) <> (tool_run_id is null))
);

create index if not exists showcase_items_status_idx
  on public.showcase_items (status, position nulls last, reviewed_at desc);

alter table public.showcase_items enable row level security;

-- A teacher can see their own answers, which is how the prompt knows not to
-- ask again. Every write goes through set_showcase_consent().
drop policy if exists "showcase own read" on public.showcase_items;
create policy "showcase own read" on public.showcase_items
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.showcase_items from anon, authenticated;
grant select on public.showcase_items to authenticated;


-- ── The teacher's answer ────────────────────────────────────────────────────
create or replace function public.set_showcase_consent(
  p_kind        text,
  p_resource_id uuid,
  p_consent     boolean
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_title    text;
  v_subject  text;
  v_year     text;
  v_region   text;
  v_existing showcase_items%rowtype;
  v_status   text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('slides', 'comprehension', 'worksheet') then
    raise exception 'unknown kind %', p_kind;
  end if;

  -- Ownership, and the card details, from the resource itself. Nothing the
  -- client sends ends up on the landing page except the yes or no.
  if p_kind = 'slides' then
    select p.title,
           nullif(p.generation_params -> 'curriculum' ->> 'subject', ''),
           nullif(p.generation_params ->> 'year', '')
      into v_title, v_subject, v_year
      from presentations p
     where p.id = p_resource_id and p.user_id = v_uid;
  else
    select coalesce(nullif(r.title, ''), nullif(r.input ->> 'topic', '')),
           coalesce(nullif(r.input ->> 'subject', ''),
                    case when p_kind = 'comprehension' then 'Reading' end),
           nullif(r.input ->> 'yearGroup', '')
      into v_title, v_subject, v_year
      from tool_runs r
     where r.id = p_resource_id
       and r.user_id = v_uid
       and r.tool_slug = case p_kind
                           when 'comprehension' then 'comprehension-generator'
                           else 'worksheet-generator'
                         end;
  end if;

  if not found or v_title is null then
    raise exception 'resource not found';
  end if;

  select nullif(country, '') into v_region from profiles where id = v_uid;

  select * into v_existing from showcase_items
   where (p_kind = 'slides' and presentation_id = p_resource_id)
      or (p_kind <> 'slides' and tool_run_id = p_resource_id);

  if v_existing.id is null then
    v_status := case when p_consent then 'pending' else 'declined' end;
    insert into showcase_items (
      user_id, kind, presentation_id, tool_run_id, slug,
      title, subject, year_label, region, consent, status
    ) values (
      v_uid, p_kind,
      case when p_kind = 'slides' then p_resource_id end,
      case when p_kind <> 'slides' then p_resource_id end,
      trim(both '-' from left(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 60))
        || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6),
      left(v_title, 140), v_subject, v_year, v_region, p_consent, v_status
    );
    return v_status;
  end if;

  -- A changed mind. Withdrawing always works, from any state. Saying yes again
  -- re-queues it, unless an admin has already turned it down.
  if not p_consent then
    v_status := case when v_existing.status in ('pending', 'approved') then 'withdrawn'
                     else v_existing.status end;
  else
    v_status := case when v_existing.status in ('declined', 'withdrawn') then 'pending'
                     else v_existing.status end;
  end if;

  update showcase_items
     set consent = p_consent,
         status = v_status,
         title = left(v_title, 140),
         subject = v_subject,
         year_label = v_year,
         region = v_region,
         updated_at = now()
   where id = v_existing.id;

  return v_status;
end;
$$;
revoke execute on function public.set_showcase_consent(text, uuid, boolean) from public, anon;
grant execute on function public.set_showcase_consent(text, uuid, boolean) to authenticated;


-- ── Admin: the review queue ─────────────────────────────────────────────────
create or replace function public.admin_list_showcase(p_status text default 'pending')
returns table (
  id              uuid,
  kind            text,
  slug            text,
  title           text,
  subject         text,
  year_label      text,
  region          text,
  teacher_name    text,
  teacher_email   text,
  status          text,
  "position"      integer,
  presentation_id uuid,
  tool_run_id     uuid,
  first_slide     jsonb,
  excerpt         text,
  created_at      timestamptz,
  reviewed_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform admin_require_section('see_content');
  return query
  select s.id, s.kind, s.slug, s.title, s.subject, s.year_label, s.region,
         nullif(trim(concat_ws(' ', pr.first_name, pr.surname)), ''),
         u.email::text,
         s.status, s.position, s.presentation_id, s.tool_run_id,
         p.slides -> 0,
         left(r.output, 600),
         s.created_at, s.reviewed_at
    from showcase_items s
    left join profiles pr on pr.id = s.user_id
    left join auth.users u on u.id = s.user_id
    left join presentations p on p.id = s.presentation_id
    left join tool_runs r on r.id = s.tool_run_id
   where s.status = coalesce(p_status, s.status)
     and s.status <> 'declined'
   order by s.position nulls last, s.created_at desc
   limit 200;
end;
$$;
revoke execute on function public.admin_list_showcase(text) from public, anon;
grant execute on function public.admin_list_showcase(text) to authenticated;


create or replace function public.admin_review_showcase(
  p_id       uuid,
  p_status   text,
  p_position integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row showcase_items%rowtype;
begin
  perform admin_require_section('see_content');
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'unknown status %', p_status;
  end if;

  select * into v_row from showcase_items where id = p_id;
  if v_row.id is null then raise exception 'not found'; end if;
  -- The teacher's say beats the admin's. A withdrawn or declined item cannot
  -- be pushed onto the homepage by anyone.
  if p_status = 'approved' and not v_row.consent then
    raise exception 'the teacher has not agreed to share this';
  end if;

  update showcase_items
     set status = p_status,
         position = p_position,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_id;

  perform admin_log(
    'Showcase ' || p_status, 'content', 'showcase_item', p_id::text, v_row.title,
    jsonb_build_object('from', v_row.status, 'to', p_status, 'position', p_position)
  );
end;
$$;
revoke execute on function public.admin_review_showcase(uuid, text, integer) from public, anon;
grant execute on function public.admin_review_showcase(uuid, text, integer) to authenticated;


-- ── Public: what the landing page and /made/<slug> may read ─────────────────
-- Definer functions returning named columns, never a policy: a policy would
-- hand anon the whole presentations or tool_runs row. Suspended accounts and
-- accounts on their way out drop off the page without anyone touching the item.
create or replace function public.public_showcase(p_limit integer default 6)
returns table (
  slug         text,
  kind         text,
  title        text,
  subject      text,
  year_label   text,
  region       text,
  teacher_name text,
  first_slide  jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select s.slug, s.kind, s.title, s.subject, s.year_label, s.region,
         nullif(trim(concat_ws(' ', pr.first_name, pr.surname)), ''),
         p.slides -> 0
    from showcase_items s
    join profiles pr on pr.id = s.user_id
    left join presentations p on p.id = s.presentation_id
   where s.status = 'approved'
     and s.consent
     and pr.suspended_at is null
     and pr.deletion_scheduled_for is null
   order by s.position nulls last, s.reviewed_at desc
   limit least(greatest(coalesce(p_limit, 6), 1), 24);
$$;
revoke execute on function public.public_showcase(integer) from public;
grant execute on function public.public_showcase(integer) to anon, authenticated;


create or replace function public.public_showcase_item(p_slug text)
returns table (
  slug         text,
  kind         text,
  title        text,
  subject      text,
  year_label   text,
  region       text,
  teacher_name text,
  slides       jsonb,
  output       text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.slug, s.kind, s.title, s.subject, s.year_label, s.region,
         nullif(trim(concat_ws(' ', pr.first_name, pr.surname)), ''),
         p.slides,
         r.output
    from showcase_items s
    join profiles pr on pr.id = s.user_id
    left join presentations p on p.id = s.presentation_id
    left join tool_runs r on r.id = s.tool_run_id
   where s.slug = p_slug
     and s.status = 'approved'
     and s.consent
     and pr.suspended_at is null
     and pr.deletion_scheduled_for is null
   limit 1;
$$;
revoke execute on function public.public_showcase_item(text) from public;
grant execute on function public.public_showcase_item(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. HERO COPY
-- ════════════════════════════════════════════════════════════════════════════
-- The v3 hero is one short line over the topic box. Guarded on the exact
-- previous value, as before, so a hand edit in /admin/copy is left alone.
update public.copy_blocks
   set value = 'Think it, Teach it.', updated_at = now()
 where key = 'home.hero.h1'
   and value = 'Type a topic. Walk out with the lesson.';


-- ── Verify after pushing ────────────────────────────────────────────────────
-- select count(*) from trial_generations;                       -- 0, no error
-- select * from public_showcase(6);                              -- empty, no error
-- select key, value from app_settings where section = 'landing'; -- two rows
