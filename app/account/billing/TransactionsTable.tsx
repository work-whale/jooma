import ManageButton from "./ManageButton";

// The payment ledger.
//
// MONEY HERE IS IN POUNDS, deliberately, and this is not in tension with the
// credits policy next door. A teacher paid £1.50, so £1.50 is what a receipt has
// to say. What must never be shown in money is the AI ALLOWANCE, because that
// figure sitting beside the subscription price reads as a metered resale of
// tokens. See app/lib/plans.ts. Amounts paid: pounds. Allowance: credits.

export interface TransactionRow {
  id: string;
  /** ISO timestamp. */
  date: string;
  description: string;
  amountGbp: number;
  status: string;
  /** Non-null when Stripe holds a downloadable invoice for this row. */
  stripeInvoiceId: string | null;
}

const gbp = (n: number) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Status tones, all drawn from colours already in use on this page — the success
 * and pending banner palettes and the muted body text — so nothing new enters
 * the design system for the sake of a table cell.
 */
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  paid: { bg: "#DDF0E2", fg: "#1f6b3b" },
  sent: { bg: "#FDF0D5", fg: "#8a6d1f" },
  draft: { bg: "#FDF0D5", fg: "#8a6d1f" },
  overdue: { bg: "#FBE3E1", fg: "#c2342b" },
  failed: { bg: "#FBE3E1", fg: "#c2342b" },
  refunded: { bg: "var(--j-tint)", fg: "var(--j-faint)" },
  void: { bg: "var(--j-tint)", fg: "var(--j-faint)" },
};

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? { bg: "var(--j-tint)", fg: "var(--j-faint)" };
  return (
    <span
      className="text-xs font-semibold px-3 py-1 rounded-full capitalize"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {status}
    </span>
  );
}

export default function TransactionsTable({
  rows,
  showReceiptsLink,
}: {
  rows: TransactionRow[];
  showReceiptsLink: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 border text-sm"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)", color: "var(--j-body)" }}
      >
        No transactions yet.
      </div>
    );
  }

  return (
    <>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--j-faint)" }} className="text-left">
                <th className="font-semibold px-4 py-3">Date</th>
                <th className="font-semibold px-4 py-3">Description</th>
                <th className="font-semibold px-4 py-3 text-right">Amount</th>
                <th className="font-semibold px-4 py-3">Status</th>
                <th className="font-semibold px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--j-tint)" }}>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--j-body)" }}>
                    {fmtDate(r.date)}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--j-ink)" }}>
                    {r.description}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                    style={{ color: "var(--j-ink)" }}
                  >
                    {gbp(r.amountGbp)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  {/* A label, not a link. The download lives behind the single
                      portal button below — see the note there. */}
                  <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--j-faint)" }}>
                    {r.stripeInvoiceId ? "In Stripe" : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        ONE portal button for all receipts rather than a link per row.

        Stripe's hosted invoice URL is a long-lived bearer link: anyone holding it
        can read the invoice, no session required. Storing it and rendering it
        into the page would leak it into anything that captures the DOM — error
        reporters, session replay, analytics. A portal session is minted on click
        and short-lived, so that's the safer door even though it costs a hop.

        It also sidesteps a shape problem: top-ups are created from a Checkout
        Session rather than an Invoice, so they'd have no such URL anyway — the
        column would be empty for exactly the rows teachers most often ask about.
      */}
      {showReceiptsLink && (
        <div className="mt-4">
          <ManageButton label="View receipts in Stripe" variant="outline" />
        </div>
      )}
    </>
  );
}
