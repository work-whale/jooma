-- ── Incomplete signups ───────────────────────────────────────────────────────
-- Accounts that exist in auth.users but never finished onboarding had ended up
-- owned by neither admin surface, so they were invisible to the console while
-- still generating resources.
--
-- How the gap opened, since both halves were deliberate:
--
--   * admin_users() starts FROM profiles (20260812000100). That was the fix for
--     invite-created auth users showing up in the Teachers tab as blank-named
--     rows, and it should stay that way.
--   * admin_pending_invites() used to INFER a pending invite from "an auth user
--     with no profiles row", which caught these accounts by accident. Then
--     20260812000200 made invites a real table and rewrote the function to read
--     it, noting at the time that the old inference "also caught self-signups
--     mid-onboarding". It did — and that was the only thing listing them.
--
-- So the state was handed from one function to the other and dropped. This
-- function owns it explicitly: a signed-up account with no profile and no open
-- invite. Normally empty; when it is not, each row is someone who abandoned
-- /complete-profile and can still spend money.
--
-- The generation count is the reason this is worth surfacing rather than just
-- counting: an orphan with runs against their name is a real person mid-use,
-- not an idle sign-in to ignore.

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
    select
      u.id,
      u.email::text,
      u.created_at,
      -- Which sign-in method got them this far. Google users are the ones who
      -- can reach this state most easily: /auth/callback sends them straight to
      -- /complete-profile with a live session, so closing the tab is all it
      -- takes.
      coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
      coalesce(r.gens, 0)
    from auth.users u
    left join profiles p on p.id = u.id
    left join (
      select tr.user_id, count(*) as gens from tool_runs tr group by tr.user_id
    ) r on r.user_id = u.id
    where p.id is null
      and u.deleted_at is null
      -- An open invite is already listed under Pending invites. Excluding it
      -- here keeps the two sections from double-reporting the same address, and
      -- keeps this list to accounts nobody is expecting.
      and not exists (
        select 1 from pending_invites i
        where lower(i.email) = lower(u.email::text)
          and i.accepted_at is null
      )
    order by r.gens desc nulls last, u.created_at desc;
end;
$$;
revoke execute on function admin_incomplete_signups() from anon, public;
grant execute on function admin_incomplete_signups() to authenticated;
