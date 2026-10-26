import Link from "next/link";
import { createClient } from "@/app/lib/auth/server";
import { hasActivePlan, isBillingInterval, PLANS, PLAN_CREDITS } from "@/app/lib/plans";
import { trialDaysFor } from "@/app/lib/trial";
import { firstPaymentCopy } from "@/app/lib/plan-copy";
import { loadPlanState } from "./loadPlanState";
import ManageButton from "./ManageButton";
import CancelSubscriptionButton from "./CancelSubscriptionButton";
import ResumeButton from "./ResumeButton";
import SwitchIntervalButton from "./SwitchIntervalButton";
import CancelDowngradeButton from "./CancelDowngradeButton";
import AllowanceMeter from "./AllowanceMeter";

// Overview: current plan, where they stand against this month's allowance, and
// the actions that manage the billing itself. CHOOSING a plan happens on
// /pricing, which the current-plan card links to; this page used to carry the
// plan cards too. The proxy guarantees a session by the time this renders.
export default async function OverviewTab({
  checkout,
  topup,
  switchTo,
}: {
  // Passed down from the page shell, which owns searchParams, rather than read
  // again here — one source, so the banner and the tab strip can't disagree.
  checkout?: string;
  topup?: string;
  /** ?switch=month from the annual trial email: open the switch on arrival. */
  switchTo?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [state, { data: usedMonth }, { data: usedToday }, { data: spend }] = await Promise.all([
    loadPlanState(supabase, user?.id ?? ""),
    supabase.rpc("my_generation_count_this_month"),
    supabase.rpc("my_generation_count_today"),
    supabase.rpc("monthly_ai_spend", { uid: user?.id ?? "" }),
  ]);

  // monthly_ai_spend returns one row; supabase-js hands back an array.
  const spendRow = (Array.isArray(spend) ? spend[0] : spend) as
    | { spend_pence: number | string; credit_pence: number | string }
    | null
    | undefined;

  const {
    plan,
    planName,
    profile,
    isSubscriber,
    hasSubscription,
    trialing,
    interval,
    pending,
    pendingSwitch,
    pendingAt,
    ending,
    ended,
    renews,
    ambassadorPro,
    ambassadorUntil,
    reviewTrialUntil,
    nextPayment,
    referralCode,
    retention,
  } = state;
  const yearly = interval === "year";
  // A discount waiting on the first payment (an ambassador code), mid-trial.
  const firstPayment =
    trialing && !ending && !ended && renews && nextPayment
      ? firstPaymentCopy({ renews, ...nextPayment, interval, code: referralCode })
      : null;

  return (
    // max-w-3xl, kept from when the plan ladder lived here: the allowance
    // meter below reads better at this width than at the old 576px.
    <div className="max-w-3xl">
      {/* The plan is granted by the Stripe webhook, which lands a moment after
          this redirect — so `plan` here is usually still the OLD one. Naming
          it would congratulate the user on the plan they just paid to leave.
          Report only what we know: the payment went through. */}
      {checkout === "success" && plan === "free" && (
        <div
          className="rounded-xl px-4 py-3 mb-5 text-sm font-medium"
          style={{ backgroundColor: "#FDF0D5", color: "#8a6d1f" }}
        >
          All set, activating your plan. This usually takes a few seconds;
          refresh the page to check.
        </div>
      )}

      {checkout === "success" && plan !== "free" && (
        <div
          className="rounded-xl px-4 py-3 mb-5 text-sm font-medium"
          style={{ backgroundColor: "#DDF0E2", color: "#1f6b3b" }}
        >
          {trialing
            ? `Your free trial of ${planName} has started. Welcome!`
            : `Payment received, welcome to ${planName}!`}
        </div>
      )}

      {topup === "success" && (
        <div
          className="rounded-xl px-4 py-3 mb-5 text-sm font-medium"
          style={{ backgroundColor: "#DDF0E2", color: "#1f6b3b" }}
        >
          Payment received — {PLAN_CREDITS.toLocaleString("en-GB")} credits have been added
          to this month.
        </div>
      )}

      <div
        className="rounded-2xl p-6 border"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--j-faint)" }}>
              Current plan
            </p>
            <p className="text-xl font-bold" style={{ color: "var(--j-ink)" }}>
              {planName}
            </p>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={
              ambassadorPro
                ? { backgroundColor: "var(--j-gold)", color: "#fff" }
                : { backgroundColor: "var(--j-tint)", color: "var(--j-faint)" }
            }
          >
            {ambassadorPro
              ? "ambassador"
              : trialing || reviewTrialUntil
                ? "free trial"
                : hasActivePlan(plan)
                  ? (profile?.subscription_status ?? "active")
                  : "no plan"}
          </span>
        </div>

        {!hasActivePlan(plan) && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }}>
            Choose a plan to start creating.
            {trialDaysFor(profile) > 0 && " Every plan starts with a free trial."}
          </p>
        )}

        {/* During a trial current_period_end IS the trial end, which is also
            when the first charge happens. */}
        {/* An ambassador's Pro is a comp with an end date, not a subscription
            that renews. Said plainly so nobody expects a charge, or a renewal. */}
        {ambassadorPro && ambassadorUntil && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }}>
            Free as a Jooma Ambassador until {ambassadorUntil}. You won&apos;t be charged.
          </p>
        )}

        {/* Standard while their ambassador application is read: no card, no
            Stripe subscription, so nothing is charged when it ends. */}
        {reviewTrialUntil && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }} data-testid="review-trial">
            Your free trial ends on {reviewTrialUntil} while we review your ambassador
            application. No card is needed, and you won&apos;t be charged. Choose a plan any time
            to keep going after that.
          </p>
        )}

        {/* The cancel flow's discount, once taken. Said here so the teacher
            can see it is on without waiting for the next invoice. */}
        {retention && !ending && !ended && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }} data-testid="retention-discount">
            {retention.endsAt
              ? `Half price until ${retention.endsAt}, from the offer you accepted.`
              : "12.5% off your next renewal, from the offer you accepted."}
          </p>
        )}

        {firstPayment && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }} data-testid="first-payment">
            {firstPayment.lead}{" "}
            <s style={{ color: "var(--j-faint)" }}>
              <span className="sr-only">was </span>
              {firstPayment.was}
            </s>{" "}
            <span className="sr-only">now </span>
            <b style={{ color: "var(--j-ink)" }}>{firstPayment.now}</b>
            {firstPayment.tail}
          </p>
        )}

        {!ambassadorPro && !reviewTrialUntil && !firstPayment && renews && hasActivePlan(plan) && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }}>
            {trialing && (ending || ended)
              ? `Your free trial ends on ${renews}. You won't be charged.`
              : trialing
                ? yearly
                  ? `Your free trial ends on ${renews}. Then £${PLANS[plan].priceYearly?.toFixed(2)} a year.`
                  : `Your free trial ends on ${renews}. Then £${PLANS[plan].priceMonthly?.toFixed(2)} a month.`
                : ending || ended
                  ? `Access ends on ${renews}.`
                  : yearly
                    ? `Renews yearly on ${renews}.`
                    : `Renews on ${renews}.`}
          </p>
        )}

        {isSubscriber ? (
          <div className="flex flex-col gap-3">
            {/* Changing plan is not a button here: /pricing offers every move in
                both directions, with the current one marked, and the link below
                goes there. This row is left with what it was always for:
                managing the billing itself. */}
            <div className="flex flex-wrap items-start gap-2">
              {/* No flow — lands on the portal homepage, which is also where
                  Stripe keeps the downloadable invoice history. The History tab
                  links here for exactly that reason. */}
              <ManageButton label="Manage billing" />
              <ManageButton
                flow="payment_method_update"
                label="Update card"
                variant="outline"
              />
              {/* Cancel, with its losses panel, while there is something live
                  to cancel. Renew instead while ENDING: it undoes the cancel.
                  Once fully ended there is nothing to renew, and /pricing is
                  the way back. */}
              {hasSubscription && !ending && !ended && (
                <CancelSubscriptionButton />
              )}
              {hasSubscription && ending && <ResumeButton />}
            </div>

            {/* Monthly or yearly, on the plan they have. Offered only while
                nothing else is waiting: Stripe holds one schedule per
                subscription, and a second change would replace the first. */}
            {hasSubscription && !ending && !ended && !pending && (
              <SwitchIntervalButton
                plan={plan}
                current={interval}
                // Only when the link asks for the interval this button offers:
                // a stale ?switch=month on a monthly plan opens nothing.
                openOnLoad={isBillingInterval(switchTo) && switchTo !== interval}
              />
            )}

            {pendingSwitch && pendingAt && (
              <p className="text-sm" style={{ color: "var(--j-body)" }}>
                Switches to {pendingSwitch.interval === "month" ? "monthly" : "yearly"} billing on{" "}
                {pendingAt}.{" "}
                <CancelDowngradeButton
                  keeping={plan}
                  label={`Keep ${yearly ? "yearly" : "monthly"} billing`}
                />
              </p>
            )}
          </div>
        ) : null}

        {/* Every plan move lives on /pricing. Named for where they stand: with
            nothing yet it is a choice, with a plan it is a change. */}
        <Link
          href="/pricing"
          className="inline-block mt-4 text-sm font-semibold underline transition-opacity hover:opacity-70"
          style={{ color: "var(--j-purple)" }}
        >
          {hasActivePlan(plan) ? "Change plan" : "See plans"}
        </Link>

        {/* Two different messages, because the two states have different exits.
            While ENDING the subscription is still live and the Renew button
            above undoes it in place. Pointing them at the plans would send them
            to buy a second subscription they don't need. Once ENDED, the plans
            page really is the only route back. */}
        {ending && (
          <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
            Your plan is set to end. Renew to keep it — you won&apos;t be charged
            until {renews ?? "the next billing date"}.
          </p>
        )}

        {ended && (
          <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
            You can subscribe again any time from the plans page.
          </p>
        )}
      </div>

      {/* The top-up button lives inside the meter, shown only above 80% used —
          see the reasoning there and the `hide_counter` pricing rule. */}
      <AllowanceMeter
        plan={plan}
        usedToday={typeof usedToday === "number" ? usedToday : 0}
        usedMonth={typeof usedMonth === "number" ? usedMonth : 0}
        spendPence={Number(spendRow?.spend_pence ?? 0)}
        creditPence={Number(spendRow?.credit_pence ?? 0)}
        justToppedUp={topup === "success"}
      />
    </div>
  );
}
