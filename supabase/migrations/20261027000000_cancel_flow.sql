-- ── Cancel flow: why teachers leave, and what kept them ───────────────────────
--
-- The cancel flow (app/(app)/profile/cancel) asks a teacher why they are going,
-- makes an offer that fits the reason, shows what they lose, and only then
-- cancels. Every step that ends the flow writes one row here: the reason, and
-- what happened (took the discount, downgraded, kept the plan, cancelled...).
--
-- The table does three jobs:
--
--   1. The once-per-12-months cap on the retention discount. The server reads
--      the teacher's last `discount` row before applying the coupon, so the
--      offer cannot become a renewable half price.
--   2. The 14-day held offer. A `cancelled` row's created_at is when the offer
--      after cancelling started; the flow reads it, nothing else stores it.
--   3. Save rate by reason, which is the number worth watching weekly.
--
-- WHO WRITES
-- Only the signed-in API routes under app/api/billing/cancel-flow, through the
-- service role. There is deliberately NO insert, update or delete policy: a
-- teacher who could write here could delete their last `discount` row and take
-- the offer again. Teachers may read their own rows, which is all the flow
-- itself needs from the browser (nothing, today) and costs nothing to allow.
--
-- dedupe_key
-- A double click on "accept" sends two requests that both see no previous
-- discount. Each claims its row with a key (retention-<user>-<yyyymm>, or
-- cancel-<subscription>-<period end>) before touching Stripe, and the unique
-- index lets only one of them through. The loser reports what the winner did.

create table if not exists cancellation_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in (
                'cost', 'other-tool', 'unused', 'term', 'missing', 'broke', 'school'
              )),
  outcome     text not null check (outcome in (
                'discount', 'downgrade', 'switch_annual',
                'kept_offer', 'kept_inventory', 'kept_confirm',
                'support_message', 'schools_contact', 'cancelled'
              )),
  plan        text,
  "interval"  text check ("interval" is null or "interval" in ('month', 'year')),
  coupon_id   text,
  detail      text check (detail is null or length(detail) <= 2000),
  dedupe_key  text unique,
  created_at  timestamptz not null default now()
);

alter table cancellation_events enable row level security;

-- The cap and the held offer both ask "this teacher's latest row of outcome X".
create index if not exists cancellation_events_user_outcome_idx
  on cancellation_events (user_id, outcome, created_at desc);

-- Reporting reads by recency across everyone.
create index if not exists cancellation_events_created_idx
  on cancellation_events (created_at desc);

drop policy if exists "cancellation_events: read own" on cancellation_events;
create policy "cancellation_events: read own" on cancellation_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- The table grant is in 20261027000100_cancel_flow_grant.sql, added after this
-- file had been pushed.

comment on table cancellation_events is
  'One row per finished step of the cancel flow. Written only by the service role; teachers read their own.';
