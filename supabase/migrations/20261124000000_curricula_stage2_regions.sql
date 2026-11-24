-- ── Curricula Stage 2: five more regions ────────────────────────────────────
--
-- Stage 2 adds the workbook's "2 Soon" countries (docs/curricula-stage2-plan.md)
-- in five new regions: Africa, Asia, the Caribbean, Europe (Malta) and the
-- Middle East. Each gets the same kind of switch the first six regions have
-- (20261114000000_curricula.sql): one boolean app_settings row, off, edited in
-- Admin > Settings > Curricula by region.
--
-- Nothing a teacher sees changes when this is pushed: every switch starts off,
-- and no curriculum is attached to these regions until the entries are built.
--
-- 1. The five switches.
insert into public.app_settings (key, label, description, section, value, sort)
values
  ('curricula_africa', 'Africa',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 7),
  ('curricula_asia', 'Asia',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 8),
  ('curricula_caribbean', 'Caribbean',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 9),
  ('curricula_europe', 'Europe (Malta)',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 10),
  ('curricula_middle_east', 'Middle East',
   'Offer these curricula to every teacher. Admins always see them.', 'curricula', 'false'::jsonb, 11)
on conflict (key) do nothing;

-- 2. The picker reads the switches through public_settings(). Same function as
--    20261114000000_curricula.sql with the five new keys added, named one by
--    one, never by pattern, so a future app_settings row cannot leak out by
--    its name. Redefined here in full because a key list cannot be appended to.
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
    'curricula_europe', 'curricula_middle_east'
  );
$$;
revoke execute on function public_settings() from public;
grant execute on function public_settings() to anon, authenticated;
