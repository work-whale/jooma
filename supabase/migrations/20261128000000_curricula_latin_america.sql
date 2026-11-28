-- ── Curricula Stage 3 batch D: the Latin America region ─────────────────────
--
-- Batch D (docs/curricula-stage3-build.md, "Batch D") puts Mexico, Brazil,
-- Argentina, Chile, Colombia and Peru under a new picker heading, Latin
-- America. As with every region, it has one boolean switch in Admin >
-- Settings > Curricula by region.
--
-- This switch starts ON (owner, 2026-11-28): the region holds only batch D, and
-- a teacher sees a batch D entry only when its release switch,
-- curricula_s3_d (seeded false by 20261127000000), is on as well. Releasing
-- the batch is then one switch, as for batches A to C. Nothing a teacher sees
-- changes when this is pushed.
--
-- 1. The region switch.
insert into public.app_settings (key, label, description, section, value, sort)
values
  ('curricula_latin_america', 'Latin America',
   'Offer these curricula to every teacher (Stage 3 entries also need their batch on). Admins always see them.', 'curricula', 'true'::jsonb, 12)
on conflict (key) do nothing;

-- 2. The picker reads the switches through public_settings(). Same function as
--    20261127000000_curricula_stage3_releases.sql with the new key added,
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
    'curricula_europe', 'curricula_middle_east', 'curricula_latin_america',
    'curricula_s3_a', 'curricula_s3_b', 'curricula_s3_c',
    'curricula_s3_d', 'curricula_s3_e'
  );
$$;
revoke execute on function public_settings() from public;
grant execute on function public_settings() to anon, authenticated;
