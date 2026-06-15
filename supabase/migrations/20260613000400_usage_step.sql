-- Sub-step attribution for multi-call tools (chiefly the slideshow, which spends
-- on deck text + YouTube + audio + images in one generation). recordUsage /
-- recordAssetCost write an optional `step` label; the breakdown RPC groups by it
-- so the admin Usage page can expand a tool into its contributors.

alter table token_usage add column if not exists step text;
alter table asset_cost  add column if not exists step text;

create or replace function admin_tool_step_breakdown()
returns table (tool_slug text, step text, generations bigint, cost_usd numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    with u as (
      select tu.tool_slug, coalesce(tu.step, 'Main') as step,
             count(*)::bigint as gens, sum(tu.cost_usd) as cost
      from token_usage tu
      where tu.created_at >= date_trunc('month', now())
      group by tu.tool_slug, coalesce(tu.step, 'Main')
      union all
      select ac.tool_slug, coalesce(ac.step, 'Main'),
             0::bigint, sum(ac.cost_usd)
      from asset_cost ac
      where ac.created_at >= date_trunc('month', now())
      group by ac.tool_slug, coalesce(ac.step, 'Main')
    )
    select u.tool_slug, u.step, sum(u.gens)::bigint, sum(u.cost)
    from u
    group by u.tool_slug, u.step
    order by u.tool_slug, sum(u.cost) desc;
end;
$$;
grant execute on function admin_tool_step_breakdown() to authenticated;
