-- Jooma 4.5: a plan change moves the resources balance ONCE.
--
-- Found by Ash's Step 10 test "Standard to Pro mid-month: 500 added": the
-- balance went up by 1,000. The webhook writes profiles.plan first and then
-- calls resources_change_plan(); a my_resources() call in between (the billing
-- page polls while it says "activating") sees the profile and the balance
-- disagree and applies the same change itself, and then the webhook applies it
-- again. Two deliveries of one Stripe event did the same.
--
-- Now the change is a no-op once the balance is already on the new plan. The
-- paid-to-paid update re-checks that inside the UPDATE, so of two concurrent
-- calls the second waits on the row lock, finds plan = p_to, and changes
-- nothing. Same signature, same grants.

create or replace function resources_change_plan(p_uid uuid, p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_before integer := resources_allowance(p_from);
  v_after  integer := resources_allowance(p_to);
begin
  if p_from = p_to then return; end if;
  -- Already moved (by my_resources, or an earlier delivery): nothing to do.
  if exists (select 1 from resource_accounts where user_id = p_uid and plan = p_to) then
    return;
  end if;
  if p_to in ('free', 'pro_trial') or p_from not in ('standard', 'pro', 'max')
     or not exists (select 1 from resource_accounts where user_id = p_uid) then
    perform resources_start(p_uid, p_to);
    return;
  end if;
  update resource_accounts
     set plan = p_to,
         allowance = allowance + greatest(0, v_after - v_before),
         updated_at = now()
   where user_id = p_uid
     and plan <> p_to;
end;
$$;
revoke execute on function resources_change_plan(uuid, text, text) from anon, authenticated, public;
grant execute on function resources_change_plan(uuid, text, text) to service_role;
