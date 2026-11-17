-- ── Jooma 4.5: the plans engine (Stage 2, spec Phase 1) ─────────────────────
--
-- WRITTEN 18 Nov 2026 BY CLAUDE, NOT APPLIED ANYWHERE. The owner reviews and
-- pushes it. The app code in the same working tree is built against it, so
-- push this BEFORE deploying that code.
--
-- What it does, in order:
--
--  1. profiles: the fifth account state.
--       plan may now be 'pro_trial'; trial_ends_at, trial_pending,
--       payment_failed_at, marketing_consent(+_at) and sunday_emails columns.
--       A pro_trial row has subscription_status NULL, so the old audiences
--       ('trialing', 'trial_ending') and teacher_mrr() never count it.
--  2. The guard triggers learn the new billing columns (a teacher must not be
--       able to set their own trial date or clear a failed payment).
--  3. resource_accounts: one row per teacher, the period and allowance state
--       of app/lib/resources.ts. Read through my_resources() only.
--  4. trial_email_keys: one row per normalised, hashed email that has had the
--       Pro trial. No foreign key, so it outlives account deletion. Never holds
--       an address.
--  5. signup_devices: the device cookie of each signup, for the "more than 2
--       accounts in 24 hours" flag. Flag only, never a block.
--  6. Functions:
--       resources_period(...)        period maths in UK time (twin of TS)
--       resources_spent(uid, since)  measured spend in resources
--       my_resources()               the caller's balance; rolls forward
--                                    lazily and ends an expired trial
--       resources_change_plan(...)   billing's plan changes (service role)
--       use_refine()                 Free's 10 refines a week
--       claim_trial_email(key)       one trial per email (service role)
--       record_signup_device(...)    + admin_flagged_devices()
--       my_generation_gate()         an expired pro_trial now reads as free
--       launch_v45_move_accounts()   Step 8, admin only, NOT run here
--
-- Units: 1 resource = 0.15p of measured spend (PENCE_PER_CREDIT in plans.ts).
-- Top-ups: allowance_grants rows of kind 'resources_topup', amount in
-- resources. They never expire. The old 'credit_gbp' grants keep working for
-- the old monthly ceiling until launch, and are not read by my_resources().
--
-- CHECK BEFORE PUSHING
--   - plan 'pro_trial' has NO plan_config row on purpose (it is not sold), so
--     anything that inner-joins plan_config drops trial accounts. That is what
--     teacher_mrr() wants. Search the admin screens for any other inner join.
--   - my_resources() is VOLATILE and writes the caller's own resource_accounts
--     row (and, when the trial has ended, their profiles.plan). It is security
--     definer and touches only auth.uid()'s rows.
--   - The SQL period maths must match app/lib/resource-periods.ts. The verify
--     script scripts/verify-resources.mjs compares the two on staging.

-- ── 1. profiles ──────────────────────────────────────────────────────────────

alter table profiles drop constraint if exists profiles_plan_check;
alter table profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro_trial', 'standard', 'pro', 'max', 'school'));

alter table profiles
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_pending boolean not null default false,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists sunday_emails boolean not null default true;

comment on column profiles.trial_ends_at is
  '23:59:59 UK time on the UK signup date plus 10 days. Set with plan = pro_trial by /api/trial/start under the service role.';
comment on column profiles.trial_pending is
  'Launch day (Step 8): a never-paid account gets a fresh trial that starts at its next login.';
comment on column profiles.payment_failed_at is
  'Set by invoice.payment_failed, cleared by invoice.paid. Drives P12 and E14.';
comment on column profiles.marketing_consent is
  'The unticked "Send me ideas and offers" box at signup (opt-in). The teacher may change it.';
comment on column profiles.sunday_emails is
  'E8, the Sunday email, has its own switch in email settings.';

-- A trial row must say when it ends.
alter table profiles drop constraint if exists profiles_trial_has_end;
alter table profiles
  add constraint profiles_trial_has_end
  check (plan is distinct from 'pro_trial' or trial_ends_at is not null) not valid;

create index if not exists profiles_trial_ends_idx
  on profiles (trial_ends_at) where plan = 'pro_trial';

-- ── 2. Guards ────────────────────────────────────────────────────────────────
-- Copied from 20261101000000; only the new columns are added.

create or replace function profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
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
     or new.current_period_end is distinct from old.current_period_end
     or new.free_trial_started_at is distinct from old.free_trial_started_at
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.trial_pending is distinct from old.trial_pending
     or new.payment_failed_at is distinct from old.payment_failed_at then
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
  if new.meta_fbp is distinct from old.meta_fbp
     or new.meta_fbc is distinct from old.meta_fbc then
    raise exception 'not authorized: advertising identifiers are set by the server';
  end if;
  if new.utm_source is distinct from old.utm_source
     or new.utm_medium is distinct from old.utm_medium
     or new.utm_campaign is distinct from old.utm_campaign
     or new.referrer_host is distinct from old.referrer_host
     or new.attributed_at is distinct from old.attributed_at then
    raise exception 'not authorized: signup attribution is set by the server';
  end if;
  -- marketing_consent and sunday_emails are the teacher's own choices, so
  -- they are deliberately NOT guarded. The consent time is kept honest here.
  if new.marketing_consent is distinct from old.marketing_consent then
    new.marketing_consent_at := now();
  elsif new.marketing_consent_at is distinct from old.marketing_consent_at then
    raise exception 'not authorized: the consent time is recorded by the server';
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
  new.free_trial_started_at := null;
  new.trial_ends_at := null;
  new.trial_pending := false;
  new.payment_failed_at := null;
  new.suspended_at := null;
  new.suspended_reason := null;
  new.suspended_by := null;
  new.meta_fbp := null;
  new.meta_fbc := null;
  new.utm_source := null;
  new.utm_medium := null;
  new.utm_campaign := null;
  new.referrer_host := null;
  new.attributed_at := null;
  -- The signup box: the teacher's own choice, stamped by the server.
  new.marketing_consent_at := case when new.marketing_consent then now() else null end;

  -- Unchanged from 20261101: an admin-invited plan is honoured, anything else
  -- (pro_trial included: only /api/trial/start grants it) falls back to free.
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

-- ── 3. resource_accounts ─────────────────────────────────────────────────────

create table if not exists resource_accounts (
  user_id            uuid primary key references profiles(id) on delete cascade,
  -- The plan whose allowance the NEXT refill sets (a downgrade waits here).
  plan               text not null
                     check (plan in ('free', 'pro_trial', 'standard', 'pro', 'max', 'school')),
  period_start       timestamptz not null,
  next_refill_at     timestamptz,
  allowance          integer not null check (allowance >= 0),
  anchor_day         smallint not null check (anchor_day between 1 and 31),
  -- Top-up resources eaten by CLOSED periods. The pool is the sum of
  -- allowance_grants of kind 'resources_topup'.
  topup_spent        numeric not null default 0 check (topup_spent >= 0),
  refines_used       integer not null default 0 check (refines_used >= 0),
  refines_week_start timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table resource_accounts is
  'Jooma 4.5 resources balance state. Twin of app/lib/resources.ts. Written only by definer functions; read through my_resources().';

alter table resource_accounts enable row level security;
-- No policies: every read and write goes through the functions below.
revoke all on resource_accounts from anon, authenticated;

-- ── 4. trial_email_keys ──────────────────────────────────────────────────────

create table if not exists trial_email_keys (
  key            text primary key check (key ~ '^[0-9a-f]{64}$'),
  first_trial_at timestamptz not null default now()
);

comment on table trial_email_keys is
  'SHA-256 of each normalised email that has had the Pro trial (app/lib/trial-guard.ts). No user id and no address, so it outlives account deletion without holding personal data in the clear.';

alter table trial_email_keys enable row level security;
revoke all on trial_email_keys from anon, authenticated;

-- ── 5. signup_devices ────────────────────────────────────────────────────────

create table if not exists signup_devices (
  id         bigint generated always as identity primary key,
  device_id  text not null check (length(device_id) between 8 and 80),
  user_id    uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists signup_devices_device_idx on signup_devices (device_id, created_at desc);
create index if not exists signup_devices_user_idx on signup_devices (user_id);

alter table signup_devices enable row level security;
revoke all on signup_devices from anon, authenticated;

-- ── 6. Functions ─────────────────────────────────────────────────────────────

-- Period maths in UK time. Mirrors resource-periods.ts and periodFor() in
-- resources.ts. p_trial_start is only read for the trial.
create or replace function resources_period(
  p_plan text, p_anchor integer, p_at timestamptz, p_trial_start timestamptz default null,
  out period_start timestamptz, out next_refill timestamptz
)
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_local   timestamp := p_at at time zone 'Europe/London';
  v_day     date := v_local::date;
  v_anchor  integer := least(31, greatest(1, coalesce(p_anchor, 1)));
  v_m       date;
  v_start   date;
  v_next    date;
begin
  if p_plan = 'free' then
    v_start := v_day - extract(dow from v_day)::integer;
    period_start := v_start::timestamp at time zone 'Europe/London';
    next_refill := (v_start + 7)::timestamp at time zone 'Europe/London';
    return;
  end if;

  if p_plan = 'pro_trial' then
    period_start := coalesce(p_trial_start, p_at);
    next_refill := (((period_start at time zone 'Europe/London')::date + 10)::timestamp
                    + time '23:59:59') at time zone 'Europe/London';
    return;
  end if;

  -- Paid: the anchor day, clamped to the month's length.
  v_m := date_trunc('month', v_day)::date;
  v_start := v_m + (least(v_anchor, extract(day from (v_m + interval '1 month - 1 day'))::integer) - 1);
  if v_start > v_day then
    v_m := (v_m - interval '1 month')::date;
    v_start := v_m + (least(v_anchor, extract(day from (v_m + interval '1 month - 1 day'))::integer) - 1);
  end if;
  v_m := (v_m + interval '1 month')::date;
  v_next := v_m + (least(v_anchor, extract(day from (v_m + interval '1 month - 1 day'))::integer) - 1);

  period_start := v_start::timestamp at time zone 'Europe/London';
  next_refill := case when p_plan = 'school' then null
                      else v_next::timestamp at time zone 'Europe/London' end;
end;
$$;

-- Allowance per plan. Mirrors PLAN_CONFIG / TRIAL in app/lib/plan-config.ts;
-- a unit test there pins the numbers, so change both together.
create or replace function resources_allowance(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'free' then 50
    when 'pro_trial' then 300
    when 'standard' then 500
    when 'pro' then 1000
    when 'max' then 2500
    else 0
  end;
$$;

-- Measured spend since an instant, in resources (0.15p each).
create or replace function resources_spent(p_uid uuid, p_since timestamptz)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select round(fx_usd_to_gbp() * 100 * (
      (select coalesce(sum(t.cost_usd), 0) from token_usage t
        where t.user_id = p_uid and t.created_at >= p_since
          -- Refining and Ask Jo chat never spend resources (plan default).
          -- Must match UNCHARGED_SLUGS in app/lib/resource-gate.ts.
          and
          -- UNCHARGED_SLUGS
          t.tool_slug not in ('modify', 'jo', 'edit-text', 'assistant'))
    + (select coalesce(sum(a.cost_usd), 0) from asset_cost a
        where a.user_id = p_uid and a.created_at >= p_since)
  ) / 0.15, 2);
$$;
revoke execute on function resources_spent(uuid, timestamptz) from anon, authenticated, public;

create or replace function resources_topups(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(g.amount), 0)::integer from allowance_grants g
  where g.user_id = p_uid and g.kind = 'resources_topup';
$$;
revoke execute on function resources_topups(uuid) from anon, authenticated, public;

-- A fresh allowance that starts NOW (startAccount in resources.ts). Keeps the
-- top-ups eaten so far. Service role and the functions below only.
create or replace function resources_start(p_uid uuid, p_plan text, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_anchor integer := extract(day from (p_now at time zone 'Europe/London'))::integer;
  v_p record;
begin
  select * into v_p from resources_period(p_plan, v_anchor, p_now, p_now);
  insert into resource_accounts as r (user_id, plan, period_start, next_refill_at, allowance, anchor_day)
  values (p_uid, p_plan, p_now, v_p.next_refill, resources_allowance(p_plan), v_anchor)
  on conflict (user_id) do update
    set plan = excluded.plan,
        period_start = excluded.period_start,
        next_refill_at = excluded.next_refill_at,
        allowance = excluded.allowance,
        anchor_day = excluded.anchor_day,
        updated_at = now();
end;
$$;
revoke execute on function resources_start(uuid, text, timestamptz) from anon, authenticated, public;
grant execute on function resources_start(uuid, text, timestamptz) to service_role;

-- Billing's plan changes (changePlan in resources.ts):
--   to Free or trial, or from Free/trial: a fresh allowance from now
--   paid up: the difference added now, refill date unchanged
--   paid down: only the plan, so the next refill sets the smaller allowance
create or replace function resources_change_plan(p_uid uuid, p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_before integer := resources_allowance(p_from);
  v_after  integer := resources_allowance(p_to);
begin
  if p_from = p_to then return; end if;
  if p_to in ('free', 'pro_trial') or p_from not in ('standard', 'pro', 'max')
     or not exists (select 1 from resource_accounts where user_id = p_uid) then
    perform resources_start(p_uid, p_to);
    return;
  end if;
  update resource_accounts
     set plan = p_to,
         allowance = allowance + greatest(0, v_after - v_before),
         updated_at = now()
   where user_id = p_uid;
end;
$$;
revoke execute on function resources_change_plan(uuid, text, text) from anon, authenticated, public;
grant execute on function resources_change_plan(uuid, text, text) to service_role;

-- The caller's balance. Rolls the period forward lazily and ends an expired
-- trial (moving the profile to Free with a fresh 50), so nothing depends on a
-- cron firing on time. Only ever touches auth.uid()'s rows.
create or replace function my_resources()
returns table (
  plan            text,
  allowance       integer,
  spent           numeric,
  allowance_left  integer,
  topup_left      integer,
  total           integer,
  period_start    timestamptz,
  next_refill_at  timestamptz,
  refines_used    integer,
  trial_ends_at   timestamptz,
  trial_ended_now boolean
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_prof   profiles;
  v_acc    resource_accounts;
  v_plan   text;
  v_spent  numeric;
  v_topups integer;
  v_over   numeric;
  v_pool   numeric;
  v_p      record;
  v_ended  boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_prof from profiles where id = v_uid for update;
  if v_prof.id is null then
    raise exception 'no profile';
  end if;
  v_plan := coalesce(v_prof.plan, 'free');

  -- The trial ends at the next request after 23:59:59, never mid-generation:
  -- a generation already running is not stopped by this.
  if v_plan = 'pro_trial' and (v_prof.trial_ends_at is null or v_prof.trial_ends_at <= now()) then
    update profiles set plan = 'free', updated_at = now() where id = v_uid;
    perform resources_start(v_uid, 'free');
    insert into app_events (user_id, name, props)
      values (v_uid, 'moved_to_free', jsonb_build_object('from', 'trial'));
    insert into app_events (user_id, name, props) values (v_uid, 'trial_ended', '{}'::jsonb);
    v_plan := 'free';
    v_ended := true;
  end if;

  -- The old no-card Standard trial ends the same way (until launch day).
  if v_prof.subscription_status = 'trialing' and v_prof.stripe_subscription_id is null
     and v_prof.current_period_end is not null and v_prof.current_period_end <= now()
     and v_plan <> 'free' then
    v_plan := 'free';
  end if;

  select * into v_acc from resource_accounts where user_id = v_uid for update;
  if v_acc.user_id is null then
    perform resources_start(v_uid, v_plan);
    select * into v_acc from resource_accounts where user_id = v_uid;
  elsif v_acc.plan <> v_plan then
    -- Billing (or an admin) changed the plan without telling this table:
    -- apply the same rule resources_change_plan() would have.
    perform resources_change_plan(v_uid, v_acc.plan, v_plan);
    select * into v_acc from resource_accounts where user_id = v_uid;
  end if;

  v_topups := resources_topups(v_uid);

  -- Roll forward (rollForward in resources.ts). The trial never refills.
  if v_acc.plan <> 'pro_trial' and v_acc.next_refill_at is not null and now() >= v_acc.next_refill_at then
    v_spent := resources_spent(v_uid, v_acc.period_start);
    v_over := greatest(0, v_spent - v_acc.allowance);
    v_pool := greatest(0, v_topups - v_acc.topup_spent);
    select * into v_p from resources_period(v_acc.plan, v_acc.anchor_day, now());
    update resource_accounts
       -- Never earlier than the refill that closed the old period, so no
       -- spend is ever counted in two periods.
       set period_start = greatest(v_p.period_start, v_acc.next_refill_at),
           next_refill_at = v_p.next_refill,
           allowance = resources_allowance(v_acc.plan),
           topup_spent = topup_spent + least(v_over, v_pool),
           updated_at = now()
     where user_id = v_uid
     returning * into v_acc;
  end if;

  -- Free's refines reset with the Sunday week.
  if v_acc.refines_week_start is null
     or v_acc.refines_week_start < (select r.period_start from resources_period('free', 1, now()) r) then
    update resource_accounts
       set refines_used = 0,
           refines_week_start = (select r.period_start from resources_period('free', 1, now()) r)
     where user_id = v_uid
     returning * into v_acc;
  end if;

  v_spent := resources_spent(v_uid, v_acc.period_start);
  v_pool := greatest(0, v_topups - v_acc.topup_spent);

  return query select
    v_acc.plan,
    v_acc.allowance,
    v_spent,
    floor(greatest(0, v_acc.allowance - v_spent))::integer,
    floor(greatest(0, v_pool - greatest(0, v_spent - v_acc.allowance)))::integer,
    floor(greatest(0, v_acc.allowance - v_spent)
          + greatest(0, v_pool - greatest(0, v_spent - v_acc.allowance)))::integer,
    v_acc.period_start,
    v_acc.next_refill_at,
    v_acc.refines_used,
    case when v_acc.plan = 'pro_trial' then v_prof.trial_ends_at end,
    v_ended;
end;
$$;
revoke execute on function my_resources() from anon, public;
grant execute on function my_resources() to authenticated;

-- One refine for the caller. Free has 10 a week; every other plan is
-- unlimited. Refining never spends resources. Returns how many are left
-- (null = unlimited), or raises 'refine_limit' when none are.
create or replace function use_refine()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_used integer;
  v_plan text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- Rolls the week and ends a trial first.
  select r.plan, r.refines_used into v_plan, v_used from my_resources() r;
  if v_plan <> 'free' then return null; end if;
  if v_used >= 10 then
    raise exception 'refine_limit' using errcode = 'P0001';
  end if;
  update resource_accounts set refines_used = refines_used + 1 where user_id = v_uid
    returning refines_used into v_used;
  return 10 - v_used;
end;
$$;
revoke execute on function use_refine() from anon, public;
grant execute on function use_refine() to authenticated;

-- One trial per email, ever. Returns true when this key is new (and records
-- it), false when it has had a trial. Service role only: the key is computed
-- server side from the session's email, never taken from a request.
create or replace function claim_trial_email(p_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  insert into trial_email_keys (key) values (p_key) on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
revoke execute on function claim_trial_email(text) from anon, authenticated, public;
grant execute on function claim_trial_email(text) to service_role;

create or replace function trial_email_seen(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from trial_email_keys where key = p_key);
$$;
revoke execute on function trial_email_seen(text) from anon, authenticated, public;
grant execute on function trial_email_seen(text) to service_role;

-- Device flag: record a signup's device cookie and say whether the device is
-- now past 2 accounts in 24 hours. Never blocks. Service role only.
create or replace function record_signup_device(p_device text, p_uid uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  if p_device is null or length(p_device) not between 8 and 80 then return false; end if;
  insert into signup_devices (device_id, user_id) values (p_device, p_uid);
  select count(distinct user_id) into v_n from signup_devices
   where device_id = p_device and created_at > now() - interval '24 hours';
  return v_n > 2;
end;
$$;
revoke execute on function record_signup_device(text, uuid) from anon, authenticated, public;
grant execute on function record_signup_device(text, uuid) to service_role;

-- For the admin console: devices past 2 accounts in any 24 hours, last 30 days.
create or replace function admin_flagged_devices()
returns table (device_id text, accounts bigint, first_at timestamptz, last_at timestamptz, user_ids uuid[])
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select d.device_id, count(distinct d.user_id), min(d.created_at), max(d.created_at),
           array_agg(distinct d.user_id)
    from signup_devices d
    where d.created_at > now() - interval '30 days'
      and exists (
        select 1 from signup_devices e
        where e.device_id = d.device_id
          and e.created_at between d.created_at and d.created_at + interval '24 hours'
        group by e.device_id
        having count(distinct e.user_id) > 2
      )
    group by d.device_id
    order by max(d.created_at) desc;
end;
$$;
revoke execute on function admin_flagged_devices() from anon, public;
grant execute on function admin_flagged_devices() to authenticated;

-- The gate: copied from 20261016000000. Only the first CASE gains the
-- expired pro_trial branch. Balance checks moved to my_resources(); this
-- still serves the hourly rate limit and the admin bypass.
create or replace function public.my_generation_gate()
 returns table(plan text, is_admin boolean, used_today integer, used_month integer, used_hour integer, rate_limit_hour integer, spend_pence bigint, credit_pence bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce((s.value #>> '{}')::integer, 0) into v_limit
    from app_settings s where s.key = 'rate_limit_per_hour';
  v_limit := coalesce(v_limit, 0);

  return query
    select
      case
        when p.plan = 'pro_trial'
         and (p.trial_ends_at is null or p.trial_ends_at <= now())
        then 'free'
        when p.subscription_status = 'trialing'
         and p.stripe_subscription_id is null
         and p.current_period_end is not null
         and p.current_period_end < now()
        then 'free'
        else coalesce(p.plan, 'free')
      end,
      coalesce(p.is_admin, false),
      (select count(*)::integer from token_usage t
        where t.user_id = v_uid
          and is_counted_generation(t.tool_slug, t.step)
          and t.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'),
      (select count(*)::integer from token_usage t
        where t.user_id = v_uid
          and is_counted_generation(t.tool_slug, t.step)
          and t.created_at >= date_trunc('month', now())),
      (select count(*)::integer from token_usage t
        where t.user_id = v_uid
          and is_counted_generation(t.tool_slug, t.step)
          and t.created_at >= now() - interval '1 hour'),
      v_limit,
      s.spend_pence,
      s.credit_pence
    from (select 1) _
    left join profiles p on p.id = v_uid
    cross join lateral monthly_ai_spend(v_uid) s;
end;
$function$;

-- The account state read by app/lib/account-access.ts, plus the 4.5 columns.
-- The return type changes, so it is dropped first.
drop function if exists my_account_access();
create function my_account_access()
returns table (
  plan text,
  is_admin boolean,
  subscription_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  free_trial_started_at timestamptz,
  has_paid boolean,
  had_ambassador_pro boolean,
  had_review_trial boolean,
  free_tries_used integer,
  trial_ends_at timestamptz,
  trial_pending boolean,
  payment_failed_at timestamptz,
  marketing_consent boolean,
  sunday_emails boolean,
  resources_made integer
)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    coalesce(p.plan, 'free'),
    coalesce(p.is_admin, false),
    p.subscription_status,
    p.stripe_customer_id,
    p.stripe_subscription_id,
    p.current_period_end,
    p.free_trial_started_at,
    exists (
      select 1 from invoices i
      where i.user_id = p.id and i.type = 'card' and i.status = 'paid' and i.amount_gbp > 0
    ),
    exists (select 1 from ambassadors a where a.user_id = p.id and a.pro_granted_at is not null),
    exists (select 1 from ambassador_applications x where x.user_id = p.id and x.trial_granted_at is not null),
    (
      select count(*)::integer from trial_generations t
      where t.guest_id = p.id
        and t.status in ('running', 'done', 'claimed')
        and t.created_at > now() - interval '24 hours'
    ),
    p.trial_ends_at,
    p.trial_pending,
    p.payment_failed_at,
    p.marketing_consent,
    p.sunday_emails,
    (select count(*)::integer from tool_runs r where r.user_id = p.id)
  from profiles p
  where p.id = auth.uid();
$$;
revoke execute on function my_account_access() from anon, public;
grant execute on function my_account_access() to authenticated;

-- ── 7. Events ────────────────────────────────────────────────────────────────
-- Server writes only (service role, and the definer functions above). The
-- lifecycle cron and the admin reports read from here.

create table if not exists app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references profiles(id) on delete set null,
  name       text not null check (name ~ '^[a-z_]{3,40}$'),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_events_user_idx on app_events (user_id, name, created_at desc);
create index if not exists app_events_name_idx on app_events (name, created_at desc);

alter table app_events enable row level security;
revoke all on app_events from anon, authenticated;

-- What the lifecycle cron has sent: one row per teacher and key ("E1",
-- "E8:2026-11-29"), so a re-run never sends twice.
create table if not exists lifecycle_email_log (
  user_id  uuid not null references profiles(id) on delete cascade,
  key      text not null check (length(key) between 2 and 40),
  sent_at  timestamptz not null default now(),
  status   text not null default 'sent' check (status in ('sent', 'skipped', 'failed')),
  primary key (user_id, key)
);
alter table lifecycle_email_log enable row level security;
revoke all on lifecycle_email_log from anon, authenticated;

-- The functions above insert into app_events, which is created after them in
-- this file. plpgsql resolves names at run time, so the order is fine.

-- ── 8. Launch day (Step 8), NOT RUN HERE ─────────────────────────────────────
-- An admin runs `select * from launch_v45_move_accounts(false)` to preview and
-- `launch_v45_move_accounts(true)` on launch day. Mirrors launchMove() in
-- app/lib/launch-day.ts:
--   paying, comped, admin          untouched
--   a live old no-card trial       untouched; ends on time, then Free
--   never paid                     Free + trial_pending (trial at next login)
--   former payer                   Free, no new trial
-- Accounts whose email already had a 4.5 trial cannot be told apart here (the
-- key is computed in the app), so /api/trial/start refuses those at login.

create or replace function launch_v45_move_accounts(p_apply boolean default false)
returns table (move text, accounts bigint)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  create temporary table _moves on commit drop as
  select p.id,
    case
      when coalesce(p.is_admin, false) then 'keep'
      when p.subscription_status = 'trialing' and p.stripe_subscription_id is null
           and p.current_period_end > now() then 'trial_runs_out'
      when not (p.subscription_status = 'trialing' and p.stripe_subscription_id is null)
           and coalesce(p.plan, 'free') in ('standard', 'pro', 'max', 'school', 'pro_trial') then 'keep'
      when exists (
        select 1 from invoices i
        where i.user_id = p.id and i.type = 'card' and i.status = 'paid' and i.amount_gbp > 0
      ) or p.stripe_subscription_id is not null then 'free'
      else 'free_trial_pending'
    end as move
  from profiles p
  where p.deletion_scheduled_for is null;

  if p_apply then
    update profiles p
       set plan = 'free', subscription_status = null, current_period_end = null,
           trial_pending = (m.move = 'free_trial_pending'), updated_at = now()
      from _moves m
     where m.id = p.id and m.move in ('free', 'free_trial_pending');
    perform resources_start(m.id, 'free') from _moves m where m.move in ('free', 'free_trial_pending');
  end if;

  return query select m.move, count(*) from _moves m group by m.move order by 1;
end;
$$;
revoke execute on function launch_v45_move_accounts(boolean) from anon, public;
grant execute on function launch_v45_move_accounts(boolean) to authenticated;
