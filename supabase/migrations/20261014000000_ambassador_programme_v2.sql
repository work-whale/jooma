-- Ambassador programme v2: invite links, applications, and monthly commission.
--
-- WHAT CHANGES
--
-- Until now an admin created an ambassador directly (name, email, code) and
-- every referred teacher was worth one payout. The programme is now
-- invitation-only and commission is monthly:
--
--   1. An admin makes a one-person invite link (a name and where we found them,
--      nothing else). ambassador_invites.
--   2. The person opens it, signs in to their own Jooma account, and applies:
--      personal details, where they post, where to pay them (bank or PayPal),
--      the code they want, and a typed signature on the agreement.
--      ambassador_applications.
--   3. An admin approves. The code they asked for is minted in Stripe exactly as
--      written, the ambassador row is created against their account, and their
--      twelve-month agreement starts.
--   4. Every subscription payment a referred teacher makes while that agreement
--      is live becomes a row in ambassador_commissions: the monthly rate for each
--      month they pay monthly, or a one-off for a yearly plan. Each row has its
--      own owed/paid state, so payouts are tracked month by month.
--
-- THE RATES ARE NOT IN HERE
--
-- They live in app/lib/ambassador-commission.ts, and each commission row stores
-- the amount it was worth when it was earned. A later change to the rates never
-- rewrites history, which is what the agreement promises (clause on rate
-- changes), and there is no second copy of the rate card to drift.
--
-- WHY EVERYTHING IS BEHIND DEFINER FUNCTIONS
--
-- An application holds a date of birth, a home address and bank details. The
-- three new tables therefore have RLS on and NO policies at all, and table
-- grants are revoked from anon and authenticated. Admins read through functions
-- guarded by admin_require_section('see_money'); an applicant reads and edits
-- their own row through functions scoped by auth.uid() that return named
-- columns (and only the last four digits of an account number). Same reasoning
-- as 20261012000000_ambassador_pro.sql: a policy grants the whole row.
--
-- Submitting an application is service-role only. The route checks the session
-- and passes the user id, so the recorded IP and user agent (the evidence behind
-- the typed signature) cannot be supplied by a browser calling the RPC directly.
--
-- WHAT IS LEFT ALONE
--
-- ambassador_referrals.payout_status and admin_set_referral_payout stay as they
-- were. They are the old one-payout-per-teacher model and nothing reads them any
-- more, but dropping a column that the webhook still writes is a deploy-order
-- hazard for no benefit. claim_ambassador_code is unchanged: attribution works
-- exactly as before.

-- ── ambassadors and codes: new columns ───────────────────────────────────────
alter table ambassadors
  add column if not exists application_id    uuid,
  add column if not exists source            text,
  add column if not exists approved_at       timestamptz,
  -- Twelve months from approval. Commission is earned only on payments made
  -- before this. Separate from pro_until, which an admin can end early.
  add column if not exists agreement_ends_at timestamptz,
  add column if not exists end_requested_at  timestamptz;

comment on column ambassadors.agreement_ends_at is
  'End of the ambassador''s twelve-month agreement. Commission is earned only on payments made before it. Null for ambassadors created before the v2 programme, who earn no commission.';

-- The hidden second coupon a yearly checkout uses. The promotion code (what a
-- teacher types) carries the first-month discount; a yearly plan is billed once
-- a year, so it gets the equivalent value off the first yearly payment instead.
-- See app/lib/ambassador-discount.ts.
alter table ambassador_codes
  add column if not exists yearly_coupon_id text;


-- ── Invites ──────────────────────────────────────────────────────────────────
create table if not exists ambassador_invites (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  source      text not null check (source in (
                'instagram', 'tiktok', 'x', 'linkedin', 'facebook', 'youtube',
                'ambassador', 'inbound', 'other')),
  -- Only the hash is kept, as for pending_invites: the link is a bearer
  -- credential and is shown to the admin once.
  token_hash  text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  opened_at   timestamptz,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz
);

alter table ambassador_invites enable row level security;
revoke all on ambassador_invites from anon, authenticated;

create index if not exists ambassador_invites_created_idx
  on ambassador_invites (created_at desc);


-- ── Applications ─────────────────────────────────────────────────────────────
create table if not exists ambassador_applications (
  id                 uuid primary key default gen_random_uuid(),
  -- set null rather than cascade, like ambassadors.user_id: this row backs a
  -- payment history that has to outlive the account.
  user_id            uuid references auth.users (id) on delete set null,
  invite_id          uuid references ambassador_invites (id) on delete set null,
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'declined')),

  -- Personal. Legal name, as on their bank account.
  first_name         text not null check (length(btrim(first_name)) between 1 and 60),
  last_name          text not null check (length(btrim(last_name)) between 1 and 60),
  email              text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  mobile             text not null check (length(btrim(mobile)) between 6 and 30),
  date_of_birth      date not null,
  address_line       text not null check (length(btrim(address_line)) between 1 and 160),
  town               text not null check (length(btrim(town)) between 1 and 80),
  postcode           text not null check (length(btrim(postcode)) between 2 and 12),
  school             text check (school is null or length(school) <= 160),
  teaches            text check (teaches is null or length(teaches) <= 160),

  -- Where they post. Handles only, without the site prefix.
  instagram          text check (instagram is null or length(instagram) <= 100),
  tiktok             text check (tiktok is null or length(tiktok) <= 100),
  x_handle           text check (x_handle is null or length(x_handle) <= 100),
  facebook           text check (facebook is null or length(facebook) <= 100),
  youtube            text check (youtube is null or length(youtube) <= 100),
  linkedin           text check (linkedin is null or length(linkedin) <= 100),
  reach              text not null check (reach in ('under_1k', '1k_5k', '5k_25k', '25k_100k', 'over_100k')),
  note               text check (note is null or length(note) <= 2000),

  -- Where to pay them. Only the chosen method's fields are kept: switching
  -- method clears the other's (update_my_ambassador_details).
  payout_method      text not null check (payout_method in ('bank', 'paypal')),
  account_holder     text not null check (length(btrim(account_holder)) between 1 and 120),
  sort_code          text,
  account_number     text,
  bank_name          text check (bank_name is null or length(bank_name) <= 120),
  paypal_email       text check (paypal_email is null or length(paypal_email) <= 254),
  -- Set when the ambassador changes where they are paid, so an admin pauses
  -- the next payout to verify it. A fraud check, see the Payout details tab.
  payout_changed_at  timestamptz,

  tax_status         text not null check (tax_status in ('self_assessment', 'limited_company', 'not_sure')),
  utr                text check (utr is null or utr ~ '^[0-9]{10}$'),

  -- The code they asked for. Minted exactly as written on approval and never
  -- regenerated. Same alphabet the apply route enforces.
  requested_code     text not null check (requested_code ~ '^[A-Z0-9-]{4,20}$' and requested_code ~ '[A-Z]'),

  -- The typed signature and its evidence.
  agreement_version  text not null check (length(agreement_version) between 1 and 40),
  signature_name     text not null check (length(btrim(signature_name)) between 4 and 120),
  signed_at          timestamptz not null default now(),
  signed_ip          text check (signed_ip is null or length(signed_ip) <= 64),
  signed_user_agent  text check (signed_user_agent is null or length(signed_user_agent) <= 400),
  declarations       jsonb not null default '{}'::jsonb,

  submitted_at       timestamptz not null default now(),
  reviewed_at        timestamptz,
  reviewed_by        uuid references auth.users (id) on delete set null,
  decline_reason     text check (decline_reason is null or length(decline_reason) <= 1000),
  ambassador_id      uuid references ambassadors (id) on delete set null,
  updated_at         timestamptz not null default now(),

  constraint ambassador_applications_payout_complete check (
    (payout_method = 'bank'
      and sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      and account_number ~ '^[0-9]{8}$'
      and length(btrim(coalesce(bank_name, ''))) >= 1)
    or
    (payout_method = 'paypal'
      and paypal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  constraint ambassador_applications_one_channel check (
    coalesce(instagram, tiktok, x_handle, facebook, youtube, linkedin) is not null
  )
);

alter table ambassador_applications enable row level security;
revoke all on ambassador_applications from anon, authenticated;

-- One live application per person: pending or approved. A declined one does not
-- block a later invite.
create unique index if not exists ambassador_applications_one_live_idx
  on ambassador_applications (user_id)
  where status in ('pending', 'approved');

-- A requested code is reserved from the moment it is asked for, so two people
-- cannot both be approved for it.
create unique index if not exists ambassador_applications_code_idx
  on ambassador_applications (lower(requested_code))
  where status in ('pending', 'approved');

create index if not exists ambassador_applications_status_idx
  on ambassador_applications (status, submitted_at);

alter table ambassadors drop constraint if exists ambassadors_application_fk;
alter table ambassadors
  add constraint ambassadors_application_fk
  foreign key (application_id) references ambassador_applications (id) on delete set null;


-- ── Commission ledger ────────────────────────────────────────────────────────
create table if not exists ambassador_commissions (
  id                    uuid primary key default gen_random_uuid(),
  ambassador_id         uuid not null references ambassadors (id) on delete cascade,
  -- set null, not cascade: a referred teacher deleting their account must not
  -- delete what the ambassador was paid for them.
  referral_id           uuid references ambassador_referrals (id) on delete set null,
  stripe_invoice_id     text,
  -- The month it counts towards, Europe/London, always the 1st.
  period                date not null check (extract(day from period) = 1),
  kind                  text not null check (kind in ('recurring', 'annual', 'adjustment')),
  plan                  text check (plan is null or plan in ('standard', 'pro', 'max')),
  billing_interval      text check (billing_interval is null or billing_interval in ('month', 'year')),
  -- Snapshotted at the time it was earned. Negative only for an adjustment.
  amount_pence          integer not null,
  -- What the teacher paid on that invoice, for "referred revenue".
  invoice_amount_pence  integer,
  status                text not null default 'unpaid' check (status in ('unpaid', 'paid', 'reversed')),
  paid_at               timestamptz,
  note                  text check (note is null or length(note) <= 500),
  created_at            timestamptz not null default now(),

  constraint ambassador_commissions_sign check (
    (kind = 'adjustment' and amount_pence < 0) or (kind <> 'adjustment' and amount_pence > 0)
  ),
  constraint ambassador_commissions_paid_dated check (status <> 'paid' or paid_at is not null)
);

alter table ambassador_commissions enable row level security;
revoke all on ambassador_commissions from anon, authenticated;

-- IDEMPOTENCE. Stripe retries, and invoice.paid and invoice.payment_succeeded
-- both fire for one payment. The webhook inserts and treats a unique violation
-- as "already recorded".
create unique index if not exists ambassador_commissions_invoice_idx
  on ambassador_commissions (stripe_invoice_id)
  where kind <> 'adjustment';
create unique index if not exists ambassador_commissions_adjustment_idx
  on ambassador_commissions (stripe_invoice_id)
  where kind = 'adjustment';
-- At most one monthly commission per teacher per month, whatever Stripe bills
-- (a cancel and resubscribe in the same month produces two invoices).
create unique index if not exists ambassador_commissions_month_idx
  on ambassador_commissions (referral_id, period)
  where kind = 'recurring';
-- A yearly plan earns once, ever.
create unique index if not exists ambassador_commissions_one_annual_idx
  on ambassador_commissions (referral_id)
  where kind = 'annual';

create index if not exists ambassador_commissions_ambassador_idx
  on ambassador_commissions (ambassador_id, period desc);


-- ── Helpers ──────────────────────────────────────────────────────────────────
-- The London month a moment falls in, as the 1st of that month.
create or replace function ambassador_period(p_at timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('month', p_at at time zone 'Europe/London')::date;
$$;

-- How a referred teacher stands today, from their profile. "Paying" means a
-- real Stripe subscription, never a comp (teacher_mrr()'s rule).
create or replace function ambassador_referral_state(
  p_plan text, p_status text, p_sub_id text, p_first_paid_at timestamptz
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_sub_id is not null and p_status = 'trialing' then 'trial'
    when p_sub_id is not null and p_status in ('active', 'past_due')
         and p_plan in ('standard', 'pro', 'max') then 'paying'
    when p_first_paid_at is not null then 'lapsed'
    else 'signed_up'
  end;
$$;


-- ── Admin: invites ───────────────────────────────────────────────────────────
create or replace function admin_create_ambassador_invite(
  p_full_name  text,
  p_source     text,
  p_token_hash text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot invite ambassadors'; end if;

  if v_name is null then raise exception 'Enter their name.'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;

  insert into ambassador_invites (full_name, source, token_hash, created_by, expires_at)
  values (v_name, p_source, p_token_hash, auth.uid(), now() + interval '14 days')
  returning id into v_id;

  perform admin_log(
    format('Created an ambassador invite for %s', v_name),
    'billing', 'ambassador_invite', v_id::text, v_name,
    jsonb_build_object('source', p_source)
  );

  return v_id;
end;
$$;
revoke execute on function admin_create_ambassador_invite(text, text, text) from anon, public;
grant execute on function admin_create_ambassador_invite(text, text, text) to authenticated;


create or replace function admin_revoke_ambassador_invite(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot change invites'; end if;

  update ambassador_invites set revoked_at = now()
   where id = p_id and used_at is null and revoked_at is null;
end;
$$;
revoke execute on function admin_revoke_ambassador_invite(uuid) from anon, public;
grant execute on function admin_revoke_ambassador_invite(uuid) to authenticated;


create or replace function admin_ambassador_invites()
returns table (
  id          uuid,
  full_name   text,
  source      text,
  created_at  timestamptz,
  expires_at  timestamptz,
  opened_at   timestamptz,
  used_at     timestamptz,
  state       text
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
    i.id, i.full_name, i.source, i.created_at, i.expires_at, i.opened_at, i.used_at,
    case
      when i.revoked_at is not null then 'revoked'
      when i.used_at is not null then 'applied'
      when i.expires_at < now() then 'expired'
      when i.opened_at is not null then 'opened'
      else 'sent'
    end
  from ambassador_invites i
  where i.created_at > now() - interval '30 days'
  order by i.created_at desc;
end;
$$;
revoke execute on function admin_ambassador_invites() from anon, public;
grant execute on function admin_ambassador_invites() to authenticated;


-- ── Admin: applications ──────────────────────────────────────────────────────
create or replace function admin_ambassador_applications(p_status text default 'pending')
returns table (
  id             uuid,
  user_id        uuid,
  full_name      text,
  email          text,
  submitted_at   timestamptz,
  reach          text,
  channels       text[],
  signed_at      timestamptz,
  requested_code text,
  status         text,
  source         text
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
    a.user_id,
    btrim(a.first_name || ' ' || a.last_name),
    a.email,
    a.submitted_at,
    a.reach,
    array_remove(array[
      case when a.instagram is not null then 'Instagram' end,
      case when a.tiktok    is not null then 'TikTok' end,
      case when a.x_handle  is not null then 'X' end,
      case when a.facebook  is not null then 'Facebook' end,
      case when a.youtube   is not null then 'YouTube' end,
      case when a.linkedin  is not null then 'LinkedIn' end
    ], null),
    a.signed_at,
    a.requested_code,
    a.status,
    i.source
  from ambassador_applications a
  left join ambassador_invites i on i.id = a.invite_id
  where a.status = coalesce(p_status, a.status)
  order by a.submitted_at asc;
end;
$$;
revoke execute on function admin_ambassador_applications(text) from anon, public;
grant execute on function admin_ambassador_applications(text) to authenticated;


-- One application in full, for the review drawer and for paying them by hand,
-- with the checks an admin would otherwise do by eye.
create or replace function admin_ambassador_application(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a        ambassador_applications;
  v_result jsonb;
begin
  perform admin_require_section('see_money');

  select * into a from ambassador_applications where id = p_id;
  if a.id is null then raise exception 'no such application'; end if;

  select to_jsonb(a) || jsonb_build_object(
    'invite', (
      select jsonb_build_object('full_name', i.full_name, 'source', i.source, 'created_at', i.created_at)
      from ambassador_invites i where i.id = a.invite_id
    ),
    'account', (
      select jsonb_build_object(
        'email', u.email,
        'created_at', u.created_at,
        'plan', coalesce(p.plan, 'free'),
        'subscription_status', p.subscription_status,
        'has_stripe_subscription', p.stripe_subscription_id is not null
      )
      from auth.users u left join profiles p on p.id = u.id
      where u.id = a.user_id
    ),
    'checks', jsonb_build_object(
      'duplicate_email', exists (
        select 1 from ambassador_applications o
        where o.id <> a.id and lower(o.email) = lower(a.email)
      ) or exists (
        select 1 from ambassadors x
        where lower(x.email) = lower(a.email) and x.id is distinct from a.ambassador_id
      ),
      'duplicate_payout', exists (
        select 1 from ambassador_applications o
        where o.id <> a.id and (
          (a.payout_method = 'bank' and o.sort_code = a.sort_code and o.account_number = a.account_number)
          or (a.payout_method = 'paypal' and lower(o.paypal_email) = lower(a.paypal_email))
        )
      ),
      'code_taken', exists (
        select 1 from ambassador_codes c
        where lower(c.code) = lower(a.requested_code) and c.ambassador_id is distinct from a.ambassador_id
      ) or exists (
        select 1 from ambassador_applications o
        where o.id <> a.id and o.status in ('pending', 'approved')
          and lower(o.requested_code) = lower(a.requested_code)
      ),
      'name_matches_account_holder',
        lower(regexp_replace(a.account_holder, '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(a.first_name || ' ' || a.last_name), '\s+', ' ', 'g'))
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke execute on function admin_ambassador_application(uuid) from anon, public;
grant execute on function admin_ambassador_application(uuid) to authenticated;


-- Approve: one transaction for everything in our own database. The Stripe
-- coupon and promotion code are made first by the route; if this fails, the
-- route deactivates them.
create or replace function admin_approve_ambassador_application(
  p_id                uuid,
  p_promotion_code_id text,
  p_code              text,
  p_yearly_coupon_id  text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a      ambassador_applications;
  v_src  text;
  v_amb  uuid;
  v_name text;
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot approve ambassadors'; end if;

  select * into a from ambassador_applications where id = p_id for update;
  if a.id is null then raise exception 'no such application'; end if;
  if a.status <> 'pending' then raise exception 'this application has already been reviewed'; end if;
  if a.user_id is null then raise exception 'the applicant no longer has a Jooma account'; end if;

  if coalesce(p_promotion_code_id, '') not like 'promo\_%' then
    raise exception 'a Stripe promotion code id is required';
  end if;
  if upper(btrim(coalesce(p_code, ''))) <> upper(a.requested_code) then
    raise exception 'the code must be the one they asked for';
  end if;

  if exists (select 1 from ambassadors x where x.user_id = a.user_id and x.status = 'active') then
    raise exception 'they are already an active ambassador';
  end if;

  select i.source into v_src from ambassador_invites i where i.id = a.invite_id;
  v_name := btrim(a.first_name || ' ' || a.last_name);

  insert into ambassadors (
    full_name, user_id, email, status, source, application_id,
    approved_at, agreement_ends_at, created_by
  )
  values (
    v_name, a.user_id, lower(a.email), 'active', v_src, a.id,
    now(), now() + interval '12 months', auth.uid()
  )
  returning id into v_amb;

  insert into ambassador_codes (ambassador_id, promotion_code_id, code, yearly_coupon_id)
  values (v_amb, p_promotion_code_id, upper(a.requested_code), nullif(btrim(coalesce(p_yearly_coupon_id, '')), ''));

  update ambassador_applications
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(),
         ambassador_id = v_amb, updated_at = now()
   where id = a.id;

  perform admin_log(
    format('Approved ambassador %s with code %s', v_name, upper(a.requested_code)),
    'billing', 'ambassador', v_amb::text, v_name,
    jsonb_build_object('application_id', a.id, 'promotion_code_id', p_promotion_code_id)
  );

  return v_amb;
end;
$$;
revoke execute on function admin_approve_ambassador_application(uuid, text, text, text) from anon, public;
grant execute on function admin_approve_ambassador_application(uuid, text, text, text) to authenticated;


create or replace function admin_decline_ambassador_application(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a ambassador_applications;
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot review ambassadors'; end if;

  select * into a from ambassador_applications where id = p_id for update;
  if a.id is null then raise exception 'no such application'; end if;
  if a.status <> 'pending' then raise exception 'this application has already been reviewed'; end if;

  update ambassador_applications
     set status = 'declined', reviewed_at = now(), reviewed_by = auth.uid(),
         decline_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now()
   where id = p_id;

  perform admin_log(
    format('Declined ambassador application from %s', btrim(a.first_name || ' ' || a.last_name)),
    'billing', 'ambassador_application', p_id::text, btrim(a.first_name || ' ' || a.last_name),
    jsonb_build_object('reason', p_reason)
  );
end;
$$;
revoke execute on function admin_decline_ambassador_application(uuid, text) from anon, public;
grant execute on function admin_decline_ambassador_application(uuid, text) to authenticated;


-- ── Admin: the ambassador list ───────────────────────────────────────────────
-- Return type changes, which create or replace cannot do.
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
  payout_method      text
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
    (select ap.payout_method from ambassador_applications ap where ap.id = a.application_id)
  from ambassadors a
  order by a.created_at desc;
end;
$$;

revoke execute on function admin_ambassadors() from anon, public;
grant execute on function admin_ambassadors() to authenticated;

comment on function admin_ambassadors() is
  'Ambassadors with their codes, referral counts, commission in pence (this month, all time, owed) and agreement dates. see_money only.';


-- ── Admin: one ambassador's teachers, for a chosen month ─────────────────────
drop function if exists admin_ambassador_referrals(uuid);

create function admin_ambassador_referrals(p_ambassador_id uuid, p_period date)
returns table (
  id                     uuid,
  user_id                uuid,
  teacher_name           text,
  teacher_email          text,
  joined_at              timestamptz,
  first_paid_at          timestamptz,
  current_plan           text,
  state                  text,
  billing_interval       text,
  discount_failed_reason text,
  code                   text,
  commissions            jsonb
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
    r.id,
    r.user_id,
    btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.surname, '')),
    u.email::text,
    r.redeemed_at,
    r.first_paid_at,
    coalesce(p.plan, 'free'),
    ambassador_referral_state(p.plan, p.subscription_status, p.stripe_subscription_id, r.first_paid_at),
    (select m.billing_interval from ambassador_commissions m
      where m.referral_id = r.id and m.kind <> 'adjustment'
      order by m.created_at desc limit 1),
    r.discount_failed_reason,
    c.code,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'plan', m.plan, 'interval', m.billing_interval,
          'amount_pence', m.amount_pence, 'status', m.status, 'paid_at', m.paid_at
        ) order by m.created_at)
        from ambassador_commissions m
       where m.referral_id = r.id and m.period = p_period),
      '[]'::jsonb
    )
  from ambassador_referrals r
  join ambassador_codes c on c.id = r.code_id
  left join profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  where r.ambassador_id = p_ambassador_id
  order by r.redeemed_at desc;
end;
$$;

revoke execute on function admin_ambassador_referrals(uuid, date) from anon, public;
grant execute on function admin_ambassador_referrals(uuid, date) to authenticated;


-- ── Admin: move commission ───────────────────────────────────────────────────
create or replace function admin_set_commission_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m ambassador_commissions;
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot record payouts'; end if;

  if p_status not in ('unpaid', 'paid') then raise exception 'unknown payout status'; end if;

  select * into m from ambassador_commissions where id = p_id for update;
  if m.id is null then raise exception 'no such commission'; end if;
  if m.status = 'reversed' then
    raise exception 'this payment was refunded, so there is nothing to pay';
  end if;

  update ambassador_commissions
     set status = p_status,
         paid_at = case when p_status = 'paid' then now() else null end
   where id = p_id;

  perform admin_log(
    format('Marked ambassador commission %s', p_status),
    'billing', 'ambassador_commission', p_id::text, to_char(m.period, 'Mon YYYY'),
    jsonb_build_object('from', m.status, 'to', p_status, 'amount_pence', m.amount_pence)
  );
end;
$$;
revoke execute on function admin_set_commission_status(uuid, text) from anon, public;
grant execute on function admin_set_commission_status(uuid, text) to authenticated;


-- Everything still owed for one ambassador in one month, in one go. Returns how
-- many rows moved.
create or replace function admin_mark_commissions_paid(p_ambassador_id uuid, p_period date)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_total bigint;
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot record payouts'; end if;

  with moved as (
    update ambassador_commissions
       set status = 'paid', paid_at = now()
     where ambassador_id = p_ambassador_id and period = p_period and status = 'unpaid'
    returning amount_pence
  )
  select count(*), coalesce(sum(amount_pence), 0) into v_count, v_total from moved;

  if v_count > 0 then
    perform admin_log(
      format('Marked %s ambassador commissions paid for %s', v_count, to_char(p_period, 'Mon YYYY')),
      'billing', 'ambassador', p_ambassador_id::text, to_char(p_period, 'Mon YYYY'),
      jsonb_build_object('count', v_count, 'amount_pence', v_total)
    );
  end if;

  return v_count;
end;
$$;
revoke execute on function admin_mark_commissions_paid(uuid, date) from anon, public;
grant execute on function admin_mark_commissions_paid(uuid, date) to authenticated;


-- ── Admin: programme summary ─────────────────────────────────────────────────
-- The KPI row. p_from null means all time. Periods are London months.
create or replace function admin_programme_summary(p_from date default null)
returns table (
  commission_pence        bigint,
  referred_revenue_pence  bigint,
  active_ambassadors      bigint,
  invited                 bigint,
  awaiting_review         bigint,
  oldest_submitted_at     timestamptz,
  subscribers_via_codes   bigint,
  all_paying              bigint,
  invites_unopened        bigint,
  free_pro_seats          bigint
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
    (select coalesce(sum(m.amount_pence), 0) from ambassador_commissions m
      where m.status <> 'reversed' and (p_from is null or m.period >= p_from))::bigint,
    (select coalesce(sum(m.invoice_amount_pence), 0) from ambassador_commissions m
      where m.kind <> 'adjustment' and m.status <> 'reversed'
        and (p_from is null or m.period >= p_from))::bigint,
    (select count(*) from ambassadors a
      where a.status = 'active' and (a.agreement_ends_at is null or a.agreement_ends_at > now())),
    (select count(*) from ambassador_invites),
    (select count(*) from ambassador_applications ap where ap.status = 'pending'),
    (select min(ap.submitted_at) from ambassador_applications ap where ap.status = 'pending'),
    (select count(*) from ambassador_referrals r join profiles p on p.id = r.user_id
      where ambassador_referral_state(p.plan, p.subscription_status, p.stripe_subscription_id, r.first_paid_at) = 'paying'),
    (select count(*) from profiles p
      where p.stripe_subscription_id is not null
        and p.subscription_status in ('active', 'past_due')
        and p.plan in ('standard', 'pro', 'max')),
    (select count(*) from ambassador_invites i
      where i.opened_at is null and i.used_at is null and i.revoked_at is null
        and i.expires_at > now() and i.created_at < now() - interval '7 days'),
    (select count(*) from ambassadors a where a.pro_until > now());
end;
$$;
revoke execute on function admin_programme_summary(date) from anon, public;
grant execute on function admin_programme_summary(date) to authenticated;


-- ── Applicant: submit ────────────────────────────────────────────────────────
-- Service role only: /api/ambassadors/apply checks the session and passes the
-- user id, and is the only thing that knows the real IP.
create or replace function submit_ambassador_application(
  p_user_id    uuid,
  p_token_hash text,
  payload      jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_invite ambassador_invites;
  v_code   text := upper(btrim(coalesce(payload->>'requested_code', '')));
  v_id     uuid;
  v_method text := payload->>'payout_method';
begin
  if p_user_id is null then raise exception 'not signed in'; end if;

  select * into v_invite from ambassador_invites where token_hash = p_token_hash for update;
  if v_invite.id is null then raise exception 'This invite link is not valid.'; end if;
  if v_invite.revoked_at is not null then raise exception 'This invite link has been withdrawn.'; end if;
  if v_invite.used_at is not null then raise exception 'This invite link has already been used.'; end if;
  if v_invite.expires_at < now() then raise exception 'This invite link has expired. Ask us for a new one.'; end if;

  if exists (select 1 from ambassador_applications a
              where a.user_id = p_user_id and a.status in ('pending', 'approved')) then
    raise exception 'You have already applied.';
  end if;
  if exists (select 1 from ambassadors x where x.user_id = p_user_id and x.status = 'active') then
    raise exception 'You are already a Jooma Ambassador.';
  end if;

  if exists (select 1 from ambassador_codes c where lower(c.code) = lower(v_code))
     or exists (select 1 from ambassador_applications a
                 where a.status in ('pending', 'approved') and lower(a.requested_code) = lower(v_code)) then
    raise exception 'That code is already taken. Try another.';
  end if;

  insert into ambassador_applications (
    user_id, invite_id,
    first_name, last_name, email, mobile, date_of_birth, address_line, town, postcode, school, teaches,
    instagram, tiktok, x_handle, facebook, youtube, linkedin, reach, note,
    payout_method, account_holder, sort_code, account_number, bank_name, paypal_email,
    tax_status, utr, requested_code,
    agreement_version, signature_name, signed_ip, signed_user_agent, declarations
  )
  values (
    p_user_id, v_invite.id,
    btrim(payload->>'first_name'), btrim(payload->>'last_name'), lower(btrim(payload->>'email')),
    btrim(payload->>'mobile'), (payload->>'date_of_birth')::date,
    btrim(payload->>'address_line'), btrim(payload->>'town'), upper(btrim(payload->>'postcode')),
    nullif(btrim(coalesce(payload->>'school', '')), ''), nullif(btrim(coalesce(payload->>'teaches', '')), ''),
    nullif(btrim(coalesce(payload->>'instagram', '')), ''), nullif(btrim(coalesce(payload->>'tiktok', '')), ''),
    nullif(btrim(coalesce(payload->>'x_handle', '')), ''), nullif(btrim(coalesce(payload->>'facebook', '')), ''),
    nullif(btrim(coalesce(payload->>'youtube', '')), ''), nullif(btrim(coalesce(payload->>'linkedin', '')), ''),
    payload->>'reach', nullif(btrim(coalesce(payload->>'note', '')), ''),
    v_method, btrim(payload->>'account_holder'),
    case when v_method = 'bank' then payload->>'sort_code' end,
    case when v_method = 'bank' then payload->>'account_number' end,
    case when v_method = 'bank' then nullif(btrim(coalesce(payload->>'bank_name', '')), '') end,
    case when v_method = 'paypal' then lower(btrim(payload->>'paypal_email')) end,
    payload->>'tax_status', nullif(btrim(coalesce(payload->>'utr', '')), ''), v_code,
    payload->>'agreement_version', btrim(payload->>'signature_name'),
    payload->>'signed_ip', left(payload->>'signed_user_agent', 400),
    coalesce(payload->'declarations', '{}'::jsonb)
  )
  returning id into v_id;

  update ambassador_invites set used_at = now(), used_by = p_user_id where id = v_invite.id;

  return v_id;
end;
$$;
revoke execute on function submit_ambassador_application(uuid, text, jsonb) from anon, authenticated, public;
grant execute on function submit_ambassador_application(uuid, text, jsonb) to service_role;


-- Whether a code is free, for the live check under the code field. Codes are
-- public by nature (they are shared on social media), so answering this for a
-- signed-in teacher reveals nothing that is not already out there.
create or replace function ambassador_code_available(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and not exists (select 1 from ambassador_codes c where lower(c.code) = lower(btrim(p_code)))
     and not exists (select 1 from ambassador_applications a
                      where a.status in ('pending', 'approved')
                        and lower(a.requested_code) = lower(btrim(p_code)));
$$;
revoke execute on function ambassador_code_available(text) from anon, public;
grant execute on function ambassador_code_available(text) to authenticated;


-- ── Applicant / ambassador: own reads ────────────────────────────────────────
create or replace function my_ambassador_application()
returns table (
  id             uuid,
  status         text,
  first_name     text,
  requested_code text,
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  decline_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.status, a.first_name, a.requested_code, a.submitted_at, a.reviewed_at, a.decline_reason
  from ambassador_applications a
  where a.user_id = auth.uid() and auth.uid() is not null
  order by a.submitted_at desc
  limit 1;
$$;
revoke execute on function my_ambassador_application() from anon, public;
grant execute on function my_ambassador_application() to authenticated;


-- Their own details for the Payout details and My agreement tabs. The account
-- number comes back as its last four digits only.
create or replace function my_ambassador_details()
returns table (
  first_name        text,
  last_name         text,
  email             text,
  mobile            text,
  address_line      text,
  town              text,
  postcode          text,
  school            text,
  teaches           text,
  instagram         text,
  tiktok            text,
  x_handle          text,
  facebook          text,
  youtube           text,
  linkedin          text,
  reach             text,
  note              text,
  payout_method     text,
  account_holder    text,
  sort_code         text,
  account_last4     text,
  bank_name         text,
  paypal_email      text,
  payout_changed_at timestamptz,
  tax_status        text,
  has_utr           boolean,
  agreement_version text,
  signature_name    text,
  signed_at         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.first_name, a.last_name, a.email, a.mobile, a.address_line, a.town, a.postcode,
    a.school, a.teaches,
    a.instagram, a.tiktok, a.x_handle, a.facebook, a.youtube, a.linkedin, a.reach, a.note,
    a.payout_method, a.account_holder, a.sort_code, right(a.account_number, 4), a.bank_name,
    a.paypal_email, a.payout_changed_at,
    a.tax_status, a.utr is not null,
    a.agreement_version, a.signature_name, a.signed_at
  from ambassador_applications a
  where a.user_id = auth.uid() and auth.uid() is not null
    and a.status in ('pending', 'approved')
  order by a.submitted_at desc
  limit 1;
$$;
revoke execute on function my_ambassador_details() from anon, public;
grant execute on function my_ambassador_details() to authenticated;


-- Edit one section of their own details. The route validates first with the
-- same rules as the application form (app/lib/ambassador-application.ts); the
-- table's checks are the backstop.
create or replace function update_my_ambassador_details(p_section text, payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_method text := payload->>'payout_method';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select a.id into v_id
  from ambassador_applications a
  where a.user_id = auth.uid() and a.status in ('pending', 'approved')
  order by a.submitted_at desc
  limit 1;
  if v_id is null then raise exception 'no application to update'; end if;

  if p_section = 'personal' then
    update ambassador_applications set
      email        = lower(btrim(payload->>'email')),
      mobile       = btrim(payload->>'mobile'),
      address_line = btrim(payload->>'address_line'),
      town         = btrim(payload->>'town'),
      postcode     = upper(btrim(payload->>'postcode')),
      school       = nullif(btrim(coalesce(payload->>'school', '')), ''),
      teaches      = nullif(btrim(coalesce(payload->>'teaches', '')), ''),
      updated_at   = now()
    where id = v_id;
  elsif p_section = 'channels' then
    update ambassador_applications set
      instagram  = nullif(btrim(coalesce(payload->>'instagram', '')), ''),
      tiktok     = nullif(btrim(coalesce(payload->>'tiktok', '')), ''),
      x_handle   = nullif(btrim(coalesce(payload->>'x_handle', '')), ''),
      facebook   = nullif(btrim(coalesce(payload->>'facebook', '')), ''),
      youtube    = nullif(btrim(coalesce(payload->>'youtube', '')), ''),
      linkedin   = nullif(btrim(coalesce(payload->>'linkedin', '')), ''),
      reach      = payload->>'reach',
      note       = nullif(btrim(coalesce(payload->>'note', '')), ''),
      updated_at = now()
    where id = v_id;
  elsif p_section = 'payout' then
    -- Only the chosen method's details are kept.
    update ambassador_applications set
      payout_method     = v_method,
      account_holder    = btrim(payload->>'account_holder'),
      sort_code         = case when v_method = 'bank' then payload->>'sort_code' end,
      account_number    = case when v_method = 'bank' then payload->>'account_number' end,
      bank_name         = case when v_method = 'bank' then nullif(btrim(coalesce(payload->>'bank_name', '')), '') end,
      paypal_email      = case when v_method = 'paypal' then lower(btrim(payload->>'paypal_email')) end,
      payout_changed_at = now(),
      updated_at        = now()
    where id = v_id;
  elsif p_section = 'tax' then
    update ambassador_applications set
      tax_status = payload->>'tax_status',
      -- A blank UTR keeps the one on file rather than erasing it: the form
      -- never shows the stored value back.
      utr        = coalesce(nullif(btrim(coalesce(payload->>'utr', '')), ''), utr),
      updated_at = now()
    where id = v_id;
  else
    raise exception 'unknown section';
  end if;
end;
$$;
revoke execute on function update_my_ambassador_details(text, jsonb) from anon, public;
grant execute on function update_my_ambassador_details(text, jsonb) to authenticated;


create or replace function request_end_my_ambassador_agreement()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update ambassadors
     set end_requested_at = coalesce(end_requested_at, now()), updated_at = now()
   where user_id = auth.uid() and auth.uid() is not null and status = 'active';
$$;
revoke execute on function request_end_my_ambassador_agreement() from anon, public;
grant execute on function request_end_my_ambassador_agreement() to authenticated;


-- ── Ambassador: own summary, now with money and the agreement ────────────────
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
  created_at         timestamptz
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
    a.created_at
  from ambassadors a
  where a.user_id = auth.uid()
    and auth.uid() is not null
  order by a.created_at desc
  limit 1;
$$;

revoke execute on function my_ambassador() from anon, public;
grant execute on function my_ambassador() to authenticated;

comment on function my_ambassador() is
  'The caller''s own ambassador row: status, free Pro term, codes, counts, commission in pence and agreement dates. Zero rows for a non-ambassador.';


-- ── Ambassador: own referrals, anonymous ─────────────────────────────────────
-- The v2 dashboard shows the plan and the date, never who the teacher is.
drop function if exists my_ambassador_referrals();

create function my_ambassador_referrals()
returns table (
  redeemed_at      timestamptz,
  first_paid_at    timestamptz,
  plan             text,
  billing_interval text,
  state            text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select a.id
    from ambassadors a
    where a.user_id = auth.uid()
      and auth.uid() is not null
    order by a.created_at desc
    limit 1
  )
  select
    r.redeemed_at,
    r.first_paid_at,
    case
      when ambassador_referral_state(p.plan, p.subscription_status, p.stripe_subscription_id, r.first_paid_at)
           in ('paying', 'trial') then p.plan
      else r.first_paid_plan
    end,
    (select m.billing_interval from ambassador_commissions m
      where m.referral_id = r.id and m.kind <> 'adjustment'
      order by m.created_at desc limit 1),
    ambassador_referral_state(p.plan, p.subscription_status, p.stripe_subscription_id, r.first_paid_at)
  from ambassador_referrals r
  join me on me.id = r.ambassador_id
  left join profiles p on p.id = r.user_id
  order by r.redeemed_at desc;
$$;

revoke execute on function my_ambassador_referrals() from anon, public;
grant execute on function my_ambassador_referrals() to authenticated;

comment on function my_ambassador_referrals() is
  'The caller''s own referrals: dates, plan, how they pay and whether they still do. Never a name. Zero rows for a non-ambassador.';


-- ── Ambassador: own commission ledger ────────────────────────────────────────
create or replace function my_ambassador_commissions()
returns table (
  period           date,
  kind             text,
  plan             text,
  billing_interval text,
  amount_pence     integer,
  status           text,
  paid_at          timestamptz,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select a.id
    from ambassadors a
    where a.user_id = auth.uid()
      and auth.uid() is not null
    order by a.created_at desc
    limit 1
  )
  select m.period, m.kind, m.plan, m.billing_interval, m.amount_pence, m.status, m.paid_at, m.created_at
  from ambassador_commissions m
  join me on me.id = m.ambassador_id
  order by m.period desc, m.created_at desc;
$$;
revoke execute on function my_ambassador_commissions() from anon, public;
grant execute on function my_ambassador_commissions() to authenticated;
