-- Plan gating: track each user's subscription tier and expose a helper to
-- count their generations in the current calendar month (for the Free-plan
-- monthly cap defined in app/lib/plans.ts).

-- 1. Plan column on profiles. Defaults to 'free'.
alter table profiles
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'pro', 'school'));

-- 2. Count the caller's tool_runs created since the start of the current month.
--    security invoker so auth.uid() resolves to the calling user under RLS.
create or replace function my_generation_count_this_month()
returns integer
language sql
stable
security invoker
as $$
  select count(*)::integer
  from tool_runs
  where user_id = auth.uid()
    and created_at >= date_trunc('month', now());
$$;

grant execute on function my_generation_count_this_month() to authenticated;
