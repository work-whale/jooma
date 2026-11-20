-- Jooma 4.5: guard the automatic teacher emails switch (security review, 20 Nov).
--
-- 20261120000000 saved app_settings.lifecycle_emails through the generic
-- admin_set_setting(), which only checks is_admin(). The card that edits it is
-- shown only to admins with see_content, so any other admin (marketing,
-- finance) could have started real sends by calling the RPC directly, with any
-- value at all. Now:
--
--   1. admin_set_lifecycle_emails(p_enabled, p_off) is the only way to save it.
--      It needs see_content (the same as the card), takes a boolean and a list
--      of known email ids, refuses anything else, and writes the audit log.
--   2. admin_set_setting() refuses the 'lifecycle_emails' key, for everyone.
--
-- The id list below must match LIFECYCLE_IDS in app/lib/lifecycle-emails.ts
-- (a unit test reads it from this file).

create or replace function admin_set_lifecycle_emails(p_enabled boolean, p_off text[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_known text[] := array['E1', 'E2a', 'E2b', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9a', 'E9b', 'E10', 'E11', 'E12', 'E13', 'E14'];
  v_off   text[] := coalesce(p_off, array[]::text[]);
  v_bad   text;
  v_value jsonb;
begin
  perform admin_require_section('see_content');
  if p_enabled is null then raise exception 'enabled must be true or false'; end if;
  select x into v_bad from unnest(v_off) as x where not (x = any (v_known)) limit 1;
  if v_bad is not null then raise exception 'not a lifecycle email: %', v_bad; end if;

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'off', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_off) as x)
  );
  update app_settings
     set value = v_value, updated_by = auth.uid(), updated_at = now()
   where key = 'lifecycle_emails';
  if not found then raise exception 'no such setting'; end if;
  perform admin_log('Changed setting', 'access', 'setting', 'lifecycle_emails', 'Automatic teacher emails', v_value);
end;
$$;
revoke execute on function admin_set_lifecycle_emails(boolean, text[]) from anon, public;
grant execute on function admin_set_lifecycle_emails(boolean, text[]) to authenticated;

-- The generic save, as in 20260805001800, plus the refusal for this one key.
create or replace function admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_label text;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if p_key = 'lifecycle_emails' then
    raise exception 'lifecycle_emails is saved from Emails & templates only';
  end if;
  update app_settings
     set value = p_value, updated_by = auth.uid(), updated_at = now()
   where key = p_key
  returning label into v_label;
  if v_label is null then raise exception 'no such setting'; end if;
  perform admin_log('Changed setting', 'access', 'setting', p_key, v_label,
    jsonb_build_object('value', p_value));
end;
$$;
revoke execute on function admin_set_setting(text, jsonb) from anon, public;
grant execute on function admin_set_setting(text, jsonb) to authenticated;
