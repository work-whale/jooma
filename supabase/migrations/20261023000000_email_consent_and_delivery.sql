-- ── Bulk email: soft opt-in, signup leads, preferences, audiences, delivery ────
--
-- Follows 20260924000000_email_campaigns.sql, which built the sending side. That
-- was never used in production, and an audit before the first send found five
-- gaps. This closes them:
--
--   1. CONSENT. Marketing now rests on the soft opt-in: a "rather not" box at
--      signup, a switch in /profile, and an unsubscribe link in every email.
--      The choice is the existing email_opt_outs list, with new sources.
--
--   2. STEP ONE LEADS. An auth user only exists once someone sets a password, so
--      anyone who typed an email at /signup and left was invisible.
--      signup_leads keeps that address for 30 days, for the signup reminders
--      and nothing else.
--
--   3. PREFERENCES. Teachers turn product email on and off themselves
--      (my_email_preferences, set_my_product_emails). Admins who may see
--      teacher addresses get the opt-out list.
--
--   4. AUDIENCES. "Paying" meant any paid plan, which counted free trials and
--      comped accounts. It now means a real Stripe subscription. Trials and
--      cancelled subscriptions become audiences of their own.
--
--   5. DELIVERY. SendGrid's event webhook reports what happened after it
--      accepted an email. Hard bounces and spam complaints become opt-outs.
--
-- Every function redefined here was checked against pg_get_functiondef() on
-- staging and production before writing (2026-10-23): both matched the
-- 20260924 file, which is the only place they had been defined.

-- ── 1. Wider enumerations ────────────────────────────────────────────────────

alter table email_opt_outs drop constraint if exists email_opt_outs_source_check;
alter table email_opt_outs add constraint email_opt_outs_source_check
  check (source in ('link', 'one_click', 'admin', 'signup', 'profile', 'bounce', 'spam'));

alter table auth_rate drop constraint if exists auth_rate_kind_check;
alter table auth_rate add constraint auth_rate_kind_check
  check (kind in ('ip', 'email', 'unsub_ip', 'guest_chat_ip', 'guest_helper_ip',
                  'lead_ip', 'lead_email'));

-- ── 2. Signup leads ──────────────────────────────────────────────────────────
-- An address typed at /signup by someone who has not set a password yet.
-- Pruned after 30 days, and as soon as the address has an account.
create table if not exists signup_leads (
  email         text primary key check (email = lower(email)),
  -- Their answer to the "rather not" box. Sticky once true: see
  -- record_signup_lead().
  opted_out     boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
alter table signup_leads enable row level security;
create index if not exists signup_leads_created_idx on signup_leads (created_at);
-- No policies. Written only through record_signup_lead(), read only by the
-- audience resolver and the prune.

/**
 * Remember an address typed at /signup. Public: the caller has no session yet.
 *
 * Returns nothing, whatever happened, so it cannot be used to ask whether an
 * address has an account. The route in front adds a honeypot and a per-IP
 * throttle; the per-address throttle lives here so it holds wherever this is
 * called from.
 *
 * It never writes email_opt_outs. Anyone can type anyone's address here, and an
 * anonymous caller must not be able to unsubscribe someone else. The "rather
 * not" answer only governs this lead's own reminders, and once true it stays
 * true, so a stranger cannot switch it back.
 */
create or replace function record_signup_lead(p_email text, p_opt_out boolean default false)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return;
  end if;

  if (select count(*) from auth_rate
      where kind = 'lead_email' and identifier = v_email
        and created_at > now() - interval '1 hour') >= 5 then
    return;
  end if;
  insert into auth_rate (kind, identifier) values ('lead_email', v_email);

  -- Already an account: the incomplete signups audience covers them.
  if exists (select 1 from auth.users u where lower(u.email::text) = v_email) then
    return;
  end if;

  insert into signup_leads (email, opted_out)
  values (v_email, coalesce(p_opt_out, false))
  on conflict (email) do update set
    opted_out    = signup_leads.opted_out or excluded.opted_out,
    last_seen_at = now();
end;
$$;
revoke execute on function record_signup_lead(text, boolean) from public;
grant execute on function record_signup_lead(text, boolean) to anon, authenticated;

/** Nightly, from the email cron. Returns how many rows went. */
create or replace function email_leads_prune()
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare v_n integer;
begin
  delete from signup_leads l
  where l.created_at < now() - interval '30 days'
     or exists (select 1 from auth.users u where lower(u.email::text) = l.email);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function email_leads_prune() from anon, authenticated, public;
grant execute on function email_leads_prune() to service_role;

-- ── 3. Audience resolver ─────────────────────────────────────────────────────
-- Changes from 20260924: leads join incomplete_signups for signup reminders;
-- 'paying' needs a Stripe subscription; 'trialing' and 'cancelled' are new.
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
          select 1 from email_opt_outs o where o.email = lower(s.email)))
      union all
      -- Leads never became customers, so the soft opt-in does not reach them:
      -- a signup reminder is the only thing they get. user_id is null, which is
      -- also how the sender knows to link them to /signup rather than /login.
      select null::uuid, l.email, null::text
      from signup_leads l
      where p_purpose = 'signup_reminder'
        and not l.opted_out
        and (v_after is null or l.created_at > v_after)
        and (v_before is null or l.created_at <= v_before)
        and not exists (select 1 from auth.users u where lower(u.email::text) = l.email)
        and not exists (
          select 1 from pending_invites i
          where lower(i.email) = l.email and i.accepted_at is null)
        and not exists (select 1 from email_opt_outs o where o.email = l.email);
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

  if v_kind not in ('all_teachers', 'free', 'paying', 'trialing', 'cancelled') then
    raise exception 'unknown audience %', v_kind;
  end if;

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
        -- A real subscription. Comped accounts (an ambassador's Pro, an admin
        -- grant) have a plan and no Stripe id, and trials are 'trialing'.
        or (v_kind = 'paying'
            and p.plan in ('standard', 'pro', 'max')
            and p.subscription_status in ('active', 'past_due')
            and p.stripe_subscription_id is not null)
        or (v_kind = 'trialing' and p.subscription_status = 'trialing')
        -- Had a subscription that ended and has not come back.
        or (v_kind = 'cancelled'
            and p.subscription_status = 'canceled'
            and coalesce(p.plan, 'free') = 'free')
      )
      and (not v_respect or not exists (
        select 1 from email_opt_outs o where o.email = lower(u.email::text)));
end;
$$;
revoke execute on function email_audience_members(jsonb, text) from anon, authenticated, public;

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
    'trialing',           (select count(*) from email_audience_members('{"kind":"trialing"}', p_purpose)),
    'cancelled',          (select count(*) from email_audience_members('{"kind":"cancelled"}', p_purpose)),
    'incomplete_signups', (select count(*) from email_audience_members('{"kind":"incomplete_signups"}', p_purpose)),
    -- The part of incomplete_signups that is leads, so Compose can say so.
    'incomplete_leads',   (select count(*) from email_audience_members('{"kind":"incomplete_signups"}', p_purpose) m
                           where m.user_id is null),
    'opted_out',          (select count(*) from email_opt_outs)
  );
end;
$$;

-- Same as 20260924 apart from the two new audience labels.
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
    when 'trialing' then 'On a free trial'
    when 'cancelled' then 'Cancelled subscription'
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

-- ── 4. Claim returns user_id ─────────────────────────────────────────────────
-- A null user_id is a lead, whose reminder links to /signup instead of /login.
-- The return type changes, so drop and recreate.
drop function if exists email_campaign_claim(uuid, integer);
create function email_campaign_claim(p_id uuid, p_limit integer)
returns table (id bigint, email text, first_name text, unsub_token uuid, user_id uuid)
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
    returning r.id, r.email, r.first_name, r.unsub_token, r.user_id;
end;
$$;
revoke execute on function email_campaign_claim(uuid, integer) from anon, authenticated, public;
grant execute on function email_campaign_claim(uuid, integer) to service_role;

-- ── 5. Delivery ──────────────────────────────────────────────────────────────
-- What SendGrid reported after accepting the email. Null until an event lands,
-- and always null for a recipient that was never sent.
alter table email_campaign_recipients
  add column if not exists delivery        text
    check (delivery in ('delivered', 'bounced', 'dropped', 'spam')),
  add column if not exists delivery_reason text,
  add column if not exists delivery_at     timestamptz;

/** Events can arrive in any order. A later outcome only replaces an earlier one
 *  if it is worse, so a stray "delivered" never hides a spam complaint. */
create or replace function email_delivery_rank(p text)
returns integer
language sql immutable set search_path = public
as $$
  select case p
    when 'spam' then 3
    when 'bounced' then 2
    when 'dropped' then 2
    when 'delivered' then 1
    else 0 end;
$$;

/**
 * Record a batch of SendGrid events, already mapped by mapEvents() in
 * app/lib/sendgrid-events.ts:
 *
 *   [{"recipient_id": 12 | null, "email": "a@b.c", "delivery": "bounced" | null,
 *     "reason": "...", "opt_out": "bounce" | "spam" | null, "at": "..."}]
 *
 * opt_out is applied by address even with no recipient id: a spam complaint
 * about a password reset should still stop marketing to that person.
 */
create or replace function email_record_events(p_events jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_updated integer;
  v_opted   integer;
begin
  with ev as (
    select distinct on (x.recipient_id)
           x.recipient_id, x.delivery, x.reason, x.at
    from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
           as x(recipient_id bigint, email text, delivery text, reason text, opt_out text, at timestamptz)
    where x.recipient_id is not null
      and x.delivery in ('delivered', 'bounced', 'dropped', 'spam')
    order by x.recipient_id, email_delivery_rank(x.delivery) desc
  )
  update email_campaign_recipients r set
    delivery        = ev.delivery,
    delivery_reason = left(ev.reason, 500),
    delivery_at     = coalesce(ev.at, now())
  from ev
  where r.id = ev.recipient_id
    and email_delivery_rank(ev.delivery) > email_delivery_rank(r.delivery);
  get diagnostics v_updated = row_count;

  insert into email_opt_outs (email, source)
  select distinct on (lower(btrim(x.email))) lower(btrim(x.email)), x.opt_out
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
         as x(recipient_id bigint, email text, delivery text, reason text, opt_out text, at timestamptz)
  where x.opt_out in ('bounce', 'spam')
    and x.email ~ '^[^@\s]+@[^@\s]+$'
  order by lower(btrim(x.email)), (x.opt_out = 'spam') desc
  on conflict (email) do nothing;
  get diagnostics v_opted = row_count;

  return jsonb_build_object('updated', v_updated, 'opted_out', v_opted);
end;
$$;
revoke execute on function email_record_events(jsonb) from anon, authenticated, public;
grant execute on function email_record_events(jsonb) to service_role;

-- History gains delivery counts. Counted on read rather than stored, so there
-- is no second set of counters to keep in step with late events. The return
-- type changes, so drop and recreate.
drop function if exists admin_email_campaigns(integer);
create function admin_email_campaigns(lim integer default 100)
returns table (
  id uuid, purpose text, subject text, preheader text, heading text, body text,
  cta_label text, cta_url text, audience_label text, status text,
  scheduled_for timestamptz, automation text, recipient_count integer,
  sent_count integer, failed_count integer, skipped_count integer,
  delivered_count integer, bounced_count integer, spam_count integer,
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
           coalesce(d.delivered, 0)::integer, coalesce(d.bounced, 0)::integer,
           coalesce(d.spam, 0)::integer,
           u.email::text, c.created_at, c.started_at, c.finished_at
    from email_campaigns c
    left join auth.users u on u.id = c.created_by
    left join lateral (
      select count(*) filter (where r.delivery = 'delivered')               as delivered,
             count(*) filter (where r.delivery in ('bounced', 'dropped'))   as bounced,
             count(*) filter (where r.delivery = 'spam')                    as spam
      from email_campaign_recipients r
      where r.campaign_id = c.id
    ) d on true
    order by c.created_at desc
    limit least(greatest(coalesce(lim, 100), 1), 500);
end;
$$;
revoke execute on function admin_email_campaigns(integer) from anon, public;
grant execute on function admin_email_campaigns(integer) to authenticated;

-- ── 6. A teacher's own switch ────────────────────────────────────────────────
-- One switch, "product news and updates", stored as presence in
-- email_opt_outs. Service notices ignore it, as they always have.

create or replace function my_email_preferences()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_email text;
begin
  select lower(u.email::text) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'product_emails', not exists (select 1 from email_opt_outs o where o.email = v_email));
end;
$$;
revoke execute on function my_email_preferences() from anon, public;
grant execute on function my_email_preferences() to authenticated;

/** p_source is 'signup' when called from /complete-profile with the signup
 *  box's answer, 'profile' from the settings switch. Turning it back on clears
 *  the row whatever put it there, including a bounce: the reader is telling us
 *  the address works. */
create or replace function set_my_product_emails(p_on boolean, p_source text default 'profile')
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_email text;
begin
  select lower(u.email::text) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'not signed in'; end if;
  if p_on then
    delete from email_opt_outs where email = v_email;
  else
    insert into email_opt_outs (email, source)
    values (v_email, case when p_source = 'signup' then 'signup' else 'profile' end)
    on conflict (email) do nothing;
  end if;
end;
$$;
revoke execute on function set_my_product_emails(boolean, text) from anon, public;
grant execute on function set_my_product_emails(boolean, text) to authenticated;

-- ── 7. The admin opt-out list ────────────────────────────────────────────────
-- Addresses, so it needs see_teachers on top of send_email_campaigns. The
-- marketing role holds only the second, and keeps seeing counts only.

create or replace function admin_email_opt_outs(p_search text default null, lim integer default 200)
returns table (email text, source text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare v_q text := lower(btrim(coalesce(p_search, '')));
begin
  perform admin_require_section('send_email_campaigns');
  perform admin_require_section('see_teachers');
  return query
    select o.email, o.source, o.created_at
    from email_opt_outs o
    where v_q = '' or strpos(o.email, v_q) > 0
    order by o.created_at desc
    limit least(greatest(coalesce(lim, 200), 1), 1000);
end;
$$;
revoke execute on function admin_email_opt_outs(text, integer) from anon, public;
grant execute on function admin_email_opt_outs(text, integer) to authenticated;

create or replace function admin_set_email_opt_out(p_email text, p_out boolean)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform admin_require_section('send_email_campaigns');
  perform admin_require_section('see_teachers');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like an email address.';
  end if;
  if p_out then
    insert into email_opt_outs (email, source) values (v_email, 'admin')
    on conflict (email) do nothing;
    perform admin_log('Added email opt-out', 'content', 'email_opt_out', v_email, v_email);
  else
    delete from email_opt_outs where email = v_email;
    perform admin_log('Removed email opt-out', 'content', 'email_opt_out', v_email, v_email);
  end if;
end;
$$;
revoke execute on function admin_set_email_opt_out(text, boolean) from anon, public;
grant execute on function admin_set_email_opt_out(text, boolean) to authenticated;
