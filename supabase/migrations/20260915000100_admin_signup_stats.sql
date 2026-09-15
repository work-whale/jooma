-- ── Signup stats, for the marketing Stats page ───────────────────────────────
--
-- Three read-only aggregates behind /admin/stats. All gated on see_stats rather
-- than bare is_admin(), because this is the one page a marketing contractor can
-- reach and these are the only functions they can call.
--
-- WHAT THESE COUNT, AND WHY IT IS NOT auth.users
--
-- admin_signups_by_month() (20260805001900) counts auth.users. Plan and country
-- live on profiles, and the two populations differ by exactly the people who
-- signed up and never finished onboarding, which admin_incomplete_signups()
-- exists to surface. A page mixing them would report a conversion rate whose
-- numerator and denominator describe different groups of people.
--
-- So everything here counts PROFILES, consistently, and the page says so. The
-- older function is left alone: the dashboard uses it and changing what it
-- counts would silently move a number someone already trusts.
--
-- PLAN IS TODAY'S PLAN, NOT THE PLAN AT SIGNUP
--
-- Nothing records plan history. A teacher who signed up free in March and
-- upgraded in September counts as Max in March's bar. That is a real and useful
-- figure (which cohorts became valuable) but it is NOT a cohort conversion
-- curve, and the page has to say which it is.

-- Who counts as paying. Lifted from teacher_mrr() (20260909000200) rather than
-- rewritten: a real Stripe subscription, excluding admins and the school plan.
-- Two functions disagreeing about who is paying is exactly the drift that
-- teacher_mrr() was created to end, and tests/billing/admin-mrr.spec.ts guards.
create or replace function is_paying_profile(p profiles)
returns boolean
language sql
immutable
as $$
  select coalesce(p.plan, 'free') not in ('free', 'school')
     and coalesce(p.is_admin, false) = false
     and p.stripe_subscription_id is not null;
$$;

-- ── Signups by month, split by plan ──────────────────────────────────────────
create or replace function admin_signup_stats_by_month(p_months integer default 12)
returns table (
  month_start date,
  label       text,
  signups     bigint,
  free        bigint,
  pro         bigint,
  max         bigint,
  paid        bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can('see_stats') then
    raise exception 'your role cannot see stats';
  end if;

  -- Clamped rather than trusted: p_months reaches this from a URL parameter,
  -- and generate_series with a hostile value is a cheap way to hurt the server.
  p_months := greatest(1, least(coalesce(p_months, 12), 120));

  return query
    select
      d.m::date,
      to_char(d.m, 'Mon YYYY'),
      count(p.id),
      count(p.id) filter (where coalesce(p.plan, 'free') = 'free'),
      count(p.id) filter (where p.plan = 'pro'),
      count(p.id) filter (where p.plan = 'max'),
      count(p.id) filter (where is_paying_profile(p))
    from generate_series(
      date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as d(m)
    -- LEFT join: a month with no signups must appear as a zero row, or the bar
    -- chart silently closes the gap and reads as continuous growth.
    left join profiles p
      on p.created_at >= d.m
     and p.created_at < d.m + interval '1 month'
     and coalesce(p.is_admin, false) = false
    group by d.m
    order by d.m;
end;
$$;
revoke execute on function admin_signup_stats_by_month(integer) from anon, public;
grant execute on function admin_signup_stats_by_month(integer) to authenticated;

-- ── Signups by country ───────────────────────────────────────────────────────
-- profiles.country is an ISO code, self declared at onboarding, defaulted from
-- the dial code and editable forever. It is "where teachers say they are now",
-- not geo-IP and not country-at-signup. Nulls become an explicit row rather
-- than being dropped, or every percentage on the panel is quietly wrong.
create or replace function admin_signup_stats_by_country(
  p_months integer default 12,
  p_limit  integer default 10
)
returns table (
  country text,
  signups bigint,
  paid    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can('see_stats') then
    raise exception 'your role cannot see stats';
  end if;

  p_months := greatest(1, least(coalesce(p_months, 12), 120));
  p_limit  := greatest(1, least(coalesce(p_limit, 10), 100));

  return query
    select
      coalesce(nullif(trim(p.country), ''), 'Not given'),
      count(*),
      count(*) filter (where is_paying_profile(p))
    from profiles p
    where coalesce(p.is_admin, false) = false
      and p.created_at >= date_trunc('month', now())
                          - ((p_months - 1) || ' months')::interval
    group by 1
    order by 2 desc, 1
    limit p_limit;
end;
$$;
revoke execute on function admin_signup_stats_by_country(integer, integer) from anon, public;
grant execute on function admin_signup_stats_by_country(integer, integer) to authenticated;

-- ── Signups by attribution ───────────────────────────────────────────────────
-- NOT an acquisition channel report, and deliberately not named like one.
--
-- Nothing records a UTM or referrer at signup, so organic, SEO, direct and paid
-- are indistinguishable from each other and all land in 'unattributed'. What we
-- genuinely know is narrower: they redeemed an ambassador code, or they arrived
-- through an invite. The Stats page shows this as "how teachers reached us"
-- with the unattributed share stated plainly, and leaves the acquisition
-- channel panel empty rather than dressing these three buckets up as one.
create or replace function admin_signup_stats_by_source(p_months integer default 12)
returns table (
  source  text,
  signups bigint,
  paid    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can('see_stats') then
    raise exception 'your role cannot see stats';
  end if;

  p_months := greatest(1, least(coalesce(p_months, 12), 120));

  return query
    with scoped as (
      select
        -- Named columns, not p.*: adding `bucket` to a `profiles` row makes it
        -- a new anonymous type, so `s::profiles` would no longer cast and
        -- is_paying_profile() could not be reused on it. Selecting only what
        -- the predicate needs keeps the CTE honest about its own shape.
        p.plan,
        p.is_admin,
        p.stripe_subscription_id,
        case
          when exists (select 1 from ambassador_referrals r where r.user_id = p.id)
            then 'ambassador'
          when exists (
            select 1 from pending_invites i
             where i.accepted_by = p.id and i.accepted_at is not null
          ) then 'invited'
          else 'unattributed'
        end as bucket
      from profiles p
      where coalesce(p.is_admin, false) = false
        and p.created_at >= date_trunc('month', now())
                            - ((p_months - 1) || ' months')::interval
    )
    select
      s.bucket,
      count(*),
      count(*) filter (
        where coalesce(s.plan, 'free') not in ('free', 'school')
          and coalesce(s.is_admin, false) = false
          and s.stripe_subscription_id is not null
      )
    from scoped s
    group by s.bucket
    order by 2 desc;
end;
$$;
revoke execute on function admin_signup_stats_by_source(integer) from anon, public;
grant execute on function admin_signup_stats_by_source(integer) to authenticated;

comment on function admin_signup_stats_by_month(integer) is
  'Signups per month from profiles, split by the plan each teacher is on TODAY (no plan history exists). Gated on see_stats.';
comment on function admin_signup_stats_by_country(integer, integer) is
  'Signups by declared country. Self reported at onboarding and editable, not geo-IP. Nulls appear as "Not given". Gated on see_stats.';
comment on function admin_signup_stats_by_source(integer) is
  'Signups bucketed into ambassador, invited and unattributed. NOT acquisition channel: no UTM or referrer is recorded, so organic, SEO and paid all fall into unattributed. Gated on see_stats.';
