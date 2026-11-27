-- ── Curricula Stage 3: one release switch per batch ─────────────────────────
--
-- Stage 3 adds the workbook's "3 Later" countries in five batches
-- (docs/curricula-stage3-plan.md). The Stage 2 region switches are already on,
-- so a Stage 3 country placed in "Middle East" or "Europe" would show the
-- moment it merged. Each batch therefore has its own switch as well, and a
-- teacher sees a Stage 3 entry only when its region AND its batch are on
-- (app/lib/curricula/index.ts, isOffered). Admins see every entry regardless.
--
-- Nothing a teacher sees changes when this is pushed: every switch starts off,
-- and the live code ignores keys it does not know.
--
-- 1. The five switches, in their own Admin > Settings section.
insert into public.app_settings (key, label, description, section, value, sort)
values
  ('curricula_s3_a', 'Stage 3 batch A: Gulf, Middle East and Türkiye',
   'Offer this batch to every teacher (its region must be on too). Admins always see it.', 'curricula_releases', 'false'::jsonb, 1),
  ('curricula_s3_b', 'Stage 3 batch B: Asia',
   'Offer this batch to every teacher (its region must be on too). Admins always see it.', 'curricula_releases', 'false'::jsonb, 2),
  ('curricula_s3_c', 'Stage 3 batch C: Europe',
   'Offer this batch to every teacher (its region must be on too). Admins always see it.', 'curricula_releases', 'false'::jsonb, 3),
  ('curricula_s3_d', 'Stage 3 batch D: Latin America',
   'Offer this batch to every teacher (its region must be on too). Admins always see it.', 'curricula_releases', 'false'::jsonb, 4),
  ('curricula_s3_e', 'Stage 3 batch E: Africa',
   'Offer this batch to every teacher (its region must be on too). Admins always see it.', 'curricula_releases', 'false'::jsonb, 5)
on conflict (key) do nothing;

-- Europe now holds more than Malta (Türkiye in batch A, then batch C).
update public.app_settings set label = 'Europe' where key = 'curricula_europe' and label = 'Europe (Malta)';

-- 2. The picker reads the switches through public_settings(). Same function as
--    20261124000000_curricula_stage2_regions.sql with the five new keys added,
--    named one by one, never by pattern, so a future app_settings row cannot
--    leak out by its name.
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
    'curricula_australia_nz', 'curricula_usa', 'curricula_canada',
    'curricula_africa', 'curricula_asia', 'curricula_caribbean',
    'curricula_europe', 'curricula_middle_east',
    'curricula_s3_a', 'curricula_s3_b', 'curricula_s3_c',
    'curricula_s3_d', 'curricula_s3_e'
  );
$$;
revoke execute on function public_settings() from public;
grant execute on function public_settings() to anon, authenticated;
