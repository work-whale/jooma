-- Admin area: an is_admin flag on profiles plus security-definer RPCs that
-- aggregate data across ALL users for the /admin dashboard. Every admin_* RPC is
-- gated by is_admin() so a non-admin calling it directly gets nothing — the
-- definer rights (which bypass RLS) are only usable by admins.

-- 1. Admin flag.
alter table profiles
  add column if not exists is_admin boolean not null default false;

-- 2. Is the caller an admin? security definer so it can read profiles regardless
--    of RLS; used as the guard inside every admin RPC.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;
grant execute on function is_admin() to authenticated;

-- 3. Global per-tool usage report (this month) — same shape as the per-user
--    my_tool_usage_report() but across everyone.
create or replace function admin_tool_usage_report()
returns table (
  tool_slug text,
  generations bigint,
  total_tokens bigint,
  text_cost_usd numeric,
  asset_cost_usd numeric,
  cost_usd numeric,
  last_used timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    with t as (
      select tu.tool_slug, count(*) as generations,
        sum(tu.prompt_tokens + tu.completion_tokens) as total_tokens,
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
      coalesce(t.text_cost, 0),
      coalesce(a.asset_cost, 0),
      coalesce(t.text_cost, 0) + coalesce(a.asset_cost, 0),
      greatest(t.last_text, a.last_asset)
    from t full outer join a on t.tool_slug = a.tool_slug
    order by 6 desc;
end;
$$;
grant execute on function admin_tool_usage_report() to authenticated;

-- 4. All users with plan, lifetime generations and lifetime cost.
create or replace function admin_users()
returns table (
  id uuid,
  email text,
  first_name text,
  surname text,
  plan text,
  subscription_status text,
  is_admin boolean,
  created_at timestamptz,
  generations bigint,
  cost_usd numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select
      u.id,
      u.email::text,
      p.first_name,
      p.surname,
      p.plan,
      p.subscription_status,
      coalesce(p.is_admin, false),
      u.created_at,
      coalesce(r.gens, 0),
      coalesce(tu.cost, 0) + coalesce(ac.cost, 0)
    from auth.users u
    left join profiles p on p.id = u.id
    left join (select tr.user_id, count(*) as gens from tool_runs tr group by tr.user_id) r on r.user_id = u.id
    left join (select t2.user_id, sum(t2.cost_usd) as cost from token_usage t2 group by t2.user_id) tu on tu.user_id = u.id
    left join (select a2.user_id, sum(a2.cost_usd) as cost from asset_cost a2 group by a2.user_id) ac on ac.user_id = u.id
    order by u.created_at desc;
end;
$$;
grant execute on function admin_users() to authenticated;

-- 5. Top-line KPIs for the overview page (single row).
create or replace function admin_overview()
returns table (
  total_users bigint,
  new_users_this_month bigint,
  paid_users bigint,
  generations_this_month bigint,
  cost_this_month numeric,
  presentations_total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
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
$$;
grant execute on function admin_overview() to authenticated;

-- 6. Subscription breakdown by plan.
create or replace function admin_plan_breakdown()
returns table (
  plan text,
  users bigint,
  active_subscribers bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select
      p.plan,
      count(*),
      count(*) filter (where p.subscription_status = 'active')
    from profiles p
    group by p.plan
    order by p.plan;
end;
$$;
grant execute on function admin_plan_breakdown() to authenticated;

-- 7. Recent tool runs across all users.
create or replace function admin_recent_runs(lim integer default 50)
returns table (
  id uuid,
  email text,
  tool_slug text,
  title text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select r.id, u.email::text, r.tool_slug, r.title, r.created_at
    from tool_runs r
    left join auth.users u on u.id = r.user_id
    order by r.created_at desc
    limit lim;
end;
$$;
grant execute on function admin_recent_runs(integer) to authenticated;

-- 8. Recent presentations across all users.
create or replace function admin_presentations(lim integer default 50)
returns table (
  id uuid,
  email text,
  title text,
  slide_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select pr.id, u.email::text, pr.title,
      coalesce(jsonb_array_length(pr.slides), 0),
      pr.created_at
    from presentations pr
    left join auth.users u on u.id = pr.user_id
    order by pr.created_at desc
    limit lim;
end;
$$;
grant execute on function admin_presentations(integer) to authenticated;

-- 9. Reset (delete) all recorded usage for the given tools, across all users.
--    Powers the Select -> Reset action on the admin Usage page.
create or replace function admin_reset_tool_usage(slugs text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  delete from token_usage where tool_slug = any(slugs);
  delete from asset_cost where tool_slug = any(slugs);
end;
$$;
grant execute on function admin_reset_tool_usage(text[]) to authenticated;

-- 10. Seed the first admin.
update profiles set is_admin = true
where id = (select id from auth.users where email = 'info@workwhale.ph');
