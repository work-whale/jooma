-- Accurate per-generation token + cost telemetry. One row per OpenAI text call,
-- written server-side from the route handler where completion.usage is the exact
-- count OpenAI bills on (NOT a tiktoken estimate). Decoupled from tool_runs
-- because that row is created client-side after the stream ends, where usage is
-- not available. See app/lib/usage.ts for the recorder.

create table if not exists token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- Matches tool_runs.tool_slug / the route's pathname so reports can join or
  -- group by tool.
  tool_slug text not null,
  model text not null,
  -- Exact counts from completion.usage. cached_tokens is the slice of
  -- prompt_tokens that hit OpenAI's prompt cache (billed at half rate on gpt-4o),
  -- kept separate so cost_usd stays correct.
  prompt_tokens integer not null,
  cached_tokens integer not null default 0,
  completion_tokens integer not null,
  -- Dollar cost computed at write time from the pricing table in usage.ts, so the
  -- figure is frozen even if prices change later.
  cost_usd numeric(10, 6) not null,
  created_at timestamptz not null default now()
);

alter table token_usage enable row level security;

create index token_usage_user_tool_idx on token_usage (user_id, tool_slug, created_at desc);
create index token_usage_tool_idx on token_usage (tool_slug, created_at desc);

-- Users may read their own usage; inserts are server-side (the recorder uses the
-- caller's session, so auth.uid() = user_id holds). No update/delete policy —
-- telemetry is append-only.
create policy "own usage read"
  on token_usage for select using (auth.uid() = user_id);

create policy "own usage insert"
  on token_usage for insert with check (auth.uid() = user_id);

-- Per-user, per-tool report for the current calendar month: how many
-- generations, total tokens, total $ and average $ per generation. security
-- invoker so auth.uid() scopes it to the caller under RLS. Mirrors
-- my_generation_count_this_month().
create or replace function my_tool_usage_report()
returns table (
  tool_slug text,
  generations bigint,
  prompt_tokens bigint,
  cached_tokens bigint,
  completion_tokens bigint,
  total_tokens bigint,
  cost_usd numeric,
  avg_cost_usd numeric
)
language sql
stable
security invoker
as $$
  select
    tool_slug,
    count(*) as generations,
    sum(prompt_tokens) as prompt_tokens,
    sum(cached_tokens) as cached_tokens,
    sum(completion_tokens) as completion_tokens,
    sum(prompt_tokens + completion_tokens) as total_tokens,
    sum(cost_usd) as cost_usd,
    avg(cost_usd) as avg_cost_usd
  from token_usage
  where user_id = auth.uid()
    and created_at >= date_trunc('month', now())
  group by tool_slug
  order by cost_usd desc;
$$;

grant execute on function my_tool_usage_report() to authenticated;
