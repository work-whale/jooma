-- Ambassador programme: one open link, and a review trial.
--
-- 1. The programme now has one short link (/ambassador) instead of single-use
--    invite links, so applying no longer needs an invite token. Anyone signed in
--    can apply; an admin still approves every application, and the existing
--    rules stay: one live application per person, codes reserved.
--    ambassador_invites and its rows are left as they are (history only).
--
-- 2. While an application is under review the applicant gets Standard for
--    three days, without a card: profiles.plan = 'standard',
--    subscription_status = 'trialing', current_period_end = the end, and no
--    Stripe subscription id. A Stripe trial always carries a subscription id,
--    so "trialing with a null id" means this local trial and nothing else.
--    trial_granted_at stops a declined applicant who applies again from getting
--    a second one.
--
-- 3. my_generation_gate() reads that trial as 'free' once current_period_end
--    has passed, so it ends on time at the moment of generating. The daily
--    ambassador-terms cron tidies the profile row afterwards.

-- ── 1. Review trial marker ───────────────────────────────────────────────────

alter table ambassador_applications
  add column if not exists trial_granted_at timestamptz;

-- ── 2. Submit without an invite ──────────────────────────────────────────────

drop function if exists submit_ambassador_application(uuid, text, jsonb);

create or replace function submit_ambassador_application(
  p_user_id uuid,
  payload   jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code   text := upper(btrim(coalesce(payload->>'requested_code', '')));
  v_id     uuid;
  v_method text := payload->>'payout_method';
begin
  if p_user_id is null then raise exception 'not signed in'; end if;

  if exists (select 1 from ambassador_applications a
              where a.user_id = p_user_id and a.status in ('pending', 'approved')) then
    raise exception 'You have already applied.';
  end if;
  if exists (select 1 from ambassadors x where x.user_id = p_user_id and x.status = 'active') then
    raise exception 'You are already a Jooma Ambassador.';
  end if;

  if exists (select 1 from ambassador_codes c where lower(c.code) = lower(v_code))
     or exists (select 1 from ambassador_applications a
                 where a.status in ('pending', 'approved') and lower(a.requested_code) = lower(v_code)) then
    raise exception 'That code is already taken. Try another.';
  end if;

  insert into ambassador_applications (
    user_id,
    first_name, last_name, email, mobile, date_of_birth, address_line, town, postcode, school, teaches,
    instagram, tiktok, x_handle, facebook, youtube, linkedin, reach, note,
    payout_method, account_holder, sort_code, account_number, bank_name, paypal_email,
    tax_status, utr, requested_code,
    agreement_version, signature_name, signed_ip, signed_user_agent, declarations
  )
  values (
    p_user_id,
    btrim(payload->>'first_name'), btrim(payload->>'last_name'), lower(btrim(payload->>'email')),
    btrim(payload->>'mobile'), (payload->>'date_of_birth')::date,
    btrim(payload->>'address_line'), btrim(payload->>'town'), upper(btrim(payload->>'postcode')),
    nullif(btrim(coalesce(payload->>'school', '')), ''), nullif(btrim(coalesce(payload->>'teaches', '')), ''),
    nullif(btrim(coalesce(payload->>'instagram', '')), ''), nullif(btrim(coalesce(payload->>'tiktok', '')), ''),
    nullif(btrim(coalesce(payload->>'x_handle', '')), ''), nullif(btrim(coalesce(payload->>'facebook', '')), ''),
    nullif(btrim(coalesce(payload->>'youtube', '')), ''), nullif(btrim(coalesce(payload->>'linkedin', '')), ''),
    payload->>'reach', nullif(btrim(coalesce(payload->>'note', '')), ''),
    v_method, btrim(payload->>'account_holder'),
    case when v_method = 'bank' then payload->>'sort_code' end,
    case when v_method = 'bank' then payload->>'account_number' end,
    case when v_method = 'bank' then nullif(btrim(coalesce(payload->>'bank_name', '')), '') end,
    case when v_method = 'paypal' then lower(btrim(payload->>'paypal_email')) end,
    payload->>'tax_status', nullif(btrim(coalesce(payload->>'utr', '')), ''), v_code,
    payload->>'agreement_version', btrim(payload->>'signature_name'),
    payload->>'signed_ip', left(payload->>'signed_user_agent', 400),
    coalesce(payload->'declarations', '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function submit_ambassador_application(uuid, jsonb) from anon, authenticated, public;
grant execute on function submit_ambassador_application(uuid, jsonb) to service_role;

-- ── 3. The gate ends an expired review trial on time ─────────────────────────
-- Copied from the live definition; only the plan column changes.

create or replace function public.my_generation_gate()
 returns table(plan text, is_admin boolean, used_today integer, used_month integer, used_hour integer, rate_limit_hour integer, spend_pence bigint, credit_pence bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce((s.value #>> '{}')::integer, 0) into v_limit
    from app_settings s where s.key = 'rate_limit_per_hour';
  v_limit := coalesce(v_limit, 0);

  return query
    select
      case
        -- A review trial (no Stripe subscription) that has run out.
        when p.subscription_status = 'trialing'
         and p.stripe_subscription_id is null
         and p.current_period_end is not null
         and p.current_period_end < now()
        then 'free'
        else coalesce(p.plan, 'free')
      end,
      coalesce(p.is_admin, false),
      (select count(*)::integer from token_usage t
        where t.user_id = v_uid
          and is_counted_generation(t.tool_slug, t.step)
          and t.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'),
      (select count(*)::integer from token_usage t
        where t.user_id = v_uid
          and is_counted_generation(t.tool_slug, t.step)
          and t.created_at >= date_trunc('month', now())),
      (select count(*)::integer from token_usage t
        where t.user_id = v_uid
          and is_counted_generation(t.tool_slug, t.step)
          and t.created_at >= now() - interval '1 hour'),
      v_limit,
      s.spend_pence,
      s.credit_pence
    from (select 1) _
    left join profiles p on p.id = v_uid
    cross join lateral monthly_ai_spend(v_uid) s;
end;
$function$;
