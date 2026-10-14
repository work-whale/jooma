-- The three ambassador programme emails, so /admin/emails lists them: an admin can
-- reword the subject or opening paragraph, preview them, and pause any of them.
--
--   ambassador_application_received   app/api/ambassadors/apply
--   ambassador_approved               app/api/admin/ambassadors/applications/[id]
--   ambassador_declined               app/api/admin/ambassadors/applications/[id]
--
-- The wording lives in app/lib/email-templates/ambassador*.ts. A missing row is
-- treated as live with that wording, so all three already sent before this ran; the
-- rows only make them visible and editable. Data only, no schema change.
-- Guarded like the other template seeds, so a re-run changes nothing and an
-- admin's edits are never overwritten.

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_application_received', 'Ambassador application received',
       'Someone signs and sends an ambassador application. Their receipt: the code they asked for, how they will be paid, and a link to the agreement they signed.',
       'We have your Jooma Ambassador application', true, 8
where not exists (select 1 from email_templates where key = 'ambassador_application_received');

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_approved', 'Ambassador approved',
       'An admin approves an ambassador application. Carries their live code, the share link, and when their agreement and free Pro end.',
       'You''re a Jooma Ambassador', true, 9
where not exists (select 1 from email_templates where key = 'ambassador_approved');

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_declined', 'Ambassador declined',
       'An admin declines an ambassador application. Quotes the reason typed in the review drawer, when there is one, and confirms their account is unchanged.',
       'Your Jooma Ambassador application', true, 10
where not exists (select 1 from email_templates where key = 'ambassador_declined');
