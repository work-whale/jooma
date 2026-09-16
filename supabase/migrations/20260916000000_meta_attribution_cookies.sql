-- ── Meta ad attribution: the two browser cookies, kept on the profile ────────
--
-- WHAT THESE ARE
--
-- _fbp and _fbc are the identifiers the Meta pixel writes into a visitor's
-- browser. _fbp is set on any visit; _fbc records the ad click that brought
-- them, and is null for anyone who arrived organically. Both are opaque Meta
-- strings, not something we compute or interpret.
--
-- WHY THEY HAVE TO BE STORED RATHER THAN READ WHEN NEEDED
--
-- The advertising specification asks us to connect a free signup to a paid
-- upgrade that may happen weeks later, in a different session, on a different
-- device. The moment a purchase is confirmed is a Stripe webhook
-- (app/api/stripe/webhook/route.ts, the invoice.paid case), which runs
-- server-to-server with NO browser attached: there are no cookies to read and
-- no pixel to ask. The teacher may have closed the tab minutes earlier.
--
-- So the cookies are captured once, at signup, by /api/meta/activation, and
-- replayed from here when the purchase lands. Without these columns the only
-- identifier available at purchase time is a hashed email, which loses the
-- click attribution entirely.
--
-- NULLABLE, both of them, and expected to be null often:
--   * _fbc is null for every organic signup, which is most of them.
--   * Both are null when an ad blocker stopped the pixel from ever running.
--   * Both are null for every account that predates this migration.
-- Nothing downstream may treat null as an error. See app/lib/meta-purchase.ts,
-- which omits an absent identifier from the payload rather than sending a blank.

alter table profiles
  add column if not exists meta_fbp text,
  add column if not exists meta_fbc text;

comment on column profiles.meta_fbp is
  'Meta _fbp browser cookie, captured at signup and replayed by the Stripe webhook so a later purchase still attributes. Null when the pixel never ran.';
comment on column profiles.meta_fbc is
  'Meta _fbc click cookie, captured at signup. Null for organic signups, which is the common case.';

-- ── These are ours to write, not the teacher's ───────────────────────────────
--
-- profiles has an "own profile update" policy, so a signed-in user can edit
-- their own row from the browser with nothing but the anon key that ships in the
-- client bundle. 20260811000400_lock_down_profile_self_update.sql exists because
-- of exactly that: it added a trigger listing the columns a user may NOT set on
-- themselves (plan, is_admin, the stripe_* fields, suspension).
--
-- These two belong on that list. A teacher who could write their own meta_fbp
-- could attach their signup to somebody else's ad click, which corrupts the
-- attribution these columns exist to provide. The legitimate writer is
-- /api/meta/activation, which uses the service role and therefore has a null
-- auth.uid() and passes the guard below untouched.
--
-- The function is replaced rather than a second trigger added, so that the full
-- list of protected columns stays readable in one place. Everything above the
-- new block is carried over verbatim from that migration.

create or replace function profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The service role (webhooks, admin routes, migrations) legitimately changes
  -- these columns. It has no JWT, so auth.uid() is null — that is the signal
  -- this is a trusted server-side write rather than a browser one.
  if auth.uid() is null then
    return new;
  end if;

  -- Admins may edit these through the console; their routes re-check is_admin
  -- server-side before they get here.
  if is_admin() then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'not authorized: is_admin cannot be changed here';
  end if;
  if new.plan is distinct from old.plan then
    raise exception 'not authorized: plan is set by billing, not by you';
  end if;
  if new.subscription_status is distinct from old.subscription_status
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.current_period_end is distinct from old.current_period_end then
    raise exception 'not authorized: billing fields are set by Stripe';
  end if;
  if new.school_id is distinct from old.school_id then
    raise exception 'not authorized: school membership is set by an admin';
  end if;
  if new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_by is distinct from old.suspended_by then
    raise exception 'not authorized: suspension is set by an admin';
  end if;
  -- New here. Forging these would misattribute a signup to another person's ad
  -- click; they are written only by /api/meta/activation under the service role.
  if new.meta_fbp is distinct from old.meta_fbp
     or new.meta_fbc is distinct from old.meta_fbc then
    raise exception 'not authorized: advertising identifiers are set by the server';
  end if;

  return new;
end;
$$;

-- The INSERT guard needs the same addition. "own profile insert" checks only
-- auth.uid() = id, so without this a brand-new user could sign up with these
-- columns already populated with values of their choosing. /complete-profile
-- legitimately inserts the row and does NOT set them, so forcing them to null
-- costs that path nothing: the activation route fills them in immediately
-- afterwards, under the service role.
--
-- Carried over verbatim from 20260811000400 apart from the two new lines.

create or replace function profiles_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  new.is_admin := false;
  new.school_id := null;
  new.subscription_status := null;
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  new.current_period_end := null;
  new.suspended_at := null;
  new.suspended_reason := null;
  new.suspended_by := null;
  -- New here. See the update guard above.
  new.meta_fbp := null;
  new.meta_fbc := null;

  -- An admin-invited teacher has their plan stashed on the auth user at invite
  -- time (see /api/admin/teachers/invite). Honour that, but only that — it was
  -- written by the service role, so it is not user-controlled. Anything else
  -- falls back to free.
  if new.plan is distinct from 'free' then
    if coalesce(
         (select (raw_user_meta_data ->> 'invited_plan') from auth.users where id = new.id),
         'free'
       ) is distinct from new.plan then
      new.plan := 'free';
    end if;
  end if;

  return new;
end;
$$;

-- The triggers themselves are unchanged and still point at these functions, so
-- there is nothing to recreate: create or replace swaps the body in place.
