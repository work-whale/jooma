import { redirect } from "next/navigation";
import AppShellSettings from "@/app/components/v2/AppShellSettings";
import { createClient } from "@/app/lib/auth/server";
import { hasActivePlan, PLANS } from "@/app/lib/plans";
import { planLosses } from "@/app/lib/plan-copy";
import {
  activeOfferLine,
  asCancelReason,
  cancelTimeline,
  heldOfferUntil,
  lossInventory,
  offerFor,
  offerLine,
  offerMoney,
  resolveStep,
} from "@/app/lib/cancel-flow";
import {
  formatDate,
  loadAccountSummary,
  loadCancelContext,
} from "@/app/lib/cancel-flow-server";
import { retentionOf } from "@/app/lib/stripe";
import CancelFlow from "./CancelFlow";

// Cancel your plan: the reason, an offer that fits it, what you lose, confirm.
//
// Replaces the hand-off to the Stripe portal's subscription_cancel flow. The
// rules it keeps are in docs/JOOMA VERSION 3/12 jooma cancel flow notes.md:
// a way forward to cancelling on every screen after the reason, no more than
// four screens, every offer applied automatically, and nothing on screen that
// the account does not actually do.
//
// Everything is read here, once per arrival, and handed to the client, which
// moves between screens with the native history API (no server round trip per
// step, and the back button still goes back a screen). Anything that changes
// the subscription refreshes this page, so what it shows is Stripe's answer.
export const dynamic = "force-dynamic";

export default async function CancelPage({
  searchParams,
}: {
  // A Promise in this version of Next. See
  // node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md
  searchParams: Promise<{ step?: string; reason?: string; kept?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile/cancel");

  const ctx = await loadCancelContext(supabase, user.id);

  // Nothing to cancel: no subscription, one that has ended, or a plan that is
  // not a Stripe subscription (an ambassador's free Pro, a comp). Billing is
  // where they can see why.
  if (!ctx.sub || ctx.ended || !hasActivePlan(ctx.plan)) {
    redirect("/profile?section=subscription");
  }

  const reason = asCancelReason(params.reason);
  const step = resolveStep(params.step, reason, ctx.ending);

  const [summary] = await Promise.all([loadAccountSummary(supabase, ctx)]);
  const renews = formatDate(ctx.periodEnd);
  const decision = offerFor(ctx.offerInput);
  const money = decision.ok ? offerMoney(ctx.plan, decision.interval) : null;
  const active = retentionOf(ctx.sub);

  const pendingChange = ctx.offerInput.hasPendingSchedule;
  const canChange = !ctx.ending && !pendingChange;

  return (
    <>
      <AppShellSettings title="Cancel your plan" contentClassName="px-4 sm:px-6 lg:px-10 pb-16" />
      <CancelFlow
        initialStep={step}
        initialReason={reason}
        plan={ctx.plan}
        planName={PLANS[ctx.plan].name}
        interval={ctx.interval}
        trialing={ctx.trialing}
        ending={ctx.ending}
        renews={renews}
        offer={
          decision.ok && money
            ? {
                interval: decision.interval,
                title: decision.interval === "year" ? "12.5% off your next renewal" : "Half price for 3 months",
                line: offerLine(ctx.plan, decision.interval, renews),
                savedPence: money.savedPence,
                heldUntil:
                  ctx.ending && ctx.offerInput.cancelledAt
                    ? formatDate(heldOfferUntil(ctx.offerInput.cancelledAt))
                    : null,
              }
            : null
        }
        activeOffer={
          active
            ? {
                line: activeOfferLine(ctx.interval),
                endsAt: active.endsAt ? formatDate(new Date(active.endsAt)) : null,
              }
            : null
        }
        // Down to Standard keeps the interval and waits for renewal, through
        // the existing route. Offered from Pro and Max only.
        canDowngrade={canChange && (ctx.plan === "pro" || ctx.plan === "max")}
        // Monthly to yearly, through the existing switch and its preview.
        canSwitchAnnual={canChange && ctx.interval === "month"}
        tiles={lossInventory(summary)}
        losses={planLosses(ctx.plan, "free")}
        timeline={cancelTimeline(summary)}
        kept={params.kept ?? null}
      />
    </>
  );
}
