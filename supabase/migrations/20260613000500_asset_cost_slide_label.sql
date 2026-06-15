-- Per-slide attribution for asset cost (chiefly slideshow images, which are
-- generated one-per-slide). recordAssetCost writes the slide title in
-- `slide_label`; the breakdown RPC returns it so the admin Usage page can nest
-- the slideshow into per-slide image costs plus deck-level shared items
-- (deck text / audio / youtube are single calls and stay slide_label = null).

alter table asset_cost add column if not exists slide_label text;

drop function if exists admin_tool_step_breakdown();
create function admin_tool_step_breakdown()
returns table (tool_slug text, step text, slide_label text, generations bigint, cost_usd numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    with u as (
      select tu.tool_slug, coalesce(tu.step, 'Main') as step, null::text as slide_label,
             count(*)::bigint as gens, sum(tu.cost_usd) as cost
      from token_usage tu
      where tu.created_at >= date_trunc('month', now())
      group by tu.tool_slug, coalesce(tu.step, 'Main')
      union all
      select ac.tool_slug, coalesce(ac.step, 'Main'), ac.slide_label,
             0::bigint, sum(ac.cost_usd)
      from asset_cost ac
      where ac.created_at >= date_trunc('month', now())
      group by ac.tool_slug, coalesce(ac.step, 'Main'), ac.slide_label
    )
    select u.tool_slug, u.step, u.slide_label, sum(u.gens)::bigint, sum(u.cost)
    from u
    group by u.tool_slug, u.step, u.slide_label
    order by u.tool_slug, sum(u.cost) desc;
end;
$$;
grant execute on function admin_tool_step_breakdown() to authenticated;
