-- The end-of-trial offer: 50% off the first month, for 7 days after a no-card
-- trial ends. Plus two automatic emails about it and two admin stats functions.
--
-- WHAT IS STORED: nothing new. When a trial ended and when its offer runs out
-- are derived from profiles.free_trial_started_at (set once, never cleared)
-- and, while the trial still runs, current_period_end. The daily cron clears
-- current_period_end when it tidies an ended trial back to free, which is why
-- the started-at date is the anchor and not the end date.
--
-- LAUNCH: a teacher whose trial ended before this shipped gets a fresh 7 days
-- from the moment this migration runs, not a window that closed before they
-- could see it. That moment is baked into trial_offer_launch() below, once, so
-- each environment has its own and a re-run does not move it. Push it to
-- production at the same time as the code that shows the offer.
--
-- The discount itself is a Stripe coupon applied by /api/stripe/checkout,
-- which reads my_account_access() on the server. Nothing here grants money.

-- ── 1. Dates ─────────────────────────────────────────────────────────────────

do $do$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trial_offer_launch'
  ) then
    execute format(
      $f$create function public.trial_offer_launch() returns timestamptz
         language sql immutable as $b$ select %L::timestamptz $b$$f$,
      now()
    );
  end if;
end
$do$;
revoke execute on function trial_offer_launch() from anon, public;

comment on function trial_offer_launch() is
  'When the end-of-trial offer shipped in this environment. A trial that ended earlier gets its 7 days from here.';

-- When a no-card trial ends (or ended). While it runs, the live end date, which
-- an admin may have moved. After the cron has tidied the row, 3 days from the
-- start, which is what /api/trial/start set (TRIAL_DAYS in app/lib/plans.ts).
create or replace function trial_end_of(
  p_started timestamptz,
  p_status text,
  p_subscription_id text,
  p_period_end timestamptz
)
returns timestamptz
language sql immutable
set search_path = public
as $$
  select case
    when p_started is null then null
    when p_status = 'trialing' and p_subscription_id is null and p_period_end is not null
      then p_period_end
    else p_started + interval '3 days'
  end;
$$;
revoke execute on function trial_end_of(timestamptz, text, text, timestamptz) from anon, public;

-- When the offer runs out: 7 days after the trial ended, or after launch for
-- a trial that ended before it.
create or replace function trial_offer_ends_at(
  p_started timestamptz,
  p_status text,
  p_subscription_id text,
  p_period_end timestamptz
)
returns timestamptz
language sql stable
set search_path = public
as $$
  select greatest(
           trial_end_of(p_started, p_status, p_subscription_id, p_period_end),
           trial_offer_launch()
         ) + interval '7 days';
$$;
revoke execute on function trial_offer_ends_at(timestamptz, text, text, timestamptz) from anon, public;

-- The same "has ever paid" test my_account_access() has always used: a paid
-- card invoice for more than nothing. A teacher who paid once and lapsed is a
-- returning customer, not someone the trial offer is for.
create or replace function trial_offer_has_paid(p_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from invoices i
    where i.user_id = p_user and i.type = 'card' and i.status = 'paid' and i.amount_gbp > 0
  );
$$;
revoke execute on function trial_offer_has_paid(uuid) from anon, authenticated, public;

-- ── 2. The account state gains the trial and offer dates ─────────────────────
-- Copied from 20261101000000; two columns added at the end. The return type
-- changes, so drop and recreate.

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
  trial_offer_ends_at timestamptz
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
    trial_offer_has_paid(p.id),
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
    ),
    trial_end_of(p.free_trial_started_at, p.subscription_status,
                 p.stripe_subscription_id, p.current_period_end),
    -- Only for someone the offer could apply to: never paid, no subscription.
    -- Whether it is open NOW is the caller's comparison (app/lib/trial-offer.ts).
    case
      when p.free_trial_started_at is not null
       and p.stripe_subscription_id is null
       and not trial_offer_has_paid(p.id)
      then trial_offer_ends_at(p.free_trial_started_at, p.subscription_status,
                               p.stripe_subscription_id, p.current_period_end)
    end
  from profiles p
  where p.id = auth.uid();
$$;

revoke execute on function my_account_access() from anon, public;
grant execute on function my_account_access() to authenticated;

comment on function my_account_access() is
  'The caller''s own account state: plan and billing columns, whether they have ever paid, held an ambassador''s Pro, or had a review trial, their free tries in the last 24 hours, and when their no-card trial and its end-of-trial offer end. Read through app/lib/account-access.ts.';

-- ── 3. Two automatic emails ──────────────────────────────────────────────────
-- Marketing, like trial_ending: they ask someone to buy, so opt-outs are
-- respected and an unsubscribe link is carried.

-- Copied from 20261101000000; the trial_ended_offer and trial_offer_ending
-- branches are added.
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

  if v_kind not in ('all_teachers', 'free', 'paying', 'trialing', 'cancelled', 'trial_ending',
                    'trial_ended_offer', 'trial_offer_ending') then
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
        -- The end-of-trial offer is open: the trial is over, nothing has been
        -- paid, and the 7 days have not run out. Once per person through the
        -- automation's dedupe. Teachers whose trial ended before this shipped
        -- are in it on the first run, because their window starts at launch.
        or (v_kind = 'trial_ended_offer'
            and p.free_trial_started_at is not null
            and p.stripe_subscription_id is null
            and not trial_offer_has_paid(p.id)
            and trial_end_of(p.free_trial_started_at, p.subscription_status,
                             p.stripe_subscription_id, p.current_period_end) <= now()
            and trial_offer_ends_at(p.free_trial_started_at, p.subscription_status,
                                    p.stripe_subscription_id, p.current_period_end) > now())
        -- The offer runs out within 36 hours. With a daily run that is 12 to
        -- 36 hours' notice, so "ends tomorrow" is true when it lands.
        or (v_kind = 'trial_offer_ending'
            and p.free_trial_started_at is not null
            and p.stripe_subscription_id is null
            and not trial_offer_has_paid(p.id)
            and trial_end_of(p.free_trial_started_at, p.subscription_status,
                             p.stripe_subscription_id, p.current_period_end) <= now()
            and trial_offer_ends_at(p.free_trial_started_at, p.subscription_status,
                                    p.stripe_subscription_id, p.current_period_end)
                between now() and now() + interval '36 hours')
      )
      and (not v_respect or not exists (
        select 1 from email_opt_outs o where o.email = lower(u.email::text)));
end;
$$;
revoke execute on function email_audience_members(jsonb, text) from anon, authenticated, public;
revoke execute on function email_audience_members(jsonb, text) from anon, authenticated, public;

-- Copied from 20261101000000; the two offer keys share the trial_ending path.
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

  if p_key in ('trial_ending', 'trial_ended_offer', 'trial_offer_ending') then
    -- Who is due is decided by the trial's dates, so delay_hours plays no part.
    v_audience := jsonb_build_object('kind', p_key);
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
revoke execute on function email_automation_enqueue(text) from anon, authenticated, public;
grant execute on function email_automation_enqueue(text) to service_role;

-- Guarded by name so a re-run cannot duplicate them or undo an admin's edits.
insert into email_broadcast_templates (name, purpose, subject, preheader, heading, body, cta_label, cta_url)
select
  'Free trial ended: 50% offer',
  'marketing',
  'Your free trial has ended: 50% off your first month',
  'Half price for your first month, if you choose a plan in the next 7 days.',
  'Half price, for the next 7 days',
  E'Hi {{firstName}},\n\nYour 3 day free trial of Jooma has ended. As a thank you for trying it, your first month on any monthly plan is half price if you choose one in the next 7 days.\n\nThere is no code to type. The discount is already waiting for you at checkout.\n\nYour account stays open either way, and you can still make slides, comprehensions and worksheets for free.',
  'Get 50% off',
  '{{siteUrl}}/pricing'
where not exists (select 1 from email_broadcast_templates where name = 'Free trial ended: 50% offer');

insert into email_broadcast_templates (name, purpose, subject, preheader, heading, body, cta_label, cta_url)
select
  'Trial offer ending',
  'marketing',
  'Your 50% off ends tomorrow',
  'Last chance for half price on your first month of Jooma.',
  'Your 50% off ends tomorrow',
  E'Hi {{firstName}},\n\nA quick reminder: the half price first month we saved for you after your free trial ends tomorrow. After that, plans go back to full price.\n\nThere is no code to type. Choose any monthly plan and the discount is applied at checkout.',
  'Claim 50% off',
  '{{siteUrl}}/pricing'
where not exists (select 1 from email_broadcast_templates where name = 'Trial offer ending');

-- OFF. Nothing mails anyone until an admin has approved the wording and turned
-- them on in /admin/emails. delay_hours is required by the table (1 to 2160)
-- and not read for these keys (see email_automation_enqueue). The values are
-- roughly when each one goes out after a trial starts, 3 days and 9 days, so
-- the admin list, which sorts on it, reads in the order they arrive.
insert into email_automations (key, name, description, template_id, live, delay_hours)
values
  (
    'trial_ended_offer',
    'Free trial ended: 50% offer',
    'Sent once when a no-card trial ends, announcing 50% off the first month for 7 days.',
    (select id from email_broadcast_templates where name = 'Free trial ended: 50% offer' order by created_at limit 1),
    false,
    72
  ),
  (
    'trial_offer_ending',
    'Trial offer ending',
    'Sent once when the 50% end-of-trial offer has under 36 hours left.',
    (select id from email_broadcast_templates where name = 'Trial offer ending' order by created_at limit 1),
    false,
    216
  )
on conflict (key) do nothing;

-- ── 4. Stats for /admin/emails ───────────────────────────────────────────────
-- Counted on read from the campaign and recipient rows, like
-- admin_email_campaigns(), so there is no second set of counters to drift.

-- One row per automation per day it sent anything, inside the window.
create or replace function admin_email_automation_daily(p_days integer default 30)
returns table (
  automation text,
  day date,
  sent integer,
  failed integer,
  skipped integer,
  delivered integer,
  bounced integer,
  spam integer
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  perform admin_require_section('send_email_campaigns');
  return query
    select c.automation,
           (coalesce(r.sent_at, c.created_at) at time zone 'Europe/London')::date,
           count(*) filter (where r.status = 'sent')::integer,
           count(*) filter (where r.status = 'failed')::integer,
           count(*) filter (where r.status = 'skipped')::integer,
           count(*) filter (where r.delivery = 'delivered')::integer,
           count(*) filter (where r.delivery in ('bounced', 'dropped'))::integer,
           count(*) filter (where r.delivery = 'spam')::integer
    from email_campaigns c
    join email_campaign_recipients r on r.campaign_id = c.id
    where c.automation is not null
      and c.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
    group by 1, 2
    order by 1, 2;
end;
$$;
revoke execute on function admin_email_automation_daily(integer) from anon, public;
grant execute on function admin_email_automation_daily(integer) to authenticated;

-- The no-card trial, end to end, for every trial started in the window.
create or replace function admin_trial_funnel(p_days integer default 30)
returns table (
  started integer,
  in_trial integer,
  ended integer,
  opted_out integer,
  got_trial_ending integer,
  got_offer_email integer,
  got_offer_ending integer,
  offer_open integer,
  paid integer
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  perform admin_require_section('send_email_campaigns');
  return query
    with t as (
      select p.id,
             lower(u.email::text) as email,
             p.stripe_subscription_id,
             trial_end_of(p.free_trial_started_at, p.subscription_status,
                          p.stripe_subscription_id, p.current_period_end) as ends,
             trial_offer_ends_at(p.free_trial_started_at, p.subscription_status,
                                 p.stripe_subscription_id, p.current_period_end) as offer_ends,
             trial_offer_has_paid(p.id) as has_paid
      from profiles p
      join auth.users u on u.id = p.id
      where p.free_trial_started_at is not null
        and p.free_trial_started_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
    ),
    got as (
      select lower(r.email) as email, c.automation
      from email_campaign_recipients r
      join email_campaigns c on c.id = r.campaign_id
      where r.status = 'sent'
        and c.automation in ('trial_ending', 'trial_ended_offer', 'trial_offer_ending')
    )
    select count(*)::integer,
           count(*) filter (where t.ends > now() and t.stripe_subscription_id is null)::integer,
           count(*) filter (where t.ends <= now())::integer,
           count(*) filter (where exists (select 1 from email_opt_outs o where o.email = t.email))::integer,
           count(*) filter (where exists (select 1 from got g where g.email = t.email and g.automation = 'trial_ending'))::integer,
           count(*) filter (where exists (select 1 from got g where g.email = t.email and g.automation = 'trial_ended_offer'))::integer,
           count(*) filter (where exists (select 1 from got g where g.email = t.email and g.automation = 'trial_offer_ending'))::integer,
           count(*) filter (where t.ends <= now() and t.offer_ends > now()
                              and t.stripe_subscription_id is null and not t.has_paid)::integer,
           count(*) filter (where t.stripe_subscription_id is not null or t.has_paid)::integer
    from t;
end;
$$;
revoke execute on function admin_trial_funnel(integer) from anon, public;
grant execute on function admin_trial_funnel(integer) to authenticated;
