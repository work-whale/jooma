-- Jooma 4.5 fix: let an expired trial end.
--
-- my_resources() (20261118000000_plans_engine.sql) moves an expired pro_trial
-- to free with an UPDATE on profiles. It runs as SECURITY DEFINER but inside the
-- teacher's session, so auth.uid() is the teacher and the privileged-columns
-- guard refused the plan change ("plan is set by billing, not by you"). The
-- trial could therefore never end, and every my_resources() and use_refine()
-- call for that teacher raised. Found by scripts/verify-resources.mjs.
--
-- The guard is otherwise unchanged: the whole function is restated because
-- CREATE OR REPLACE needs it, with one narrow exception added to the plan check.

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
  -- Jooma 4.5: my_resources() ends an expired trial inside the teacher's own
  -- session, so auth.uid() is set here. Only that one move is let through: an
  -- already expired pro_trial going to free. trial_ends_at cannot be changed
  -- by the teacher (the billing check below), so this cannot be used early.
  if new.plan is distinct from old.plan
     and not (old.plan = 'pro_trial' and new.plan = 'free'
              and old.trial_ends_at is not null and old.trial_ends_at <= now()) then
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
