-- ── Emails & templates: bulk email from the admin console ──────────────────────
--
-- Until now Jooma only sent transactional mail (email_templates, /admin/emails).
-- This adds the other half: an admin writing to many people at once. Marketing,
-- notices, general information, and nudging accounts that never finished
-- signing up.
--
-- What lands here:
--
--   email_broadcast_templates  reusable wording an admin starts a send from
--   email_campaigns            one send: a SNAPSHOT of the wording, an audience,
--                              a schedule and the running counts
--   email_campaign_recipients  one row per person per send. The unique index is
--                              what stops anyone getting the same email twice,
--                              and the per-row token is the unsubscribe credential
--   email_opt_outs             who asked not to hear from us, by address
--   email_automations          the automatic signup reminders (off by default)
--
-- WHO CAN DO WHAT
--
--   * Reading and writing templates, counting an audience, creating a campaign,
--     cancelling one: definer RPCs guarded by admin_require_section on the new
--     send_email_campaigns permission (super_admin and marketing).
--   * Turning an audience into addresses, claiming a batch, recording outcomes,
--     enqueuing automations: definer functions granted to service_role ONLY.
--     The Next routes call them after requireAdminRoute('send_email_campaigns'),
--     the cron after CRON_SECRET. Recipient addresses therefore never reach a
--     browser, which is what lets the marketing role send without seeing
--     teacher data.
--   * Unsubscribing: email_unsubscribe(token), granted to anon. The credential is
--     an unguessable per-recipient uuid, it is idempotent, and it answers only
--     "did that token exist", so it cannot be used to ask about an address. The
--     route in front of it adds a per-IP throttle and a honeypot.
--
-- PURPOSES
--
--   marketing, signup_reminder, information  skip anyone in email_opt_outs and
--                                            carry an unsubscribe link
--   notice                                   account, service or legal notices.
--                                            Sent regardless of opt-outs, which
--                                            is why the UI says so beside it
--
-- Every audience excludes suspended accounts and accounts scheduled for
-- deletion. Someone on their way out is not a marketing target.

-- ── 1. Tables ────────────────────────────────────────────────────────────────

create table if not exists email_broadcast_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  purpose     text not null
                check (purpose in ('marketing', 'signup_reminder', 'information', 'notice')),
  subject     text not null default '',
  preheader   text not null default '',
  heading     text not null default '',
  body        text not null default '',
  cta_label   text not null default '',
  cta_url     text not null default '',
  archived    boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table email_broadcast_templates enable row level security;

create table if not exists email_campaigns (
  id               uuid primary key default gen_random_uuid(),
  purpose          text not null
                     check (purpose in ('marketing', 'signup_reminder', 'information', 'notice')),
  template_id      uuid references email_broadcast_templates(id) on delete set null,
  -- A snapshot, not a reference: editing a template after the fact must not
  -- rewrite what the history says went out.
  subject          text not null,
  preheader        text not null default '',
  heading          text not null default '',
  body             text not null,
  cta_label        text not null default '',
  cta_url          text not null default '',
  -- {"kind": "all_teachers" | "free" | "paying" | "incomplete_signups" | "emails",
  --  "emails": [...]} for a manual send, {"kind": "automation"} for a nudge.
  audience         jsonb not null,
  audience_label   text not null,
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_for    timestamptz not null default now(),
  -- email_automations.key when the cron created this, null for a manual send.
  automation       text,
  recipient_count  integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  skipped_count    integer not null default 0,
  materialised_at  timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
alter table email_campaigns enable row level security;
create index if not exists email_campaigns_due_idx on email_campaigns (status, scheduled_for);
create index if not exists email_campaigns_created_idx on email_campaigns (created_at desc);

create table if not exists email_campaign_recipients (
  id           bigint generated always as identity primary key,
  campaign_id  uuid not null references email_campaigns(id) on delete cascade,
  -- Cascade, not set null: when an account is deleted its address should leave
  -- the send history too. The campaign keeps its counts, which are not personal.
  user_id      uuid references auth.users(id) on delete cascade,
  email        text not null,
  first_name   text,
  status       text not null default 'pending'
                 check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error        text,
  claimed_at   timestamptz,
  sent_at      timestamptz,
  unsub_token  uuid not null default gen_random_uuid() unique
);
alter table email_campaign_recipients enable row level security;
create unique index if not exists email_campaign_recipients_once
  on email_campaign_recipients (campaign_id, lower(email));
create index if not exists email_campaign_recipients_status_idx
  on email_campaign_recipients (campaign_id, status);
create index if not exists email_campaign_recipients_email_idx
  on email_campaign_recipients (lower(email));

create table if not exists email_opt_outs (
  email       text primary key check (email = lower(email)),
  source      text not null default 'link' check (source in ('link', 'one_click', 'admin')),
  created_at  timestamptz not null default now()
);
alter table email_opt_outs enable row level security;

create table if not exists email_automations (
  key          text primary key,
  name         text not null,
  description  text not null,
  template_id  uuid references email_broadcast_templates(id) on delete set null,
  live         boolean not null default false,
  delay_hours  integer not null check (delay_hours between 1 and 2160),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);
alter table email_automations enable row level security;

-- No policies on any of the five. RLS on with nothing granted means only the
-- definer functions below and the service role reach them.

-- ── 2. Unsubscribe throttle ──────────────────────────────────────────────────
-- /api/email/unsubscribe throttles by IP through auth_rate, under its own kind so
-- it never eats into the password reset allowance of a shared school network.
alter table auth_rate drop constraint if exists auth_rate_kind_check;
alter table auth_rate add constraint auth_rate_kind_check
  check (kind in ('ip', 'email', 'unsub_ip'));

-- ── 3. Permission ────────────────────────────────────────────────────────────
insert into role_permissions (role, permission, allowed)
values
  ('super_admin', 'send_email_campaigns', true),
  ('support',     'send_email_campaigns', false),
  ('finance',     'send_email_campaigns', false),
  ('marketing',   'send_email_campaigns', true)
on conflict (role, permission) do nothing;

-- ── 4. Who is an incomplete signup ───────────────────────────────────────────
-- The filter used to live only inside admin_incomplete_signups(). The audience
-- resolver needs exactly the same definition, and two copies would drift, so it
-- moves here and both read it. Internal: no grants.
create or replace function incomplete_signup_users()
returns table (id uuid, email text, created_at timestamptz, provider text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email::text, u.created_at,
         coalesce(u.raw_app_meta_data ->> 'provider', 'email')
  from auth.users u
  left join profiles p on p.id = u.id
  where p.id is null
    and u.deleted_at is null
    and not exists (
      select 1 from pending_invites i
      where lower(i.email) = lower(u.email::text)
        and i.accepted_at is null
    );
$$;
revoke execute on function incomplete_signup_users() from anon, authenticated, public;

create or replace function admin_incomplete_signups()
returns table (
  id           uuid,
  email        text,
  created_at   timestamptz,
  provider     text,
  generations  bigint
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select s.id, s.email, s.created_at, s.provider, coalesce(r.gens, 0)
    from incomplete_signup_users() s
    left join (
      select tr.user_id, count(*) as gens from tool_runs tr group by tr.user_id
    ) r on r.user_id = s.id
    order by r.gens desc nulls last, s.created_at desc;
end;
$$;
revoke execute on function admin_incomplete_signups() from anon, public;
grant execute on function admin_incomplete_signups() to authenticated;

-- ── 5. Audience resolver ─────────────────────────────────────────────────────
-- The one place an audience becomes people. Internal: no grants. Counting and
-- materialising both go through it, so the number shown before sending is the
-- number that gets sent.
create or replace function email_audience_members(p_audience jsonb, p_purpose text)
returns table (user_id uuid, email text, first_name text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_kind    text := p_audience ->> 'kind';
  v_respect boolean := p_purpose <> 'notice';
  v_emails  text[];
  v_after   timestamptz := nullif(p_audience ->> 'created_after', '')::timestamptz;
  v_before  timestamptz := nullif(p_audience ->> 'created_before', '')::timestamptz;
begin
  if v_kind = 'incomplete_signups' then
    return query
      select s.id, lower(s.email), null::text
      from incomplete_signup_users() s
      where s.email is not null
        and (v_after is null or s.created_at > v_after)
        and (v_before is null or s.created_at <= v_before)
        and (not v_respect or not exists (
          select 1 from email_opt_outs o where o.email = lower(s.email)));
    return;
  end if;

  if v_kind = 'emails' then
    select coalesce(array_agg(distinct lower(btrim(x))), array[]::text[])
      into v_emails
    from jsonb_array_elements_text(coalesce(p_audience -> 'emails', '[]'::jsonb)) x;

    -- Existing accounts only, with or without a profile. A free-text box that
    -- could mail any address would turn this page into a spam cannon.
    return query
      select u.id, lower(u.email::text), p.first_name
      from auth.users u
      left join profiles p on p.id = u.id
      where u.deleted_at is null
        and u.email is not null
        and lower(u.email::text) = any (v_emails)
        and (p.id is null or (p.suspended_at is null and p.deletion_scheduled_for is null))
        and (not v_respect or not exists (
          select 1 from email_opt_outs o where o.email = lower(u.email::text)));
    return;
  end if;

  if v_kind not in ('all_teachers', 'free', 'paying') then
    raise exception 'unknown audience %', v_kind;
  end if;

  -- Same plan split as the Announcements audiences.
  return query
    select u.id, lower(u.email::text), p.first_name
    from profiles p
    join auth.users u on u.id = p.id
    where u.deleted_at is null
      and u.email is not null
      and p.suspended_at is null
      and p.deletion_scheduled_for is null
      and (
        v_kind = 'all_teachers'
        or (v_kind = 'free' and coalesce(p.plan, 'free') = 'free')
        or (v_kind = 'paying' and coalesce(p.plan, 'free') <> 'free')
      )
      and (not v_respect or not exists (
        select 1 from email_opt_outs o where o.email = lower(u.email::text)));
end;
$$;
revoke execute on function email_audience_members(jsonb, text) from anon, authenticated, public;

-- ── 6. Admin RPCs ────────────────────────────────────────────────────────────

/** Counts for the audience picker, and the opt-out total. Counts only, never
 *  addresses: the marketing role holds this permission and no teacher data. */
create or replace function admin_email_audience_counts(p_purpose text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform admin_require_section('send_email_campaigns');
  if p_purpose not in ('marketing', 'signup_reminder', 'information', 'notice') then
    raise exception 'unknown purpose';
  end if;
  return jsonb_build_object(
    'all_teachers',       (select count(*) from email_audience_members('{"kind":"all_teachers"}', p_purpose)),
    'free',               (select count(*) from email_audience_members('{"kind":"free"}', p_purpose)),
    'paying',             (select count(*) from email_audience_members('{"kind":"paying"}', p_purpose)),
    'incomplete_signups', (select count(*) from email_audience_members('{"kind":"incomplete_signups"}', p_purpose)),
    'opted_out',          (select count(*) from email_opt_outs)
  );
end;
$$;
revoke execute on function admin_email_audience_counts(text) from anon, public;
grant execute on function admin_email_audience_counts(text) to authenticated;

/** How many of a typed list of addresses would actually receive it. */
create or replace function admin_email_audience_count(p_audience jsonb, p_purpose text)
returns integer
language plpgsql stable security definer set search_path = public
as $$
begin
  perform admin_require_section('send_email_campaigns');
  return (select count(*) from email_audience_members(p_audience, p_purpose));
end;
$$;
revoke execute on function admin_email_audience_count(jsonb, text) from anon, public;
grant execute on function admin_email_audience_count(jsonb, text) to authenticated;

create or replace function admin_broadcast_templates()
returns setof email_broadcast_templates
language plpgsql stable security definer set search_path = public
as $$
begin
  perform admin_require_section('send_email_campaigns');
  return query
    select * from email_broadcast_templates
    where not archived
    order by updated_at desc;
end;
$$;
revoke execute on function admin_broadcast_templates() from anon, public;
grant execute on function admin_broadcast_templates() to authenticated;

/** Insert when payload has no id, update when it does. Returns the id. */
create or replace function admin_upsert_broadcast_template(payload jsonb)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_id      uuid := nullif(payload ->> 'id', '')::uuid;
  v_name    text := btrim(coalesce(payload ->> 'name', ''));
  v_purpose text := coalesce(payload ->> 'purpose', 'marketing');
  v_cta_url text := btrim(coalesce(payload ->> 'cta_url', ''));
begin
  perform admin_require_section('send_email_campaigns');

  if v_name = '' then raise exception 'Give the template a name.'; end if;
  if v_purpose not in ('marketing', 'signup_reminder', 'information', 'notice') then
    raise exception 'Unknown purpose.';
  end if;
  if v_cta_url <> '' and v_cta_url !~ '^(https?://|\{\{\w+\}\})' then
    raise exception 'The button link must start with https:// or be a placeholder.';
  end if;

  if v_id is null then
    insert into email_broadcast_templates (
      name, purpose, subject, preheader, heading, body, cta_label, cta_url,
      created_by, updated_by
    ) values (
      v_name, v_purpose,
      coalesce(payload ->> 'subject', ''), coalesce(payload ->> 'preheader', ''),
      coalesce(payload ->> 'heading', ''), coalesce(payload ->> 'body', ''),
      coalesce(payload ->> 'cta_label', ''), v_cta_url,
      auth.uid(), auth.uid()
    )
    returning id into v_id;
    perform admin_log('Created email template', 'content', 'broadcast_template',
      v_id::text, v_name, jsonb_build_object('purpose', v_purpose));
  else
    update email_broadcast_templates set
      name       = v_name,
      purpose    = v_purpose,
      subject    = coalesce(payload ->> 'subject', subject),
      preheader  = coalesce(payload ->> 'preheader', preheader),
      heading    = coalesce(payload ->> 'heading', heading),
      body       = coalesce(payload ->> 'body', body),
      cta_label  = coalesce(payload ->> 'cta_label', cta_label),
      cta_url    = v_cta_url,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_id and not archived;
    if not found then raise exception 'That template no longer exists.'; end if;
    perform admin_log('Updated email template', 'content', 'broadcast_template',
      v_id::text, v_name, jsonb_build_object('purpose', v_purpose));
  end if;

  return v_id;
end;
$$;
revoke execute on function admin_upsert_broadcast_template(jsonb) from anon, public;
grant execute on function admin_upsert_broadcast_template(jsonb) to authenticated;

/** Archived rather than deleted: past campaigns point at it. */
create or replace function admin_archive_broadcast_template(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_name text;
begin
  perform admin_require_section('send_email_campaigns');
  if exists (select 1 from email_automations where template_id = p_id and live) then
    raise exception 'An automatic reminder uses this template. Turn it off first.';
  end if;
  update email_broadcast_templates set archived = true, updated_by = auth.uid(), updated_at = now()
  where id = p_id and not archived
  returning name into v_name;
  if v_name is null then raise exception 'That template no longer exists.'; end if;
  perform admin_log('Archived email template', 'content', 'broadcast_template', p_id::text, v_name);
end;
$$;
revoke execute on function admin_archive_broadcast_template(uuid) from anon, public;
grant execute on function admin_archive_broadcast_template(uuid) to authenticated;

/**
 * Create a campaign, due now or later. Validation mirrors validateBroadcast() in
 * app/lib/email-templates/broadcast.ts; this copy is the one that counts.
 */
create or replace function admin_create_email_campaign(payload jsonb)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_id        uuid;
  v_purpose   text := coalesce(payload ->> 'purpose', '');
  v_subject   text := btrim(coalesce(payload ->> 'subject', ''));
  v_body      text := coalesce(payload ->> 'body', '');
  v_cta_label text := btrim(coalesce(payload ->> 'cta_label', ''));
  v_cta_url   text := btrim(coalesce(payload ->> 'cta_url', ''));
  v_audience  jsonb := coalesce(payload -> 'audience', '{}'::jsonb);
  v_kind      text := v_audience ->> 'kind';
  v_when      timestamptz := coalesce(nullif(payload ->> 'scheduled_for', '')::timestamptz, now());
  v_label     text;
  v_template  uuid := nullif(payload ->> 'template_id', '')::uuid;
begin
  perform admin_require_section('send_email_campaigns');

  if v_purpose not in ('marketing', 'signup_reminder', 'information', 'notice') then
    raise exception 'Choose what kind of email this is.';
  end if;
  if v_subject = '' then raise exception 'The email needs a subject.'; end if;
  if length(v_subject) > 200 then raise exception 'Keep the subject under 200 characters.'; end if;
  if btrim(v_body) = '' then raise exception 'The email needs a body.'; end if;
  if length(v_body) > 20000 then raise exception 'The body is too long.'; end if;
  if (v_cta_label = '') <> (v_cta_url = '') then
    raise exception 'A button needs both a label and a link.';
  end if;
  if v_cta_url <> '' and v_cta_url !~ '^(https?://|\{\{\w+\}\})' then
    raise exception 'The button link must start with https:// or be a placeholder.';
  end if;
  if v_when > now() + interval '1 year' then
    raise exception 'Schedule it within the next year.';
  end if;
  if v_when < now() - interval '5 minutes' then
    raise exception 'That time has already passed.';
  end if;

  v_label := case v_kind
    when 'all_teachers' then 'All teachers'
    when 'free' then 'Free plan'
    when 'paying' then 'Paying teachers'
    when 'incomplete_signups' then 'Incomplete signups'
    when 'emails' then 'Chosen addresses'
    else null end;
  if v_label is null then raise exception 'Choose who it goes to.'; end if;

  if v_kind = 'emails' then
    if jsonb_typeof(v_audience -> 'emails') <> 'array'
       or jsonb_array_length(v_audience -> 'emails') = 0 then
      raise exception 'Add at least one address.';
    end if;
    if jsonb_array_length(v_audience -> 'emails') > 50 then
      raise exception 'Up to 50 addresses at a time. Use an audience for more.';
    end if;
    v_audience := jsonb_build_object('kind', 'emails', 'emails', v_audience -> 'emails');
  else
    v_audience := jsonb_build_object('kind', v_kind);
  end if;

  insert into email_campaigns (
    purpose, template_id, subject, preheader, heading, body, cta_label, cta_url,
    audience, audience_label, status, scheduled_for, created_by
  ) values (
    v_purpose, v_template, v_subject,
    btrim(coalesce(payload ->> 'preheader', '')), btrim(coalesce(payload ->> 'heading', '')),
    v_body, v_cta_label, v_cta_url,
    v_audience, v_label, 'scheduled', v_when, auth.uid()
  )
  returning id into v_id;

  perform admin_log(
    case when v_when > now() + interval '1 minute' then 'Scheduled bulk email' else 'Sent bulk email' end,
    'content', 'email_campaign', v_id::text, v_subject,
    jsonb_build_object('purpose', v_purpose, 'audience', v_label, 'scheduled_for', v_when));

  return v_id;
end;
$$;
revoke execute on function admin_create_email_campaign(jsonb) from anon, public;
grant execute on function admin_create_email_campaign(jsonb) to authenticated;

/** Stop a campaign. Scheduled ones never start; one mid-send stops after the
 *  batch in flight, and everyone it had not reached is marked skipped. */
create or replace function admin_cancel_email_campaign(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_subject text;
begin
  perform admin_require_section('send_email_campaigns');
  update email_campaigns set status = 'cancelled', finished_at = now()
  where id = p_id and status in ('scheduled', 'sending')
  returning subject into v_subject;
  if v_subject is null then raise exception 'Only a scheduled or sending email can be cancelled.'; end if;

  update email_campaign_recipients
     set status = 'skipped', error = 'Cancelled'
   where campaign_id = p_id and status = 'pending';

  update email_campaigns c set
    skipped_count = (select count(*) from email_campaign_recipients r
                     where r.campaign_id = c.id and r.status = 'skipped')
  where c.id = p_id;

  perform admin_log('Cancelled bulk email', 'content', 'email_campaign', p_id::text, v_subject);
end;
$$;
revoke execute on function admin_cancel_email_campaign(uuid) from anon, public;
grant execute on function admin_cancel_email_campaign(uuid) to authenticated;

create or replace function admin_email_campaigns(lim integer default 100)
returns table (
  id uuid, purpose text, subject text, preheader text, heading text, body text,
  cta_label text, cta_url text, audience_label text, status text,
  scheduled_for timestamptz, automation text, recipient_count integer,
  sent_count integer, failed_count integer, skipped_count integer,
  created_by_email text, created_at timestamptz, started_at timestamptz,
  finished_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  perform admin_require_section('send_email_campaigns');
  return query
    select c.id, c.purpose, c.subject, c.preheader, c.heading, c.body,
           c.cta_label, c.cta_url, c.audience_label, c.status,
           c.scheduled_for, c.automation, c.recipient_count,
           c.sent_count, c.failed_count, c.skipped_count,
           u.email::text, c.created_at, c.started_at, c.finished_at
    from email_campaigns c
    left join auth.users u on u.id = c.created_by
    order by c.created_at desc
    limit least(greatest(coalesce(lim, 100), 1), 500);
end;
$$;
revoke execute on function admin_email_campaigns(integer) from anon, public;
grant execute on function admin_email_campaigns(integer) to authenticated;

create or replace function admin_email_automations()
returns setof email_automations
language plpgsql stable security definer set search_path = public
as $$
begin
  perform admin_require_section('send_email_campaigns');
  return query select * from email_automations order by delay_hours;
end;
$$;
revoke execute on function admin_email_automations() from anon, public;
grant execute on function admin_email_automations() to authenticated;

create or replace function admin_update_email_automation(p_key text, payload jsonb)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_row email_automations;
  v_template uuid;
  v_live boolean;
  v_delay integer;
begin
  perform admin_require_section('send_email_campaigns');
  select * into v_row from email_automations where key = p_key;
  if v_row.key is null then raise exception 'No such automatic email.'; end if;

  v_template := case when payload ? 'template_id'
                     then nullif(payload ->> 'template_id', '')::uuid
                     else v_row.template_id end;
  v_live  := coalesce((payload ->> 'live')::boolean, v_row.live);
  v_delay := coalesce((payload ->> 'delay_hours')::integer, v_row.delay_hours);

  if v_live and v_template is null then
    raise exception 'Choose a template before turning this on.';
  end if;
  if v_template is not null and not exists (
    select 1 from email_broadcast_templates where id = v_template and not archived
  ) then
    raise exception 'That template no longer exists.';
  end if;
  if v_delay < 1 or v_delay > 2160 then
    raise exception 'The delay must be between 1 hour and 90 days.';
  end if;

  update email_automations set
    template_id = v_template, live = v_live, delay_hours = v_delay,
    updated_by = auth.uid(), updated_at = now()
  where key = p_key;

  perform admin_log('Updated automatic email', 'content', 'email_automation', p_key, v_row.name,
    jsonb_build_object('live', v_live, 'delay_hours', v_delay, 'template_id', v_template));
end;
$$;
revoke execute on function admin_update_email_automation(text, jsonb) from anon, public;
grant execute on function admin_update_email_automation(text, jsonb) to authenticated;

-- ── 7. Sending engine (service role only) ────────────────────────────────────

/**
 * Turn a due campaign's audience into recipient rows and mark it sending.
 * Idempotent: a second call on the same campaign does nothing, and the unique
 * index would absorb a duplicate anyway. Returns the recipient count.
 */
create or replace function email_campaign_materialise(p_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_c email_campaigns;
  v_n integer;
begin
  select * into v_c from email_campaigns where id = p_id for update;
  if v_c.id is null then raise exception 'no such campaign'; end if;
  if v_c.materialised_at is not null or v_c.status <> 'scheduled' then
    return v_c.recipient_count;
  end if;

  insert into email_campaign_recipients (campaign_id, user_id, email, first_name)
  select p_id, m.user_id, m.email, m.first_name
  from email_audience_members(v_c.audience, v_c.purpose) m
  on conflict do nothing;

  select count(*) into v_n from email_campaign_recipients where campaign_id = p_id;

  update email_campaigns set
    recipient_count = v_n,
    materialised_at = now(),
    started_at      = coalesce(started_at, now()),
    status          = case when v_n = 0 then 'sent' else 'sending' end,
    finished_at     = case when v_n = 0 then now() else null end
  where id = p_id;

  return v_n;
end;
$$;
revoke execute on function email_campaign_materialise(uuid) from anon, authenticated, public;
grant execute on function email_campaign_materialise(uuid) to service_role;

/**
 * Claim up to p_limit pending recipients for delivery.
 *
 * Rows left in 'sending' for over ten minutes belonged to a run that died mid
 * batch. They become failed, NOT pending: SendGrid may well have accepted them,
 * and one missing email is a better outcome than the same email twice.
 */
create or replace function email_campaign_claim(p_id uuid, p_limit integer)
returns table (id bigint, email text, first_name text, unsub_token uuid)
language plpgsql volatile security definer set search_path = public
as $$
#variable_conflict use_column
begin
  update email_campaign_recipients
     set status = 'failed', error = 'Interrupted before delivery was confirmed'
   where campaign_id = p_id and status = 'sending'
     and claimed_at < now() - interval '10 minutes';

  if not exists (select 1 from email_campaigns c where c.id = p_id and c.status = 'sending') then
    return;
  end if;

  return query
    update email_campaign_recipients r
       set status = 'sending', claimed_at = now()
     where r.id in (
       select x.id from email_campaign_recipients x
       where x.campaign_id = p_id and x.status = 'pending'
       order by x.id
       limit greatest(least(coalesce(p_limit, 100), 500), 1)
       for update skip locked
     )
    returning r.id, r.email, r.first_name, r.unsub_token;
end;
$$;
revoke execute on function email_campaign_claim(uuid, integer) from anon, authenticated, public;
grant execute on function email_campaign_claim(uuid, integer) to service_role;

/**
 * Record outcomes for a batch and bring the campaign's counts up to date.
 * p_results is [{"id": 1, "status": "sent" | "failed" | "skipped", "error": "..."}].
 * Returns the progress the admin's progress bar reads.
 */
create or replace function email_campaign_record(p_id uuid, p_results jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_pending integer;
  v_c email_campaigns;
begin
  update email_campaign_recipients r set
    status  = x.status,
    error   = left(x.error, 500),
    sent_at = case when x.status = 'sent' then now() else null end
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as x(id bigint, status text, error text)
  where r.id = x.id
    and r.campaign_id = p_id
    and r.status = 'sending'
    and x.status in ('sent', 'failed', 'skipped');

  select count(*) into v_pending
  from email_campaign_recipients
  where campaign_id = p_id and status in ('pending', 'sending');

  update email_campaigns c set
    sent_count    = s.sent,
    failed_count  = s.failed,
    skipped_count = s.skipped,
    status = case
      when c.status = 'sending' and v_pending = 0 then
        case when s.sent = 0 and s.failed > 0 then 'failed' else 'sent' end
      else c.status end,
    finished_at = case when c.status = 'sending' and v_pending = 0 then now() else c.finished_at end
  from (
    select count(*) filter (where status = 'sent')    as sent,
           count(*) filter (where status = 'failed')  as failed,
           count(*) filter (where status = 'skipped') as skipped
    from email_campaign_recipients where campaign_id = p_id
  ) s
  where c.id = p_id
  returning c.* into v_c;

  return jsonb_build_object(
    'status', v_c.status,
    'recipients', v_c.recipient_count,
    'sent', v_c.sent_count,
    'failed', v_c.failed_count,
    'skipped', v_c.skipped_count,
    'pending', v_pending
  );
end;
$$;
revoke execute on function email_campaign_record(uuid, jsonb) from anon, authenticated, public;
grant execute on function email_campaign_record(uuid, jsonb) to service_role;

/**
 * One run of an automatic reminder: everyone whose signup crossed the delay
 * since the last few days, who has not had this reminder before, becomes a
 * campaign that is already sending. Returns its id, or null when nobody is due.
 *
 * The three day window is what makes switching one on safe. Without it, the
 * first run after turning the 1 day reminder on would mail every incomplete
 * signup in history, some of them months old.
 */
create or replace function email_automation_enqueue(p_key text)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_a email_automations;
  v_t email_broadcast_templates;
  v_id uuid;
  v_n integer;
  v_audience jsonb;
begin
  select * into v_a from email_automations where key = p_key;
  if v_a.key is null or not v_a.live or v_a.template_id is null then return null; end if;

  select * into v_t from email_broadcast_templates where id = v_a.template_id and not archived;
  if v_t.id is null then return null; end if;

  v_audience := jsonb_build_object(
    'kind', 'incomplete_signups',
    'created_after', now() - make_interval(hours => v_a.delay_hours) - interval '3 days',
    'created_before', now() - make_interval(hours => v_a.delay_hours)
  );

  -- Serialise runs of the same automation so two overlapping crons cannot both
  -- decide the same person is due. Held to the end of the transaction, so the
  -- cohort query below returns the same people both times it runs.
  perform pg_advisory_xact_lock(hashtext('email_automation:' || p_key));

  select count(*) into v_n
  from email_audience_members(v_audience, v_t.purpose) m
  where not exists (
    select 1 from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    where c.automation = p_key and lower(r.email) = m.email
  );
  if v_n = 0 then return null; end if;

  insert into email_campaigns (
    purpose, template_id, subject, preheader, heading, body, cta_label, cta_url,
    audience, audience_label, status, scheduled_for, automation,
    recipient_count, materialised_at, started_at
  ) values (
    v_t.purpose, v_t.id, v_t.subject, v_t.preheader, v_t.heading, v_t.body,
    v_t.cta_label, v_t.cta_url,
    jsonb_build_object('kind', 'automation', 'automation', p_key),
    'Automatic: ' || v_a.name, 'sending', now(), p_key,
    v_n, now(), now()
  )
  returning id into v_id;

  insert into email_campaign_recipients (campaign_id, user_id, email, first_name)
  select v_id, m.user_id, m.email, m.first_name
  from email_audience_members(v_audience, v_t.purpose) m
  where not exists (
    select 1 from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    where c.automation = p_key and lower(r.email) = m.email
  )
  on conflict do nothing;

  return v_id;
end;
$$;
revoke execute on function email_automation_enqueue(text) from anon, authenticated, public;
grant execute on function email_automation_enqueue(text) to service_role;

-- ── 8. Unsubscribe (public) ──────────────────────────────────────────────────
create or replace function email_unsubscribe(p_token uuid, p_source text default 'link')
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare v_email text;
begin
  select lower(email) into v_email from email_campaign_recipients where unsub_token = p_token;
  if v_email is null then return false; end if;
  insert into email_opt_outs (email, source)
  values (v_email, case when p_source in ('link', 'one_click') then p_source else 'link' end)
  on conflict (email) do nothing;
  return true;
end;
$$;
revoke execute on function email_unsubscribe(uuid, text) from public;
grant execute on function email_unsubscribe(uuid, text) to anon, authenticated;

-- ── 9. Seed ──────────────────────────────────────────────────────────────────
-- One starter per purpose, so the page is not empty on day one. Guarded on the
-- table being empty so a re-run cannot duplicate them.
insert into email_broadcast_templates (name, purpose, subject, preheader, heading, body, cta_label, cta_url)
select * from (values
  (
    'Finish your signup',
    'signup_reminder',
    'Your Jooma account is nearly ready',
    'One short step and you can start planning.',
    'You are one step away',
    E'Hi {{firstName}},\n\nYou started creating a Jooma account but did not quite finish. It only takes a minute: add your name and you are in.\n\nOnce you are set up you can plan lessons, make resources and share them with colleagues.',
    'Finish setting up',
    '{{completeSignupUrl}}'
  ),
  (
    'Product news',
    'marketing',
    'New in Jooma this month',
    'A quick look at what is new.',
    'What is new in Jooma',
    E'Hi {{firstName}},\n\nHere is what we have been working on:\n\n- **First new thing.** One sentence on why it helps.\n- **Second new thing.** One sentence on why it helps.\n\nAs always, just reply if you have ideas for what we should build next.',
    'Open Jooma',
    '{{siteUrl}}'
  ),
  (
    'General update',
    'information',
    'An update from Jooma',
    '',
    'An update from the Jooma team',
    E'Hi {{firstName}},\n\nWrite your update here.',
    '',
    ''
  ),
  (
    'Service notice',
    'notice',
    'Important: a change to your Jooma account',
    '',
    'A change to your account',
    E'Hi {{firstName}},\n\nWe are writing to let you know about a change that affects your account.\n\nDescribe the change, when it happens, and whether they need to do anything.',
    '',
    ''
  )
) as seed(name, purpose, subject, preheader, heading, body, cta_label, cta_url)
where not exists (select 1 from email_broadcast_templates);

-- Both reminders start OFF and point at the starter above. Nothing mails anyone
-- until an admin turns one on.
insert into email_automations (key, name, description, template_id, live, delay_hours)
values
  ('signup_nudge_1d', 'Signup reminder, day 1',
   'Sent to incomplete signups about a day after they started.',
   (select id from email_broadcast_templates where purpose = 'signup_reminder' order by created_at limit 1),
   false, 24),
  ('signup_nudge_7d', 'Signup reminder, day 7',
   'A second reminder about a week after they started, if they still have not finished.',
   (select id from email_broadcast_templates where purpose = 'signup_reminder' order by created_at limit 1),
   false, 168)
on conflict (key) do nothing;
