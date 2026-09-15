-- ── Product internals behind see_product, and one restored dash ─────────────
--
-- The second half of 20260915000300, which guarded revenue and teacher PII and
-- deliberately left product internals for their own pass.
--
-- WHAT THESE LEAK, AND TO WHOM
--
-- No customer data: no names, no emails, no revenue. What they carry is the
-- cost structure and the technical choices behind it. Probed as a real
-- marketing user before writing this, the four unguarded functions returned:
--
--   admin_tool_usage_report   lesson-planner $19.25, generate-slideshow $0.04
--   admin_model_routing       gpt-4o $19.24, gpt-4o-2024-08-06 $0.04
--   admin_tools               49 tools, with per-tool model and effort settings
--   admin_slide_costs         per-slide generation costs
--
-- For a marketing agency that is mostly meaningless. For a competitor, or an
-- agency that also works with one, "Jooma runs gpt-4o and their lesson planner
-- costs about 19 dollars a month to operate" is real intelligence.
--
-- Reaching it takes deliberate effort: devtools, the anon key from the page
-- source, a hand-built RPC call. Nobody stumbles into it. But the barrier is
-- knowledge rather than permission, so it holds only while nobody curious is
-- looking, and you do not control who at an agency holds the login or what
-- happens to it when they leave.
--
-- admin_tool_step_breakdown was not in the probe above but carries the same
-- per-step costs, so it is guarded with the rest.
--
-- Bodies come from pg_get_functiondef() on staging, one line added, nothing
-- else touched. Same discipline as 20260915000300, for the same reason: these
-- have been recreated across several migrations and the newest file on disk is
-- not always what is running.

create or replace function admin_tool_usage_report()
returns table(tool_slug text, generations bigint, total_tokens bigint, reasoning_tokens bigint, models text[], text_cost_usd numeric, asset_cost_usd numeric, cost_usd numeric, last_used timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_product');
  return query
    with t as (
      select tu.tool_slug, count(*) as generations,
        sum(tu.prompt_tokens + tu.completion_tokens) as total_tokens,
        coalesce(sum(tu.reasoning_tokens), 0) as reasoning_tokens,
        array_agg(distinct tu.model) as models,
        sum(tu.cost_usd) as text_cost,
        max(tu.created_at) as last_text
      from token_usage tu
      where tu.created_at >= date_trunc('month', now())
      group by tu.tool_slug
    ),
    a as (
      select ac.tool_slug, sum(ac.cost_usd) as asset_cost, max(ac.created_at) as last_asset
      from asset_cost ac
      where ac.created_at >= date_trunc('month', now())
      group by ac.tool_slug
    )
    select
      coalesce(t.tool_slug, a.tool_slug),
      coalesce(t.generations, 0),
      coalesce(t.total_tokens, 0),
      coalesce(t.reasoning_tokens, 0),
      -- A tool with only image/audio spend has no token_usage row at all, so
      -- the full outer join yields NULL here rather than an empty array.
      coalesce(t.models, array[]::text[]),
      coalesce(t.text_cost, 0),
      coalesce(a.asset_cost, 0),
      coalesce(t.text_cost, 0) + coalesce(a.asset_cost, 0),
      greatest(t.last_text, a.last_asset)
    from t full outer join a on t.tool_slug = a.tool_slug
    order by 8 desc;
end;
$function$;

create or replace function admin_model_routing()
returns table(model text, effort text, runs bigint, total_tokens bigint, reasoning_tokens bigint, cache_write_tokens bigint, cost_usd numeric, cost_per_run numeric, tools bigint, text_total_usd numeric, all_in_total_usd numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_product');
  return query
    with totals as (
      select
        (select coalesce(sum(t.cost_usd),0) from token_usage t
          where t.created_at >= date_trunc('month', now())) as text_total,
        (select coalesce(sum(a.cost_usd),0) from asset_cost a
          where a.created_at >= date_trunc('month', now())) as asset_total
    )
    select
      tu.model,
      -- Not coalesced to a literal here: the UI decides how to render "this
      -- model has no effort setting", and a text placeholder in the data would
      -- be indistinguishable from a real effort named '—'.
      tu.effort,
      count(*),
      sum(tu.prompt_tokens + tu.completion_tokens),
      coalesce(sum(tu.reasoning_tokens), 0),
      coalesce(sum(tu.cache_write_tokens), 0),
      sum(tu.cost_usd),
      sum(tu.cost_usd) / greatest(count(*), 1),
      count(distinct tu.tool_slug),
      max(tt.text_total),
      max(tt.text_total + tt.asset_total)
    from token_usage tu
    cross join totals tt
    where tu.created_at >= date_trunc('month', now())
    group by tu.model, tu.effort
    order by 7 desc;
end;
$function$;

create or replace function admin_tools()
returns table(slug text, display_name text, enabled boolean, plans text[], model_note text, kind text, model text, effort text, verbosity text, runs bigint, total_tokens bigint, cost_usd numeric, cost_per_run numeric, avg_tokens numeric, avg_prompt_tokens numeric, avg_completion_tokens numeric, reasoning_tokens bigint, models text[], last_used timestamp with time zone)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_product');
  return query
    with text_usage as (
      select tu.tool_slug,
             count(*)                                     as runs,
             sum(tu.prompt_tokens + tu.completion_tokens) as tokens,
             sum(tu.prompt_tokens)                        as prompt_tokens,
             sum(tu.completion_tokens)                    as completion_tokens,
             sum(tu.reasoning_tokens)                     as reasoning_tokens,
             sum(tu.cost_usd)                             as cost,
             array_agg(distinct tu.model)                 as models,
             max(tu.created_at)                           as last_used
      from token_usage tu
      where tu.created_at >= date_trunc('month', now())
      group by tu.tool_slug
    ),
    asset_usage as (
      select ac.tool_slug,
             sum(ac.cost_usd) as cost,
             max(ac.created_at) as last_used
      from asset_cost ac
      where ac.created_at >= date_trunc('month', now())
      group by ac.tool_slug
    ),
    runs as (
      select r.tool_slug, count(*) as n
      from tool_runs r
      where r.created_at >= date_trunc('month', now())
      group by r.tool_slug
    )
    select
      t.slug,
      coalesce(t.display_name, t.slug),
      t.enabled,
      t.plans,
      t.model_note,
      t.kind,
      t.model,
      t.effort,
      t.verbosity,
      coalesce(rn.n, tx.runs, 0),
      coalesce(tx.tokens, 0),
      coalesce(tx.cost, 0) + coalesce(au.cost, 0),
      case
        when coalesce(rn.n, tx.runs, 0) > 0
        then (coalesce(tx.cost, 0) + coalesce(au.cost, 0)) / coalesce(rn.n, tx.runs)
        else 0
      end,
      case when coalesce(tx.runs, 0) > 0 then round(tx.tokens::numeric / tx.runs) else 0 end,
      -- Averages come from token_usage's own run count, never tool_runs': the
      -- client-written history table can miss rows, which would inflate the
      -- per-run average and overstate every projected cost.
      case when coalesce(tx.runs, 0) > 0 then round(tx.prompt_tokens::numeric / tx.runs) else 0 end,
      case when coalesce(tx.runs, 0) > 0 then round(tx.completion_tokens::numeric / tx.runs) else 0 end,
      coalesce(tx.reasoning_tokens, 0),
      coalesce(tx.models, array[]::text[]),
      greatest(tx.last_used, au.last_used)
    from tool_settings t
    left join text_usage  tx on tx.tool_slug = t.slug
    left join asset_usage au on au.tool_slug = t.slug
    left join runs        rn on rn.tool_slug = t.slug
    -- Preserved from 20260812130038: `hidden` rows stay out of the admin list.
    -- Utilities are NOT filtered here, they are the routes that migration
    -- exists to make controllable.
    where not t.hidden
    order by (coalesce(tx.cost, 0) + coalesce(au.cost, 0)) desc, t.slug;
end;
$function$;

create or replace function admin_slide_costs()
returns table(slide_label text, cost_usd numeric, created_at timestamp with time zone, breakdown jsonb)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_product');
  return query
    select sc.slide_label, sc.cost_usd, sc.created_at, sc.breakdown
    from slide_cost sc
    where sc.created_at >= date_trunc('month', now())
    order by sc.created_at desc;
end;
$function$;

create or replace function admin_tool_step_breakdown()
returns table(tool_slug text, step text, slide_label text, generations bigint, cost_usd numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform admin_require_section('see_product');
  return query
    with u as (
      select tu.tool_slug, coalesce(tu.step, 'Main') as step, null::text as slide_label,
             count(*)::bigint as gens, sum(tu.cost_usd) as cost
      from token_usage tu
      where tu.created_at >= date_trunc('month', now())
      group by tu.tool_slug, coalesce(tu.step, 'Main')
      union all
      select ac.tool_slug, coalesce(ac.step, 'Main'), ac.slide_label,
             0::bigint, sum(ac.cost_usd)
      from asset_cost ac
      where ac.created_at >= date_trunc('month', now())
      group by ac.tool_slug, coalesce(ac.step, 'Main'), ac.slide_label
    )
    select u.tool_slug, u.step, u.slide_label, sum(u.gens)::bigint, sum(u.cost)
    from u
    group by u.tool_slug, u.step, u.slide_label
    order by u.tool_slug, sum(u.cost) desc;
end;
$function$;


-- ── Restore the payer placeholder ───────────────────────────────────────────
--
-- 20260915000300 rebuilt admin_invoices to add its guard and, in doing so,
-- changed the fallback in the payer column from an em dash to a hyphen. That
-- was not intentional and not asked for: the no-dash lint rule covers the
-- marketing surfaces, not admin internals, and the migration's own header
-- claims one line added and nothing else touched. A rendered value is not a
-- comment, so it goes back.
--
-- Only the literal on the coalesce line differs from the version now running.
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
        u.email::text, '—'),
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


-- ── After pushing ───────────────────────────────────────────────────────────
--
--   select p.proname,
--          pg_get_functiondef(p.oid) ilike '%admin_require_section%' as guarded,
--          pg_get_functiondef(p.oid) like '%''—''%'                  as has_emdash
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('admin_tool_usage_report','admin_model_routing',
--       'admin_tools','admin_slide_costs','admin_tool_step_breakdown',
--       'admin_invoices')
--   order by p.proname;
--
-- All six guarded = true. admin_invoices and admin_model_routing both show
-- has_emdash = true: the first is the restored payer placeholder, the second is
-- an em dash inside a code comment that was there all along and is left alone.
