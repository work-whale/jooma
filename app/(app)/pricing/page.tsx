import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown } from "@phosphor-icons/react/dist/ssr";
import AppShellSettings from "@/app/components/v2/AppShellSettings";
import { createClient } from "@/app/lib/auth/server";
import { hasActivePlan } from "@/app/lib/plans";
import { loadPlanState } from "@/app/account/billing/loadPlanState";
import PlanPicker from "@/app/account/billing/PlanPicker";
import AmbassadorCodeField from "@/app/account/billing/AmbassadorCodeField";

// Plans: every plan a teacher can be on, and the way to each one.
//
// This was retired to a redirect into /profile in September, when nothing
// linked here. It is back as the one place plans are chosen and changed: the
// sidebar's plan button, the upgrade prompts and Profile's "Change plan" all
// land here. Profile keeps what is about BILLING (card, invoices, cancel,
// renew, monthly or yearly, usage).
//
// Still Stripe's cancel_url (app/api/stripe/checkout/route.ts), so
// ?checkout=cancelled is answered here, where they can simply pick again.
//
// The data comes from loadPlanState, shared with Profile's Overview tab, so the
// two pages always agree about subscriptions, schedules and intervals.
export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: {
  // A Promise in this version of Next. See
  // node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out, the landing page's pricing section is the honest destination,
  // the same one every other "Pricing" link on the site uses.
  if (!user) redirect("/#pricing");

  // Old links and bookmarks from when this page forwarded to Profile carried a
  // billing tab (?tab=history, ?tab=usage). Those belong to Profile still, so
  // they keep going there, every other param riding along.
  if (params.tab !== undefined) {
    const forwarded = new URLSearchParams();
    forwarded.set("section", "subscription");
    for (const [key, value] of Object.entries(params)) {
      if (key === "section" || value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => forwarded.append(key, v));
      else forwarded.set(key, value);
    }
    redirect(`/profile?${forwarded.toString()}`);
  }

  const state = await loadPlanState(supabase, user.id);
  const {
    plan,
    hasSubscription,
    trialEligible,
    pending,
    pendingSwitch,
    pendingAt,
    ending,
    interval,
    referralCode,
    codeSpent,
    codeDiscount,
    ambassador,
    ambassadorPro,
    ambassadorUntil,
  } = state;

  return (
    <>
      <AppShellSettings title="Plans" contentClassName="px-4 sm:px-6 lg:px-10 pb-16" />

      <div className="max-w-3xl">
        <p className="text-sm mb-5" style={{ color: "var(--j-body)" }}>
          Every plan, with what it includes. Your card, invoices and usage are in{" "}
          <Link
            href="/profile?section=subscription"
            className="font-semibold underline transition-opacity hover:opacity-70"
            style={{ color: "var(--j-purple)" }}
          >
            Usage and billing
          </Link>
          .
        </p>

        {/* Where Stripe sends someone who backs out of paying. Nothing was
            charged, and the cards below are right here to try again. */}
        {params.checkout === "cancelled" && (
          <div
            role="status"
            className="rounded-xl px-4 py-3 mb-5 text-sm font-medium"
            style={{ backgroundColor: "var(--j-tint)", color: "var(--j-deep)" }}
          >
            Checkout cancelled. Nothing was charged, and you can pick a plan whenever
            you&apos;re ready.
          </div>
        )}

        {/* An ambassador on their free year. Choosing a plan now does not cut
            it short: checkout starts billing on the day it ends. */}
        {ambassadorPro && ambassadorUntil && (
          <div
            className="rounded-2xl px-5 py-4 mb-5 flex gap-3 items-start border"
            style={{
              backgroundColor: "var(--j-gold-bg)",
              borderColor: "color-mix(in srgb, var(--j-gold) 30%, transparent)",
            }}
            data-testid="ambassador-plan-banner"
          >
            <Crown
              weight="fill"
              className="w-5 h-5 shrink-0 mt-0.5"
              style={{ color: "var(--j-gold)" }}
            />
            <div className="text-sm" style={{ color: "var(--j-body)" }}>
              <p className="font-bold" style={{ color: "var(--j-ink)" }}>
                Pro is on us until {ambassadorUntil}.
              </p>
              <p className="mt-1">
                Thank you for representing Jooma. If you choose a plan to carry on
                after that, your card is only charged from {ambassadorUntil}.
              </p>
            </div>
          </div>
        )}

        {state.ladder.length > 0 && (
          <PlanPicker
            // Keyed on the code: applying one refreshes this page, and a new
            // key remounts the picker so it opens on Monthly, where the code
            // shows as money off the first payment.
            key={referralCode ?? "no-code"}
            plans={state.ladder}
            // An ambassador's free Pro is a comp, not something they bought,
            // so every card stays buyable, Pro included: that is how they keep
            // Pro after the free year, billed from the day it ends.
            current={ambassadorPro ? "free" : plan}
            hasSubscription={hasSubscription}
            trialEligible={trialEligible}
            pendingPlan={pendingSwitch ? null : (pending?.plan ?? null)}
            pendingInterval={pending?.interval ?? null}
            pendingAt={pendingAt}
            // While a subscription is ending, renewing comes first (in Profile):
            // swapping a plan that is about to stop would charge for something
            // disappearing. A billing switch waiting is the same: a plan move
            // now would release its schedule and drop the switch.
            locked={(ending && hasActivePlan(plan)) || Boolean(pendingSwitch)}
            subscriptionInterval={interval}
            hasUnusedCode={Boolean(referralCode) && !codeSpent}
            codeDiscount={codeDiscount}
          />
        )}

        {/* A referral code, beside the plans it discounts. Hidden once the
            discount has been used, and for ambassadors, who hand codes out
            rather than claim them. */}
        {!codeSpent && !ambassador && <AmbassadorCodeField claimedCode={referralCode} />}
      </div>
    </>
  );
}
