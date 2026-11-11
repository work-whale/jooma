-- ── Usage rows are written by the server only ──────────────────────────────
--
-- THE HOLE.
-- token_usage and asset_cost each had an "insert your own row" policy, from
-- when the recorder ran on the caller's session (20260613000000,
-- 20260613000100), and 20260813080000 granted INSERT to authenticated. Nothing
-- stopped cost_usd being negative. monthly_ai_spend() sums those costs, and the
-- credit ceiling in generation-guard.ts compares that sum with the plan's
-- allowance. So a signed-in teacher holding the public anon key (it ships in
-- the browser bundle) could insert one row costing -100 dollars and never meet
-- the ceiling again.
--
-- WHY NOTHING BREAKS.
-- Every real row is written with the service role: recordUsage() and
-- recordAssetCost() go through insertWithRetry() on supabaseAdmin
-- (app/lib/usage.ts), and claimGuestWork() reassigns guest rows the same way.
-- The service role bypasses RLS and grants, so it keeps writing as before.
--
-- WHAT STAYS.
-- SELECT on a teacher's own rows ("own usage read", "own asset cost read"): the
-- billing page, my_tool_usage_report() and the follow-up budget in
-- app/lib/follow-on-server.ts read them.
--
-- THE CHECK CONSTRAINTS.
-- A second line, aimed at the service role: no code path should ever write a
-- negative cost, and if one does it should fail loudly rather than quietly hand
-- out credit. If this migration fails on them, a negative row already exists:
-- treat that as evidence the hole above was used, not as data to clean up.
--
-- Verified by scripts/verify-usage-writes.mjs.

drop policy if exists "own usage insert" on token_usage;
drop policy if exists "own asset cost insert" on asset_cost;

revoke insert, update, delete on token_usage from authenticated, anon;
revoke insert, update, delete on asset_cost from authenticated, anon;

alter table token_usage
  add constraint token_usage_cost_nonneg check (cost_usd >= 0);

alter table asset_cost
  add constraint asset_cost_cost_nonneg check (cost_usd >= 0);
