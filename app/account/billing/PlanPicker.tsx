"use client";

import { useState } from "react";
import Link from "next/link";
import PlanCard, { PlanCardGrid, type PlanCardAction } from "@/app/components/plans/PlanCard";
import BillingToggle from "@/app/components/plans/BillingToggle";
import {
  maxYearlySavingPercent,
  planCardCta,
  planCardName,
  planCardPricing,
  planFeatures,
  planTrialLine,
  TRIAL_CTA,
} from "@/app/lib/plan-copy";
import { DEFAULT_INTERVAL, PLANS, type BillingInterval, type PlanId } from "@/app/lib/plans";
import DowngradeButton from "./DowngradeButton";
import UpgradeButton from "./UpgradeButton";
import CancelDowngradeButton from "./CancelDowngradeButton";
import BillingChangePanel from "./BillingChangePanel";

/*
 * Every plan a teacher can be on, and the way to get to each one.
 *
 * WHY ALL OF THEM, ALWAYS
 * This used to render only for people with NO subscription, and only the plans
 * above them — so a subscriber saw a single "Upgrade" button and a Max
 * subscriber saw nothing at all. Moving down was invisible: the only route off
 * Max was the red Cancel button, which reads as quitting rather than switching.
 * Showing the full ladder with the current rung marked makes every move
 * available in the same place, in both directions.
 *
 * The figures are derived — PLANS for the price, planCredits() via
 * planFeatures() for the allowance — so a card cannot advertise something the
 * ceiling will not honour. See the note above PENCE_PER_CREDIT in lib/plans.ts.
 *
 * The ACTIONS are all existing components. This decides which one belongs on
 * which card; each still owns its own confirmation and its own request.
 */

/** The plan most people should buy. Carries the badge, and the purple card. */
const FEATURED: PlanId = "pro";

export default function PlanPicker({
  /** Plans to show, cheapest first. */
  plans,
  /** The plan they are on. "free" means none. */
  current,
  /** Whether they have a live Stripe subscription to change, as opposed to
   *  needing a fresh checkout. A lapsed subscriber has a customer and an old
   *  subscription id but nothing live, and must go through checkout. */
  hasSubscription = false,
  /** Whether a checkout would start with the free trial (first subscription
   *  only, see lib/trial.ts). Changes the label and adds the trial line. */
  trialEligible = false,
  /** A scheduled downgrade, read back from Stripe by the server. */
  pendingPlan = null,
  /** The interval that scheduled change bills at, when it moves interval too. */
  pendingInterval = null,
  /** When that scheduled change takes effect, already formatted. */
  pendingAt = null,
  /** The subscription is cancelling or has ended. Plan changes are hidden:
   *  renewing comes first, and swapping a plan that is about to stop would
   *  charge for something disappearing. */
  locked = false,
  /** The interval their live subscription bills at, read from Stripe. The
   *  toggle opens on it for a subscriber, so the cards first show what they
   *  pay now; flipping it shows, and offers, the other interval. */
  subscriptionInterval = "month",
  /** They have claimed an ambassador code that is still unused. It discounts
   *  monthly checkouts only, which the picker says when Yearly is chosen. */
  hasUnusedCode = false,
}: {
  plans: PlanId[];
  current: PlanId;
  hasSubscription?: boolean;
  trialEligible?: boolean;
  pendingPlan?: PlanId | null;
  pendingInterval?: BillingInterval | null;
  pendingAt?: string | null;
  locked?: boolean;
  subscriptionInterval?: BillingInterval;
  hasUnusedCode?: boolean;
}) {
  const [pending, setPending] = useState<PlanId | null>(null);
  /**
   * The interval the cards show and act at.
   *
   * A subscriber opens on the interval they pay now, so the first thing they
   * see is their own price, marked as theirs. Someone with nothing yet opens on
   * Yearly, the better deal, as on the landing page.
   */
  const [interval, setIntervalChoice] = useState<BillingInterval>(
    hasSubscription ? subscriptionInterval : DEFAULT_INTERVAL,
  );
  /** True when the cards show the interval a subscriber is NOT billed at, so
   *  every card there, their own plan's included, is a billing change. */
  const otherInterval = hasSubscription && interval !== subscriptionInterval;
  const [error, setError] = useState<string | null>(null);
  /** The plan whose confirmation panel is open, below the grid. */
  const [changing, setChanging] = useState<PlanId | null>(null);

  /** Flipping the toggle closes any open confirmation: it was for a price the
   *  cards no longer show. */
  function chooseInterval(next: BillingInterval) {
    setIntervalChoice(next);
    setChanging(null);
  }

  /** The card for the plan AND interval they already have. */
  const isCurrentCard = (id: PlanId) => id === current && !otherInterval;

  async function subscribe(plan: PlanId) {
    setPending(plan);
    setError(null);
    try {
      // Checkout, not the upgrade route: this path is for teachers with no
      // subscription to swap. Someone who already subscribes gets the
      // Upgrade/Downgrade buttons instead, which change the subscription they
      // have rather than starting a second one.
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        // assign(), not `location.href =`: a full navigation to Stripe's domain
        // either way, but the React compiler reads the property write as
        // mutating a value from outside the component.
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? "Could not start checkout.");
    } catch {
      setError("Network error. Please try again.");
    }
    // Only reached if checkout did not open, so the button can be retried.
    setPending(null);
  }

  /**
   * Which plan move a card offers, if any.
   *
   * Kept separate from rendering because a change is CONFIRMED below the grid
   * rather than inside the card: the confirmation panel carries a list of
   * consequences and a pair of buttons, and a card column is roughly 200px
   * wide, which wraps that to two or three words a line. The card starts the
   * move; the panel underneath explains it with room to be read.
   */
  function moveFor(id: PlanId): "buy" | "up" | "down" | "billing" | null {
    if (isCurrentCard(id)) return null;
    // A change is already scheduled. Offering a second one would stack
    // conflicting schedules, so every other card goes quiet until it is either
    // cancelled or lands.
    if (pendingPlan) return null;
    // Cancelling or ended: renewing comes first. Matches the gate the Overview
    // card applies to its own buttons.
    if (locked) return null;

    // No subscription to change — this is a purchase, not a swap.
    if (!hasSubscription) return "buy";

    // The other interval: a billing change, with a plan change if this is not
    // their plan. /api/stripe/switch-interval decides when it happens.
    if (otherInterval) return "billing";

    return (PLANS[id].priceMonthly ?? 0) > (PLANS[current].priceMonthly ?? 0)
      ? "up"
      : "down";
  }

  function actionFor(id: PlanId): PlanCardAction {
    if (isCurrentCard(id)) return { kind: "current" };

    const move = moveFor(id);
    if (!move) return { kind: "none" };

    if (move === "buy") {
      return {
        kind: "button",
        label: pending === id ? "Starting checkout…" : trialEligible ? TRIAL_CTA : planCardCta(id),
        onClick: () => subscribe(id),
        disabled: pending !== null,
      };
    }

    // Opens the confirmation panel below the grid. Selecting the card a second
    // time closes it again, so the button is a toggle rather than a dead end.
    return {
      kind: "button",
      // Their own plan at the other interval names the interval, since the
      // plan is not what changes.
      label:
        move === "billing" && id === current
          ? `Switch to ${interval === "year" ? "yearly" : "monthly"}`
          : `Switch to ${planCardName(id)}`,
      onClick: () => setChanging(changing === id ? null : id),
      disabled: false,
    };
  }

  return (
    <div className="mt-5">
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--j-ink)" }}>
        {/* "Choose" for someone with nothing yet; "Change" once there is a
            subscription to move, in either direction. */}
        {hasSubscription ? "Change your plan" : "Choose your plan"}
      </p>

      <BillingToggle
        value={interval}
        onChange={chooseInterval}
        savePercent={maxYearlySavingPercent(plans)}
      />

      {!hasSubscription && hasUnusedCode && interval === "year" && (
        <p className="text-sm mb-3 text-center" style={{ color: "var(--j-faint)" }}>
          Your code applies to monthly plans.
        </p>
      )}

      <PlanCardGrid columns={plans.length}>
        {plans.map((id) => {
          const isCurrent = isCurrentCard(id);
          const isPending = pendingPlan === id;
          // Named only when the scheduled change moves interval as well.
          const pendingBilled =
            pendingInterval && pendingInterval !== subscriptionInterval
              ? `, billed ${pendingInterval === "year" ? "yearly" : "monthly"}`
              : "";

          // Only the two cards involved in a scheduled change say anything.
          const footer =
            isPending && pendingAt ? (
              <>
                Starts on {pendingAt}
                {pendingBilled}. <CancelDowngradeButton keeping={current} />
              </>
            ) : isCurrent && pendingPlan && pendingAt ? (
              <>Yours until {pendingAt}.</>
            ) : trialEligible && moveFor(id) === "buy" ? (
              planTrialLine(id, interval)
            ) : null;

          return (
            <PlanCard
              key={id}
              name={planCardName(id)}
              {...planCardPricing(id, interval)}
              features={planFeatures(id)}
              featured={id === FEATURED}
              badge={id === FEATURED ? "Most popular" : undefined}
              current={isCurrent}
              action={actionFor(id)}
              footer={footer}
            />
          );
        })}
      </PlanCardGrid>

      {/* The confirmation, full width beneath the cards rather than inside the
          one that was clicked. It carries a list of consequences and a pair of
          buttons, and a card column is far too narrow to read that in. */}
      {changing && (
        <div className="mt-4">
          {moveFor(changing) === "billing" ? (
            <BillingChangePanel
              key={`${changing}-${interval}`}
              fromPlan={current}
              toPlan={changing}
              to={interval}
              onClose={() => setChanging(null)}
            />
          ) : moveFor(changing) === "up" ? (
            <UpgradeButton
              to={changing}
              interval={interval}
              onClose={() => setChanging(null)}
            />
          ) : (
            <DowngradeButton
              from={current}
              to={changing}
              interval={interval}
              onClose={() => setChanging(null)}
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-sm mt-3" role="alert" style={{ color: "#c2342b" }}>
          {error}
        </p>
      )}

      {/* Schools are sold hands-on, not self-serve: there is no seat model on
          profiles to bill against, so this is an enquiry, not a card. */}
      <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
        Running a whole school?{" "}
        {/* Already signed in, so this goes to the in-app form rather than the
            public page: the name and email prefill from their profile. */}
        <Link
          href="/help?tab=school"
          className="font-semibold underline transition-opacity hover:opacity-70"
          style={{ color: "var(--j-purple)" }}
        >
          Talk to us
        </Link>{" "}
        about school pricing.
      </p>
    </div>
  );
}
