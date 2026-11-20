-- Accepting a newer ambassador agreement (version 0.5, 20 November 2026).
--
-- The agreement is signed once, on the application (agreement_version,
-- signature_name, signed_at, signed_ip). When its text changes, nobody is
-- moved across on their own: the app offers the new version and they stay on
-- the one they signed until they accept. Each acceptance is its own dated row
-- here, with the same evidence as the first signature, so the original is
-- never overwritten. The version in force is the newest of the two
-- (app/lib/ambassador-agreement-status.ts).
--
-- Writes are SERVICE-ROLE ONLY, like submit_ambassador_application: the route
-- (app/api/ambassadors/accept-agreement) checks the session and is the only
-- thing that knows the caller's real IP. Reads go through definer functions
-- that return named columns, never a policy.

create table if not exists ambassador_agreement_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null references ambassador_applications (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  version            text not null check (length(version) between 1 and 40),
  signature_name     text not null check (length(signature_name) between 4 and 120),
  accepted_at        timestamptz not null default now(),
  signed_ip          text check (signed_ip is null or length(signed_ip) <= 64),
  signed_user_agent  text check (signed_user_agent is null or length(signed_user_agent) <= 512),
  unique (application_id, version)
);

create index if not exists ambassador_agreement_acceptances_user_idx
  on ambassador_agreement_acceptances (user_id);

-- No policies: nothing reads or writes the table directly.
alter table ambassador_agreement_acceptances enable row level security;
revoke all on ambassador_agreement_acceptances from anon, authenticated;

comment on table ambassador_agreement_acceptances is
  'A later agreement version accepted by an ambassador or applicant, with their typed name, IP and browser. The original signature stays on ambassador_applications.';


-- ── Accept (service role only) ───────────────────────────────────────────────
-- Against the caller's newest pending or approved application. Accepting the
-- same version twice is a no-op that returns the first acceptance's time.
create or replace function accept_ambassador_agreement(
  p_user_id        uuid,
  p_version        text,
  p_signature_name text,
  p_ip             text,
  p_user_agent     text
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_app  ambassador_applications;
  v_name text := btrim(coalesce(p_signature_name, ''));
  v_at   timestamptz;
begin
  if p_user_id is null then raise exception 'not signed in'; end if;
  if length(v_name) < 4 then raise exception 'Type your full name to accept.'; end if;
  if length(v_name) > 120 then raise exception 'That name is too long.'; end if;
  if p_version is null or length(p_version) not between 1 and 40 then
    raise exception 'That version of the agreement is out of date.';
  end if;

  select * into v_app
  from ambassador_applications
  where user_id = p_user_id and status in ('pending', 'approved')
  order by submitted_at desc
  limit 1;
  if v_app.id is null then raise exception 'There is no agreement on file to update.'; end if;
  if v_app.agreement_version = p_version then
    raise exception 'You already signed this version.';
  end if;

  insert into ambassador_agreement_acceptances
    (application_id, user_id, version, signature_name, signed_ip, signed_user_agent)
  values
    (v_app.id, p_user_id, p_version, v_name, left(p_ip, 64), left(p_user_agent, 512))
  on conflict (application_id, version) do nothing
  returning accepted_at into v_at;

  if v_at is null then
    select accepted_at into v_at
    from ambassador_agreement_acceptances
    where application_id = v_app.id and version = p_version;
  end if;
  return v_at;
end;
$$;

revoke execute on function accept_ambassador_agreement(uuid, text, text, text, text) from anon, authenticated, public;
grant execute on function accept_ambassador_agreement(uuid, text, text, text, text) to service_role;


-- ── The caller's own acceptances ─────────────────────────────────────────────
create or replace function my_ambassador_agreement_acceptances()
returns table (
  version        text,
  signature_name text,
  accepted_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select x.version, x.signature_name, x.accepted_at
  from ambassador_agreement_acceptances x
  where x.user_id = auth.uid()
    and auth.uid() is not null
    and x.application_id = (
      select ap.id from ambassador_applications ap
      where ap.user_id = auth.uid() and ap.status in ('pending', 'approved')
      order by ap.submitted_at desc
      limit 1
    )
  order by x.accepted_at desc;
$$;

revoke execute on function my_ambassador_agreement_acceptances() from anon, public;
grant execute on function my_ambassador_agreement_acceptances() to authenticated;


-- ── Admin: who signed what, and who accepted what ────────────────────────────
create or replace function admin_ambassador_agreements()
returns table (
  application_id  uuid,
  signed_version  text,
  version         text,
  signature_name  text,
  accepted_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform admin_require_section('see_money');
  return query
    select ap.id, ap.agreement_version, x.version, x.signature_name, x.accepted_at
    from ambassador_applications ap
    left join ambassador_agreement_acceptances x on x.application_id = ap.id
    where ap.status in ('pending', 'approved')
    order by ap.submitted_at desc, x.accepted_at;
end;
$$;

revoke execute on function admin_ambassador_agreements() from anon, public;
grant execute on function admin_ambassador_agreements() to authenticated;
