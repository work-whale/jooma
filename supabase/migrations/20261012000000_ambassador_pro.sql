-- Ambassador Pro: twelve free months of Pro for the teachers who represent
-- Jooma, and a page where an ambassador sees the teachers who joined with
-- their code.
--
-- WHAT THIS ADDS
--
--   ambassadors.pro_until       When the free Pro ends. Written by the admin
--                               grant route, read by the sidebar, the
--                               /ambassador page, checkout (so subscribing
--                               early starts billing only when the free year
--                               ends) and the daily ambassador-terms cron that
--                               takes the comp off once it has passed.
--   ambassadors.pro_granted_at  When it was granted, for the admin table.
--
--   my_ambassador()             The caller's OWN ambassador row and counts.
--   my_ambassador_referrals()   The caller's OWN referrals, as initials.
--
-- WHY DEFINER FUNCTIONS AND NOT A TEACHER READ POLICY
--
-- All three ambassador tables are admin-only, deliberately (see
-- 20260909000300_ambassadors.sql). A read policy would grant whole rows: the
-- ambassador's admin notes, other teachers' user ids, payout notes. These
-- functions return named columns only, scoped by auth.uid(), and nothing about
-- a referred teacher beyond a first name and a surname initial. No email, no
-- id, no school.
--
-- The plan itself still lives on profiles.plan, written as a comp (plan 'pro',
-- no Stripe subscription) exactly like the admin change-plan route does. A comp
-- never pays an ambassador out, which the referral rules already guarantee:
-- first_paid_at is written by the invoice.paid webhook and nothing else.

alter table ambassadors
  add column if not exists pro_until      timestamptz,
  add column if not exists pro_granted_at timestamptz;

comment on column ambassadors.pro_until is
  'When the ambassador''s free Pro ends. Null = never granted. The ambassador-terms cron removes the comp once this has passed, unless they have since subscribed through Stripe.';


-- ── Admin list: now also returns pro_until ───────────────────────────────────
-- The return type changes, which create or replace cannot do.
drop function if exists admin_ambassadors();

create function admin_ambassadors()
returns table (
  id             uuid,
  full_name      text,
  email          text,
  status         text,
  user_id        uuid,
  notes          text,
  created_at     timestamptz,
  codes          text[],
  referrals      bigint,
  subscribers    bigint,
  owed           bigint,
  paid           bigint,
  pro_until      timestamptz,
  pro_granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

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
    -- "Subscribers" means money actually arrived, not merely that they hold a
    -- paid plan today: a comp would otherwise inflate an ambassador's numbers.
    (select count(*) from ambassador_referrals r
      where r.ambassador_id = a.id and r.first_paid_at is not null),
    (select count(*) from ambassador_referrals r
      where r.ambassador_id = a.id and r.payout_status = 'unpaid'),
    (select count(*) from ambassador_referrals r
      where r.ambassador_id = a.id and r.payout_status = 'paid'),
    a.pro_until,
    a.pro_granted_at
  from ambassadors a
  order by a.created_at desc;
end;
$$;

revoke execute on function admin_ambassadors() from anon, public;
grant execute on function admin_ambassadors() to authenticated;

comment on function admin_ambassadors() is
  'Ambassadors with their codes, referral counts and free Pro term. "subscribers" counts referrals whose first payment actually arrived, so comped teachers are excluded.';


-- ── Teacher: my own ambassador row ───────────────────────────────────────────
-- Zero rows for anyone who is not an ambassador, which is how the sidebar and
-- the /ambassador page tell. A paused ambassador is still returned, with its
-- status, so the page can say so rather than pretending they never were one.
--
-- user_id is not unique on ambassadors (an admin could create two rows for the
-- same teacher), so this takes the newest rather than returning both.
create or replace function my_ambassador()
returns table (
  full_name   text,
  status      text,
  pro_until   timestamptz,
  codes       text[],
  referrals   bigint,
  subscribers bigint,
  owed        bigint,
  paid        bigint
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
      where r.ambassador_id = a.id and r.payout_status = 'unpaid'),
    (select count(*) from ambassador_referrals r
      where r.ambassador_id = a.id and r.payout_status = 'paid')
  from ambassadors a
  where a.user_id = auth.uid()
    and auth.uid() is not null
  order by a.created_at desc
  limit 1;
$$;

revoke execute on function my_ambassador() from anon, public;
grant execute on function my_ambassador() to authenticated;

comment on function my_ambassador() is
  'The caller''s own ambassador row: name, status, free Pro term, codes and referral counts. Zero rows for a non-ambassador.';


-- ── Teacher: the teachers who joined with my code ────────────────────────────
-- Initials only. An ambassador knows these people, or at least shared a link
-- with them, but the referred teacher never agreed to be listed by full name,
-- email or school to someone else.
create or replace function my_ambassador_referrals()
returns table (
  display_name    text,
  redeemed_at     timestamptz,
  subscribed      boolean,
  first_paid_plan text,
  payout_status   text
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
    coalesce(
      nullif(
        trim(
          coalesce(nullif(trim(p.first_name), ''), '') ||
          case
            when nullif(trim(p.surname), '') is not null
              then ' ' || upper(left(trim(p.surname), 1)) || '.'
            else ''
          end
        ),
        ''
      ),
      'A teacher'
    ),
    r.redeemed_at,
    r.first_paid_at is not null,
    r.first_paid_plan,
    r.payout_status
  from ambassador_referrals r
  join me on me.id = r.ambassador_id
  left join profiles p on p.id = r.user_id
  order by r.redeemed_at desc;
$$;

revoke execute on function my_ambassador_referrals() from anon, public;
grant execute on function my_ambassador_referrals() to authenticated;

comment on function my_ambassador_referrals() is
  'The caller''s own referrals, named by first name and surname initial only. Zero rows for a non-ambassador.';


-- ── Admin: link an ambassador to their account ───────────────────────────────
-- admin_create_ambassador links user_id by email at creation, but an ambassador
-- is often added before they have signed up, and nothing links them later. The
-- Pro grant needs the account, so it calls this first. Same email match as at
-- creation; returns the linked user id, or null when there is still no account.
create or replace function admin_link_ambassador_account(p_ambassador_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  select a.user_id into v_user from ambassadors a where a.id = p_ambassador_id;
  if v_user is not null then
    return v_user;
  end if;

  select u.id into v_user
  from ambassadors a
  join auth.users u on lower(u.email) = lower(a.email)
  where a.id = p_ambassador_id;

  if v_user is not null then
    update ambassadors set user_id = v_user, updated_at = now()
    where id = p_ambassador_id;
  end if;

  return v_user;
end;
$$;

revoke execute on function admin_link_ambassador_account(uuid) from anon, public;
grant execute on function admin_link_ambassador_account(uuid) to authenticated;

comment on function admin_link_ambassador_account(uuid) is
  'Links an ambassador row to the Jooma account with the same email, when it is not linked yet. Admin only. Returns the user id, or null if they have no account.';
