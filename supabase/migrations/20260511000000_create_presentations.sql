create extension if not exists "pgcrypto";

create table if not exists presentations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Slideshow',
  slides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table presentations enable row level security;

-- MVP: open access (no auth yet). Tighten later when auth lands.
create policy "anon read"   on presentations for select using (true);
create policy "anon insert" on presentations for insert with check (true);
create policy "anon update" on presentations for update using (true);
create policy "anon delete" on presentations for delete using (true);
