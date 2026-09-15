-- ── Section guards on the RPCs that carry money and teacher PII ─────────────
--
-- THE HOLE THIS CLOSES
--
-- Until now every admin_* function was guarded by is_admin() and nothing else.
-- That was defensible while every admin was staff. It stops being defensible
-- with `marketing`, which is the first role meant for someone outside the
-- company: the sidebar hides the dashboard from them, and the page redirects
-- them away, but neither is a boundary. A marketing user with devtools open
-- could call admin_dashboard() over PostgREST and read MRR, or admin_users()
-- and enumerate every teacher's name and email.
--
-- tests/admin/console-access.spec.ts asserts exactly this and currently FAILS
-- on the admin_dashboard case. It should pass after this migration.
--
-- WHAT IS AND IS NOT COVERED
--
--   see_money   15 functions carrying revenue, invoices, margins, seat value.
--   see_people   5 functions carrying teacher names, emails and activity.
--   (later)      Product internals, admin_tool_usage_report and friends, carry
--                token costs and model routing. Commercially dull next to the
--                two above and deliberately deferred to their own migration.
--
-- HOW THESE BODIES WERE PRODUCED
--
-- Every function below is the text pg_get_functiondef() returned from staging,
-- with ONE line added and nothing else altered. It is not retyped from the
-- migration history: several of these have been recreated three or four times
-- and the newest file on disk is not always what is running. Rebuilding from
-- the live definition is the only way to avoid silently reverting a later fix.
--
-- Verify after pushing with the query at the foot of this file.

-- ── The guard itself ────────────────────────────────────────────────────────
-- One helper rather than the same two lines twenty times, so a future change to
-- how sections are enforced happens here instead of in every function.
--
-- Raises rather than returning empty: a silent empty result reads as "no data
-- yet" and would have someone chasing a reporting bug that is really a
-- permission. Message names the permission so the cause is legible in a log.
create or replace function admin_require_section(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can(p_permission) then
    raise exception 'your role cannot see this (%)', p_permission;
  end if;
end;
$$;
revoke execute on function admin_require_section(text) from anon, public;
grant execute on function admin_require_section(text) to authenticated;

comment on function admin_require_section(text) is
  'Raises unless the caller is an admin AND holds the named section permission. The database-side half of the console section gates; the sidebar is only the UX half.';


-- ════════════════════════════════════════════════════════════════════════════
-- REVENUE  ->  see_money
-- ════════════════════════════════════════════════════════════════════════════

create or replace function teacher_mrr()
returns table(paying_gbp numeric, paying_count bigint, comped_gbp numeric, comped_count bigint, ending_gbp numeric, ending_count bigint, paying_sub_ids text[])
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- ADMIN ONLY, and this is new.
  --
  -- 20260909000100 left this ungated because nothing outside admin_dashboard()
  -- and admin_usage_summary() called it, and both check for themselves. The
  -- dashboard page now calls it directly to get paying_sub_ids, which makes it
  -- reachable by any signed-in teacher through PostgREST: it is security
  -- definer, so without this check it would hand out company revenue and a list
  -- of live Stripe subscription ids to anybody with an account.
  perform admin_require_section('see_money');

  return query
  with paid as (
    select
      p.stripe_subscription_id                        as sub_id,
      p.stripe_subscription_id is not null            as has_sub,
      coalesce(p.cancel_at_period_end, false)         as ending,
      coalesce(pc.price_monthly, 0)                   as price
    from profiles p
    join plan_config pc on pc.plan_id = coalesce(p.plan, 'free')
    where coalesce(p.plan, 'free') not in ('free', 'school')
      and coalesce(p.is_admin, false) = false
  )
  select
    coalesce(sum(price) filter (where has_sub and not ending), 0),
    count(*)            filter (where has_sub and not ending),
    -- No subscription behind the plan: comped by an admin.
    coalesce(sum(price) filter (where not has_sub), 0),
    count(*)            filter (where not has_sub),
    -- Paying now, but cancelling. Real revenue this month, gone next.
    coalesce(sum(price) filter (where has_sub and ending), 0),
    count(*)            filter (where has_sub and ending),
    coalesce(
      array_agg(sub_id) filter (where has_sub and not ending),
      array[]::text[]
    )
  from paid;
end;
$function$;

create or replace function admin_dashboard()
returns table(total_teachers bigint, new_teachers_month bigint, paying_teachers bigint, mrr_gbp numeric, b2c_mrr_gbp numeric, b2b_mrr_gbp numeric, comped_mrr_gbp numeric, comped_teachers bigint, ending_mrr_gbp numeric, ending_teachers bigint, schools_total bigint, schools_live bigint, seats_sold bigint, seats_assigned bigint, cost_month_usd numeric, ai_image_cost_usd numeric, generations_month bigint, ai_images_month bigint, open_tickets bigint, high_priority_tickets bigint, flags_awaiting bigint, overdue_invoices bigint, overdue_value_gbp numeric, failed_payments bigint)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  m record;
  seats numeric;
begin
  perform admin_require_section('see_money');

  select * into m from teacher_mrr();
  select coalesce(sum(s.seats * seat_rate(s.seats)), 0) into seats
    from schools s where s.status = 'live';

  return query
  select
    (select count(*) from auth.users),
    (select count(*) from auth.users where created_at >= date_trunc('month', now())),
    m.paying_count,

    m.paying_gbp + seats,
    m.paying_gbp,
    seats,
    m.comped_gbp,
    m.comped_count,
    m.ending_gbp,
    m.ending_count,

    (select count(*) from schools),
    (select count(*) from schools where status = 'live'),
    (select coalesce(sum(s2.seats), 0)::bigint from schools s2),
    (select count(*) from school_seats where status in ('assigned','dormant')),

    (select coalesce(sum(t.cost_usd), 0) from token_usage t
      where t.created_at >= date_trunc('month', now()))
    + (select coalesce(sum(a.cost_usd), 0) from asset_cost a
      where a.created_at >= date_trunc('month', now())),
    (select coalesce(sum(a.cost_usd), 0) from asset_cost a
      where a.kind = 'image' and a.created_at >= date_trunc('month', now())),
    (select count(*) from tool_runs r where r.created_at >= date_trunc('month', now())),
    (select coalesce(sum(a.units), 0)::bigint from asset_cost a
      where a.kind = 'image' and a.created_at >= date_trunc('month', now())),

    (select count(*) from support_threads where status = 'open'),
    (select count(*) from support_threads where status <> 'closed' and priority = 'high'),
    (select count(*) from safeguarding_flags where status = 'review'),

    (select count(*) from invoices
      where status = 'overdue'
         or (status = 'sent' and due_at is not null and due_at < current_date)),
    (select coalesce(sum(amount_gbp), 0) from invoices
      where status = 'overdue'
         or (status = 'sent' and due_at is not null and due_at < current_date)),
    (select count(*) from invoices where status = 'failed');
end;
$function$;

create or replace function admin_overview()
returns table(total_users bigint, new_users_this_month bigint, paid_users bigint, generations_this_month bigint, cost_this_month numeric, presentations_total bigint)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select
      (select count(*) from auth.users),
      (select count(*) from auth.users where created_at >= date_trunc('month', now())),
      (select count(*) from profiles where plan <> 'free'),
      (select count(*) from tool_runs where created_at >= date_trunc('month', now())),
      (select coalesce(sum(cost_usd), 0) from token_usage where created_at >= date_trunc('month', now()))
        + (select coalesce(sum(cost_usd), 0) from asset_cost where created_at >= date_trunc('month', now())),
      (select count(*) from presentations);
end;
$function$;

create or replace function admin_usage_summary()
returns table(ai_spend_usd numeric, ai_image_cost_usd numeric, text_cost_usd numeric, generations bigint, ai_images bigint, active_teachers bigint, cost_per_active_usd numeric, mrr_gbp numeric, gross_margin numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare fx numeric := fx_usd_to_gbp();
begin
  perform admin_require_section('see_money');
  return query
  with spend as (
    select
      (select coalesce(sum(t.cost_usd),0) from token_usage t
        where t.created_at >= date_trunc('month', now())) as text_cost,
      (select coalesce(sum(a.cost_usd),0) from asset_cost a
        where a.created_at >= date_trunc('month', now())) as asset_cost_total,
      (select coalesce(sum(a.cost_usd),0) from asset_cost a
        where a.kind = 'image' and a.created_at >= date_trunc('month', now())) as image_cost,
      (select coalesce(sum(a.units),0)::bigint from asset_cost a
        where a.kind = 'image' and a.created_at >= date_trunc('month', now())) as images,
      (select count(*) from tool_runs r
        where r.created_at >= date_trunc('month', now())) as gens,
      (select count(distinct r.user_id) from tool_runs r
        where r.created_at >= date_trunc('month', now())) as active,
      (select paying_gbp from teacher_mrr())
      + (select coalesce(sum(s.seats * seat_rate(s.seats)),0)
           from schools s where s.status = 'live') as mrr
  )
  select
    s.text_cost + s.asset_cost_total,
    s.image_cost,
    s.text_cost,
    s.gens,
    s.images,
    s.active,
    case when s.active > 0 then (s.text_cost + s.asset_cost_total) / s.active else 0 end,
    s.mrr,
    case when s.mrr > 0
         then (s.mrr - (s.text_cost + s.asset_cost_total) * fx) / s.mrr
         else null end
  from spend s;
end;
$function$;

create or replace function admin_cost_breakdown()
returns table(label text, cost_usd numeric, units bigint, note text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select 'AI-generated images', coalesce(sum(a.cost_usd), 0),
           coalesce(sum(a.units), 0)::bigint,
           'The single biggest lever on gross margin'
    from asset_cost a
    where a.kind = 'image' and a.created_at >= date_trunc('month', now())
  union all
    select 'Audio', coalesce(sum(a.cost_usd), 0), coalesce(sum(a.units), 0)::bigint,
           'Slideshow narration'
    from asset_cost a
    where a.kind = 'audio' and a.created_at >= date_trunc('month', now())
  union all
    select 'Text generation', coalesce(sum(t.cost_usd), 0), count(*)::bigint,
           'Every tool that writes rather than draws'
    from token_usage t
    where t.created_at >= date_trunc('month', now())
  order by 2 desc;
end;
$function$;

create or replace function admin_billing_summary()
returns table(collected_this_month numeric, outstanding numeric, overdue_count bigint, failed_count bigint, failed_value numeric, refunded_this_month numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select
      coalesce(sum(i.amount_gbp) filter (
        where i.status = 'paid' and i.paid_at >= date_trunc('month', now())), 0),
      coalesce(sum(i.amount_gbp) filter (where i.status in ('sent','overdue')), 0),
      count(*) filter (
        where i.status = 'overdue'
           or (i.status = 'sent' and i.due_at is not null and i.due_at < current_date)),
      count(*) filter (where i.status = 'failed'),
      coalesce(sum(i.amount_gbp) filter (where i.status = 'failed'), 0),
      coalesce(sum(i.amount_gbp) filter (
        where i.status = 'refunded' and i.updated_at >= date_trunc('month', now())), 0)
    from invoices i;
end;
$function$;

create or replace function admin_invoices()
returns table(id uuid, reference text, payer text, type text, amount_gbp numeric, status text, due_at date, paid_at timestamp with time zone, method text, po_number text, attempt_count integer, failure_reason text, school_id uuid, user_id uuid, created_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select
      i.id, i.reference,
      coalesce(sc.name,
        nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.surname,'')), ''),
        u.email::text, '-'),
      i.type, i.amount_gbp,
      case when i.status = 'sent' and i.due_at is not null and i.due_at < current_date
           then 'overdue' else i.status end,
      i.due_at, i.paid_at, i.method, i.po_number,
      i.attempt_count, i.failure_reason,
      i.school_id, i.user_id, i.created_at
    from invoices i
    left join schools sc   on sc.id = i.school_id
    left join auth.users u on u.id = i.user_id
    left join profiles p   on p.id = i.user_id
    order by i.created_at desc;
end;
$function$;

create or replace function admin_topup_summary()
returns table(sold_total bigint, sold_this_month bigint, revenue_total numeric, revenue_this_month numeric, ai_packs bigint, repeat_buyers bigint)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select count(*),
      count(*) filter (where p.created_at >= date_trunc('month', now())),
      coalesce(sum(p.price_gbp), 0),
      coalesce(sum(p.price_gbp) filter (where p.created_at >= date_trunc('month', now())), 0),
      count(*) filter (where p.kind = 'ai_image'),
      (select count(*) from (select pu.user_id from topup_purchases pu
        group by pu.user_id having count(*) > 1) r)
    from topup_purchases p;
end;
$function$;

create or replace function admin_recent_topups(p_limit integer default 50)
returns table(id uuid, user_id uuid, email text, pack_name text, kind text, units integer, price_gbp numeric, status text, stripe_payment_intent_id text, created_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select
      pu.id,
      pu.user_id,
      u.email::text,
      coalesce(t.name, 'AI credit top-up'),
      pu.kind,
      pu.units,
      pu.price_gbp,
      coalesce(inv.status, 'paid'),
      pu.stripe_payment_intent_id,
      pu.created_at
    from topup_purchases pu
    left join auth.users u on u.id = pu.user_id
    left join topup_packs t on t.id = pu.pack_id
    left join lateral (
      select i.status
      from invoices i
      where i.user_id = pu.user_id
        and i.type = 'topup'
        and i.amount_gbp = pu.price_gbp
        and i.created_at between pu.created_at - interval '2 minutes'
                             and pu.created_at + interval '2 minutes'
      order by i.created_at
      limit 1
    ) inv on true
    order by pu.created_at desc
    limit greatest(p_limit, 1);
end;
$function$;

create or replace function admin_topup_packs()
returns table(id uuid, kind text, name text, price_gbp numeric, unit integer, available_to text[], active boolean, stripe_price_id text, sort integer, sold bigint, revenue_gbp numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select t.id, t.kind, t.name, t.price_gbp, t.unit, t.available_to, t.active,
           t.stripe_price_id, t.sort,
           count(pu.id),
           coalesce(sum(pu.price_gbp), 0)
    from topup_packs t
    left join topup_purchases pu on pu.pack_id = t.id
    group by t.id
    order by t.sort;
end;
$function$;

create or replace function admin_plans()
returns table(plan_id text, name text, audience text, price_monthly numeric, price_yearly numeric, monthly_resources integer, ai_image_slideshows integer, description text, status text, stripe_price_monthly text, users bigint)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    select c.plan_id, c.name, c.audience, c.price_monthly, c.price_yearly,
           c.monthly_resources, c.ai_image_slideshows, c.description, c.status,
           c.stripe_price_monthly,
           count(p.id)
    from plan_config c
    left join profiles p on coalesce(p.plan, 'free') = c.plan_id
    where c.status <> 'retired'
    group by c.plan_id, c.name, c.audience, c.price_monthly, c.price_yearly,
             c.monthly_resources, c.ai_image_slideshows, c.description, c.status,
             c.stripe_price_monthly, c.sort
    order by c.sort;
end;
$function$;

create or replace function admin_thinnest_margins(lim integer default 10)
returns table(user_id uuid, teacher text, email text, plan text, is_admin boolean, revenue_gbp numeric, plan_revenue_gbp numeric, topup_revenue_gbp numeric, cost_usd numeric, ai_images bigint, generations bigint, contribution_gbp numeric, margin_pct numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  fx numeric := fx_usd_to_gbp();
begin
  perform admin_require_section('see_money');
  return query
    with usage as (
      select
        u.id,
        coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.surname,'')), ''),
                 u.email::text) as name,
        u.email::text as email,
        coalesce(p.plan, 'free') as plan,
        coalesce(p.is_admin, false) as is_admin,
        coalesce(pc.price_monthly, 0) as plan_revenue,
        (select coalesce(sum(tp.price_gbp), 0) from topup_purchases tp
          where tp.user_id = u.id
            and tp.kind = 'credit_gbp'
            and tp.created_at >= date_trunc('month', now())
            and not exists (
              select 1 from invoices inv
               where inv.user_id = tp.user_id
                 and inv.type = 'topup'
                 and inv.status = 'refunded'
                 and inv.amount_gbp = tp.price_gbp
                 and inv.created_at >= date_trunc('month', now())
            )) as topup_revenue,
        (select coalesce(sum(t.cost_usd), 0) from token_usage t
          where t.user_id = u.id and t.created_at >= date_trunc('month', now()))
        + (select coalesce(sum(a.cost_usd), 0) from asset_cost a
          where a.user_id = u.id and a.created_at >= date_trunc('month', now())) as cost,
        (select coalesce(sum(a2.units), 0)::bigint from asset_cost a2
          where a2.user_id = u.id and a2.kind = 'image'
            and a2.created_at >= date_trunc('month', now())) as images,
        (select count(*) from tool_runs r
          where r.user_id = u.id and r.created_at >= date_trunc('month', now())) as gens
      from auth.users u
      left join profiles p     on p.id = u.id
      left join plan_config pc on pc.plan_id = coalesce(p.plan, 'free')
    ),
    totals as (
      select us.*, (us.plan_revenue + us.topup_revenue) as revenue from usage us
    )
    select
      t.id, t.name, t.email, t.plan, t.is_admin,
      t.revenue,
      t.plan_revenue,
      t.topup_revenue,
      t.cost,
      t.images,
      t.gens,
      t.revenue - (t.cost * fx),
      case when t.revenue > 0
           then (t.revenue - (t.cost * fx)) / t.revenue
           else null end
    from totals t
    where t.gens > 0 or t.cost > 0
    order by
      case when t.revenue > 0 then (t.revenue - (t.cost * fx)) / t.revenue else 999 end,
      t.cost desc
    limit lim;
end;
$function$;

create or replace function admin_schools()
returns table(id uuid, name text, urn text, town text, trust_name text, status text, seats integer, seats_assigned bigint, seats_invited bigint, seats_dormant bigint, seats_free bigint, rate numeric, monthly_value numeric, annual_value numeric, resources_used bigint, resources_pool integer, ai_used bigint, ai_pool integer, cost_usd numeric, onboarding_percent integer, renews_at date, created_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    with seat_rollup as (
      select s.school_id,
        count(*) filter (where s.status = 'assigned') as assigned,
        count(*) filter (where s.status = 'invited')  as invited,
        count(*) filter (where s.status = 'dormant')  as dormant,
        count(*) filter (where s.status = 'free')     as free
      from school_seats s group by s.school_id
    ),
    usage as (
      select p.school_id,
        (select count(*) from tool_runs r
          where r.user_id = p.id and r.created_at >= date_trunc('month', now())) as runs,
        (select coalesce(sum(a.units), 0) from asset_cost a
          where a.user_id = p.id and a.kind = 'image'
            and a.created_at >= date_trunc('month', now())) as images,
        (select coalesce(sum(t.cost_usd), 0) from token_usage t
          where t.user_id = p.id and t.created_at >= date_trunc('month', now()))
        + (select coalesce(sum(a2.cost_usd), 0) from asset_cost a2
          where a2.user_id = p.id and a2.created_at >= date_trunc('month', now())) as cost
      from profiles p where p.school_id is not null
    ),
    usage_rollup as (
      select u.school_id, sum(u.runs)::bigint as runs,
             sum(u.images)::bigint as images, sum(u.cost) as cost
      from usage u group by u.school_id
    ),
    tasks as (
      select t.school_id,
             (count(*) filter (where t.done) * 100 / greatest(count(*), 1))::integer as pct
      from school_onboarding_tasks t group by t.school_id
    )
    select
      sc.id, sc.name, sc.urn, sc.town, tr.name, sc.status, sc.seats,
      coalesce(sr.assigned, 0), coalesce(sr.invited, 0),
      coalesce(sr.dormant, 0),  coalesce(sr.free, 0),
      seat_rate(sc.seats),
      seat_rate(sc.seats) * sc.seats,
      seat_rate(sc.seats) * sc.seats * 12,
      coalesce(ur.runs, 0), sc.seats * sc.resources_per_seat,
      coalesce(ur.images, 0), sc.seats * sc.ai_images_per_seat,
      coalesce(ur.cost, 0), coalesce(tk.pct, 0), sc.renews_at, sc.created_at
    from schools sc
    left join trusts tr       on tr.id = sc.trust_id
    left join seat_rollup sr  on sr.school_id = sc.id
    left join usage_rollup ur on ur.school_id = sc.id
    left join tasks tk        on tk.school_id = sc.id
    order by sc.created_at desc;
end;
$function$;

create or replace function admin_school_detail(sid uuid)
returns table(id uuid, name text, urn text, town text, phase text, trust_name text, status text, seats integer, seats_assigned bigint, seats_invited bigint, seats_dormant bigint, seats_free bigint, rate numeric, monthly_value numeric, billing_type text, po_number text, finance_email text, payment_terms integer, invoice_schedule text, vat_registered boolean, contract_start date, renews_at date, contract_months integer, onboarding_fee numeric, dpa_signed_at timestamp with time zone, domain_allowlist text, resources_per_seat integer, ai_images_per_seat integer, resources_used bigint, ai_used bigint, cost_usd numeric, contact_name text, contact_role text, contact_email text, contact_phone text, notes text, created_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_money');
  return query
    with seat_rollup as (
      select
        count(*) filter (where s.status = 'assigned') as assigned,
        count(*) filter (where s.status = 'invited')  as invited,
        count(*) filter (where s.status = 'dormant')  as dormant,
        count(*) filter (where s.status = 'free')     as free
      from school_seats s where s.school_id = sid
    ),
    usage_rollup as (
      select
        coalesce(sum((select count(*) from tool_runs r
          where r.user_id = p.id and r.created_at >= date_trunc('month', now()))), 0)::bigint as runs,
        coalesce(sum((select coalesce(sum(a.units), 0) from asset_cost a
          where a.user_id = p.id and a.kind = 'image'
            and a.created_at >= date_trunc('month', now()))), 0)::bigint as images,
        coalesce(sum(
          (select coalesce(sum(t.cost_usd), 0) from token_usage t
            where t.user_id = p.id and t.created_at >= date_trunc('month', now()))
          + (select coalesce(sum(a2.cost_usd), 0) from asset_cost a2
            where a2.user_id = p.id and a2.created_at >= date_trunc('month', now()))
        ), 0) as cost
      from profiles p where p.school_id = sid
    )
    select
      sc.id, sc.name, sc.urn, sc.town, sc.phase, tr.name, sc.status, sc.seats,
      sr.assigned, sr.invited, sr.dormant, sr.free,
      seat_rate(sc.seats), seat_rate(sc.seats) * sc.seats,
      sc.billing_type, sc.po_number, sc.finance_email, sc.payment_terms,
      sc.invoice_schedule, sc.vat_registered,
      sc.contract_start, sc.renews_at, sc.contract_months, sc.onboarding_fee,
      sc.dpa_signed_at, sc.domain_allowlist,
      sc.resources_per_seat, sc.ai_images_per_seat,
      ur.runs, ur.images, ur.cost,
      sc.contact_name, sc.contact_role, sc.contact_email, sc.contact_phone,
      sc.notes, sc.created_at
    from schools sc
    left join trusts tr on tr.id = sc.trust_id
    cross join seat_rollup sr
    cross join usage_rollup ur
    where sc.id = sid;
end;
$function$;

create or replace function admin_fx_rate()
returns table(usd_to_gbp numeric, reviewed_at date, note text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- Was `language sql` with no guard at all. Rewritten as plpgsql purely so a
  -- guard can run before the select; the query itself is unchanged.
  perform admin_require_section('see_money');
  return query
    select f.usd_to_gbp, f.reviewed_at, f.note from fx_rate f where f.id;
end;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- TEACHER PII  ->  see_people
--
-- Names, emails and what each person generated. Arguably more sensitive to an
-- outside contractor than the MRR figure: revenue is one number, this is every
-- customer's identity.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function admin_users()
returns table(id uuid, email text, first_name text, surname text, plan text, subscription_status text, is_admin boolean, created_at timestamp with time zone, generations bigint, generations_this_month bigint, cost_usd numeric, ai_images_this_month bigint, resources_topup bigint, ai_topup bigint, school_id uuid, school_name text, suspended_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_people');
  return query
    select
      u.id, u.email::text, p.first_name, p.surname, p.plan, p.subscription_status,
      coalesce(p.is_admin, false), u.created_at,
      coalesce(r.gens, 0), coalesce(rm.gens, 0),
      coalesce(tu.cost, 0) + coalesce(ac.cost, 0),
      coalesce(img.units, 0),
      coalesce(gr.resource_topup, 0), coalesce(gr.ai_topup, 0),
      p.school_id, sc.name,
      p.suspended_at
    from profiles p
    join auth.users u on u.id = p.id
    left join schools sc on sc.id = p.school_id
    left join (select tr.user_id, count(*) as gens from tool_runs tr group by tr.user_id) r
      on r.user_id = u.id
    left join (
      select tr2.user_id, count(*) as gens from tool_runs tr2
      where tr2.created_at >= date_trunc('month', now()) group by tr2.user_id
    ) rm on rm.user_id = u.id
    left join (select t2.user_id, sum(t2.cost_usd) as cost from token_usage t2 group by t2.user_id) tu
      on tu.user_id = u.id
    left join (select a2.user_id, sum(a2.cost_usd) as cost from asset_cost a2 group by a2.user_id) ac
      on ac.user_id = u.id
    left join (
      select a3.user_id, sum(a3.units)::bigint as units from asset_cost a3
      where a3.kind = 'image' and a3.created_at >= date_trunc('month', now())
      group by a3.user_id
    ) img on img.user_id = u.id
    left join (
      select g.user_id,
        sum(g.amount) filter (where g.kind = 'resource')::bigint as resource_topup,
        sum(g.amount) filter (where g.kind = 'ai_image')::bigint as ai_topup
      from allowance_grants g
      where g.created_at >= date_trunc('month', now())
        and (g.expires_at is null or g.expires_at > now())
      group by g.user_id
    ) gr on gr.user_id = u.id
    order by u.created_at desc;
end;
$function$;

create or replace function admin_teacher_detail(uid uuid)
returns table(id uuid, email text, first_name text, surname text, dial_code text, phone text, country text, plan text, subscription_status text, stripe_customer_id text, current_period_end timestamp with time zone, is_admin boolean, created_at timestamp with time zone, generations bigint, generations_this_month bigint, cost_usd numeric, suspended_at timestamp with time zone, suspended_reason text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_people');
  return query
    select
      u.id,
      u.email::text,
      p.first_name,
      p.surname,
      p.dial_code,
      p.phone,
      p.country,
      p.plan,
      p.subscription_status,
      p.stripe_customer_id,
      p.current_period_end,
      coalesce(p.is_admin, false),
      u.created_at,
      coalesce(r.gens, 0),
      coalesce(rm.gens, 0),
      coalesce(tu.cost, 0) + coalesce(ac.cost, 0),
      p.suspended_at,
      p.suspended_reason
    from auth.users u
    left join profiles p on p.id = u.id
    left join (select tr.user_id, count(*) as gens from tool_runs tr where tr.user_id = uid group by tr.user_id) r on r.user_id = u.id
    left join (
      select tr2.user_id, count(*) as gens
      from tool_runs tr2
      where tr2.user_id = uid and tr2.created_at >= date_trunc('month', now())
      group by tr2.user_id
    ) rm on rm.user_id = u.id
    left join (select t2.user_id, sum(t2.cost_usd) as cost from token_usage t2 where t2.user_id = uid group by t2.user_id) tu on tu.user_id = u.id
    left join (select a2.user_id, sum(a2.cost_usd) as cost from asset_cost a2 where a2.user_id = uid group by a2.user_id) ac on ac.user_id = u.id
    where u.id = uid;
end;
$function$;

create or replace function admin_recent_runs(lim integer default 50)
returns table(id uuid, email text, tool_slug text, title text, created_at timestamp with time zone, models text[], cost_usd numeric, cost_is_exact boolean)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- see_people rather than see_product: the rows carry an email address, which
  -- is what decides who may read them.
  perform admin_require_section('see_people');
  return query
    select
      r.id, u.email::text, r.tool_slug, r.title, r.created_at,
      case
        when r.run_id is not null then
          coalesce((
            select array_agg(distinct tu.model)
            from token_usage tu where tu.run_id = r.run_id
          ), array[]::text[])
        else
          coalesce((
            select array_agg(distinct tu.model)
            from token_usage tu
            where tu.user_id = r.user_id and tu.run_id is null
              and tu.created_at between r.created_at - interval '1 minute'
                                    and r.created_at + interval '1 minute'
          ), array[]::text[])
      end as models,
      case
        when r.run_id is not null then
          coalesce((select sum(tu.cost_usd) from token_usage tu where tu.run_id = r.run_id), 0)
          + coalesce((select sum(ac.cost_usd) from asset_cost ac where ac.run_id = r.run_id), 0)
        else
          coalesce((
            select sum(tu.cost_usd) from token_usage tu
            where tu.user_id = r.user_id and tu.run_id is null
              and tu.created_at between r.created_at - interval '1 minute'
                                    and r.created_at + interval '1 minute'
          ), 0)
          + coalesce((
            select sum(ac.cost_usd) from asset_cost ac
            where ac.user_id = r.user_id and ac.run_id is null
              and ac.created_at between r.created_at - interval '1 minute'
                                    and r.created_at + interval '1 minute'
          ), 0)
      end as cost_usd,
      (r.run_id is not null) as cost_is_exact
    from tool_runs r
    left join auth.users u on u.id = r.user_id
    order by r.created_at desc
    limit lim;
end;
$function$;

create or replace function admin_teacher_activity(uid uuid, lim integer default 50, off integer default 0)
returns table(id uuid, tool_slug text, title text, created_at timestamp with time zone, approx_cost_usd numeric, cost_is_exact boolean, total_count bigint)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_people');
  return query
    with runs as (
      select r.id, r.tool_slug, r.title, r.created_at, r.run_id
      from tool_runs r
      where r.user_id = uid
    ),
    total as (select count(*) as n from runs),
    page as (
      select * from runs order by runs.created_at desc limit lim offset off
    )
    select
      rp.id, rp.tool_slug, rp.title, rp.created_at,
      case
        when rp.run_id is not null then
          coalesce((select sum(t.cost_usd) from token_usage t where t.run_id = rp.run_id), 0)
          + coalesce((select sum(a.cost_usd) from asset_cost a where a.run_id = rp.run_id), 0)
        else
          coalesce((
            select sum(t.cost_usd) from token_usage t
            where t.user_id = uid and t.run_id is null
              and t.created_at between rp.created_at - interval '1 minute'
                                   and rp.created_at + interval '1 minute'
          ), 0)
          + coalesce((
            select sum(a.cost_usd) from asset_cost a
            where a.user_id = uid and a.run_id is null
              and a.created_at between rp.created_at - interval '1 minute'
                                   and rp.created_at + interval '1 minute'
          ), 0)
      end,
      (rp.run_id is not null),
      (select total.n from total)
    from page rp
    order by rp.created_at desc;
end;
$function$;

create or replace function admin_teacher_recent_runs(uid uuid, lim integer default 10)
returns table(id uuid, tool_slug text, title text, created_at timestamp with time zone, approx_cost_usd numeric, cost_is_exact boolean)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_people');
  return query
    select
      r.id, r.tool_slug, r.title, r.created_at,
      case
        when r.run_id is not null then
          coalesce((select sum(tu.cost_usd) from token_usage tu where tu.run_id = r.run_id), 0)
          + coalesce((select sum(ac.cost_usd) from asset_cost ac where ac.run_id = r.run_id), 0)
        else
          coalesce((
            select sum(tu.cost_usd) from token_usage tu
            where tu.user_id = uid and tu.run_id is null
              and tu.created_at between r.created_at - interval '1 minute'
                                   and r.created_at + interval '1 minute'
          ), 0)
          + coalesce((
            select sum(ac.cost_usd) from asset_cost ac
            where ac.user_id = uid and ac.run_id is null
              and ac.created_at between r.created_at - interval '1 minute'
                                   and r.created_at + interval '1 minute'
          ), 0)
      end as approx_cost_usd,
      (r.run_id is not null) as cost_is_exact
    from tool_runs r
    where r.user_id = uid
    order by r.created_at desc
    limit lim;
end;
$function$;


-- ── After pushing, confirm nothing but the guard changed ────────────────────
--
--   select p.proname,
--          pg_get_function_result(p.oid) as returns,
--          p.prosecdef,
--          pg_get_functiondef(p.oid) ilike '%admin_require_section%' as guarded
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('teacher_mrr','admin_dashboard','admin_overview',
--       'admin_usage_summary','admin_cost_breakdown','admin_billing_summary',
--       'admin_invoices','admin_topup_summary','admin_recent_topups',
--       'admin_topup_packs','admin_plans','admin_thinnest_margins',
--       'admin_schools','admin_school_detail','admin_fx_rate','admin_users',
--       'admin_teacher_detail','admin_recent_runs','admin_teacher_activity',
--       'admin_teacher_recent_runs')
--   order by guarded, p.proname;
--
-- Every row must read guarded = true, prosecdef = true, and the same `returns`
-- as before. A changed signature means a body was rebuilt wrongly.
