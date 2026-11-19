-- Typical resources per saved resource, per tool, for app/lib/tool-estimates.ts.
--
-- READ-ONLY. Run it against PRODUCTION (real usage) in the Supabase SQL editor
-- or through the MCP, then copy the figures into TOOL_ESTIMATES by hand.
-- 1 resource = 0.15p of model spend (PENCE_PER_CREDIT in app/lib/plans.ts);
-- USD to GBP at 0.79, the same rate monthly_ai_spend uses.
--
-- Spend is everything a tool logged (token_usage + asset_cost); it is divided
-- by the resources actually SAVED (tool_runs), so abandoned runs are spread
-- over the finished ones. The slideshow folds in its helper routes, and its
-- text-only figure leaves out generated pictures, which are estimated per
-- picture instead (the last column).

with spend as (
  select case
           when tool_slug in ('generate-slideshow', 'generate-outline', 'generate-image',
                              'generate-audio', 'find-youtube') then 'slideshow'
           else tool_slug
         end as slug,
         sum(cost_usd) as c
  from (
    select tool_slug, cost_usd from token_usage where created_at > now() - interval '90 days'
    union all
    select tool_slug, cost_usd from asset_cost where created_at > now() - interval '90 days'
  ) x
  group by 1
), deck_img as (
  select sum(cost_usd) as c, count(*) as n
  from asset_cost
  where kind = 'image'
    and tool_slug in ('generate-slideshow', 'generate-image')
    and created_at > now() - interval '90 days'
), saved as (
  select tool_slug as slug, count(*) as n
  from tool_runs
  where created_at > now() - interval '90 days'
  group by 1
)
select s.slug,
       sv.n as saved,
       round((s.c / sv.n)::numeric * 79 / 0.15, 1) as resources_per_saved,
       case when s.slug = 'slideshow'
            then round(((s.c - (select c from deck_img)) / sv.n)::numeric * 79 / 0.15, 1)
       end as deck_text_only,
       (select round((c / nullif(n, 0))::numeric * 79 / 0.15, 1) from deck_img) as resources_per_picture
from spend s
join saved sv on sv.slug = s.slug
order by s.slug;
