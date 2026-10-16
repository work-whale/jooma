import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, Crown, CurrencyGbp, TrendUp, UsersThree } from "@phosphor-icons/react/dist/ssr";
import {
  AMBASSADOR_RATES,
  addMonths,
  gbp,
  payoutDateFor,
  periodLabel,
  periodOf,
  periodsBetween,
  type LedgerRow,
} from "@/app/lib/ambassador-commission";
import { asPlanId } from "@/app/lib/plans";
import { planCardName } from "@/app/lib/plan-copy";
import { daysUntil, AMBASSADOR_ENDING_DAYS } from "@/app/lib/plan-badge";
import ApplicationStatus from "@/app/components/ambassador/ApplicationStatus";
import s from "@/app/components/ambassador/programme.module.css";
import { loadAmbassadorContext, loadLedger, loadReferrals, type MyReferral } from "./data";
import { Bars, Metric, Panel, PlanSwatch, SegLinks, longDate, shortDate } from "./parts";

// Dashboard tab: this month, who is paying, the last twelve months, and the
// most recent sign-ups. Referred teachers are never named here, only the plan
// and the date (the definer function returns nothing more).
//
// Not an ambassador: an applicant sees where their application stands, anyone
// else gets the programme's landing page. /ambassador is also the one short
// link the programme is shared by (jooma.ai/ambassador): signed out, proxy.ts
// rewrites it to /ambassador/join without changing the URL; signed in, a
// teacher who has not applied lands here and is sent on to the same page.
export const dynamic = "force-dynamic";

const STATE: Record<MyReferral["state"], { label: string; cls: string }> = {
  paying: { label: "Paying", cls: s.bPaid },
  trial: { label: "In trial", cls: s.bRev },
  lapsed: { label: "Stopped", cls: s.bGrey },
  signed_up: { label: "Signed up", cls: s.bGrey },
};

export default async function AmbassadorDashboard(props: {
  searchParams?: Promise<{ month?: string; chart?: string; all?: string }>;
}) {
  const ctx = await loadAmbassadorContext();
  if (!ctx.ambassador) {
    const app = ctx.application;
    if (app && (app.status === "pending" || app.status === "declined")) {
      return (
        <ApplicationStatus
          status={app.status}
          firstName={ctx.firstName}
          submittedAt={app.submitted_at}
          declineReason={app.decline_reason}
          trialUntil={ctx.reviewTrialUntil}
        />
      );
    }
    redirect("/ambassador/join");
  }

  const a = ctx.ambassador;
  const sp = (await props.searchParams) ?? {};
  const [ledger, referrals] = await Promise.all([loadLedger(), loadReferrals()]);

  const now = new Date();
  const current = periodOf(now);
  const recentMonths = [current, addMonths(current, -1), addMonths(current, -2)];
  const month = recentMonths.includes(sp.month ?? "") ? sp.month! : current;
  const chart = sp.chart === "signups" ? "signups" : "earn";

  // ── KPIs ──
  const paying = referrals.filter((r) => r.state === "paying").length;
  const newThisMonth = referrals.filter((r) => periodOf(new Date(r.redeemed_at)) === current).length;
  const stillPct = referrals.length > 0 ? Math.round((paying / referrals.length) * 100) : 0;
  const since = a.approved_at ?? a.created_at;

  // ── This month, by plan ──
  const monthRows = ledger.filter((r) => r.period === month && r.status !== "reversed");
  const byPlan = groupByPlan(monthRows);
  const monthTotal = monthRows.reduce((t, r) => t + r.amount_pence, 0);

  // ── Twelve months ──
  const months = periodsBetween(addMonths(current, -11), current).reverse();
  const points = months.map((p) => ({
    key: p,
    label: periodLabel(p),
    value:
      chart === "earn"
        ? ledger.filter((r) => r.period === p && r.status !== "reversed").reduce((t, r) => t + r.amount_pence, 0)
        : referrals.filter((r) => periodOf(new Date(r.redeemed_at)) === p).length,
  }));

  // ── Free Pro ──
  const proUntil = a.pro_until ? new Date(a.pro_until) : null;
  const proLive = proUntil !== null && proUntil.getTime() > now.getTime();
  const daysLeft = proLive ? daysUntil(proUntil!, now) : null;

  const recent = sp.all === "1" ? referrals : referrals.slice(0, 5);

  return (
    <>
      <div className={s.mgrid}>
        <Metric
          hero
          icon={<CurrencyGbp size={14} weight="fill" />}
          label="This month"
          value={gbp(Number(a.this_month_pence))}
          sub={`Paid on ${longDate(payoutDateFor(current)).replace(/ \d{4}$/, "")}`}
          testId="metric-this-month"
        />
        <Metric
          icon={<UsersThree size={14} weight="fill" />}
          label="Active subscribers"
          value={paying.toLocaleString("en-GB")}
          sub={
            <>
              <span className={s.up}>+{newThisMonth}</span> signed up this month
            </>
          }
        />
        <Metric
          icon={<TrendUp size={14} weight="fill" />}
          label="Signed up all time"
          value={referrals.length.toLocaleString("en-GB")}
          sub={`${stillPct}% still subscribed`}
        />
        <Metric
          icon={<Coins size={14} weight="fill" />}
          label="Earned all time"
          value={gbp(Number(a.all_time_pence))}
          sub={`Since ${longDate(since)}`}
        />
      </div>

      <div
        className={`${s.callout} ${s.calloutGold}`}
        data-testid="ambassador-pro-status"
        style={{ marginTop: 14 }}
      >
        <Crown size={17} weight="fill" />
        <span>
          {proLive && daysLeft !== null && daysLeft <= AMBASSADOR_ENDING_DAYS ? (
            <>
              Your free Pro ends in <b>{daysLeft} {daysLeft === 1 ? "day" : "days"}</b>.{" "}
              <Link href="/pricing" style={{ fontWeight: 700, textDecoration: "underline" }}>
                Keep Pro
              </Link>
            </>
          ) : proLive ? (
            <>
              <b>Ambassador Pro</b>, free until {longDate(proUntil!)}.
            </>
          ) : proUntil ? (
            <>
              Your free year of Pro ended on {longDate(proUntil)}. You&apos;re on{" "}
              {planCardName(asPlanId(ctx.plan))} now.{" "}
              <Link href="/pricing" style={{ fontWeight: 700, textDecoration: "underline" }}>
                See plans
              </Link>
            </>
          ) : (
            <>Your free Pro is being set up. It will show here once it&apos;s active.</>
          )}
          {a.status !== "active" && (
            <> Your code is paused at the moment, so new teachers can&apos;t use it. Everyone who already joined still counts.</>
          )}
        </span>
      </div>

      <Panel
        title={`${periodLabel(month, false)}, by plan`}
        right={
          <SegLinks
            options={recentMonths.map((m) => ({
              href: `/ambassador?month=${m}${chart === "signups" ? "&chart=signups" : ""}`,
              label: periodLabel(m, false),
              on: m === month,
            }))}
          />
        }
      >
        {byPlan.length === 0 ? (
          <p className={s.muted}>Nothing earned in {periodLabel(month)} yet.</p>
        ) : (
          <table className={s.t} data-testid="by-plan">
            <thead>
              <tr>
                <th>Plan</th>
                <th>How they pay</th>
                <th>Subscribers</th>
                <th className={s.num}>Rate</th>
                <th className={s.num}>You earn</th>
              </tr>
            </thead>
            <tbody>
              {byPlan.map((g) => (
                <tr key={`${g.plan}-${g.kind}`}>
                  <td>
                    <PlanSwatch plan={g.plan} />
                  </td>
                  <td>{g.kind === "annual" ? "Yearly, new" : g.kind === "adjustment" ? "Refunds" : "Monthly"}</td>
                  <td>{g.kind === "adjustment" ? "" : g.count}</td>
                  <td className={s.num}>{g.kind === "adjustment" ? "" : gbp(g.rate)}</td>
                  <td className={s.num}>{gbp(g.total)}</td>
                </tr>
              ))}
              <tr className={s.tot}>
                <td colSpan={4}>Total for {periodLabel(month)}</td>
                <td className={s.num}>{gbp(monthTotal)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className={`${s.callout} ${s.calloutGold}`}>
          <span>
            Monthly subscribers earn you the rate again every month they pay while your agreement
            runs. Yearly subscribers pay once, so they appear in the month they joined and not after.
          </span>
        </div>
      </Panel>

      <Panel
        title="Last twelve months"
        right={
          <SegLinks
            options={[
              { href: `/ambassador?month=${month}`, label: "Earnings", on: chart === "earn" },
              { href: `/ambassador?month=${month}&chart=signups`, label: "Sign-ups", on: chart === "signups" },
            ]}
          />
        }
      >
        <Bars
          points={points}
          format={(v) => (chart === "earn" ? gbp(v) : `${v} sign-up${v === 1 ? "" : "s"}`)}
          label={chart === "earn" ? "Earnings for each of the last twelve months" : "Sign-ups for each of the last twelve months"}
        />
      </Panel>

      <Panel
        title="Most recent sign-ups"
        right={
          referrals.length > 5 && sp.all !== "1" ? (
            <Link href="/ambassador?all=1" scroll={false} className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
              See all {referrals.length}
            </Link>
          ) : undefined
        }
      >
        {referrals.length === 0 ? (
          <p className={s.muted}>
            Nobody yet. Share your code and they&apos;ll appear here as soon as they sign up.
          </p>
        ) : (
          <table className={s.t} data-testid="ambassador-referrals">
            <thead>
              <tr>
                <th>When</th>
                <th>Plan</th>
                <th>How they pay</th>
                <th className={s.num}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td>{shortDate(r.redeemed_at)}</td>
                  <td>{r.plan ? <PlanSwatch plan={r.plan} /> : "None yet"}</td>
                  <td>{r.billing_interval === "year" ? "Yearly" : r.billing_interval === "month" ? "Monthly" : "Not yet"}</td>
                  <td className={s.num}>
                    <span className={`${s.badge} ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={s.muted} style={{ fontSize: ".82rem" }}>
          Teachers who sign up with your code are never named. You see the plan and the date, never
          who they are.
        </p>
      </Panel>
    </>
  );
}

interface PlanGroup {
  plan: string;
  kind: LedgerRow["kind"];
  count: number;
  rate: number;
  total: number;
}

/** One row per plan and kind, in the mockup's order: monthly, then yearly. */
function groupByPlan(rows: LedgerRow[]): PlanGroup[] {
  const order = ["standard", "pro", "max"];
  const kinds: LedgerRow["kind"][] = ["recurring", "annual", "adjustment"];
  const out: PlanGroup[] = [];
  for (const kind of kinds) {
    for (const plan of order) {
      const these = rows.filter((r) => r.kind === kind && (r.plan ?? "") === plan);
      if (these.length === 0) continue;
      out.push({
        plan,
        kind,
        count: these.length,
        rate:
          kind === "annual"
            ? AMBASSADOR_RATES.year[plan as "standard"]
            : AMBASSADOR_RATES.month[plan as "standard"],
        total: these.reduce((t, r) => t + r.amount_pence, 0),
      });
    }
  }
  return out;
}
