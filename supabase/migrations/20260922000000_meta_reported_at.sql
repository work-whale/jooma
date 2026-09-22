-- ── Which invoices have been reported to Meta as a Purchase ─────────────────
--
-- WHY THIS COLUMN EXISTS
--
-- Stripe fires BOTH invoice.paid and invoice.payment_succeeded for one
-- subscription payment, and the webhook handles them in a single block. Sending
-- the Meta Purchase from both meant one payment produced two conversion events,
-- relying on Meta collapsing them by event_id. Confirmed in Events Manager: two
-- rows, same event id. Probably deduplicated, but "probably" is the wrong thing
-- to depend on when the failure mode is a client scaling ad spend against
-- doubled revenue.
--
-- So the report now fires from invoice.paid only. That closes the duplicate and
-- opens a smaller hole: Stripe does not promise both events, so an invoice that
-- somehow arrives only as invoice.payment_succeeded would never be reported at
-- all. Under-reporting is the better failure of the two, but it is still a
-- failure, and it would be silent.
--
-- This column is what makes it self-healing. The webhook stamps it once Meta
-- accepts the event; the second event type checks it and sends only if it is
-- still null. Either event can therefore do the job, exactly one of them
-- actually does, and the recovery happens within seconds rather than never.
--
-- NULL means "not reported", which is the correct reading for:
--   * every invoice that predates this migration,
--   * one-off credit top-ups, which are deliberately never reported as a
--     Purchase (see isReportablePurchase in app/lib/meta-purchase.ts),
--   * an invoice where Meta was unreachable or refused the event.
-- Nothing downstream may treat null as an error.
--
-- It doubles as an audit trail: a paid subscription invoice with a null here is
-- a conversion Meta never heard about, and that is a question worth being able
-- to ask in SQL rather than by reading server logs.

alter table invoices
  add column if not exists meta_reported_at timestamptz;

comment on column invoices.meta_reported_at is
  'When this invoice was accepted by Meta as a Purchase conversion. Null means not reported: a top-up, an invoice predating the pixel, or a send that failed. Written only by the Stripe webhook under the service role.';

-- Partial index, not a plain one. The only question ever asked of this column is
-- "which paid card invoices are still unreported", so indexing the rows that are
-- already done would be dead weight: over time nearly every row is non-null, and
-- the interesting set stays small.
create index if not exists invoices_meta_unreported_idx
  on invoices (paid_at)
  where meta_reported_at is null and status = 'paid';

-- No RLS change. `invoices` is admin-only already, and this column is written
-- exclusively by the Stripe webhook using the service role, which bypasses RLS.
-- A teacher has no business seeing whether their subscription was reported to an
-- advertising platform.
