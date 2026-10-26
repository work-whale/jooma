-- ── Cancel flow: the table grant the first migration left out ──────────────────
--
-- 20261027000000_cancel_flow.sql created cancellation_events with RLS and a
-- "read own" policy, but no table grant. This project grants explicitly per
-- table (see shares, enquiries, jo_threads), so without one a signed-in teacher
-- gets "permission denied" before the policy is even consulted.
-- scripts/verify-cancel-flow.mjs caught it.
--
-- SELECT only. Insert, update and delete stay ungranted on purpose: rows are
-- written by the service role from the cancel-flow routes, and a teacher who
-- could delete their own `discount` row could take the offer again.

grant select on cancellation_events to authenticated;
