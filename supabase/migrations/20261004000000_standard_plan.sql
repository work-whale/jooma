-- Standard replaces Free.
--
-- Free (1 a day, 5 a month) is withdrawn. Standard is the new entry plan at
-- GBP 4.99 a month for 500 credits, and every self-serve plan now starts with a
-- 3 day free trial taken through Stripe Checkout.
--
-- THE VALUE 'free' STAYS, with a new meaning: "no active subscription". It is
-- what a signup who never checked out, a lapsed subscriber and every old Free
-- account all hold, and the app refuses every generation for it (see
-- checkAllGates). It is deliberately not renamed: the database functions here
-- already read 'free' as "not paying" (is_paying_profile, my_generation_gate,
-- the MRR and audience functions), which is exactly what it still means. So
-- existing Free accounts need no data change to become locked.

-- ── Plan constraints ─────────────────────────────────────────────────────────

alter table profiles drop constraint if exists profiles_plan_check;
alter table profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'standard', 'pro', 'max', 'school'));

alter table plan_config drop constraint if exists plan_config_plan_id_check;
alter table plan_config
  add constraint plan_config_plan_id_check
  check (plan_id in ('free', 'standard', 'pro', 'max', 'school'));

-- An ambassador is owed for a Standard subscriber exactly as for Pro or Max.
alter table ambassador_referrals drop constraint if exists ambassador_referrals_first_paid_plan_check;
alter table ambassador_referrals
  add constraint ambassador_referrals_first_paid_plan_check
  check (first_paid_plan in ('standard', 'pro', 'max'));

-- ── plan_config ──────────────────────────────────────────────────────────────

-- stripe_price_monthly is left null on purpose: price ids differ per
-- environment, and priceIdFor() falls back to STRIPE_PRICE_STANDARD_MONTHLY.
-- Set it from the admin Plans screen to make it a live database setting.
insert into plan_config
  (plan_id, name, audience, price_monthly, price_yearly, monthly_resources,
   ai_image_slideshows, description, status, sort)
values
  ('standard', 'Standard', 'teacher', 4.99, null, null,
   5, '500 credits a month. Every tool, watermarked exports.', 'live', 1)
on conflict (plan_id) do nothing;

update plan_config
   set name = 'No plan',
       description = 'No active subscription. Nothing can be generated.',
       monthly_resources = 0,
       status = 'retired',
       sort = 0,
       updated_at = now()
 where plan_id = 'free';

update plan_config set sort = 2, updated_at = now() where plan_id = 'pro';
update plan_config set sort = 3, updated_at = now() where plan_id = 'max';
update plan_config set sort = 4, updated_at = now() where plan_id = 'school';

-- ── Top-up packs ─────────────────────────────────────────────────────────────
-- An account with no plan cannot spend credit, so it must not be sold any.
-- Standard takes its place on every pack that offered Free.

update topup_packs
   set available_to = case
         when 'standard' = any(available_to) then array_remove(available_to, 'free')
         else array_replace(available_to, 'free', 'standard')
       end
 where 'free' = any(available_to);

alter table topup_packs
  alter column available_to set default array['standard', 'pro', 'max']::text[];

create or replace function public.admin_upsert_topup_pack(payload jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  v_id := nullif(payload->>'id', '')::uuid;

  if v_id is null then
    insert into topup_packs (kind, name, price_gbp, unit, available_to, active, sort, stripe_price_id)
    values (
      payload->>'kind', payload->>'name',
      (payload->>'price_gbp')::numeric, (payload->>'unit')::integer,
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(payload->'available_to')),
        array['standard','pro','max']::text[]
      ),
      coalesce((payload->>'active')::boolean, true),
      -- Was a flat 99, so every pack created from the console collided on the
      -- same sort and `order by sort limit 1` picked between them arbitrarily.
      -- Append to the end of the list instead.
      coalesce(
        (payload->>'sort')::integer,
        (select coalesce(max(sort), 0) + 1 from topup_packs)
      ),
      nullif(payload->>'stripe_price_id', '')
    )
    returning id into v_id;
    perform admin_log('Created top-up pack', 'billing', 'topup_pack', v_id::text, payload->>'name', payload);
  else
    update topup_packs set
      name            = coalesce(nullif(payload->>'name', ''), name),
      price_gbp       = coalesce((payload->>'price_gbp')::numeric, price_gbp),
      unit            = coalesce((payload->>'unit')::integer, unit),
      active          = coalesce((payload->>'active')::boolean, active),
      sort            = coalesce((payload->>'sort')::integer, sort),
      available_to    = coalesce(
                          (select array_agg(value::text)
                             from jsonb_array_elements_text(payload->'available_to')),
                          available_to
                        ),
      stripe_price_id = coalesce(nullif(payload->>'stripe_price_id', ''), stripe_price_id)
    where id = v_id;
    perform admin_log('Updated top-up pack', 'billing', 'topup_pack', v_id::text, payload->>'name', payload);
  end if;

  return v_id;
end;
$function$;

-- ── Tool scoping (metadata) ──────────────────────────────────────────────────

update tool_settings
   set plans = array_append(plans, 'standard')
 where not ('standard' = any(plans));

alter table tool_settings
  alter column plans set default array['free', 'standard', 'pro', 'max', 'school']::text[];

-- ── Signup stats ─────────────────────────────────────────────────────────────
-- A `standard` column alongside free/pro/max. The return type changes, so the
-- function is dropped and recreated rather than replaced.

drop function if exists public.admin_signup_stats_by_month(integer);

create function public.admin_signup_stats_by_month(p_months integer default 12)
 returns table(month_start date, label text, signups bigint, free bigint, standard bigint, pro bigint, max bigint, paid bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can('see_stats') then
    raise exception 'your role cannot see stats';
  end if;

  -- Clamped rather than trusted: p_months reaches this from a URL parameter,
  -- and generate_series with a hostile value is a cheap way to hurt the server.
  p_months := greatest(1, least(coalesce(p_months, 12), 120));

  return query
    select
      d.m::date,
      to_char(d.m, 'Mon YYYY'),
      count(p.id),
      count(p.id) filter (where coalesce(p.plan, 'free') = 'free'),
      count(p.id) filter (where p.plan = 'standard'),
      count(p.id) filter (where p.plan = 'pro'),
      count(p.id) filter (where p.plan = 'max'),
      count(p.id) filter (where is_paying_profile(p))
    from generate_series(
      date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as d(m)
    -- LEFT join: a month with no signups must appear as a zero row, or the bar
    -- chart silently closes the gap and reads as continuous growth.
    left join profiles p
      on p.created_at >= d.m
     and p.created_at < d.m + interval '1 month'
     and coalesce(p.is_admin, false) = false
    group by d.m
    order by d.m;
end;
$function$;

revoke all on function public.admin_signup_stats_by_month(integer) from public, anon;
grant execute on function public.admin_signup_stats_by_month(integer) to authenticated, service_role;

-- ── Landing copy ─────────────────────────────────────────────────────────────
-- Only where the value is still the shipped default, so an admin's own edit is
-- never overwritten.

update copy_blocks
   set value = 'Start free trial', updated_at = now()
 where key = 'home.hero.cta'
   and value = 'Start free';

update copy_blocks
   set value = 'Three days free on every plan. Cancel any time before it ends.',
       updated_at = now()
 where key = 'home.hero.reassure'
   and value = 'Five free resources a month. No card needed.';
