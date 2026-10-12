"use client";

import { useEffect, useState } from "react";
import { createClient } from "./auth/client";
import { asPlanId } from "./plans";
import { planBadgeFor, type AmbassadorTerm, type PlanBadge } from "./plan-badge";

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
  const [state, setState] = useState<PlanBadgeState>(() => ({
    ...planBadgeFor("free", null),
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: profile }, ambassador] = await Promise.all([
        supabase.from("profiles").select("plan").maybeSingle(),
        supabase.rpc("my_ambassador"),
      ]);
      if (cancelled) return;

      const row = (
        !ambassador.error && Array.isArray(ambassador.data) ? ambassador.data[0] : null
      ) as MyAmbassadorRow | null | undefined;
      const term: AmbassadorTerm | null = row
        ? { status: row.status, proUntil: row.pro_until ? new Date(row.pro_until) : null }
        : null;

      setState({ ...planBadgeFor(asPlanId(profile?.plan), term), loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
