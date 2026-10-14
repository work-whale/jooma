-- Ambassador programme follow-ups: channel verification, the end-of-agreement
-- reminder, and the yearly tax summary.
--
--   ambassador_applications.verified_channels
--       Which of an applicant's channels an admin has checked by hand. Ticked
--       and unticked from the review drawer and the ambassador's dropdown,
--       shown to the ambassador as Verified / Unverified on Payout details.
--       Changing a handle drops its verification, since the account checked is
--       no longer the account on file.
--
--   ambassadors.end_reminder_sent_at
--       The agreement promises "we will write to you a month before it ends".
--       The daily ambassador-terms cron sends that email once and stamps this.
--
--   ambassador_tax_summaries
--       Which yearly tax summaries have been emailed, one per ambassador per UK
--       tax year, so the April email goes exactly once. Written by the cron
--       with the service role; admin-readable only.
--
-- Plus the two email rows for /admin/emails, guarded like the others.

-- ── Channel verification ─────────────────────────────────────────────────────
alter table ambassador_applications
  add column if not exists verified_channels text[] not null default '{}';

alter table ambassador_applications drop constraint if exists ambassador_applications_verified_channels_check;
alter table ambassador_applications
  add constraint ambassador_applications_verified_channels_check
  check (verified_channels <@ array['instagram', 'tiktok', 'x_handle', 'facebook', 'youtube', 'linkedin']::text[]);

comment on column ambassador_applications.verified_channels is
  'Channels an admin has checked by hand (keys: instagram, tiktok, x_handle, facebook, youtube, linkedin). A handle that changes loses its verification.';

create or replace function admin_set_channel_verified(
  p_application_id uuid,
  p_channel        text,
  p_verified       boolean
)
returns text[]
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a      ambassador_applications;
  v_out  text[];
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot verify ambassadors'; end if;

  if p_channel not in ('instagram', 'tiktok', 'x_handle', 'facebook', 'youtube', 'linkedin') then
    raise exception 'unknown channel';
  end if;

  select * into a from ambassador_applications where id = p_application_id for update;
  if a.id is null then raise exception 'no such application'; end if;

  -- Nothing to verify on a channel they did not give.
  if p_verified and (to_jsonb(a) ->> p_channel) is null then
    raise exception 'they have not given that channel';
  end if;

  update ambassador_applications
     set verified_channels = case
           when p_verified then array(select distinct unnest(verified_channels || p_channel) order by 1)
           else array_remove(verified_channels, p_channel)
         end,
         updated_at = now()
   where id = p_application_id
  returning verified_channels into v_out;

  perform admin_log(
    format('%s ambassador channel %s', case when p_verified then 'Verified' else 'Unverified' end, p_channel),
    'billing', 'ambassador_application', p_application_id::text,
    btrim(a.first_name || ' ' || a.last_name),
    jsonb_build_object('channel', p_channel, 'verified', p_verified)
  );

  return v_out;
end;
$$;
revoke execute on function admin_set_channel_verified(uuid, text, boolean) from anon, public;
grant execute on function admin_set_channel_verified(uuid, text, boolean) to authenticated;


-- The ambassador's own edit: as before, plus a changed handle loses its tick.
create or replace function update_my_ambassador_details(p_section text, payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_method text := payload->>'payout_method';
  a        ambassador_applications;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into a
  from ambassador_applications
  where user_id = auth.uid() and status in ('pending', 'approved')
  order by submitted_at desc
  limit 1;
  v_id := a.id;
  if v_id is null then raise exception 'no application to update'; end if;

  if p_section = 'personal' then
    update ambassador_applications set
      email        = lower(btrim(payload->>'email')),
      mobile       = btrim(payload->>'mobile'),
      address_line = btrim(payload->>'address_line'),
      town         = btrim(payload->>'town'),
      postcode     = upper(btrim(payload->>'postcode')),
      school       = nullif(btrim(coalesce(payload->>'school', '')), ''),
      teaches      = nullif(btrim(coalesce(payload->>'teaches', '')), ''),
      updated_at   = now()
    where id = v_id;
  elsif p_section = 'channels' then
    update ambassador_applications set
      instagram  = nullif(btrim(coalesce(payload->>'instagram', '')), ''),
      tiktok     = nullif(btrim(coalesce(payload->>'tiktok', '')), ''),
      x_handle   = nullif(btrim(coalesce(payload->>'x_handle', '')), ''),
      facebook   = nullif(btrim(coalesce(payload->>'facebook', '')), ''),
      youtube    = nullif(btrim(coalesce(payload->>'youtube', '')), ''),
      linkedin   = nullif(btrim(coalesce(payload->>'linkedin', '')), ''),
      reach      = payload->>'reach',
      note       = nullif(btrim(coalesce(payload->>'note', '')), ''),
      -- Keep a tick only where the handle on file is unchanged.
      verified_channels = array(
        select c from unnest(a.verified_channels) as c
        where (to_jsonb(a) ->> c) is not distinct from nullif(btrim(coalesce(payload->>c, '')), '')
          and nullif(btrim(coalesce(payload->>c, '')), '') is not null
      ),
      updated_at = now()
    where id = v_id;
  elsif p_section = 'payout' then
    update ambassador_applications set
      payout_method     = v_method,
      account_holder    = btrim(payload->>'account_holder'),
      sort_code         = case when v_method = 'bank' then payload->>'sort_code' end,
      account_number    = case when v_method = 'bank' then payload->>'account_number' end,
      bank_name         = case when v_method = 'bank' then nullif(btrim(coalesce(payload->>'bank_name', '')), '') end,
      paypal_email      = case when v_method = 'paypal' then lower(btrim(payload->>'paypal_email')) end,
      payout_changed_at = now(),
      updated_at        = now()
    where id = v_id;
  elsif p_section = 'tax' then
    update ambassador_applications set
      tax_status = payload->>'tax_status',
      utr        = coalesce(nullif(btrim(coalesce(payload->>'utr', '')), ''), utr),
      updated_at = now()
    where id = v_id;
  else
    raise exception 'unknown section';
  end if;
end;
$$;
revoke execute on function update_my_ambassador_details(text, jsonb) from anon, public;
grant execute on function update_my_ambassador_details(text, jsonb) to authenticated;


-- Their own details now also say which channels are verified. Return type
-- changes, so drop and recreate.
drop function if exists my_ambassador_details();

create function my_ambassador_details()
returns table (
  first_name        text,
  last_name         text,
  email             text,
  mobile            text,
  address_line      text,
  town              text,
  postcode          text,
  school            text,
  teaches           text,
  instagram         text,
  tiktok            text,
  x_handle          text,
  facebook          text,
  youtube           text,
  linkedin          text,
  reach             text,
  note              text,
  payout_method     text,
  account_holder    text,
  sort_code         text,
  account_last4     text,
  bank_name         text,
  paypal_email      text,
  payout_changed_at timestamptz,
  tax_status        text,
  has_utr           boolean,
  agreement_version text,
  signature_name    text,
  signed_at         timestamptz,
  verified_channels text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.first_name, a.last_name, a.email, a.mobile, a.address_line, a.town, a.postcode,
    a.school, a.teaches,
    a.instagram, a.tiktok, a.x_handle, a.facebook, a.youtube, a.linkedin, a.reach, a.note,
    a.payout_method, a.account_holder, a.sort_code, right(a.account_number, 4), a.bank_name,
    a.paypal_email, a.payout_changed_at,
    a.tax_status, a.utr is not null,
    a.agreement_version, a.signature_name, a.signed_at,
    a.verified_channels
  from ambassador_applications a
  where a.user_id = auth.uid() and auth.uid() is not null
    and a.status in ('pending', 'approved')
  order by a.submitted_at desc
  limit 1;
$$;
revoke execute on function my_ambassador_details() from anon, public;
grant execute on function my_ambassador_details() to authenticated;


-- ── The end-of-agreement reminder ────────────────────────────────────────────
alter table ambassadors
  add column if not exists end_reminder_sent_at timestamptz;

comment on column ambassadors.end_reminder_sent_at is
  'When the "your agreement ends in a month" email went out. Set by the ambassador-terms cron, once.';


-- ── Yearly tax summaries ─────────────────────────────────────────────────────
create table if not exists ambassador_tax_summaries (
  id             uuid primary key default gen_random_uuid(),
  ambassador_id  uuid not null references ambassadors (id) on delete cascade,
  -- "2025 to 2026": 6 April to 5 April, as app/lib/ambassador-commission.ts
  -- (taxYearOf) labels it.
  tax_year       text not null check (tax_year ~ '^[0-9]{4} to [0-9]{4}$'),
  paid_pence     integer not null,
  payments       integer not null,
  sent_at        timestamptz not null default now(),
  unique (ambassador_id, tax_year)
);

alter table ambassador_tax_summaries enable row level security;
revoke all on ambassador_tax_summaries from anon, authenticated;

drop policy if exists "admins read ambassador tax summaries" on ambassador_tax_summaries;
create policy "admins read ambassador tax summaries" on ambassador_tax_summaries
  for select using (is_admin());
grant select on ambassador_tax_summaries to authenticated;


-- ── Email rows ───────────────────────────────────────────────────────────────
insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_agreement_ending', 'Ambassador agreement ending',
       'A month before an ambassador''s twelve-month agreement ends, from the daily ambassador-terms cron. Asks whether they want to carry on.',
       'Your Jooma Ambassador agreement ends next month', true, 11
where not exists (select 1 from email_templates where key = 'ambassador_agreement_ending');

insert into email_templates (key, name, trigger_description, subject, live, sort)
select 'ambassador_tax_summary', 'Ambassador yearly tax summary',
       'Each April, for every ambassador paid in the tax year just ended, from the daily ambassador-terms cron. Their total paid, for their self assessment.',
       'Your Jooma Ambassador tax summary for {{taxYear}}', true, 12
where not exists (select 1 from email_templates where key = 'ambassador_tax_summary');
