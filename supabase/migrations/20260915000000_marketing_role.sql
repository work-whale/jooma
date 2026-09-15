-- ── Marketing role, and per-section visibility ───────────────────────────────
--
-- Three things at once, because they cannot be split without leaving the
-- database in a state the UI disagrees with:
--
--   1. `content` and `developer` go; `marketing` arrives.
--   2. Eight `see_*` permissions land, one per sidebar section, so a role's
--      reach is data rather than code.
--   3. admin_console_access() returns the caller's role and permission set in
--      one round trip, because the layout would otherwise fire eight admin_can
--      calls to draw one sidebar.
--
-- ORDER IS LOAD BEARING. The CHECK rewrite comes AFTER the reassignment, or
-- adding the constraint fails while validating rows it is about to forbid.
--
-- THE ROLE LIST LIVES IN FOUR PLACES. This migration changes all of them:
--   - the admin_team.role CHECK constraint, below
--   - the inline guard in admin_set_role()
--   - the inline guard in admin_grant_admin()
--   - app/lib/adminRoles.ts, on the TypeScript side
--
-- Checked against production before writing: admin_team holds 4 rows and NONE
-- is on content or developer, so step 1 is a no-op there. It stays in because
-- staging and local databases may differ, and because a constraint that has to
-- be dropped by hand at 2am is a worse outcome than a redundant update.

-- ── 1. Reassign anyone on a role that is going ───────────────────────────────
-- To support, not marketing: a content editor moved to marketing would lose
-- edit_copy and GAIN revenue visibility, which is not a demotion anyone asked
-- for. Support is the column default and the least surprising landing spot.
-- Reassign by hand afterwards if someone deserves otherwise.
update admin_team set role = 'support' where role in ('content', 'developer');

-- ── 2. Rewrite the CHECK ─────────────────────────────────────────────────────
-- Created inline in 20260805001700, so Postgres named it admin_team_role_check.
-- `if exists` covers the case where it was ever renamed by hand.
alter table admin_team drop constraint if exists admin_team_role_check;
alter table admin_team add constraint admin_team_role_check
  check (role in ('super_admin', 'support', 'finance', 'marketing'));

-- ── 3. Drop the dead roles' permission rows ──────────────────────────────────
-- role_permissions has no FK to a roles table (role is free text), so this is
-- just a delete. The matrix UI renders one column per role from the TypeScript
-- list, so leaving these would show columns nobody can be assigned to.
delete from role_permissions where role in ('content', 'developer');

-- ── 4. Seed the new permissions ──────────────────────────────────────────────
-- ON CONFLICT DO NOTHING, deliberately.
--
-- The original seed in 20260805001700 guarded with
-- `where not exists (select 1 from role_permissions)`, which is all-or-nothing:
-- now the table is populated that guard would skip every row here. 20260811000300
-- hit exactly this and documents it. Per-row conflict handling also makes this
-- migration re-runnable, which the two ALTERs above already are.
--
-- Marketing gets see_stats and nothing else. Every action permission below is
-- seeded false for it, so the role cannot act even where a page is reachable.
insert into role_permissions (role, permission, allowed)
values
  -- Sections. One per sidebar group, plus stats.
  ('super_admin','see_overview',true), ('support','see_overview',true),
  ('finance','see_overview',true),     ('marketing','see_overview',false),

  -- Finance sees stats too: revenue questions and signup questions are the
  -- same conversation. Drop this row if stats should be marketing only.
  ('super_admin','see_stats',true),    ('support','see_stats',false),
  ('finance','see_stats',true),        ('marketing','see_stats',true),

  ('super_admin','see_people',true),   ('support','see_people',true),
  ('finance','see_people',true),       ('marketing','see_people',false),

  ('super_admin','see_money',true),    ('support','see_money',false),
  ('finance','see_money',true),        ('marketing','see_money',false),

  ('super_admin','see_product',true),  ('support','see_product',true),
  ('finance','see_product',false),     ('marketing','see_product',false),

  ('super_admin','see_support',true),  ('support','see_support',true),
  ('finance','see_support',false),     ('marketing','see_support',false),

  ('super_admin','see_content',true),  ('support','see_content',true),
  ('finance','see_content',false),     ('marketing','see_content',false),

  ('super_admin','see_admin',true),    ('support','see_admin',false),
  ('finance','see_admin',false),       ('marketing','see_admin',false),

  -- Actions, for the new role only. The other three roles already have theirs
  -- from earlier migrations and must not be disturbed here.
  ('marketing','see_teachers',false),
  ('marketing','reset_passwords',false),
  ('marketing','view_as_teacher',false),
  ('marketing','invite_teachers',false),
  ('marketing','grant_allowance',false),
  ('marketing','suspend_accounts',false),
  ('marketing','change_plan',false),
  ('marketing','issue_refunds',false),
  ('marketing','edit_copy',false),
  ('marketing','onboard_school',false),
  ('marketing','toggle_tools',false),
  ('marketing','see_deletions',false),
  ('marketing','manage_admins',false),
  ('marketing','export_personal_data',false)
on conflict (role, permission) do nothing;

-- Same reasoning as super_admin/manage_admins in 20260813000500: unticking this
-- would hide the Team page from the only role that can unhide it, and there is
-- no route back through the UI. admin_set_permission already refuses to switch
-- a protected row off, and TeamView renders a padlock instead of a toggle.
update role_permissions
   set protected = true
 where role = 'super_admin' and permission = 'see_admin';

-- ── 5. Teach the role guards the new list ────────────────────────────────────
-- Both bodies are unchanged from their previous migrations except the role
-- list. Recreated in full because `create or replace` needs the whole function.

create or replace function admin_set_role(uid uuid, p_role text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_email text; v_supers integer;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can('manage_admins') then
    raise exception 'your role cannot manage admins';
  end if;
  if p_role not in ('super_admin','support','finance','marketing') then
    raise exception 'invalid role';
  end if;

  select u.email::text into v_email from auth.users u where u.id = uid;
  if v_email is null then raise exception 'no such user'; end if;

  -- Never let the last super admin demote themselves: that would leave nobody
  -- able to manage roles, with no way back through the UI.
  if p_role <> 'super_admin' then
    select count(*) into v_supers
    from profiles p
    left join admin_team t on t.user_id = p.id
    where p.is_admin and coalesce(t.role, 'super_admin') = 'super_admin'
      and p.id <> uid;
    if v_supers = 0 then
      raise exception 'cannot remove the last super admin';
    end if;
  end if;

  insert into admin_team (user_id, role, invited_by)
  values (uid, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;

  perform admin_log('Changed admin role', 'access', 'admin', uid::text, v_email,
    jsonb_build_object('role', p_role));
end;
$$;
revoke execute on function admin_set_role(uuid, text) from anon, public;
grant execute on function admin_set_role(uuid, text) to authenticated;

create or replace function admin_grant_admin(uid uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_email text; v_already boolean;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if not admin_can('manage_admins') then
    raise exception 'your role cannot manage admins';
  end if;
  if p_role not in ('super_admin','support','finance','marketing') then
    raise exception 'invalid role';
  end if;

  select u.email::text, coalesce(p.is_admin, false)
    into v_email, v_already
  from profiles p
  join auth.users u on u.id = p.id
  where p.id = uid;

  if v_email is null then raise exception 'no such user'; end if;
  -- Not an error worth being clever about, but worth being explicit: silently
  -- succeeding here would let this be used to change an existing admin's role
  -- while bypassing admin_set_role's last-super-admin guard.
  if v_already then raise exception 'already an admin'; end if;

  update profiles set is_admin = true where id = uid;

  insert into admin_team (user_id, role, invited_by)
  values (uid, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;

  perform admin_log('Made an admin', 'access', 'admin', uid::text, v_email,
    jsonb_build_object('role', p_role));
end;
$$;
revoke execute on function admin_grant_admin(uuid, text) from anon, public;
grant execute on function admin_grant_admin(uuid, text) to authenticated;

-- ── 6. The caller's access, in one round trip ────────────────────────────────
-- The admin layout renders on every page in the console. Asking admin_can()
-- eight times to decide which sidebar groups to draw would be eight round trips
-- per navigation; this is one.
--
-- Returns ONLY the permissions that are allowed, so the caller can treat the
-- array as a set and never has to check a boolean. Role comes back alongside
-- because the UI shows it, and fetching it separately would defeat the point.
--
-- admin_can() and admin_my_permissions() are deliberately untouched:
-- admin_can() is the API-route boundary in app/lib/auth/admin-route.ts, and
-- three pages already depend on both. This is purely additive.
create or replace function admin_console_access()
returns table (role text, permissions text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  return query
  select
    admin_role(),
    coalesce(
      (select array_agg(rp.permission order by rp.permission)
         from role_permissions rp
        where rp.role = admin_role() and rp.allowed),
      array[]::text[]
    );
end;
$$;
revoke execute on function admin_console_access() from anon, public;
grant execute on function admin_console_access() to authenticated;

comment on function admin_console_access() is
  'The calling admin''s role and the permissions they hold, in one round trip. Drives the sidebar and the page-level section gates. Allowed permissions only, so callers can treat the array as a set.';
