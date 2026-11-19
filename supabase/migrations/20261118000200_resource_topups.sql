-- Jooma 4.5: top-up packs in resources (spec Step 2 and Step 4).
--
-- The plans engine (20261118000000) counts top-ups as allowance_grants rows of
-- kind 'resources_topup', amount in resources, never expiring. Nothing could
-- write that kind yet: the three kind checks below only allowed the old
-- 'resource', 'ai_image' and 'credit_gbp'. This migration:
--
--   1. lets allowance_grants, topup_purchases and topup_packs hold
--      'resources_topup';
--   2. gives topup_packs a stable `pack_key` ('pack-500', 'pack-1500',
--      'pack-4000'), the id in app/lib/plan-config.ts TOP_UP_PACKS that rides
--      Stripe Checkout metadata. The resources and price a teacher sees come
--      from the config; this row only maps a pack to its Stripe price;
--   3. adds the three packs with NO Stripe price. Each environment sets its own
--      stripe_price_id afterwards (staging: done by Claude on 18 Nov; production:
--      the owner, from the admin top-ups screen or SQL). A pack with no price
--      is not for sale, so nothing can be charged by mistake in between;
--   4. lets admin_grant_allowance give goodwill resources ('resources_topup',
--      never expiring), since a 'credit_gbp' grant no longer moves the balance.
--
-- The old £1.50 'credit_gbp' pack is left as it is. The 4.5 code reads only
-- 'resources_topup' packs, so it is simply never offered again; switch it off
-- in admin when convenient.

-- 1. Kind checks
alter table allowance_grants drop constraint if exists allowance_grants_kind_check;
alter table allowance_grants add constraint allowance_grants_kind_check
  check (kind in ('resource', 'ai_image', 'credit_gbp', 'resources_topup'));

alter table topup_purchases drop constraint if exists topup_purchases_kind_check;
alter table topup_purchases add constraint topup_purchases_kind_check
  check (kind in ('resource', 'ai_image', 'credit_gbp', 'resources_topup'));

alter table topup_packs drop constraint if exists topup_packs_kind_check;
alter table topup_packs add constraint topup_packs_kind_check
  check (kind in ('resource', 'ai_image', 'credit_gbp', 'resources_topup'));

-- 2. Stable pack key
alter table topup_packs add column if not exists pack_key text;
create unique index if not exists topup_packs_pack_key_key on topup_packs (pack_key) where pack_key is not null;
comment on column topup_packs.pack_key is
  'Jooma 4.5: the TOP_UP_PACKS id in app/lib/plan-config.ts. Never rename one that has sold.';

-- 3. The three packs. `unit` is resources for this kind.
insert into topup_packs (kind, name, price_gbp, unit, available_to, active, sort, stripe_price_id, pack_key)
select v.kind, v.name, v.price_gbp, v.unit, array['standard', 'pro', 'max'], true, v.sort, null, v.pack_key
from (values
  ('resources_topup', '500 resources', 2.49::numeric, 500, 10, 'pack-500'),
  ('resources_topup', '1,500 resources', 5.99::numeric, 1500, 11, 'pack-1500'),
  ('resources_topup', '4,000 resources', 12.99::numeric, 4000, 12, 'pack-4000')
) as v(kind, name, price_gbp, unit, sort, pack_key)
where not exists (select 1 from topup_packs p where p.pack_key = v.pack_key);

-- 4. Goodwill resources from admin
create or replace function public.admin_grant_allowance(uid uuid, p_kind text, p_amount integer, p_reason text default 'Goodwill — support issue'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_label text;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  if p_kind not in ('resource', 'ai_image', 'credit_gbp', 'resources_topup') then
    raise exception 'kind must be resource, ai_image, credit_gbp or resources_topup';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_kind = 'ai_image' and p_amount > 500 then
    raise exception 'AI-image grants are capped at 500';
  end if;
  if p_kind in ('resource', 'resources_topup') and p_amount > 10000 then
    raise exception 'resource grants are capped at 10000';
  end if;
  if p_kind = 'credit_gbp' and p_amount > 5000 then
    raise exception 'credit grants are capped at £50';
  end if;

  insert into allowance_grants (user_id, kind, amount, reason, granted_by, expires_at)
  values (
    uid, p_kind, p_amount, p_reason, auth.uid(),
    -- 4.5 resources never expire, like a bought top-up.
    case when p_kind = 'resources_topup' then null
         else (date_trunc('month', now()) + interval '1 month') end
  )
  returning id into v_id;

  select coalesce(nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.surname,'')), ''), u.email::text)
    into v_label
  from auth.users u
  left join profiles p on p.id = u.id
  where u.id = uid;

  perform admin_log(
    case
      when p_kind = 'ai_image' then 'Granted ' || p_amount || ' AI-image slideshows'
      when p_kind = 'credit_gbp' then 'Granted £' || to_char(p_amount / 100.0, 'FM999990.00') || ' of AI credit'
      else 'Granted ' || p_amount || ' resources'
    end,
    'account',
    'user',
    uid::text,
    v_label,
    jsonb_build_object('kind', p_kind, 'amount', p_amount, 'reason', p_reason)
  );

  return v_id;
end;
$function$;
