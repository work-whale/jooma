-- Per-user history of AI tool generations. Every generation/refine is saved
-- (unlimited). Keyed to auth.users; RLS-scoped to the owner.

create table if not exists tool_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  tool_slug text not null,
  title text,
  input jsonb not null,
  output text not null,
  created_at timestamptz not null default now()
);

alter table tool_runs enable row level security;

create index tool_runs_user_tool_idx on tool_runs (user_id, tool_slug, created_at desc);

create policy "own runs read"
  on tool_runs for select using (auth.uid() = user_id);

create policy "own runs insert"
  on tool_runs for insert with check (auth.uid() = user_id);

create policy "own runs delete"
  on tool_runs for delete using (auth.uid() = user_id);
