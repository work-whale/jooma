-- User profiles, keyed to Supabase Auth users. Populated on /complete-profile
-- after sign-up. Unlike the MVP tables, this one is RLS-scoped to the owner.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  surname text not null,
  dial_code text,
  phone text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile read"
  on profiles for select using (auth.uid() = id);

create policy "own profile insert"
  on profiles for insert with check (auth.uid() = id);

create policy "own profile update"
  on profiles for update using (auth.uid() = id);
