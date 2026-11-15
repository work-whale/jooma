-- ── Curricula beyond the UK ─────────────────────────────────────────────────
--
-- 1. The teacher's school system, on their profile.
--
--    curriculum_id is an id from the registry in app/lib/curricula (england,
--    jersey, us-tx ...). The registry lives in code and grows with every
--    region, so the database checks only the shape of the id, not the list:
--    a new curriculum needs no migration, and the app parses the value on read
--    (an unknown id falls back to England).
--
--    curriculum_confirmed_at is set when the teacher picks or confirms it.
--    Until then the app shows a one-time "we've set your curriculum to ..."
--    banner over the value it inferred.
--
--    Both are ordinary self-service columns, like first_name and country: the
--    "own profile update" policy covers them, and profiles_guard_privileged_
--    columns() only blocks the columns it names, so no trigger change.
alter table public.profiles
  add column if not exists curriculum_id text,
  add column if not exists curriculum_confirmed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_curriculum_id_format;
alter table public.profiles
  add constraint profiles_curriculum_id_format
  check (curriculum_id is null or (curriculum_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(curriculum_id) <= 40));

-- 2. One switch per region, in Admin > Settings. All off: the UK curricula are
--    always offered and need no switch. Admins see every checked curriculum
--    whatever these say, so a region can be tried on production first.
insert into public.app_settings (key, label, description, section, value, sort)
values
  ('curricula_british_isles', 'Jersey, Guernsey, Isle of Man and Gibraltar',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 1),
  ('curricula_ireland', 'Ireland',
   'Offer the Irish curriculum to every teacher. Admins always see it.', 'curricula', 'false'::jsonb, 2),
  ('curricula_international', 'International programmes (IB, Cambridge, Pearson)',
   'Offer these programmes to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 3),
  ('curricula_australia_nz', 'Australia and New Zealand',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 4),
  ('curricula_usa', 'United States',
   'Offer every US state''s standards to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 5),
  ('curricula_canada', 'Canada',
   'Offer these provinces'' curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 6)
on conflict (key) do nothing;

-- 3. The picker reads the switches through public_settings(), which already
--    hands signed-in teachers the switches they obey. Named one by one, never
--    a LIKE, so a future app_settings row cannot leak out by its name.
create or replace function public_settings()
returns table (key text, value jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select s.key, s.value from app_settings s
  where s.key in (
    'signups_open', 'maintenance_mode', 'google_signin',
    'curricula_british_isles', 'curricula_ireland', 'curricula_international',
    'curricula_australia_nz', 'curricula_usa', 'curricula_canada'
  );
$$;
revoke execute on function public_settings() from public;
grant execute on function public_settings() to anon, authenticated;
