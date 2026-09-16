-- ── Where a signup came from ────────────────────────────────────────────────
--
-- The Stats page has an acquisition panel that cannot answer its own question:
-- nothing records where a teacher arrived from, so organic, search, social and
-- paid all collapse into one bucket and the panel carries a NOT BUILT YET
-- banner saying so.
--
-- 20260916000000 added meta_fbp/meta_fbc, which tell META what worked. These
-- columns tell US, in our own admin, across every channel rather than one.
--
-- HOW THE VALUE GETS HERE
--
-- Nothing detects anything. Whoever builds a link types the label into it:
--   jooma.ai?utm_source=facebook&utm_medium=cpc&utm_campaign=autumn
-- The browser sends that URL like any other, proxy.ts reads the label on the
-- very first page load and stores it in a 30 day cookie, and
-- /api/meta/activation copies it here when the profile row is created.
--
-- Referrer is the half that needs no cooperation: browsers volunteer the
-- previous page on a click through, which is what catches organic search where
-- there is no link for anyone to tag.
--
-- NULLABLE, all of them, and null is the common case:
--   * Every account created before this migration. Permanently, with nothing to
--     backfill from. attributed_at is how you tell those apart from an account
--     that arrived after launch carrying nothing.
--   * Anyone who typed the address, used a bookmark, or came through a browser
--     that strips the Referer header.
--   * Anyone whose in-app browser handed Google sign-in to a different browser,
--     which is a real and unfixable gap concentrated on paid social.
-- Nothing downstream may treat null as an error.

alter table profiles
  add column if not exists utm_source    text,
  add column if not exists utm_medium    text,
  add column if not exists utm_campaign  text,
  add column if not exists referrer_host text,
  add column if not exists attributed_at timestamptz;

comment on column profiles.utm_source is
  'Campaign source from the link the teacher arrived through, lowercased. Self declared by whoever built the link, never validated. Null when the link carried no tag.';
comment on column profiles.utm_medium is
  'Campaign medium, lowercased. Conventionally cpc, email or social, but it is free text.';
comment on column profiles.utm_campaign is
  'Campaign name, lowercased. Free text chosen by whoever built the link.';
comment on column profiles.referrer_host is
  'Hostname of the page that linked here, never a full URL. A referrer URL carries the linking page query string, which for a search engine is the search terms. Null for direct arrivals and for our own pages.';
comment on column profiles.attributed_at is
  'First touch timestamp. Its real job is telling "signed up before we recorded anything" apart from "signed up after and arrived with nothing" — two states that are indistinguishable without it, and unrecoverable later.';

-- ── Normalisation, enforced where the data lives ────────────────────────────
--
-- Folding happens in TypeScript (app/lib/attribution.ts, normaliseUtm) because
-- it is a pure rule that belongs in the unit tests. This constraint is the belt:
-- a regression there fails loudly on the next write instead of quietly splitting
-- Facebook and facebook into two rows that nobody reconciles for three months.
--
-- NOT VALID so it does not scan the table. Every existing row is null anyway,
-- but the habit is right.

alter table profiles
  drop constraint if exists profiles_attribution_normalised;

alter table profiles
  add constraint profiles_attribution_normalised check (
    (utm_source    is null or utm_source    = lower(btrim(utm_source)))
    and (utm_medium    is null or utm_medium    = lower(btrim(utm_medium)))
    and (utm_campaign  is null or utm_campaign  = lower(btrim(utm_campaign)))
    and (referrer_host is null or referrer_host = lower(btrim(referrer_host)))
  ) not valid;

-- Partial, because the overwhelming majority of rows carry null here and will
-- for a long time. This exists for a future "show me everyone from campaign X"
-- admin query rather than for the Stats panel, which range scans on created_at
-- regardless. If that query never materialises, this index is the one thing in
-- the migration that can be dropped without consequence.
create index if not exists profiles_utm_source_idx
  on profiles (utm_source)
  where utm_source is not null;

-- ── These are ours to write, not the teacher's ──────────────────────────────
--
-- Same argument 20260916000000 makes for meta_fbp, and it applies harder here.
-- profiles has an "own profile update" policy, so a signed-in teacher can edit
-- their own row from the browser with the anon key that ships in the client
-- bundle. A teacher who could set their own utm_source could attribute their
-- signup to any campaign they liked, which corrupts the exact figures these
-- columns exist to provide.
--
-- The legitimate writer is /api/meta/activation, which uses the service role,
-- therefore has a null auth.uid(), and passes both guards untouched.
--
-- BOTH FUNCTION BODIES BELOW ARE THE LIVE DEFINITIONS, pulled with
-- pg_get_functiondef() rather than retyped from the migration history. Several
-- of these have been recreated more than once and the newest file on disk is not
-- always what is running. The only edits are the two new blocks, each marked.
--
-- Getting this wrong is the sharpest risk in this migration: a body that lost
-- the `plan` check would turn an attribution feature into a privilege
-- escalation. Diff before pushing.

create or replace function profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- The service role (webhooks, admin routes, migrations) legitimately changes
  -- these columns. It has no JWT, so auth.uid() is null — that is the signal
  -- this is a trusted server-side write rather than a browser one.
  if auth.uid() is null then
    return new;
  end if;

  -- Admins may edit these through the console; their routes re-check is_admin
  -- server-side before they get here.
  if is_admin() then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'not authorized: is_admin cannot be changed here';
  end if;
  if new.plan is distinct from old.plan then
    raise exception 'not authorized: plan is set by billing, not by you';
  end if;
  if new.subscription_status is distinct from old.subscription_status
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.current_period_end is distinct from old.current_period_end then
    raise exception 'not authorized: billing fields are set by Stripe';
  end if;
  if new.school_id is distinct from old.school_id then
    raise exception 'not authorized: school membership is set by an admin';
  end if;
  if new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_by is distinct from old.suspended_by then
    raise exception 'not authorized: suspension is set by an admin';
  end if;
  -- Forging these would misattribute a signup to another person's ad click;
  -- they are written only by /api/meta/activation under the service role.
  if new.meta_fbp is distinct from old.meta_fbp
     or new.meta_fbc is distinct from old.meta_fbc then
    raise exception 'not authorized: advertising identifiers are set by the server';
  end if;
  -- New here. Same reasoning as the advertising identifiers above: a teacher who
  -- could set their own campaign tag could credit any campaign they chose.
  if new.utm_source is distinct from old.utm_source
     or new.utm_medium is distinct from old.utm_medium
     or new.utm_campaign is distinct from old.utm_campaign
     or new.referrer_host is distinct from old.referrer_host
     or new.attributed_at is distinct from old.attributed_at then
    raise exception 'not authorized: signup attribution is set by the server';
  end if;

  return new;
end;
$function$;

create or replace function profiles_guard_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  new.is_admin := false;
  new.school_id := null;
  new.subscription_status := null;
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  new.current_period_end := null;
  new.suspended_at := null;
  new.suspended_reason := null;
  new.suspended_by := null;
  new.meta_fbp := null;
  new.meta_fbc := null;
  -- New here. See the update guard above.
  --
  -- NOTE THE ASYMMETRY, because it is the quietest trap in this feature: an
  -- INSERT carrying these is silently nulled and succeeds, while an UPDATE
  -- raises. So if anyone ever adds these columns to the client upsert in
  -- app/complete-profile/page.tsx, nothing errors and nothing logs. The panel
  -- just stays empty. The write belongs in /api/meta/activation, under the
  -- service role, and nowhere else.
  new.utm_source := null;
  new.utm_medium := null;
  new.utm_campaign := null;
  new.referrer_host := null;
  new.attributed_at := null;

  -- An admin-invited teacher has their plan stashed on the auth user at invite
  -- time (see /api/admin/teachers/invite). Honour that, but only that — it was
  -- written by the service role, so it is not user-controlled. Anything else
  -- falls back to free.
  if new.plan is distinct from 'free' then
    if coalesce(
         (select (raw_user_meta_data ->> 'invited_plan') from auth.users where id = new.id),
         'free'
       ) is distinct from new.plan then
      new.plan := 'free';
    end if;
  end if;

  return new;
end;
$function$;

-- Triggers are not recreated: create or replace swaps the body in place, and
-- both were created by 20260811000400 (lines 73-77 and 121-125).

-- ── The merged acquisition panel ────────────────────────────────────────────
--
-- Replaces the version in 20260915000100, which bucketed into ambassador /
-- invited / unattributed and could say nothing about campaigns. Same name and
-- same argument, so app/admin/stats/page.tsx needs no change to the call.
--
-- THE LADDER IS ORDERED FOR THIS PAGE'S AUDIENCE, WHICH IS THE MARKETING TEAM.
--
-- A teacher can arrive through an ad, then enter an ambassador code, then be
-- invited by their head of department. All three are true, and the panel gives
-- one row per teacher, so one has to win. Who wins is a reporting choice, not a
-- fact about the teacher:
--
--   1. utm:<source> A campaign tag. FIRST, deliberately: see below.
--   2. invited      A named person at a named school put them here.
--   3. ambassador   They redeemed a code.
--   4. ref:<host>   The site that linked to them, when nothing was tagged.
--   5. direct       We were recording, and there was nothing to record.
--   6. unattributed We were not recording yet. Permanent.
--
-- WHY THE CAMPAIGN TAG OUTRANKS AN AMBASSADOR CODE
--
-- An earlier draft put ambassador first, on the reasoning that a payout is
-- attached and crediting the same teacher to a campaign would have two reports
-- disagreeing. That is true, and it is the wrong trade for THIS page.
--
-- If an ambassador promotes their code inside a paid campaign, which is the most
-- likely place for the two to overlap, an ambassador-first ladder files those
-- signups under the code and the campaign appears to have produced nothing. The
-- agency reads this panel to decide which ads to keep running, so the bias is
-- not cosmetic: it would have them kill an ad that was working.
--
-- Ambassador performance has a better home already: /admin/ambassadors, with
-- referrals, first payment and payout status attached. Nothing here affects any
-- of it. This page answers "did the marketing work", and it should answer it
-- with every signup the marketing actually produced.
--
-- The cost, stated plainly: you can no longer read total ambassador signups off
-- THIS panel, because a code redeemed after an ad click now counts as the ad.
-- Use the ambassadors page for that.
--
-- NOTE: this reorders 20260915000100, which checked ambassador first and had no
-- campaign bucket at all. Existing rows will move.
--
-- `channel` is a coarse grouping so the view can be read at a glance with
-- fifteen rows in it, and so StatsView never parses a 'utm:' prefix in TSX.
--
-- DROPPED, not replaced. 20260915000100 returned (source, signups, paid) and
-- this adds `channel`, which changes the row type: `create or replace` refuses
-- that outright with "cannot change return type of existing function". The drop
-- is safe because nothing holds a reference to it. It is called from one place,
-- app/admin/stats/page.tsx, over PostgREST by name at request time, so there is
-- no view or dependent function to cascade to, and no window where a caller
-- sees a missing function: this migration runs in one transaction.

drop function if exists admin_signup_stats_by_source(integer);

create function admin_signup_stats_by_source(p_months integer default 12)
returns table (
  source  text,
  channel text,
  signups bigint,
  paid    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform admin_require_section('see_stats');

  p_months := greatest(1, least(coalesce(p_months, 12), 120));

  return query
    with scoped as (
      select
        -- Named columns rather than p.*: adding a computed column makes the CTE
        -- row an anonymous type, so is_paying_profile(s::profiles) would stop
        -- casting. The predicate is inlined below for the same reason.
        p.plan,
        p.is_admin,
        p.stripe_subscription_id,
        case
          -- The campaign tag first. If an ad brought them, the agency reading
          -- this page needs to see it, whatever else they did afterwards.
          when nullif(btrim(p.utm_source), '') is not null
            then 'utm:' || lower(btrim(p.utm_source))
          when exists (
            select 1 from pending_invites i
             where i.accepted_by = p.id and i.accepted_at is not null
          ) then 'invited'
          when exists (
            select 1 from ambassador_referrals r where r.user_id = p.id
          ) then 'ambassador'
          when nullif(btrim(p.referrer_host), '') is not null
            then 'ref:' || lower(btrim(p.referrer_host))
          when p.attributed_at is not null then 'direct'
          else 'unattributed'
        end as source,
        case
          when nullif(btrim(p.utm_source), '') is not null then 'campaign'
          when exists (
            select 1 from pending_invites i
             where i.accepted_by = p.id and i.accepted_at is not null
          ) then 'invite'
          when exists (
            select 1 from ambassador_referrals r where r.user_id = p.id
          ) then 'ambassador'
          when nullif(btrim(p.referrer_host), '') is not null then 'referral'
          when p.attributed_at is not null then 'direct'
          else 'unknown'
        end as channel
      from profiles p
      where coalesce(p.is_admin, false) = false
        and p.created_at >= date_trunc('month', now())
                            - ((p_months - 1) || ' months')::interval
    )
    select
      s.source,
      s.channel,
      count(*),
      count(*) filter (
        where coalesce(s.plan, 'free') not in ('free', 'school')
          and coalesce(s.is_admin, false) = false
          and s.stripe_subscription_id is not null
      )
    from scoped s
    group by s.source, s.channel
    order by 3 desc, 1;
end;
$$;
revoke execute on function admin_signup_stats_by_source(integer) from anon, public;
grant execute on function admin_signup_stats_by_source(integer) to authenticated;

comment on function admin_signup_stats_by_source(integer) is
  'One row per signup source, by a precedence ladder ordered for the marketing team who read this page: campaign tag first, then invite, then ambassador code, then referring site, then direct, then unrecorded. A code redeemed after an ad click counts as the ad, so total ambassador signups must be read from /admin/ambassadors instead. Campaign tags are self declared by whoever built the link and are never validated. Gated on see_stats.';

-- ── After pushing ───────────────────────────────────────────────────────────
--
--   select conname from pg_constraint
--    where conrelid = 'profiles'::regclass and conname like '%attribution%';
--
--   select pg_get_functiondef(p.oid) like '%plan is set by billing%' as keeps_plan_guard,
--          pg_get_functiondef(p.oid) like '%utm_source%'             as guards_utm
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('profiles_guard_privileged_columns','profiles_guard_insert');
--
-- Both functions must show keeps_plan_guard = true AND guards_utm = true. A
-- false in the first column means a body was rebuilt wrongly and plan
-- self-assignment is open.
