import {
  AI_SPEND_CEILING_PENCE,
  hasActivePlan,
  PLANS,
  creditsRemaining,
  toCredits,
  type PlanId,
} from "@/app/lib/plans";
import TopUpButton from "./TopUpButton";

// Where a user stands this month. Paid plans are metered on measured AI SPEND
// against a monthly ceiling, plus any credit bought, shown as credits. An
// account with no plan has nothing to meter and renders nothing.
//
// Deliberately not shown in the app header: pricing_rules carries a
// `hide_counter` rule ("show it only above 80% used — a visible counter makes
// teachers generate less"), so the meter lives here and in the block modal.

const PROMINENT_AT = 0.8;

const nf = new Intl.NumberFormat("en-GB");

/** First of next month, in the user's locale — when everything resets. */
function resetsOn(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long" },
  );
}

function Bar({ fraction, tone }: { fraction: number; tone: string }) {
  return (
    <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--j-tint)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
          backgroundColor: tone,
        }}
      />
    </div>
  );
}

export default function AllowanceMeter({
  plan,
  usedToday,
  usedMonth,
  spendPence,
  creditPence,
  justToppedUp,
}: {
  plan: PlanId;
  usedToday: number;
  usedMonth: number;
  spendPence: number;
  creditPence: number;
  /** True right after a top-up redirect, before the webhook has landed. */
  justToppedUp?: boolean;
}) {
  const ceiling = AI_SPEND_CEILING_PENCE[plan];

  // ── Paid plans: measured spend against the ceiling ──
  if (ceiling !== null) {
    const allowance = ceiling + creditPence;
    const fraction = allowance > 0 ? spendPence / allowance : 0;
    const spent = spendPence >= allowance;
    const tone = spent ? "#c2342b" : fraction >= PROMINENT_AT ? "#b07a1e" : "#3a8f5a";

    return (
      <div
        className="rounded-2xl p-6 border mt-5"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
      >
        {/* Shown in credits, never pounds. The underlying meter is pence of
            model spend, but surfacing that next to the subscription price reads
            as "I paid £7.99 and only got £1.50", which is not what the plan is.
            See toCredits() in lib/plans.ts. */}
        <p className="text-xs font-semibold mb-1" style={{ color: "var(--j-faint)" }}>
          Credits this month
        </p>
        <p className="text-xl font-bold mb-3" style={{ color: "var(--j-ink)" }}>
          {nf.format(creditsRemaining(spendPence, allowance))}{" "}
          <span className="text-sm font-medium" style={{ color: "var(--j-faint)" }}>
            of {nf.format(toCredits(allowance))} left
          </span>
        </p>

        <Bar fraction={fraction} tone={tone} />

        {creditPence > 0 && (
          <p className="text-sm mb-1" style={{ color: "var(--j-body)" }}>
            Includes {nf.format(toCredits(creditPence))} top-up credits.
          </p>
        )}

        <p className="text-sm" style={{ color: "var(--j-faint)" }}>
          Resets on {resetsOn()}. Unused credits don&apos;t carry over.
        </p>

        {justToppedUp && creditPence === 0 && (
          <p className="text-sm mt-3" style={{ color: "#b07a1e" }}>
            Your credit is being applied — refresh in a moment.
          </p>
        )}

        {/* Offered early enough to be useful, not so early it nags. */}
        {(spent || fraction >= PROMINENT_AT) && (
          <div className="mt-4">
            <TopUpButton />
          </div>
        )}
      </div>
    );
  }

  // No plan: nothing to meter. The plan card above already says to choose one,
  // and "0 of 0 this month" would read as an allowance that ran out.
  if (!hasActivePlan(plan)) return null;

  // ── Count-capped plans: generation counts ──
  // No plan on sale is capped by count today; kept so a count-capped plan
  // (or School, once modelled) still has a meter.
  const { dailyGenerations, monthlyGenerations } = PLANS[plan].limits;
  if (dailyGenerations === null && monthlyGenerations === null) return null;

  const monthFraction =
    monthlyGenerations ? usedMonth / monthlyGenerations : 0;
  const outOfMonth = monthlyGenerations !== null && usedMonth >= monthlyGenerations;
  const outOfDay = dailyGenerations !== null && usedToday >= dailyGenerations;

  return (
    <div
      className="rounded-2xl p-6 border mt-5"
      style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
    >
      <p className="text-xs font-semibold mb-1" style={{ color: "var(--j-faint)" }}>
        Generations
      </p>
      <p className="text-xl font-bold mb-3" style={{ color: "var(--j-ink)" }}>
        {usedMonth}{" "}
        <span className="text-sm font-medium" style={{ color: "var(--j-faint)" }}>
          of {monthlyGenerations} this month
        </span>
      </p>

      <Bar
        fraction={monthFraction}
        tone={outOfMonth ? "#c2342b" : monthFraction >= PROMINENT_AT ? "#b07a1e" : "#3a8f5a"}
      />

      {dailyGenerations !== null && (
        <p className="text-sm mb-1" style={{ color: "var(--j-body)" }}>
          {outOfDay
            ? "You've used today's generation — the next unlocks at midnight UTC."
            : `${usedToday} of ${dailyGenerations} used today.`}
        </p>
      )}

      <p className="text-sm" style={{ color: "var(--j-faint)" }}>
        {outOfMonth
          ? `Your generations reset on ${resetsOn()}.`
          : `Resets on ${resetsOn()}.`}
      </p>
    </div>
  );
}
