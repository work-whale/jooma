-- Jooma 4.5: the switch for the automatic teacher emails (E1 to E14), moved
-- from the Vercel variable LIFECYCLE_EMAILS into Admin, Emails & templates
-- (owner, 20 Nov).
--
--   value = { "enabled": <master switch>, "off": [<emails turned off on their own>] }
--
-- Saved through the existing admin_set_setting() (admin only, audit logged)
-- and read by the lifecycle cron under the service role
-- (app/lib/lifecycle-switch.ts). Anything unreadable there reads as OFF.
-- Section 'emails' is hidden on /admin/settings: Emails & templates is its
-- only editor. Not in public_settings(): nothing signed out needs it.
--
-- Starts OFF, so pushing this sends nothing on its own.

insert into public.app_settings (key, label, description, section, value, sort)
values (
  'lifecycle_emails',
  'Automatic teacher emails',
  'Master switch and per email on/off for the 4.5 trial, Free and billing emails. Edited on Emails & templates.',
  'emails',
  '{"enabled": false, "off": []}'::jsonb,
  40
)
on conflict (key) do nothing;

-- ── Verify after pushing ────────────────────────────────────────────────────
-- select key, value from app_settings where key = 'lifecycle_emails';
--   -- lifecycle_emails | {"off": [], "enabled": false}
