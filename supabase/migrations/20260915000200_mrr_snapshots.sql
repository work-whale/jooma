-- ── MRR history ──────────────────────────────────────────────────────────────
--
-- Nothing has ever stored a monthly revenue figure. teacher_mrr() computes one
-- live and throws it away, so "MRR over time" has no source and the Stats page
-- leaves that panel out. This table starts recording from today; the chart
-- appears once it has rows.
--
-- WHY TWO MONEY COLUMNS
--
-- A subscriber on a temporary coupon is still worth their list price as
-- RECURRING revenue: the discount lapses and the full amount resumes. A
-- subscriber on a forever coupon genuinely is worth the discounted amount.
-- app/lib/subscriptionValue.ts applies every discount and ignores the coupon's
-- duration, which is right for "what arrived this month" and wrong for a trend
-- line: when a coupon lapses the billed figure jumps with no subscription event
-- behind it.
--
-- So both are stored. list_gbp is the run rate, billed_gbp is the cash, and
-- billed rising to meet list becomes a visible, explainable event rather than a
-- mystery step. On production today the two live subscriptions list at GBP 7.99
-- and bill 80p and 8p, so the gap is real and worth seeing.
--
-- NO BACKFILL. Stripe holds two invoices totalling 88p, both test cards from
-- one afternoon. There is no revenue history to reconstruct, and inventing a
-- curve from it would be worse than an empty chart. Revisit once real invoices
-- exist; the invoices table already records them.

create table if not exists mrr_snapshots (
  -- One row per day. The date is the key rather than a serial id so a re-run,
  -- a retry, or two crons racing all land on the same row instead of quietly
  -- doubling the day.
  captured_on   date primary key default current_date,

  -- List prices from plan_config, discounts ignored. Always available: this
  -- comes from teacher_mrr() and needs nothing external.
  list_gbp      numeric(10,2) not null default 0,

  -- What Stripe actually charges this cycle, discounts applied. NULL when
  -- Stripe could not be read, which is deliberately distinct from 0: a bad
  -- afternoon at Stripe must not be recorded as a day nobody paid.
  billed_gbp    numeric(10,2),

  paying_count  integer not null default 0,
  comped_gbp    numeric(10,2) not null default 0,
  comped_count  integer not null default 0,
  ending_gbp    numeric(10,2) not null default 0,
  ending_count  integer not null default 0,

  created_at    timestamptz not null default now()
);

alter table mrr_snapshots enable row level security;

-- No policy grants write access. The cron writes with the service role, which
-- bypasses RLS; nothing else should ever insert here. Reads go through the
-- definer function below rather than a policy, so a teacher with an account
-- cannot read company revenue by querying the table directly.
drop policy if exists "admins read mrr snapshots" on mrr_snapshots;
create policy "admins read mrr snapshots" on mrr_snapshots
  for select using (is_admin());

-- ── The series, for the chart ────────────────────────────────────────────────
create or replace function admin_mrr_history(p_months integer default 12)
returns table (
  captured_on  date,
  list_gbp     numeric,
  billed_gbp   numeric,
  paying_count integer,
  comped_gbp   numeric,
  ending_gbp   numeric
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
    select s.captured_on, s.list_gbp, s.billed_gbp,
           s.paying_count, s.comped_gbp, s.ending_gbp
    from mrr_snapshots s
    where s.captured_on >= (date_trunc('month', now())
                            - ((p_months - 1) || ' months')::interval)::date
    order by s.captured_on;
end;
$$;
revoke execute on function admin_mrr_history(integer) from anon, public;
grant execute on function admin_mrr_history(integer) to authenticated;

comment on table mrr_snapshots is
  'Daily point-in-time MRR. list_gbp is the run rate at list prices; billed_gbp is what Stripe actually charges after discounts, NULL when Stripe was unreachable. Written by /api/cron/mrr-snapshot.';
comment on function admin_mrr_history(integer) is
  'MRR snapshots for the Stats chart. Gated on see_stats.';
