"use client";

import { useEffect, useState } from "react";
import { createClient } from "./auth/client";
import { DEFAULT_PLAN, effectivePlan, type PlanId } from "./plans";
import { buyablePacks, PACK_COLUMNS, type TopUpPack } from "./topup-packs";

/*
 * The credit packs the signed-in teacher may buy, in display order.
 *
 * Read straight from topup_packs in the browser: the read policy is
 * `active or is_admin()` and `select` is granted to `authenticated`, so a
 * teacher can list active packs under RLS with no route of its own.
 *
 * `available_to` is filtered HERE for display only. It is not enforced by RLS,
 * so /api/stripe/topup re-checks it before creating a session — see the note in
 * topup-packs.ts. Never treat this list as the authority on what may be bought.
 */

export interface TopUpPacks {
  packs: TopUpPack[];
  loading: boolean;
  /** True once loaded with nothing to sell: no active pack, none allowed on
   *  this plan, or none configured with a Stripe price. */
  empty: boolean;
}

export function useTopUpPacks(enabled = true): TopUpPacks {
  const [packs, setPacks] = useState<TopUpPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Two reads rather than a join: profiles and topup_packs have different
        // policies, and PostgREST cannot embed across them without a foreign
        // key. Both are small and indexed.
        const [{ data: profile }, { data: rows }] = await Promise.all([
          user
            ? supabase
                .from("profiles")
                .select("plan, subscription_status, stripe_subscription_id, current_period_end")
                .eq("id", user.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from("topup_packs")
            .select(PACK_COLUMNS)
            .eq("kind", "credit_gbp")
            .eq("active", true)
            .order("sort"),
        ]);

        if (cancelled) return;

        const plan: PlanId = profile ? effectivePlan(profile) : DEFAULT_PLAN;
        setPacks(buyablePacks(rows ?? [], plan));
      } catch {
        // An empty list renders as "no top ups available" rather than an error
        // screen. The modal still closes, and the billing page still works.
        if (!cancelled) setPacks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { packs, loading, empty: !loading && packs.length === 0 };
}
