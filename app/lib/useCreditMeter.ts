"use client";

import { useEffect, useState } from "react";
import { getEntitlements } from "./entitlements";
import { creditsRemaining, toCredits } from "./plans";
import { picturesAllowed, type AccountPlan } from "./plan-config";
import type { MeterPeriod } from "./resource-meter";
import { useResources } from "./useResources";

/*
 * The sidebar credit meter.
 *
 * Credits are DERIVED, not stored. There is no balance column and no ledger:
 * `monthly_ai_spend` sums this month's measured provider cost, and the plan's
 * ceiling plus any purchased top-up is the allowance. See the long note above
 * PENCE_PER_CREDIT in plans.ts for why the teacher-facing unit is credits and
 * not pence.
 *
 * Everything here comes from getEntitlements(), which is the display-side twin
 * of the server's checkAllGates(). The two read the same numbers and must stay
 * in agreement, so this deliberately adds no arithmetic of its own beyond the
 * conversion helpers plans.ts already exports.
 */

export interface CreditMeter {
  /** Still loading. The meter renders a neutral placeholder rather than a 0. */
  loading: boolean;
  /** Credits left this month, floored at zero. */
  remaining: number;
  /** The month's allowance in credits, including purchased top-up. */
  allowance: number;
  /** Fraction of the allowance still available, 0 to 1. */
  fraction: number;
  /**
   * Plans with no spend ceiling (Free, which is gated by generation count, and
   * School, which is not modelled). The meter shows the plan's real limit
   * instead of inventing a credit figure it does not have.
   */
  metered: boolean;
  /** When the allowance resets. Null for the 4.5 trial, which never refills. */
  refillsOn: Date | null;
  /** Jooma 4.5: when the Pro trial ends. Null otherwise and before 4.5. */
  endsOn: Date | null;
  /** What the allowance is per: "week" on Free, "trial" once, else "month". */
  period: MeterPeriod;
  /** The plan the balance belongs to, or null before 4.5. */
  plan: string | null;
  /** Generated pictures on this plan. Before 4.5, any metered (paid) plan. */
  pictures: boolean;
}

/** The first of next month. Grants expire at month end, so this is the reset. */
function startOfNextMonth(from = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

type LegacyMeter = Omit<CreditMeter, "refillsOn" | "endsOn" | "period" | "plan" | "pictures">;

/**
 * Jooma 4.5 reads my_resources() (useResources). Before that migration is
 * pushed the RPC is missing and this falls back to the monthly spend meter
 * below, unchanged.
 */
export function useCreditMeter(): CreditMeter {
  const v45 = useResources();
  const legacy = useLegacyCreditMeter(v45 === "missing");
  if (v45 === "missing") {
    return {
      ...legacy,
      refillsOn: startOfNextMonth(),
      endsOn: null,
      period: "month",
      plan: null,
      pictures: legacy.metered,
    };
  }
  if (v45 === null) {
    return {
      loading: true,
      remaining: 0,
      allowance: 0,
      fraction: 0,
      metered: false,
      refillsOn: null,
      endsOn: null,
      period: "month",
      plan: null,
      pictures: false,
    };
  }
  return {
    loading: false,
    remaining: v45.remaining,
    allowance: v45.allowance,
    fraction: v45.fraction,
    metered: v45.metered,
    refillsOn: v45.refillsOn,
    endsOn: v45.endsOn,
    period: v45.period,
    plan: v45.plan,
    pictures: picturesAllowed(v45.plan as AccountPlan),
  };
}

function useLegacyCreditMeter(enabled: boolean): LegacyMeter {
  const [state, setState] = useState<LegacyMeter>({
    loading: true,
    remaining: 0,
    allowance: 0,
    fraction: 0,
    metered: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const ent = await getEntitlements();
        if (cancelled) return;

        // ceilingPence is null on unmetered plans, and already includes any
        // purchased top-up credit on the rest.
        if (ent.ceilingPence === null) {
          setState({
            loading: false,
            remaining: 0,
            allowance: 0,
            fraction: 0,
            metered: false,
          });
          return;
        }

        const allowance = toCredits(ent.ceilingPence);
        const remaining = creditsRemaining(ent.spendPence, ent.ceilingPence);
        setState({
          loading: false,
          remaining,
          allowance,
          // Guard the divide: a zero allowance would otherwise give NaN and a
          // progress bar with no width at all.
          fraction: allowance > 0 ? remaining / allowance : 0,
          metered: true,
        });
      } catch {
        // A failed lookup must not take the sidebar down with it, and must not
        // silently DELETE the credit block either: metered:false is how an
        // UNMETERED PLAN hides the meter, so reusing it for an error conflates
        // "you have no ceiling" with "we could not find out".
        //
        // Keep whatever was last shown instead. On a first load there is
        // nothing to keep, so the meter stays in its loading state rather than
        // resolving to a wrong answer.
        //
        // NOTE this catch is narrower than it looks. supabase-js resolves with
        // { data: null, error } rather than throwing, so a failed request does
        // NOT land here: getEntitlements falls through to plan "free", whose
        // ceiling is null, and the meter hides anyway. Credits disappearing in
        // practice is that path plus a sidebar remount, not this one.
        if (!cancelled) {
          setState((previous) =>
            previous.loading ? previous : { ...previous, loading: false },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
