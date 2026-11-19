-- Jooma 4.5 Step 7: the cookie banner's choice, kept on the profile so that
-- server-side Meta events (sent from webhooks, with no browser to read the
-- cookie from) follow it. Null means no choice yet, which sends nothing.
-- Written by /api/consent and /api/trial/start with the service role.

alter table public.profiles
  add column if not exists ads_consent text
    check (ads_consent in ('accepted', 'rejected')),
  add column if not exists ads_consent_at timestamptz;

comment on column public.profiles.ads_consent is
  'Cookie banner choice for Meta advertising (accepted or rejected). Null: no choice, no Meta events.';
