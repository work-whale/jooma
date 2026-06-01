-- Stripe billing: link each profile to its Stripe customer + subscription so the
-- webhook can keep `plan` (defined in app/lib/plans.ts) in sync with payment
-- state. The `plan` column already exists (20260601000100_add_plan_gating.sql);
-- here we add the Stripe bookkeeping columns the webhook writes to.

alter table profiles
  add column if not exists stripe_customer_id text,
  -- Active/most-recent subscription id (sub_…). Null on the Free plan.
  add column if not exists stripe_subscription_id text,
  -- Raw Stripe subscription status: active, trialing, past_due, canceled, etc.
  add column if not exists subscription_status text,
  -- End of the current paid period; access is retained until this moment even
  -- after a cancellation is scheduled.
  add column if not exists current_period_end timestamptz;

-- One Stripe customer maps to exactly one profile. Lets the webhook resolve a
-- profile from a customer id when an event lacks our metadata.
create unique index if not exists profiles_stripe_customer_id_idx
  on profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Note: the webhook writes these columns with the service-role key, which
-- bypasses RLS. The existing "own profile" policies still let the owner READ
-- their billing state from the client; no client-side write policy is added so
-- users can't forge their own plan.
