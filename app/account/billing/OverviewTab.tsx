import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { pendingPlanChange } from "@/app/lib/stripe";
import {
  asPlanId,
  hasActivePlan,
  PLANS,
  PLAN_CREDITS,
  SELECTABLE_PLAN_IDS,
} from "@/app/lib/plans";
import { trialDaysFor } from "@/app/lib/trial";
import ManageButton from "./ManageButton";
import CancelSubscriptionButton from "./CancelSubscriptionButton";
import ResumeButton from "./ResumeButton";
import PlanPicker from "./PlanPicker";
import AllowanceMeter from "./AllowanceMeter";
import AmbassadorCodeField from "./AmbassadorCodeField";

// Overview: current plan, where they stand against this month's allowance, and
// the actions that change either. The proxy guarantees a session by the time
// this renders.
export default async function OverviewTab({
  checkout,
  topup,
}: {
  // Passed down from the page shell, which owns searchParams, rather than read
  // again here — one source, so the banner and the tab strip can't disagree.
  checkout?: string;
  topup?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: usedMonth },
    { data: usedToday },
    { data: spend },
    { data: referral },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "plan, subscription_status, cancel_at_period_end, current_period_end, stripe_customer_id, stripe_subscription_id",
      )
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase.rpc("my_generation_count_this_month"),
    supabase.rpc("my_generation_count_today"),
    supabase.rpc("monthly_ai_spend", { uid: user?.id ?? "" }),
    // The ambassador code they have claimed, if any.
    //
    // SERVICE ROLE, not the caller's client. ambassador_referrals is admin-only
    // with no teacher read policy — deliberately, since a teacher-writable
    // referral would let anyone assign themselves an ambassador — so the user's
    // own client sees nothing here and the field would always offer an input.
    // Scoped by their own id, so it can only ever find their own row.
    supabaseAdmin
      .from("ambassador_referrals")
      .select("first_paid_at, ambassador_codes ( code )")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
  ]);

  // monthly_ai_spend returns one row; supabase-js hands back an array.
  const spendRow = (Array.isArray(spend) ? spend[0] : spend) as
    | { spend_pence: number | string; credit_pence: number | string }
    | null
    | undefined;

  const plan = asPlanId(profile?.plan);
  const planName = PLANS[plan].name;

  // The code field has three states, and "spent" is the one worth being explicit
  // about: once first_paid_at is set the one-month discount has been used, so
  // there is nothing to offer and nothing to tell them to do. Showing an input
  // then would invite a second code that attribution would refuse anyway.
  const referralCode =
    (referral?.ambassador_codes as unknown as { code?: string } | null)?.code ?? null;
  const codeSpent = Boolean(referral?.first_paid_at);

  // Two different flags, deliberately not collapsed into one.
  //
  // A Stripe CUSTOMER outlives the subscription: a lapsed subscriber still has
  // a card on file worth updating, but nothing to cancel. Cancel additionally
  // needs a LIVE subscription, because Stripe's subscription_cancel flow takes
  // its id. The id alone is not enough: it is never cleared, so a lapsed
  // subscriber still carries the old one, and offering them a plan swap would
  // send it to a subscription Stripe has already closed. They check out again.
  const isSubscriber = Boolean(profile?.stripe_customer_id);
  const hasSubscription = Boolean(profile?.stripe_subscription_id) && hasActivePlan(plan);
  const trialing = profile?.subscription_status === "trialing";

  // Every plan a teacher can buy, cheapest first. Derived from
  // SELECTABLE_PLAN_IDS so a plan arriving or leaving needs no change here, and
  // so this can never offer School, which is hidden and has no self-serve
  // billing, or the retired "free" state. Leaving altogether is the Cancel
  // button above, not a card.
  const ladder = SELECTABLE_PLAN_IDS.slice().sort(
    (a, b) => (PLANS[a].priceMonthly ?? 0) - (PLANS[b].priceMonthly ?? 0),
  );

  // A downgrade they have already scheduled, which lives on a Stripe
  // subscription schedule rather than on the profile — nothing has changed yet,
  // and every column here should keep saying so until it does. Null whenever
  // there is no schedule, or if Stripe is unreachable.
  const pending = await pendingPlanChange(profile?.stripe_subscription_id);

  const renews = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  // Two distinct states, and the difference is the whole point of this block.
  //
  // ENDING: cancelled through the portal, which schedules rather than cancels —
  // Stripe keeps status = "active" and only sets cancel_at_period_end, so the
  // teacher keeps Pro until the period runs out. Testing the status alone (as
  // this once did) never matched, so the page claimed the plan would "renew"
  // and kept offering a Cancel button Stripe would reject.
  //
  // ENDED: the period elapsed and Stripe closed the subscription for good.
  // Nothing left to renew — resubscribing means a new checkout.
  const ended = profile?.subscription_status === "canceled";
  const ending = Boolean(profile?.cancel_at_period_end) && !ended;

  // The scheduled change's date, formatted like every other date on this page.
  const pendingAt = pending
    ? new Date(pending.at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    // max-w-3xl, not the max-w-xl this used to be. That 576px was sized for a
    // single summary card stacked over a couple of buttons; the plan ladder
    // below is three cards side by side, which left each one about 170px wide
    // and wrapped every feature line in two. The summary card keeps its own
    // narrower width so it does not stretch to fill this.
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
            style={{ backgroundColor: "var(--j-tint)", color: "var(--j-faint)" }}
          >
            {trialing
              ? "free trial"
              : hasActivePlan(plan)
                ? (profile?.subscription_status ?? "active")
                : "no plan"}
          </span>
        </div>

        {!hasActivePlan(plan) && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }}>
            Choose a plan below to start creating.
            {trialDaysFor(profile) > 0 && " Every plan starts with a free trial."}
          </p>
        )}

        {/* During a trial current_period_end IS the trial end, which is also
            when the first charge happens. */}
        {renews && hasActivePlan(plan) && (
          <p className="text-sm mb-5" style={{ color: "var(--j-body)" }}>
            {trialing && (ending || ended)
              ? `Your free trial ends on ${renews}. You won't be charged.`
              : trialing
                ? `Your free trial ends on ${renews}. Then £${PLANS[plan].priceMonthly?.toFixed(2)} a month.`
                : ending || ended
                  ? `Access ends on ${renews}.`
                  : `Renews on ${renews}.`}
          </p>
        )}

        {isSubscriber ? (
          <div className="flex flex-col gap-3">
            {/* Changing plan is no longer a button here — the cards below offer
                every move in both directions, with the current one marked. This
                row is left with what it was always for: managing the billing
                itself. */}
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
                  Once fully ended there is nothing to renew, and the plan cards
                  below are the way back. */}
              {hasSubscription && !ending && !ended && (
                <CancelSubscriptionButton from={plan} trialing={trialing} />
              )}
              {hasSubscription && ending && <ResumeButton />}
            </div>
          </div>
        ) : (
          /* No CTA here for a teacher with nothing to manage — the plan cards
             below the card do that job, showing every plan with its real price
             and allowance rather than sending them off to /pricing and back. */
          null
        )}

        {/* Two different messages, because the two states have different exits.
            While ENDING the subscription is still live and the Renew button
            above undoes it in place — telling them to visit /pricing would send
            them to buy a second subscription they don't need. Once ENDED, that
            really is the only route back. */}
        {ending && (
          <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
            Your plan is set to end. Renew to keep it — you won&apos;t be charged
            until {renews ?? "the next billing date"}.
          </p>
        )}

        {ended && (
          <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
            You can subscribe again any time from the plans below.
          </p>
        )}
      </div>

      {/* Every plan, for everybody — the current one marked, and each of the
          others carrying the action that gets there: checkout for a teacher
          with no subscription, a swap up or down for one who has. This used to
          render only for non-subscribers, which left a Max subscriber with no
          visible way to move at all. */}
      {ladder.length > 0 && (
        <PlanPicker
          plans={ladder}
          current={plan}
          hasSubscription={hasSubscription}
          trialEligible={trialDaysFor(profile) > 0}
          pendingPlan={pending?.plan ?? null}
          pendingAt={pendingAt}
          // While a subscription is ending, renewing comes first: swapping a
          // plan that is about to stop would charge for something disappearing.
          // Once it has ENDED (back to no plan) the cards are the way back in,
          // through a fresh checkout.
          locked={ending && hasActivePlan(plan)}
        />
      )}

      {/* An ambassador code, beside the plans it discounts. Hidden once the
          discount has actually been used — see codeSpent above. */}
      {!codeSpent && <AmbassadorCodeField claimedCode={referralCode} />}

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
