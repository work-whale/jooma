"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "./auth/client";
import { effectivePlan } from "./plans";
import { planBadgeFor, type AmbassadorTerm, type PlanBadge, type TrialStatus } from "./plan-badge";
import { useAccountAccess } from "./useAccountAccess";

/*
 * The sidebar's plan pill, and whether to dress the shell as an ambassador's.
 *
 * Two reads in parallel: the teacher's own profiles.plan (RLS lets them read
 * their own row) and my_ambassador(), a definer function that returns the
 * caller's ambassador row and nothing else. The ambassador tables themselves
 * are admin-only and stay that way.
 *
 * Fails quiet. If my_ambassador() is missing (an environment without the
 * 20261012000000 migration) or errors, the teacher is simply treated as not an
 * ambassador, the same way useCreditMeter hides the meter rather than showing
 * a false zero.
 */

export interface PlanBadgeState extends PlanBadge {
  loading: boolean;
}

interface MyAmbassadorRow {
  status: string;
  pro_until: string | null;
}

export function usePlanBadge(): PlanBadgeState {
  // Shared and cached with the rest of the page (one request), so the trial
  // countdown costs nothing extra. Null while loading, which reads as no trial.
  const access = useAccountAccess();
  const [base, setBase] = useState<{
    plan: ReturnType<typeof effectivePlan>;
    term: AmbassadorTerm | null;
    /** When it was read: the badge's "now". The countdown ticks on its own. */
    at: Date;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: profile }, ambassador] = await Promise.all([
        supabase
          .from("profiles")
          .select("plan, subscription_status, stripe_subscription_id, current_period_end")
          .maybeSingle(),
        supabase.rpc("my_ambassador"),
      ]);
      if (cancelled) return;

      const row = (
        !ambassador.error && Array.isArray(ambassador.data) ? ambassador.data[0] : null
      ) as MyAmbassadorRow | null | undefined;
      const term: AmbassadorTerm | null = row
        ? { status: row.status, proUntil: row.pro_until ? new Date(row.pro_until) : null }
        : null;

      setBase({ plan: effectivePlan(profile), term, at: new Date() });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<PlanBadgeState>(() => {
    if (!base) return { ...planBadgeFor("free", null), loading: true };
    const trial: TrialStatus | null = access
      ? {
          trialEndsAt: access.state === "trial" ? access.trialEndsAt : null,
          trialStartedAt: access.trialStartedAt,
          offerEndsAt: access.trialOffer?.endsAt ?? null,
        }
      : null;
    return { ...planBadgeFor(base.plan, base.term, base.at, trial), loading: false };
  }, [base, access]);
}
