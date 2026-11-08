-- Follow-up to 20261109000000_trial_end_offer.sql.
--
-- That migration taught email_audience_members() two new audiences,
-- trial_ended_offer and trial_offer_ending, but left them off the allowlist
-- at the top of the function, which raises 'unknown audience' for anything not
-- on it. So the daily cron logged an error for each and sent nothing. Found by
-- tests/billing/trial-offer.spec.ts on staging, before production.
--
-- The original file is corrected too, so an environment that has neither runs
-- that one correctly and then this one, which changes nothing there. This is
-- the same function, copied whole, with only the allowlist line different.

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
