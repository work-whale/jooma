-- Agreement v0.4, clauses 5 and 6: keeping your place, and ending for inactivity.
--
-- The clock itself is TypeScript (app/lib/ambassador-activity.ts) and runs in
-- the daily ambassador-terms cron. This migration only gives it somewhere to
-- write what it told each ambassador, and gives admins the one action the
-- agreement leaves to a person: ending it, with a reason.
--
-- ENDING FOR INACTIVITY
--
-- status 'ended' takes the crown off (branding follows status = 'active') and
-- stops new claims on the code (claim_ambassador_code refuses anything but
-- active). agreement_ends_at is deliberately NOT touched: clause 6 says
-- everyone already on the code keeps paying the ambassador for the rest of the
-- term, and the webhook pays on agreement_ends_at alone. pro_until moves to the
-- end of the current London month, and the existing cron takes Pro off then.

-- ── Status and stamps ────────────────────────────────────────────────────────
alter table ambassadors drop constraint if exists ambassadors_status_check;
alter table ambassadors
  add constraint ambassadors_status_check check (status in ('active', 'paused', 'ended'));

alter table ambassadors
  -- The one-quiet-month email. Cleared when a new subscriber arrives.
  add column if not exists quiet_notice_sent_at timestamptz,
  -- Under review: when it started, and the last moment to bring one in.
  add column if not exists review_started_at    timestamptz,
  add column if not exists review_deadline      timestamptz,
  add column if not exists ended_at             timestamptz,
  add column if not exists end_reason           text;

comment on column ambassadors.review_started_at is
  'When the ambassador moved to Under review under clause 5 (two quiet months). Null when not under review.';
comment on column ambassadors.end_reason is
  'The reason given in the written notice when an admin ended the agreement for inactivity.';


-- ── Ambassador: own summary, with the review and ending ──────────────────────
drop function if exists my_ambassador();

create function my_ambassador()
returns table (
  full_name          text,
  status             text,
  pro_until          timestamptz,
  codes              text[],
  referrals          bigint,
  subscribers        bigint,
  active_subscribers bigint,
  this_month_pence   bigint,
  all_time_pence     bigint,
  owed_pence         bigint,
  paid_pence         bigint,
  approved_at        timestamptz,
  agreement_ends_at  timestamptz,
  end_requested_at   timestamptz,
  created_at         timestamptz,
  review_started_at  timestamptz,
  review_deadline    timestamptz,
  ended_at           timestamptz,
  end_reason         text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.full_name,
    a.status,
    a.pro_until,
    coalesce(
      (select array_agg(c.code order by c.created_at)
         from ambassador_codes c where c.ambassador_id = a.id),
      array[]::text[]
    ),
    (select count(*) from ambassador_referrals r where r.ambassador_id = a.id),
    (select count(*) from ambassador_referrals r
      where r.ambassador_id = a.id and r.first_paid_at is not null),
    (select count(*) from ambassador_referrals r
      join profiles p on p.id = r.user_id
      where r.ambassador_id = a.id
        and ambassador_referral_state(p.plan, p.subscription_status, p.stripe_subscription_id, r.first_paid_at) = 'paying'),
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status <> 'reversed'
        and m.period = ambassador_period(now()))::bigint,
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status <> 'reversed')::bigint,
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status = 'unpaid')::bigint,
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status = 'paid')::bigint,
    a.approved_at,
    a.agreement_ends_at,
    a.end_requested_at,
    a.created_at,
    a.review_started_at,
    a.review_deadline,
    a.ended_at,
    a.end_reason
  from ambassadors a
  where a.user_id = auth.uid()
    and auth.uid() is not null
  order by a.created_at desc
  limit 1;
$$;

revoke execute on function my_ambassador() from anon, public;
grant execute on function my_ambassador() to authenticated;

comment on function my_ambassador() is
  'The caller''s own ambassador row: status, free Pro term, codes, counts, commission in pence, agreement dates, and any inactivity review or ending. Zero rows for a non-ambassador.';


-- ── Admin: the ambassador list, with the review and ending ───────────────────
drop function if exists admin_ambassadors();

create function admin_ambassadors()
returns table (
  id                 uuid,
  full_name          text,
  email              text,
  status             text,
  user_id            uuid,
  notes              text,
  created_at         timestamptz,
  codes              text[],
  referrals          bigint,
  subscribers        bigint,
  active_subscribers bigint,
  this_month_pence   bigint,
  all_time_pence     bigint,
  owed_pence         bigint,
  pro_until          timestamptz,
  pro_granted_at     timestamptz,
  source             text,
  approved_at        timestamptz,
  agreement_ends_at  timestamptz,
  end_requested_at   timestamptz,
  application_id     uuid,
  payout_method      text,
  review_started_at  timestamptz,
  review_deadline    timestamptz,
  ended_at           timestamptz,
  end_reason         text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform admin_require_section('see_money');

  return query
  select
    a.id,
    a.full_name,
    a.email,
    a.status,
    a.user_id,
    a.notes,
    a.created_at,
    coalesce(
      (select array_agg(c.code order by c.created_at)
         from ambassador_codes c where c.ambassador_id = a.id),
      array[]::text[]
    ),
    (select count(*) from ambassador_referrals r where r.ambassador_id = a.id),
    (select count(*) from ambassador_referrals r
      where r.ambassador_id = a.id and r.first_paid_at is not null),
    (select count(*) from ambassador_referrals r
      join profiles p on p.id = r.user_id
      where r.ambassador_id = a.id
        and ambassador_referral_state(p.plan, p.subscription_status, p.stripe_subscription_id, r.first_paid_at) = 'paying'),
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status <> 'reversed'
        and m.period = ambassador_period(now()))::bigint,
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status <> 'reversed')::bigint,
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.ambassador_id = a.id and m.status = 'unpaid')::bigint,
    a.pro_until,
    a.pro_granted_at,
    a.source,
    a.approved_at,
    a.agreement_ends_at,
    a.end_requested_at,
    a.application_id,
    (select ap.payout_method from ambassador_applications ap where ap.id = a.application_id),
    a.review_started_at,
    a.review_deadline,
    a.ended_at,
    a.end_reason
  from ambassadors a
  order by a.created_at desc;
end;
$$;

revoke execute on function admin_ambassadors() from anon, public;
grant execute on function admin_ambassadors() to authenticated;

comment on function admin_ambassadors() is
  'Ambassadors with their codes, referral counts, commission in pence (this month, all time, owed), agreement dates and any inactivity review or ending. see_money only.';


-- ── Admin: end an agreement for inactivity (clause 6) ────────────────────────
-- Only once the review has run out with no new subscriber; the cron clears the
-- review the day one arrives, so a live review_deadline in the past is that test.
-- Returns what the route needs next: the Stripe promotion codes to switch off
-- and the date free Pro now ends, for the written notice.
create or replace function admin_end_ambassador_for_inactivity(p_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a        ambassadors;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_until  timestamptz;
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot end an agreement'; end if;
  if v_reason = '' then raise exception 'give the reason, it goes in the written notice'; end if;

  select * into a from ambassadors where id = p_id for update;
  if a.id is null then raise exception 'no such ambassador'; end if;
  if a.status <> 'active' then raise exception 'this ambassador is not active'; end if;
  if a.review_deadline is null or a.review_deadline > now() then
    raise exception 'the review has not run out yet';
  end if;

  -- The first moment of next month in London, which is the end of this one.
  v_until := (date_trunc('month', now() at time zone 'Europe/London') + interval '1 month')
             at time zone 'Europe/London';

  update ambassadors
     set status = 'ended',
         ended_at = now(),
         end_reason = v_reason,
         pro_until = case when pro_until is null then null else least(pro_until, v_until) end,
         review_started_at = null,
         review_deadline = null,
         updated_at = now()
   where id = p_id;

  perform admin_log(
    'Ended ambassador agreement for inactivity',
    'billing', 'ambassador', p_id::text, a.full_name,
    jsonb_build_object('reason', v_reason, 'pro_until', v_until)
  );

  return jsonb_build_object(
    'pro_until', (select pro_until from ambassadors where id = p_id),
    'promotion_code_ids', coalesce(
      (select jsonb_agg(c.promotion_code_id) from ambassador_codes c
        where c.ambassador_id = p_id and c.promotion_code_id is not null),
      '[]'::jsonb)
  );
end;
$$;
revoke execute on function admin_end_ambassador_for_inactivity(uuid, text) from anon, public;
grant execute on function admin_end_ambassador_for_inactivity(uuid, text) to authenticated;


-- ── The three emails, so /admin/emails lists them ────────────────────────────
-- Wording in app/lib/email-templates/ambassador*.ts. Guarded like the other
-- seeds, so a re-run changes nothing and an admin's edits are kept.
insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_quiet_month', 'Ambassador quiet month',
       'An ambassador on agreement 0.4 or later goes one full calendar month (not August) with no new subscriber. A heads-up only: nothing else happens.',
       'A quiet month on your Jooma code', true, 13
where not exists (select 1 from email_templates where key = 'ambassador_quiet_month');

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_under_review', 'Ambassador under review',
       'Two full calendar months with no new subscriber. Sent the day the account moves to Under review, with the date they have until to bring one in.',
       'Your Jooma Ambassador account is under review', true, 14
where not exists (select 1 from email_templates where key = 'ambassador_under_review');

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_ended_inactivity', 'Ambassador ended for inactivity',
       'An admin ends an agreement after the review ran out. The written notice: the reason they typed, when free Pro ends, and that existing subscribers keep paying commission.',
       'Your Jooma Ambassador agreement has ended', true, 15
where not exists (select 1 from email_templates where key = 'ambassador_ended_inactivity');
