-- Invite links without a name.
--
-- An admin now makes a link with one click and sends it wherever they found
-- the person, so there is no name to type. The applicant's own details arrive
-- with their application, as before. Older invites keep the name they were
-- made with.

-- The length check stays: it still holds for a name, and a null passes it.
alter table ambassador_invites alter column full_name drop not null;


-- ── Admin: create an invite ──────────────────────────────────────────────────
-- Same signature, so the API and verify-ambassadors.mjs keep calling it as is.
-- The name is optional now; the source still has to be one of the allowed ones.
create or replace function admin_create_ambassador_invite(
  p_full_name  text,
  p_source     text,
  p_token_hash text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  perform admin_require_section('see_money');
  if not admin_can('change_plan') then raise exception 'your role cannot invite ambassadors'; end if;

  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;

  insert into ambassador_invites (full_name, source, token_hash, created_by, expires_at)
  values (v_name, coalesce(p_source, 'other'), p_token_hash, auth.uid(), now() + interval '14 days')
  returning id into v_id;

  perform admin_log(
    case when v_name is null then 'Created an ambassador invite link'
         else format('Created an ambassador invite for %s', v_name) end,
    'billing', 'ambassador_invite', v_id::text, coalesce(v_name, 'Invite link'),
    jsonb_build_object('source', coalesce(p_source, 'other'))
  );

  return v_id;
end;
$$;
revoke execute on function admin_create_ambassador_invite(text, text, text) from anon, public;
grant execute on function admin_create_ambassador_invite(text, text, text) to authenticated;


-- ── Admin: invites issued ────────────────────────────────────────────────────
-- Adds used_by_name, from the application the link was used for, so a link
-- made without a name still reads as a person once it has been used. The
-- return type changes, so the function is dropped first.
drop function if exists admin_ambassador_invites();

create function admin_ambassador_invites()
returns table (
  id           uuid,
  full_name    text,
  source       text,
  created_at   timestamptz,
  expires_at   timestamptz,
  opened_at    timestamptz,
  used_at      timestamptz,
  state        text,
  used_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform admin_require_section('see_money');

  return query
  select
    i.id, i.full_name, i.source, i.created_at, i.expires_at, i.opened_at, i.used_at,
    case
      when i.revoked_at is not null then 'revoked'
      when i.used_at is not null then 'applied'
      when i.expires_at < now() then 'expired'
      when i.opened_at is not null then 'opened'
      else 'sent'
    end,
    (
      select btrim(a.first_name || ' ' || a.last_name)
      from ambassador_applications a
      where a.invite_id = i.id
      order by a.submitted_at desc
      limit 1
    )
  from ambassador_invites i
  where i.created_at > now() - interval '30 days'
  order by i.created_at desc;
end;
$$;
revoke execute on function admin_ambassador_invites() from anon, public;
grant execute on function admin_ambassador_invites() to authenticated;
