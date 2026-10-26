-- ── Annual trial email: the yearly price, the date, and the way to monthly ─────
--
-- Since yearly billing launched (2026-10-06) every annual trial ended in a
-- declined first charge: insufficient funds, a revoked authorisation, and a
-- decline followed by a "too expensive" cancellation. Every monthly first charge
-- in the same window went through. The trial is three days, too short for
-- Stripe's own trial reminder (seven days or more), so nothing told them a
-- £71.99 charge was coming.
--
-- So the webhook now emails anyone who starts an annual trial, the moment
-- Checkout completes: what they will be charged, when, and a one-click switch
-- to monthly, which during the trial is free and immediate.
--
-- 1. profiles.annual_trial_email_sent_at
--
--    The once-only claim. Stripe can deliver checkout.session.completed more
--    than once, so the webhook stamps this with a conditional update (where it
--    is still null) and only the update that changed a row sends. Same pattern
--    as invoices.meta_reported_at.
--
--    Deliberately NOT added to profiles_guard_privileged_columns. A teacher
--    editing it on their own row can only suppress or re-arm their own email,
--    and the email is only ever sent from a Stripe checkout, so there is
--    nothing to escalate. Recreating that guard to add it would mean retyping a
--    security function for no gain.
--
-- 2. The email_templates row, so /admin/emails lists it and an admin can edit
--    the subject and opening, or pause it. Wording in
--    app/lib/email-templates/annualTrialStarted.ts. Guarded like the other
--    seeds, so a re-run changes nothing and an admin's edits are kept.

alter table profiles
  add column if not exists annual_trial_email_sent_at timestamptz;

comment on column profiles.annual_trial_email_sent_at is
  'When the annual trial email went out. Set by the Stripe webhook as a once-only claim; null means not sent.';

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'annual_trial_started', 'Annual trial started',
       'A teacher completes checkout for a free trial on a yearly plan. Says what the first charge will be and when, and links straight to switching to monthly, which is free during the trial.',
       'Your Jooma trial: {{amount}} for the year on {{chargeDate}}', true, 23
where not exists (select 1 from email_templates where key = 'annual_trial_started');
