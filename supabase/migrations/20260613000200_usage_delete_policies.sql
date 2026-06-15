-- Allow users to reset (delete) their own usage telemetry from the /account/usage
-- report. The token_usage / asset_cost tables were created append-only; this adds
-- owner-scoped delete so the "Reset" action can clear a tool's rows. Mirrors the
-- "own runs delete" policy on tool_runs.

drop policy if exists "own usage delete" on token_usage;
create policy "own usage delete"
  on token_usage for delete using (auth.uid() = user_id);

drop policy if exists "own asset cost delete" on asset_cost;
create policy "own asset cost delete"
  on asset_cost for delete using (auth.uid() = user_id);