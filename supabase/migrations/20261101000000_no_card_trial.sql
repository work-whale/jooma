-- ── The no-card trial ───────────────────────────────────────────────────────
--
-- The 3 day trial no longer takes a card. A new teacher gets Standard for three
-- days the moment their profile is saved, with no Stripe customer or subscription
-- behind it. Subscribing is a normal paid checkout that charges straight away.
-- When the three days run out the account stays open, limited to the three tools
-- on the landing page.
--
-- The row is shaped like the ambassador review trial (20261016000000): status
-- 'trialing' with a null stripe_subscription_id. my_generation_gate() and the
-- ambassador-terms cron already end that shape on time, so neither changes.
--
-- 1. profiles.free_trial_started_at
--
--    Tells this trial from a review trial, and is what makes it once per account.
--    Unlike annual_trial_email_sent_at it IS added to the guards: a teacher who
--    could null their own would get a fresh trial every three days.
--
-- 2. my_account_access()
--
--    The account state in one read, including two facts a teacher cannot read for
--    themselves (a paid invoice, an ambassador's Pro grant). The caller's own row,
--    named columns only.
--
-- 3. The trial_ending automatic email, OFF until the wording is approved.
--
-- 4. teacher_mrr() stops counting a trial with no subscription as a comp.

-- ── 1. The column and its guards ─────────────────────────────────────────────

alter table profiles
  add column if not exists free_trial_started_at timestamptz;

comment on column profiles.free_trial_started_at is
  'When the no-card trial started. Set once by /api/trial/start under the service role, and never cleared: it is the "has had this trial" marker.';

-- Copied from 20260916000100; only the new column is added.
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
     or new.current_period_end is distinct from old.current_period_end
     or new.free_trial_started_at is distinct from old.free_trial_started_at then
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
  -- Same reasoning as the advertising identifiers above: a teacher who could set
  -- their own campaign tag could credit any campaign they chose.
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
  new.free_trial_started_at := null;
  new.suspended_at := null;
  new.suspended_reason := null;
  new.suspended_by := null;
  new.meta_fbp := null;
  new.meta_fbc := null;
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

-- ── 2. The account state ─────────────────────────────────────────────────────

create or replace function my_account_access()
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
  free_tries_used integer
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
    exists (
      select 1 from ambassadors a
      where a.user_id = p.id and a.pro_granted_at is not null
    ),
    exists (
      select 1 from ambassador_applications x
      where x.user_id = p.id and x.trial_granted_at is not null
    ),
    -- Their runs on the free tools, counted as checkTrial counts them.
    (
      select count(*)::integer from trial_generations t
      where t.guest_id = p.id
        and t.status in ('running', 'done', 'claimed')
        and t.created_at > now() - interval '24 hours'
    )
  from profiles p
  where p.id = auth.uid();
$$;

revoke execute on function my_account_access() from anon, public;
grant execute on function my_account_access() to authenticated;

comment on function my_account_access() is
  'The caller''s own account state: plan and billing columns, plus whether they have ever paid, held an ambassador''s Pro, or had a review trial, and their free tries in the last 24 hours. Read through app/lib/account-access.ts.';

-- ── 3. The trial ending email ────────────────────────────────────────────────
--
-- MARKETING, not a service message: it asks someone to buy, and with no card
-- taken nothing is about to happen to their money. So it respects the opt-out
-- list and carries an unsubscribe link, which is why it runs through the bulk
-- automation rather than sendTemplate.

-- Copied from 20261023000000; only the trial_ending branch is added.
create or replace function email_audience_members(p_audience jsonb, p_purpose text)
returns table (user_id uuid, email text, first_name text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_kind    text := p_audience ->> 'kind';
  v_respect boolean := p_purpose <> 'notice';
  v_emails  text[];
  v_after   timestamptz := nullif(p_audience ->> 'created_after', '')::timestamptz;
  v_before  timestamptz := nullif(p_audience ->> 'created_before', '')::timestamptz;
begin
  if v_kind = 'incomplete_signups' then
    return query
      select s.id, lower(s.email), null::text
      from incomplete_signup_users() s
      where s.email is not null
        and (v_after is null or s.created_at > v_after)
        and (v_before is null or s.created_at <= v_before)
        and (not v_respect or not exists (
          select 1 from email_opt_outs o where o.email = lower(s.email)))
      union all
      -- Leads never became customers, so the soft opt-in does not reach them:
      -- a signup reminder is the only thing they get. user_id is null, which is
      -- also how the sender knows to link them to /signup rather than /login.
      select null::uuid, l.email, null::text
      from signup_leads l
      where p_purpose = 'signup_reminder'
        and not l.opted_out
        and (v_after is null or l.created_at > v_after)
        and (v_before is null or l.created_at <= v_before)
        and not exists (select 1 from auth.users u where lower(u.email::text) = l.email)
        and not exists (
          select 1 from pending_invites i
          where lower(i.email) = l.email and i.accepted_at is null)
        and not exists (select 1 from email_opt_outs o where o.email = l.email);
    return;
  end if;

  if v_kind = 'emails' then
    select coalesce(array_agg(distinct lower(btrim(x))), array[]::text[])
      into v_emails
    from jsonb_array_elements_text(coalesce(p_audience -> 'emails', '[]'::jsonb)) x;

    -- Existing accounts only, with or without a profile. A free-text box that
    -- could mail any address would turn this page into a spam cannon.
    return query
      select u.id, lower(u.email::text), p.first_name
      from auth.users u
      left join profiles p on p.id = u.id
      where u.deleted_at is null
        and u.email is not null
        and lower(u.email::text) = any (v_emails)
        and (p.id is null or (p.suspended_at is null and p.deletion_scheduled_for is null))
        and (not v_respect or not exists (
          select 1 from email_opt_outs o where o.email = lower(u.email::text)));
    return;
  end if;

  if v_kind not in ('all_teachers', 'free', 'paying', 'trialing', 'cancelled', 'trial_ending') then
    raise exception 'unknown audience %', v_kind;
  end if;

  return query
    select u.id, lower(u.email::text), p.first_name
    from profiles p
    join auth.users u on u.id = p.id
    where u.deleted_at is null
      and u.email is not null
      and p.suspended_at is null
      and p.deletion_scheduled_for is null
      and (
        v_kind = 'all_teachers'
        or (v_kind = 'free' and coalesce(p.plan, 'free') = 'free')
        -- A real subscription. Comped accounts (an ambassador's Pro, an admin
        -- grant) have a plan and no Stripe id, and trials are 'trialing'.
        or (v_kind = 'paying'
            and p.plan in ('standard', 'pro', 'max')
            and p.subscription_status in ('active', 'past_due')
            and p.stripe_subscription_id is not null)
        or (v_kind = 'trialing' and p.subscription_status = 'trialing')
        -- Had a subscription that ended and has not come back.
        or (v_kind = 'cancelled'
            and p.subscription_status = 'canceled'
            and coalesce(p.plan, 'free') = 'free')
        -- A no-card trial in its last 24 hours. The cron runs daily, so each
        -- trial is in this window for exactly one run. A review trial has no
        -- free_trial_started_at, and subscribing fills in the subscription id.
        or (v_kind = 'trial_ending'
            and p.free_trial_started_at is not null
            and p.subscription_status = 'trialing'
            and p.stripe_subscription_id is null
            and p.current_period_end > now()
            and p.current_period_end <= now() + interval '24 hours')
      )
      and (not v_respect or not exists (
        select 1 from email_opt_outs o where o.email = lower(u.email::text)));
end;
$$;
revoke execute on function email_audience_members(jsonb, text) from anon, authenticated, public;

-- Copied from 20260924000000; only the audience now depends on the key.
create or replace function email_automation_enqueue(p_key text)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_a email_automations;
  v_t email_broadcast_templates;
  v_id uuid;
  v_n integer;
  v_audience jsonb;
begin
  select * into v_a from email_automations where key = p_key;
  if v_a.key is null or not v_a.live or v_a.template_id is null then return null; end if;

  select * into v_t from email_broadcast_templates where id = v_a.template_id and not archived;
  if v_t.id is null then return null; end if;

  if p_key = 'trial_ending' then
    -- Who is due is decided by the trial's end date, so delay_hours plays no part.
    v_audience := jsonb_build_object('kind', 'trial_ending');
  else
    v_audience := jsonb_build_object(
      'kind', 'incomplete_signups',
      'created_after', now() - make_interval(hours => v_a.delay_hours) - interval '3 days',
      'created_before', now() - make_interval(hours => v_a.delay_hours)
    );
  end if;

  -- Serialise runs of the same automation so two overlapping crons cannot both
  -- decide the same person is due. Held to the end of the transaction, so the
  -- cohort query below returns the same people both times it runs.
  perform pg_advisory_xact_lock(hashtext('email_automation:' || p_key));

  select count(*) into v_n
  from email_audience_members(v_audience, v_t.purpose) m
  where not exists (
    select 1 from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    where c.automation = p_key and lower(r.email) = m.email
  );
  if v_n = 0 then return null; end if;

  insert into email_campaigns (
    purpose, template_id, subject, preheader, heading, body, cta_label, cta_url,
    audience, audience_label, status, scheduled_for, automation,
    recipient_count, materialised_at, started_at
  ) values (
    v_t.purpose, v_t.id, v_t.subject, v_t.preheader, v_t.heading, v_t.body,
    v_t.cta_label, v_t.cta_url,
    jsonb_build_object('kind', 'automation', 'automation', p_key),
    'Automatic: ' || v_a.name, 'sending', now(), p_key,
    v_n, now(), now()
  )
  returning id into v_id;

  insert into email_campaign_recipients (campaign_id, user_id, email, first_name)
  select v_id, m.user_id, m.email, m.first_name
  from email_audience_members(v_audience, v_t.purpose) m
  where not exists (
    select 1 from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    where c.automation = p_key and lower(r.email) = m.email
  )
  on conflict do nothing;

  return v_id;
end;
$$;
revoke execute on function email_automation_enqueue(text) from anon, authenticated, public;
grant execute on function email_automation_enqueue(text) to service_role;

-- Guarded by name so a re-run cannot duplicate it or undo an admin's edits.
insert into email_broadcast_templates (name, purpose, subject, preheader, heading, body, cta_label, cta_url)
select
  'Free trial ending',
  'marketing',
  'Your Jooma free trial ends soon',
  'Choose a plan to keep all thirty five tools.',
  'Your free trial ends soon',
  E'Hi {{firstName}},\n\nYour 3 day free trial ends in the next 24 hours. Choose a plan to keep all thirty five tools, your exports and your credits. Plans start at £4.99 a month.\n\nIf you do not choose one, your account stays open and you can still make slides, comprehensions and worksheets, but you will not be able to export them.',
  'Choose a plan',
  '{{siteUrl}}/pricing'
where not exists (select 1 from email_broadcast_templates where name = 'Free trial ending');

-- OFF. Nothing mails anyone until an admin has approved the wording and turned
-- it on in /admin/emails. delay_hours is required by the table and not read for
-- this key (see email_automation_enqueue).
insert into email_automations (key, name, description, template_id, live, delay_hours)
values (
  'trial_ending',
  'Free trial ending',
  'Sent once to a teacher on the no-card trial, in its last 24 hours.',
  (select id from email_broadcast_templates where name = 'Free trial ending' order by created_at limit 1),
  false,
  48
)
on conflict (key) do nothing;

-- ── 4. MRR ───────────────────────────────────────────────────────────────────
-- Copied from 20260915000300; only the trial filter is added. A plan with no
-- subscription behind it means a comp, except during a trial with no card, which
-- is neither revenue nor something an admin gave away.

create or replace function teacher_mrr()
returns table(paying_gbp numeric, paying_count bigint, comped_gbp numeric, comped_count bigint, ending_gbp numeric, ending_count bigint, paying_sub_ids text[])
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- ADMIN ONLY, and this is new.
  --
  -- 20260909000100 left this ungated because nothing outside admin_dashboard()
  -- and admin_usage_summary() called it, and both check for themselves. The
  -- dashboard page now calls it directly to get paying_sub_ids, which makes it
  -- reachable by any signed-in teacher through PostgREST: it is security
  -- definer, so without this check it would hand out company revenue and a list
  -- of live Stripe subscription ids to anybody with an account.
  perform admin_require_section('see_money');

  return query
  with paid as (
    select
      p.stripe_subscription_id                        as sub_id,
      p.stripe_subscription_id is not null            as has_sub,
      coalesce(p.cancel_at_period_end, false)         as ending,
      coalesce(pc.price_monthly, 0)                   as price
    from profiles p
    join plan_config pc on pc.plan_id = coalesce(p.plan, 'free')
    where coalesce(p.plan, 'free') not in ('free', 'school')
      and coalesce(p.is_admin, false) = false
      and not (p.subscription_status = 'trialing' and p.stripe_subscription_id is null)
  )
  select
    coalesce(sum(price) filter (where has_sub and not ending), 0),
    count(*)            filter (where has_sub and not ending),
    -- No subscription behind the plan: comped by an admin.
    coalesce(sum(price) filter (where not has_sub), 0),
    count(*)            filter (where not has_sub),
    -- Paying now, but cancelling. Real revenue this month, gone next.
    coalesce(sum(price) filter (where has_sub and ending), 0),
    count(*)            filter (where has_sub and ending),
    coalesce(
      array_agg(sub_id) filter (where has_sub and not ending),
      array[]::text[]
    )
  from paid;
end;
$function$;
