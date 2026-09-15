import { requireSection } from "../access";
import { stripe } from "@/app/lib/stripe";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import InvoicesView, {
  type BillingSummary,
  type DunningRow,
  type InvoiceRow,
  type SchoolOption,
} from "./InvoicesView";

export const dynamic = "force-dynamic";

/**
 * Subscriptions Stripe is currently trying to collect on.
 *
 * `past_due` means a payment failed and Stripe's Smart Retries are still
 * running; `unpaid` means it has given up. Both are states support needs to see,
 * because the teacher is still on a paid plan in Stripe's eyes but their card
 * isn't working.
 *
 * Read live rather than mirrored: retry schedules are Stripe's, change with its
 * dunning settings, and would be stale the moment we copied them.
 */
async function loadDunning(): Promise<{ rows: DunningRow[]; error: string | null }> {
  try {
    const [pastDue, unpaid] = await Promise.all([
      stripe.subscriptions.list({ status: "past_due", limit: 50, expand: ["data.customer"] }),
      stripe.subscriptions.list({ status: "unpaid", limit: 50, expand: ["data.customer"] }),
    ]);

    const subs = [...pastDue.data, ...unpaid.data];
    if (subs.length === 0) return { rows: [], error: null };

    // Map Stripe customers back to our teachers so the table can name them.
    const customerIds = subs.map((s) =>
      typeof s.customer === "string" ? s.customer : s.customer.id,
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_customer_id")
      .in("stripe_customer_id", customerIds);

    const userByCustomer = new Map(
      (profiles ?? []).map((p) => [p.stripe_customer_id as string, p.id as string]),
    );

    const rows: DunningRow[] = subs.map((sub) => {
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const customer =
        typeof sub.customer === "string" || sub.customer.deleted ? null : sub.customer;

      return {
        id: sub.id,
        userId: userByCustomer.get(customerId) ?? null,
        email: customer?.email ?? null,
        status: sub.status,
        amountGbp: (sub.items.data[0]?.price?.unit_amount ?? 0) / 100,
        // When Stripe will try the card again. Absent once it has stopped.
        nextAttempt: null,
        since: new Date(sub.created * 1000).toISOString(),
      };
    });

    return { rows, error: null };
  } catch (err) {
    console.error("[admin/revenue] could not read dunning state from Stripe", err);
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Could not reach Stripe.",
    };
  }
}

export default async function AdminRevenuePage() {
  const { supabase } = await requireSection("see_money");

  const [{ data: invoices }, { data: summary }, { data: schools }, dunning] = await Promise.all([
    supabase.rpc("admin_invoices"),
    supabase.rpc("admin_billing_summary"),
    supabase.rpc("admin_schools"),
    loadDunning(),
  ]);

  return (
    <InvoicesView
      rows={(invoices ?? []) as InvoiceRow[]}
      summary={((summary ?? [])[0] ?? null) as BillingSummary | null}
      schools={((schools ?? []) as SchoolOption[]).map((s) => ({
        id: s.id,
        name: s.name,
        seats: s.seats,
        annual_value: s.annual_value,
      }))}
      dunning={dunning.rows}
      // Doubles as the Stripe connectivity check on the Tax & company card:
      // null here means the API answered.
      stripeError={dunning.error}
    />
  );
}
