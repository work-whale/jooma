import { typeLabel } from "@/app/lib/toolRunDisplay";

// Per-tool credit use for the current month.
//
// SHOWN IN CREDITS, NEVER MONEY. The underlying figure is measured provider
// spend, but putting that in front of a teacher — "you've used £1.50 of AI" next
// to a £7.99 charge — reads as "I only got £1.50 of value", which is both wrong
// (the price buys the product, not a metered resale of tokens) and impossible to
// argue with once seen. See the credits rationale in app/lib/plans.ts and the
// conversion in the my_tool_usage_report() RPC.
//
// WHY THERE IS NO LONGER A "RESET" BUTTON.
// This table used to offer Select / Reset, which deleted the chosen tools' rows
// from token_usage and asset_cost. Those are precisely the rows
// monthly_ai_spend() sums to enforce the monthly AI spend ceiling — so the
// button was a one-click credit reset. It's gone, and so are the RLS DELETE
// policies that made it possible (20260819000000_usage_report_credits.sql);
// removing only the button would have left the same hole open to anyone with the
// anon key and a REST client. Admin reset is unaffected — it goes through
// admin_reset_tool_usage(), which is security definer.
//
// With no interactivity left this is a plain server component, so none of it
// ships to the browser.

export interface ReportRow {
  tool_slug: string;
  generations: number;
  total_tokens: number;
  /** Credits, UNROUNDED — see the note on rounding below. */
  text_credits: number;
  asset_credits: number;
  credits: number;
}

const nf = new Intl.NumberFormat("en-GB");

/**
 * Credits are whole numbers to a teacher, so rounding happens HERE and only
 * here. The RPC returns unrounded numeric precisely so that rows and footer are
 * each summed before either is rounded.
 *
 * The "<1" case earns its keep: a tool with a genuine but tiny cost would
 * otherwise render "0", which reads as "this one is free" and invites a teacher
 * to hammer it. "<1" is honest that there is a cost without inventing
 * precision. Exact zero stays "—", the existing convention for no data.
 */
const credits = (n: number) => {
  const v = Number(n) || 0;
  if (v <= 0) return "—";
  if (v < 1) return "<1";
  return nf.format(Math.round(v));
};

// Average credits for one generation; guards the zero case so a tool with only
// asset rows (no counted text generation) doesn't divide by zero.
const perGen = (used: number, gens: number) => (gens > 0 ? used / gens : used);

export default function UsageTable({ rows }: { rows: ReportRow[] }) {
  // Summed RAW, then formatted once. This is the payoff of the RPC returning
  // unrounded credits: the footer is the true total rather than a total of
  // rounded parts.
  //
  // Per-row display rounding does mean adding up the visible column can differ
  // from the footer by a credit or two. That trade is deliberate — the
  // alternative (footer = sum of rounded rows) makes the footer itself wrong,
  // and at credit magnitudes the discrepancy is invisible where the same
  // arithmetic in dollars was not.
  const totals = rows.reduce(
    (acc, r) => ({
      generations: acc.generations + Number(r.generations),
      credits: acc.credits + Number(r.credits),
    }),
    { generations: 0, credits: 0 },
  );
  const totalEach = perGen(totals.credits, totals.generations);

  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl p-6 border text-sm"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)", color: "var(--j-body)" }}
      >
        No generations yet this month.
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--j-faint)" }} className="text-left">
              <th className="font-semibold px-4 py-3">Tool</th>
              <th className="font-semibold px-4 py-3 text-right">Generations</th>
              <th className="font-semibold px-4 py-3 text-right">Resources used</th>
              <th className="font-semibold px-4 py-3 text-right">Per generation</th>
              {/* "Next 10" rather than "Average per 10": these are forward
                  projections at the current average, and the old label read
                  like a historical figure. */}
              <th className="font-semibold px-4 py-3 text-right">Next 10</th>
              <th className="font-semibold px-4 py-3 text-right">Next 100</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // supabase-js hands numeric back as a string on some paths, so
              // every read goes through Number().
              const each = perGen(Number(r.credits), Number(r.generations));
              return (
                <tr key={r.tool_slug} className="border-t" style={{ borderColor: "var(--j-tint)" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--j-ink)" }}>
                    {typeLabel(r.tool_slug)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--j-body)" }}>
                    {nf.format(Number(r.generations))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--j-ink)" }}>
                    {credits(Number(r.credits))}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--j-body)" }}>
                    {credits(each)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--j-body)" }}>
                    {credits(each * 10)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--j-body)" }}>
                    {credits(each * 100)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: "var(--j-line)" }}>
              <td className="px-4 py-3 font-bold" style={{ color: "var(--j-ink)" }}>
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--j-ink)" }}>
                {nf.format(totals.generations)}
              </td>
              <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--j-ink)" }}>
                {credits(totals.credits)}
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--j-ink)" }}>
                {credits(totalEach)}
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--j-ink)" }}>
                {credits(totalEach * 10)}
              </td>
              <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--j-ink)" }}>
                {credits(totalEach * 100)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
