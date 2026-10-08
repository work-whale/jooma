-- ── Free tries from the hero: who actually became a new teacher ─────────────
--
-- admin_guest_try_stats (20261006000100) counts RUNS, and its `claimed` column
-- means "this run moved into an account". That moves for a login as readily as
-- for a signup, and one teacher who made three decks counts three times. On
-- production in October it read "5 signed up after" for what was one new
-- account and one existing teacher logging in.
--
-- This function counts PEOPLE instead, as a funnel:
--
--   tried            distinct people who made something, failed runs included
--   new_accounts     their account was created AFTER their first try
--   started_trial    of those, went through checkout (the 3 day trial)
--   paying           of those, the subscription is now active (trial charged)
--   existing_logins  an account that already existed before the first try.
--                    Shown on its own, never counted as a conversion.
--
-- WHO IS A PERSON
--
-- A guest is a browser cookie. A guest whose work was claimed is the account
-- that claimed it, so a teacher who tried on two browsers and logged in on both
-- is one person, and a guest's failed run (never claimed) does not split them
-- into a second, anonymous person. A guest nobody claimed is its own person.
-- Each person is counted once, in the month of their FIRST try.
--
-- WHAT IT CANNOT SEE
--
-- A try only links to an account when the visitor signs up in the same browser,
-- since the guest cookie is the link. Trying on a phone and signing up later on
-- a laptop is a signup this does not attribute, so the figures read low.
--
-- `started_trial` reads stripe_subscription_id, which the webhook writes on the
-- first subscription and never clears (see app/lib/trial.ts), so a teacher who
-- trialled and cancelled still counts as having started. A new account has never
-- subscribed before, so its first checkout always carries the trial. An admin
-- assigned plan has no Stripe subscription and counts as neither.
--
-- Read-only, counts only, gated on see_stats like admin_guest_try_stats.
create or replace function admin_guest_try_funnel(p_months integer default 12)
returns table (
  month_start     date,
  label           text,
  tried           bigint,
  new_accounts    bigint,
  started_trial   bigint,
  paying          bigint,
  existing_logins bigint
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

  -- Clamped rather than trusted: p_months reaches this from a URL parameter.
  p_months := greatest(1, least(coalesce(p_months, 12), 120));

  return query
    with guests as (
      -- One row per guest cookie, with the account that claimed its work.
      select g.guest_id,
             (array_agg(g.claimed_by order by g.claimed_at)
                filter (where g.claimed_by is not null))[1] as owner,
             min(g.created_at) as first_try
        from trial_generations g
       group by g.guest_id
    ),
    people as (
      select coalesce(gu.owner::text, gu.guest_id::text) as person,
             gu.owner,
             min(gu.first_try) as first_try
        from guests gu
       group by 1, 2
    ),
    classified as (
      select date_trunc('month', p.first_try) as m,
             (p.owner is not null and u.created_at > p.first_try) as is_new,
             (p.owner is not null and u.created_at <= p.first_try) as is_existing,
             (pr.stripe_subscription_id is not null) as trialled,
             (pr.stripe_subscription_id is not null
                and pr.subscription_status = 'active') as is_paying
        from people p
        left join auth.users u on u.id = p.owner
        left join profiles pr on pr.id = p.owner
    )
    select
      d.m::date,
      to_char(d.m, 'Mon YYYY'),
      count(c.m),
      count(*) filter (where c.is_new),
      count(*) filter (where c.is_new and c.trialled),
      count(*) filter (where c.is_new and c.is_paying),
      count(*) filter (where c.is_existing)
    from generate_series(
      date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as d(m)
    -- LEFT join: a quiet month must come back as zeros, not be missing.
    left join classified c on c.m = d.m
    group by d.m
    order by d.m;
end;
$$;
revoke execute on function admin_guest_try_funnel(integer) from anon, public;
grant execute on function admin_guest_try_funnel(integer) to authenticated;

comment on function admin_guest_try_funnel(integer) is
  'Free tries from the landing hero as a funnel of people per month of first try: tried, made a NEW account, started the trial, paying now, plus existing teachers who logged in (not a conversion). Counts only. Gated on see_stats.';

-- ── Verify after pushing ────────────────────────────────────────────────────
-- As an admin with see_stats:
-- select * from admin_guest_try_funnel(3);  -- 3 rows, one per month, no error
