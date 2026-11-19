import { createClient } from "@/app/lib/auth/server";
import { toCredits } from "@/app/lib/plans";
import TransactionsTable, { type TransactionRow } from "./TransactionsTable";

// History: everything the teacher has actually paid for.
//
// No new RPC and no migration — `invoices` and `topup_purchases` already carry
// owner-scoped SELECT policies ("own invoices read", "own topups read") and the
// matching table grants, so RLS does the scoping and two plain selects suffice.
// Putting the de-duplication below into a security-definer function would freeze
// a presentation decision in the database, which is the wrong place for it.

const ROW_LIMIT = 50;

/**
 * How close in time a top-up purchase and its mirrored invoice must be to count
 * as the same payment.
 *
 * Five minutes rather than "same calendar month" (which
 * 20260812130150_exclude_refunded_topups.sql settles for) because the webhook
 * writes both rows inside one handler invocation, seconds apart. A month-wide
 * window would collapse two genuine £1.50 top-ups in the same month into one
 * and hide a payment the teacher made.
 */
const MATCH_WINDOW_MS = 5 * 60_000;

export default async function HistoryTab() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: invoiceRows }, { data: topupRows }] = await Promise.all([
    supabase
      .from("invoices")
      // .eq on user_id is redundant under the "own invoices read" policy, but
      // it's the convention elsewhere in this route and it means a future policy
      // mistake degrades to "shows nothing" rather than "shows everyone's".
      .select("id, reference, type, amount_gbp, status, paid_at, method, created_at, stripe_invoice_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from("topup_purchases")
      .select("id, kind, units, price_gbp, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
  ]);

  const invoices = invoiceRows ?? [];
  const topups = topupRows ?? [];

  // ── Why this isn't a UNION of the two tables ───────────────────────────────
  //
  // One £1.50 top-up writes TWO rows (see grantTopUpCredit in
  // app/api/stripe/webhook/route.ts, where the write order is load-bearing):
  //
  //   topup_purchases  the idempotency gate, keyed on stripe_payment_intent_id
  //   invoices         the local mirror, type='topup', carrying stripe_charge_id
  //
  // They share no identifier — a PaymentIntent and a Charge are different Stripe
  // objects — so there is nothing to join on. Listing both tables naively
  // double-lists every top-up.
  //
  // So `invoices` is the ledger. It already holds subscription charges
  // (type='card'), school invoices (type='school') AND top-ups, which makes it
  // the complete record of money moved; the credit quantity a teacher wants is
  // derivable from amount_gbp without reading topup_purchases at all.
  //
  // EXCEPT that the mirror is best-effort: it logs and swallows its own failure,
  // because by that point the credit is already granted and a webhook retry
  // would hit the idempotency gate and skip the grant. So a purchase CAN exist
  // with no invoice. Rather than silently hide a payment, an unmatched purchase
  // is listed too.
  const hasMatchingInvoice = (purchase: { price_gbp: number | string; created_at: string }) => {
    const at = new Date(purchase.created_at).getTime();
    const amount = Number(purchase.price_gbp);
    return invoices.some(
      (inv) =>
        inv.type === "topup" &&
        Number(inv.amount_gbp) === amount &&
        Math.abs(new Date(inv.created_at).getTime() - at) <= MATCH_WINDOW_MS,
    );
  };

  const rows: TransactionRow[] = [
    ...invoices.map((inv) => {
      const amountGbp = Number(inv.amount_gbp);
      return {
        id: inv.id as string,
        // paid_at is the date that matters to a teacher when it exists; drafts
        // and failures only have created_at.
        date: (inv.paid_at as string | null) ?? (inv.created_at as string),
        description: describe(inv.type as string, inv.method as string | null, amountGbp),
        amountGbp,
        status: inv.status as string,
        stripeInvoiceId: (inv.stripe_invoice_id as string | null) ?? null,
      };
    }),
    ...topups.filter((t) => !hasMatchingInvoice(t)).map((t) => {
      const amountGbp = Number(t.price_gbp);
      return {
        id: t.id as string,
        date: t.created_at as string,
        description: describe("topup", null, amountGbp),
        amountGbp,
        status: "paid",
        stripeInvoiceId: null,
      };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Only offer the Stripe receipts link if there is actually a Stripe invoice
  // behind one of these rows — for a teacher whose only history is a top-up, the
  // portal's invoice list is empty and the button is a dead end.
  const hasStripeInvoices = rows.some((r) => r.stripeInvoiceId !== null);

  return (
    <>
      <p className="text-sm mb-4" style={{ color: "var(--j-faint)" }}>
        {rows.length >= ROW_LIMIT
          ? `Your last ${ROW_LIMIT} payments.`
          : "Every payment on your account."}
      </p>

      <TransactionsTable rows={rows} showReceiptsLink={hasStripeInvoices} />
    </>
  );
}

/**
 * What the teacher sees in the Description column.
 *
 * For card charges `method` is already human-readable ("Visa ••4242 · Pro
 * monthly") because describeInvoice() in the webhook builds it that way.
 *
 * Top-up credits are derived through toCredits(), the same function the
 * allowance meter uses, so the figure on a receipt always matches the figure on
 * the meter.
 */
function describe(type: string, method: string | null, amountGbp: number): string {
  if (type === "topup") {
    const granted = toCredits(amountGbp * 100);
    return `Top up · ${granted.toLocaleString("en-GB")} resources`;
  }
  if (type === "school") return method || "School invoice";
  return method || "Subscription payment";
}
