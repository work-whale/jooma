import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe, intervalOfPrice } from "@/app/lib/stripe";
import { effectivePlan, type BillingInterval, type PlanId } from "@/app/lib/plans";
import { londonDayKey, streakFrom } from "@/app/lib/badgeCriteria";
import { minutesSavedFor } from "@/app/lib/tools";
import {
  type AccountSummary,
  type CancelOutcome,
  type CancelReason,
  type OfferInput,
} from "@/app/lib/cancel-flow";

/*
 * The cancel flow's reads and its one write, shared by the page and the three
 * routes under app/api/billing/cancel-flow so they all see the same teacher.
 *
 * Stripe is the authority on the subscription (status, schedule, discounts,
 * whether it is ending); the profile is only where the subscription id comes
 * from. That is the ownership check: the id is never read from a request.
 */

export interface CancelContext {
  plan: PlanId;
  interval: BillingInterval;
  subscriptionId: string | null;
  sub: Stripe.Subscription | null;
  trialing: boolean;
  ending: boolean;
  ended: boolean;
  /** current_period_end, as a Date. */
  periodEnd: Date | null;
  offerInput: OfferInput;
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDate(d: Date | null): string | null {
  return d ? longDate(d) : null;
}

function scheduleIsPending(schedule: Stripe.Subscription["schedule"]): boolean {
  if (!schedule || typeof schedule === "string") return Boolean(schedule);
  if (schedule.status !== "active" && schedule.status !== "not_started") return false;
  return Boolean(schedule.phases?.[1]);
}

/** Their latest row of each outcome the offer rules read. */
async function lastEvents(userId: string): Promise<{ discount: Date | null; cancelled: Date | null }> {
  const read = async (outcome: CancelOutcome) => {
    const { data, error } = await supabaseAdmin
      .from("cancellation_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("outcome", outcome)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Thrown, not read as "none": an unreadable table must not lift the cap.
    if (error) throw new Error(`cancellation_events: ${error.message}`);
    return data?.created_at ? new Date(data.created_at) : null;
  };
  const [discount, cancelled] = await Promise.all([read("discount"), read("cancelled")]);
  return { discount, cancelled };
}

export async function loadCancelContext(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<CancelContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, subscription_status, cancel_at_period_end, current_period_end, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  const plan = effectivePlan(profile);
  const subscriptionId = (profile?.stripe_subscription_id as string | null) ?? null;

  let sub: Stripe.Subscription | null = null;
  if (subscriptionId) {
    try {
      sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["discounts", "schedule"],
      });
    } catch (err) {
      console.error("[cancel-flow] subscription lookup failed", err);
    }
  }

  const status = sub?.status ?? (profile?.subscription_status as string | null) ?? null;
  const ended = status === "canceled";
  const ending =
    !ended &&
    (sub
      ? Boolean(sub.cancel_at_period_end) ||
        (typeof sub.cancel_at === "number" && sub.cancel_at * 1000 > now.getTime())
      : Boolean(profile?.cancel_at_period_end));
  const interval = intervalOfPrice(sub?.items.data[0]?.price);
  const periodEndUnix = sub?.items.data[0]?.current_period_end;
  const periodEnd =
    typeof periodEndUnix === "number"
      ? new Date(periodEndUnix * 1000)
      : profile?.current_period_end
        ? new Date(profile.current_period_end as string)
        : null;

  const events = await lastEvents(userId);

  return {
    plan,
    interval,
    subscriptionId,
    sub,
    trialing: status === "trialing",
    ending,
    ended,
    periodEnd,
    offerInput: {
      plan,
      interval,
      hasSubscription: Boolean(sub) && !ended,
      status,
      ending,
      hasDiscount: (sub?.discounts ?? []).some((d) => Boolean(d)),
      hasPendingSchedule: scheduleIsPending(sub?.schedule ?? null),
      lastDiscountAt: events.discount,
      cancelledAt: events.cancelled,
      now,
    },
  };
}

/** The real numbers for "what you lose". Every read is the teacher's own,
 *  through their own client and RLS. */
export async function loadAccountSummary(
  supabase: SupabaseClient,
  ctx: Pick<CancelContext, "plan" | "periodEnd" | "trialing">,
  now = new Date(),
): Promise<AccountSummary> {
  const [{ data: runs }, { count: badges }] = await Promise.all([
    supabase.from("tool_runs").select("tool_slug, created_at").limit(10000),
    supabase.from("user_badges").select("badge_id", { count: "exact", head: true }),
  ]);

  const rows = (runs ?? []) as { tool_slug: string; created_at: string }[];
  const activeDays = new Set<string>();
  let minutesSaved = 0;
  for (const r of rows) {
    minutesSaved += minutesSavedFor(r.tool_slug);
    const at = new Date(r.created_at);
    if (!Number.isNaN(at.getTime())) activeDays.add(londonDayKey(at));
  }

  return {
    plan: ctx.plan,
    periodEnd: formatDate(ctx.periodEnd),
    trialing: ctx.trialing,
    resources: rows.length,
    minutesSaved,
    badges: badges ?? 0,
    streak: streakFrom(activeDays, now),
  };
}

export interface EventRow {
  userId: string;
  reason: CancelReason;
  outcome: CancelOutcome;
  plan: PlanId;
  interval: BillingInterval | null;
  couponId?: string | null;
  detail?: string | null;
  dedupeKey?: string | null;
}

/**
 * Write one row. Returns "duplicate" when the dedupe key is already taken,
 * which is how a double click finds out the first click did the work.
 */
export async function recordEvent(row: EventRow): Promise<{ id: string } | "duplicate"> {
  const { data, error } = await supabaseAdmin
    .from("cancellation_events")
    .insert({
      user_id: row.userId,
      reason: row.reason,
      outcome: row.outcome,
      plan: row.plan,
      interval: row.interval,
      coupon_id: row.couponId ?? null,
      detail: row.detail ? row.detail.slice(0, 2000) : null,
      dedupe_key: row.dedupeKey ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return "duplicate";
    throw new Error(`cancellation_events insert: ${error.message}`);
  }
  return { id: data.id as string };
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("cancellation_events").delete().eq("id", id);
  if (error) console.error("[cancel-flow] could not release a claimed row", id, error);
}
