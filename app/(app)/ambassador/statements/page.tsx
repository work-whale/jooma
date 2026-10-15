import { redirect } from "next/navigation";
import { CurrencyGbp, FileText, Info } from "@phosphor-icons/react/dist/ssr";
import {
  gbp,
  nextPayout,
  periodLabel,
  statementsFrom,
  taxYearOf,
  taxYearTotals,
} from "@/app/lib/ambassador-commission";
import { maskAccount } from "@/app/lib/ambassador-application";
import s from "@/app/components/ambassador/programme.module.css";
import { loadAmbassadorContext, loadDetails, loadLedger } from "../data";
import { Panel, longDate } from "../parts";
import StatementsCsv from "./StatementsCsv";

// Statements tab: what is coming next, what has been paid, and a yearly total
// for their tax return. Payouts are made by hand, so a month reads "Paid" once
// an admin has recorded every row in it.
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: s.bPaid },
  part_paid: { label: "Part paid", cls: s.bDue },
  due: { label: "Due", cls: s.bDue },
};

export default async function AmbassadorStatements() {
  const ctx = await loadAmbassadorContext();
  if (!ctx.ambassador) redirect("/ambassador");

  const [ledger, details] = await Promise.all([loadLedger(), loadDetails()]);
  const now = new Date();
  const next = nextPayout(ledger, now);
  const statements = statementsFrom(ledger);
  const taxYears = taxYearTotals(ledger);
  const thisTaxYear = taxYearOf(now);

  const method = !details
    ? "the account you gave us"
    : details.payout_method === "paypal"
      ? `PayPal, ${details.paypal_email}`
      : `${details.bank_name ?? "your bank"}, account ${maskAccount(details.account_last4)}`;

  const owedNow = next.closedPence + next.runningPence;

  return (
    <>
      <Panel title="Next payout" first>
        <div className={s.rowline} style={{ borderBottom: 0, paddingTop: 4 }}>
          <span className={s.rowIcon} style={{ background: "linear-gradient(140deg,#E8B944,#C08A1E)" }}>
            <CurrencyGbp size={17} weight="fill" />
          </span>
          <span className={s.rowMain}>
            <b data-testid="next-payout">
              {gbp(owedNow)} for {periodLabel(next.period)}
              {next.closedPence > 0 ? `, including ${gbp(next.closedPence)} from earlier months` : ""}
            </b>
            <span>
              {method}. Leaves us on {longDate(next.payoutOn)}.
            </span>
          </span>
          <span className={s.rowRight}>
            <span className={`${s.badge} ${s.bDue}`}>Scheduled</span>
          </span>
        </div>
        <div className={s.callout}>
          <Info size={17} weight="fill" />
          <span>
            {periodLabel(next.period, false)} is still running, so this figure moves until the month
            closes. Whatever it comes to is paid in full; there is no minimum.
          </span>
        </div>
      </Panel>

      <Panel
        title="Statements"
        right={
          <StatementsCsv
            rows={statements.map((st) => ({
              month: periodLabel(st.period),
              paidOn: st.paidOn ? st.paidOn.slice(0, 10) : "",
              commission: (st.commissionPence / 100).toFixed(2),
              adjustments: (st.adjustmentsPence / 100).toFixed(2),
              net: (st.netPence / 100).toFixed(2),
              status: STATUS[st.status].label,
            }))}
          />
        }
      >
        {statements.length === 0 ? (
          <p className={s.muted}>Nothing earned yet. Your first statement appears with your first commission.</p>
        ) : (
          <table className={s.t} data-testid="statements-table">
            <thead>
              <tr>
                <th>Paid on</th>
                <th>For</th>
                <th className={s.num}>Commission</th>
                <th className={s.num}>Adjustments</th>
                <th className={s.num}>Total</th>
                <th className={s.num}>Status</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((st) => (
                <tr key={st.period}>
                  <td>{st.paidOn ? longDate(st.paidOn) : "Not yet"}</td>
                  <td>{periodLabel(st.period)}</td>
                  <td className={s.num}>{gbp(st.commissionPence)}</td>
                  <td className={s.num} style={{ color: st.adjustmentsPence < 0 ? "var(--j-orange-ink)" : "var(--j-faint)" }}>
                    {gbp(st.adjustmentsPence)}
                  </td>
                  <td className={s.num}>{gbp(st.netPence)}</td>
                  <td className={s.num}>
                    <span className={`${s.badge} ${STATUS[st.status].cls}`}>{STATUS[st.status].label}</span>
                  </td>
                </tr>
              ))}
              <tr className={s.tot}>
                <td colSpan={4}>Paid so far</td>
                <td className={s.num}>{gbp(statements.reduce((t, st) => t + st.paidPence, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Yearly tax summary">
        {(taxYears.length === 0 ? [{ taxYear: thisTaxYear, paidPence: 0 }] : taxYears).map((ty) => (
          <div key={ty.taxYear} className={s.rowline}>
            <span className={s.rowIcon} style={{ background: "#0E7490" }}>
              <FileText size={17} weight="fill" />
            </span>
            <span className={s.rowMain}>
              <b>{ty.taxYear}</b>
              <span>
                {gbp(ty.paidPence)} paid to you
                {ty.taxYear === thisTaxYear ? " so far this tax year" : ""}.
              </span>
            </span>
          </div>
        ))}
        <p className={s.muted} style={{ fontSize: ".82rem" }}>
          We email you a summary each April for the tax year just ended. Commission is paid gross.
          Declaring it is your responsibility. This summary is to help, not to replace your own
          records.
        </p>
      </Panel>
    </>
  );
}
