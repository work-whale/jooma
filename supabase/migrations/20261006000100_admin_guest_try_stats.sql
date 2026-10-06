-- ── Free tries from the hero, for the Stats page ────────────────────────────
--
-- One read-only aggregate behind the "Free tries from the hero" panel on
-- /admin/stats. Gated on see_stats like the signup functions in
-- 20260915000100, because marketing reads this page too.
--
-- WHY A DEFINER FUNCTION
--
-- trial_generations has no policies and no grants (20261005000000): only the
-- service role touches it. This hands the Stats page counts, never rows, so no
-- guest id, IP hash or generated output ever leaves the database through it.
--
-- WHAT IT COUNTS
--
--   tries      every run started, failed ones included
--   succeeded  runs that produced something (done, or since claimed)
--   failed     runs that errored. These do not use up the visitor's free try.
--   claimed    runs moved into an account at sign up or log in
--   guests     distinct guest cookies behind those runs
--
-- The tool list includes worksheet-generator ahead of its guest route, so the
-- panel shows it as zero now and fills in by itself once it ships.
create or replace function admin_guest_try_stats(p_months integer default 12)
returns table (
  month_start date,
  label       text,
  tool        text,
  tries       bigint,
  succeeded   bigint,
  failed      bigint,
  claimed     bigint,
  guests      bigint
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
    select
      d.m::date,
      to_char(d.m, 'Mon YYYY'),
      t.tool,
      count(g.id),
      count(g.id) filter (where g.status in ('done', 'claimed')),
      count(g.id) filter (where g.status = 'failed'),
      count(g.id) filter (where g.status = 'claimed'),
      count(distinct g.guest_id)
    from generate_series(
      date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as d(m)
    cross join (
      values ('slideshow'), ('comprehension-generator'), ('worksheet-generator')
    ) as t(tool)
    -- LEFT join: a quiet month must come back as zeros, not be missing.
    left join trial_generations g
      on g.tool = t.tool
     and g.created_at >= d.m
     and g.created_at < d.m + interval '1 month'
    group by d.m, t.tool
    order by d.m, t.tool;
end;
$$;
revoke execute on function admin_guest_try_stats(integer) from anon, public;
grant execute on function admin_guest_try_stats(integer) to authenticated;

comment on function admin_guest_try_stats(integer) is
  'Free generations from the landing hero per month and tool: tries, succeeded, failed, claimed into an account, distinct guests. Counts only, from trial_generations. Gated on see_stats.';

-- ── Verify after pushing ────────────────────────────────────────────────────
-- As an admin with see_stats:
-- select * from admin_guest_try_stats(3);  -- 9 rows (3 months x 3 tools), no error
