create extension if not exists "pgcrypto";

create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  style text,
  data_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists generated_images_prompt_idx
  on generated_images (lower(prompt));

create index if not exists generated_images_created_at_idx
  on generated_images (created_at desc);

alter table generated_images enable row level security;

-- MVP: open access (no auth yet). Tighten later when auth lands.
create policy "anon read"   on generated_images for select using (true);
create policy "anon insert" on generated_images for insert with check (true);
create policy "anon delete" on generated_images for delete using (true);
