-- Per-unit cost telemetry for non-text assets: AI images and TTS audio. These
-- are NOT billed per token (images = flat rate per model/size/quality; tts-1 =
-- $/character), so they can't live in token_usage. One row per asset-producing
-- call, written server-side. See recordAssetCost() in app/lib/usage.ts.

create table if not exists asset_cost (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- Same slug space as token_usage so the report can group both per tool.
  tool_slug text not null,
  kind text not null check (kind in ('image', 'audio')),
  -- For 'image' this is the image count; for 'audio' the character count fed to
  -- tts-1. Informational — cost_usd is the source of truth.
  units integer not null default 0,
  -- Dollar cost computed at write time (image table in ai-image.ts / tts char
  -- rate), frozen against later price changes.
  cost_usd numeric(10, 6) not null,
  created_at timestamptz not null default now()
);

alter table asset_cost enable row level security;

create index asset_cost_user_tool_idx on asset_cost (user_id, tool_slug, created_at desc);
create index asset_cost_tool_idx on asset_cost (tool_slug, created_at desc);

drop policy if exists "own asset cost read" on asset_cost;
create policy "own asset cost read"
  on asset_cost for select using (auth.uid() = user_id);

drop policy if exists "own asset cost insert" on asset_cost;
create policy "own asset cost insert"
  on asset_cost for insert with check (auth.uid() = user_id);

-- Replace the report to combine token (text) cost with per-unit (image/audio)
-- cost per tool for the current month. text_cost_usd and asset_cost_usd are
-- broken out; cost_usd is the all-in total. full outer join so a tool with only
-- assets (or only text) still appears. DROP first because the prior migration's
-- version has a different return shape (create or replace can't change that).
drop function if exists my_tool_usage_report();
create function my_tool_usage_report()
returns table (
  tool_slug text,
  generations bigint,
  total_tokens bigint,
  text_cost_usd numeric,
  asset_cost_usd numeric,
  cost_usd numeric
)
language sql
stable
security invoker
as $$
  with t as (
    select
      tool_slug,
      count(*) as generations,
      sum(prompt_tokens + completion_tokens) as total_tokens,
      sum(cost_usd) as text_cost
    from token_usage
    where user_id = auth.uid()
      and created_at >= date_trunc('month', now())
    group by tool_slug
  ),
  a as (
    select
      tool_slug,
      sum(cost_usd) as asset_cost
    from asset_cost
    where user_id = auth.uid()
      and created_at >= date_trunc('month', now())
    group by tool_slug
  )
  select
    coalesce(t.tool_slug, a.tool_slug) as tool_slug,
    coalesce(t.generations, 0) as generations,
    coalesce(t.total_tokens, 0) as total_tokens,
    coalesce(t.text_cost, 0) as text_cost_usd,
    coalesce(a.asset_cost, 0) as asset_cost_usd,
    coalesce(t.text_cost, 0) + coalesce(a.asset_cost, 0) as cost_usd
  from t
  full outer join a on t.tool_slug = a.tool_slug
  order by cost_usd desc;
$$;

grant execute on function my_tool_usage_report() to authenticated;
