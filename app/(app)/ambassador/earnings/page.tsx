import { redirect } from "next/navigation";
import { Clock, CurrencyGbp, Receipt, TrendUp, Warning } from "@phosphor-icons/react/dist/ssr";
import {
  AMBASSADOR_RATES,
  COMMISSION_PLANS,
  addMonths,
  gbp,
  payoutDateFor,
  periodLabel,
  periodOf,
  periodsBetween,
  statementsFrom,
} from "@/app/lib/ambassador-commission";
import s from "@/app/components/ambassador/programme.module.css";
import { loadAmbassadorContext, loadLedger, loadReferrals } from "../data";
import { Metric, Panel, PlanSwatch, SegLinks, longDate } from "../parts";

// Earnings tab: every pound, where it came from, and when it lands.
export const dynamic = "force-dynamic";

type Range = "12m" | "year" | "all";

export default async function AmbassadorEarnings(props: { searchParams?: Promise<{ range?: string }> }) {
  const ctx = await loadAmbassadorContext();
  if (!ctx.ambassador) redirect("/ambassador");
  const a = ctx.ambassador;
  const sp = (await props.searchParams) ?? {};
  const range: Range = sp.range === "year" || sp.range === "all" ? sp.range : "12m";

  const [ledger, referrals] = await Promise.all([loadLedger(), loadReferrals()]);
  const now = new Date();
  const current = periodOf(now);
  const live = ledger.filter((r) => r.status !== "reversed");

  const thisMonth = live.filter((r) => r.period === current).reduce((t, r) => t + r.amount_pence, 0);

  // Teachers in their free trial: what their first payment would earn, at the
  // monthly rate for the plan they are trialling. An estimate, labelled as one.
  const trials = referrals.filter((r) => r.state === "trial");
  const awaiting = trials.reduce(
    (t, r) => t + (r.plan && r.plan in AMBASSADOR_RATES.month ? AMBASSADOR_RATES.month[r.plan as "pro"] : 0),
    0,
  );

  const statements = statementsFrom(ledger);
  const paidOut = Number(a.paid_pence);
  const paidStatements = statements.filter((st) => st.paidPence > 0).length;
  const best = statements.reduce<{ period: string; net: number } | null>(
    (b, st) => (!b || st.netPence > b.net ? { period: st.period, net: st.netPence } : b),
    null,
  );

  const first = a.approved_at ? periodOf(new Date(a.approved_at)) : periodOf(new Date(a.created_at));
  const from =
    range === "12m" ? addMonths(current, -11) : range === "year" ? `${current.slice(0, 4)}-01-01` : first;
  const months = periodsBetween(from < first && range !== "12m" ? first : from, current);

  const rows = months.map((p) => {
    const these = live.filter((r) => r.period === p);
    const recurring = these.filter((r) => r.kind === "recurring");
    const annual = these.filter((r) => r.kind === "annual");
    const adjustments = these.filter((r) => r.kind === "adjustment").reduce((t, r) => t + r.amount_pence, 0);
    return {
      period: p,
      monthlySubs: recurring.length,
      yearlyNew: annual.length,
      recurring: recurring.reduce((t, r) => t + r.amount_pence, 0) + adjustments,
      oneOff: annual.reduce((t, r) => t + r.amount_pence, 0),
    };
  });
  const total = rows.reduce((t, r) => t + r.recurring + r.oneOff, 0);

  return (
    <>
      <div className={s.mgrid}>
        <Metric
          hero
          icon={<CurrencyGbp size={14} weight="fill" />}
          label={`${periodLabel(current, false)} so far`}
          value={gbp(thisMonth)}
          sub={`Due ${longDate(payoutDateFor(current)).replace(/ \d{4}$/, "")}`}
        />
        <Metric
          icon={<Clock size={14} weight="fill" />}
          label="Awaiting clearance"
          value={gbp(awaiting)}
          sub={trials.length === 1 ? "1 trial not yet paid" : `${trials.length} trials not yet paid`}
        />
        <Metric
          icon={<Receipt size={14} weight="fill" />}
          label="Paid out so far"
          value={gbp(paidOut)}
          sub={`Across ${paidStatements} statement${paidStatements === 1 ? "" : "s"}`}
        />
        <Metric
          icon={<TrendUp size={14} weight="fill" />}
          label="Best month"
          value={best ? gbp(best.net) : gbp(0)}
          sub={best ? periodLabel(best.period) : "Nothing yet"}
        />
      </div>

      <Panel
        title="Month by month"
        right={
          <SegLinks
            options={[
              { href: "/ambassador/earnings", label: "Last 12 months", on: range === "12m" },
              { href: "/ambassador/earnings?range=year", label: "This year", on: range === "year" },
              { href: "/ambassador/earnings?range=all", label: "All time", on: range === "all" },
            ]}
          />
        }
      >
        <table className={s.t} data-testid="earnings-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Monthly subs</th>
              <th>Yearly, new</th>
              <th className={s.num}>Recurring</th>
              <th className={s.num}>One-off</th>
              <th className={s.num}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period}>
                <td>{periodLabel(r.period)}</td>
                <td>{r.monthlySubs}</td>
                <td>{r.yearlyNew}</td>
                <td className={s.num}>{gbp(r.recurring)}</td>
                <td className={s.num}>{gbp(r.oneOff)}</td>
                <td className={s.num}>{gbp(r.recurring + r.oneOff)}</td>
              </tr>
            ))}
            <tr className={s.tot}>
              <td colSpan={5}>Total</td>
              <td className={s.num}>{gbp(total)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="How it adds up">
        <table className={s.t}>
          <thead>
            <tr>
              <th>Plan</th>
              <th className={s.num}>Monthly, every month</th>
              <th className={s.num}>Yearly, once</th>
            </tr>
          </thead>
          <tbody>
            {COMMISSION_PLANS.map((p) => (
              <tr key={p}>
                <td>
                  <PlanSwatch plan={p} />
                </td>
                <td className={s.num}>{gbp(AMBASSADOR_RATES.month[p])}</td>
                <td className={s.num}>{gbp(AMBASSADOR_RATES.year[p])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`${s.callout} ${s.calloutWarn}`}>
          <Warning size={17} weight="fill" />
          <span>
            If a teacher is refunded or charges back, that commission comes off your balance. It
            shows on your statement as an adjustment so you can always see why a figure moved.
          </span>
        </div>
      </Panel>
    </>
  );
}
