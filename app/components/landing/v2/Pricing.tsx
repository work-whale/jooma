"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PlanCard, {
  PlanCardGrid,
  type PlanCardAction,
} from "@/app/components/plans/PlanCard";
import BillingToggle from "@/app/components/plans/BillingToggle";
import { DEFAULT_INTERVAL, type BillingInterval } from "@/app/lib/plans";
import Reveal from "./Reveal";
import shared from "./landing.module.css";
import styles from "./Pricing.module.css";

/** One row of the pricing table, as the server hands it over.
 *
 *  Named PlanCard historically, which now collides with the shared card
 *  component this renders. The component owns the name; this is the data. */
export interface PricingPlan {
  id: "standard" | "pro" | "max" | "school";
  name: string;
  price: string;
  per: string;
  features: string[];
  cta: string;
  /** The purple, most-prominent card. */
  featured?: boolean;
  /** Starts a Stripe checkout for this plan instead of following a link. */
  checkout?: "standard" | "pro" | "max";
  /** The trial line under the button, e.g. "3 days free, then £4.99 a month". */
  trial?: string | null;
  href?: string;
  /** The card as shown with Yearly selected. Everything above is the monthly
   *  card. Absent fields fall back to it. */
  yearly?: {
    price: string;
    per: string;
    was?: string;
    saving?: string;
    note?: string;
    trial?: string | null;
  };
}


/**
 * The pricing table.
 *
 * The figures are passed in from the server, derived from PLANS, so they cannot
 * drift from what is actually charged and granted.
 *
 * There is no free plan: every paid card starts a checkout with the free
 * trial, and says so under its button.
 *
 * The card itself is shared with /welcome and the profile's subscription
 * section, so all three look the same and only have to be styled once.
 */
export default function Pricing({
  plans,
  savePercent,
}: {
  plans: PricingPlan[];
  /** The best yearly saving, for the toggle's "Save up to 25%". */
  savePercent: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setBillingInterval] = useState<BillingInterval>(DEFAULT_INTERVAL);

  async function startCheckout(plan: "standard" | "pro" | "max") {
    setPending(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });

      // Nobody can subscribe without an account, so send them to sign up and
      // bring them back here afterwards rather than failing silently.
      if (res.status === 401) {
        router.push(`/signup?plan=${plan}`);
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  function actionFor(plan: PricingPlan): PlanCardAction {
    if (plan.checkout) {
      const checkout = plan.checkout;
      return {
        kind: "button",
        label: pending === checkout ? "Starting..." : plan.cta,
        onClick: () => startCheckout(checkout),
        disabled: pending !== null,
      };
    }
    return { kind: "link", label: plan.cta, href: plan.href ?? "/signup" };
  }

  return (
    <section className={`${shared.sec} ${shared.secAlt}`} id="pricing">
      <div className={shared.shell}>
        <Reveal className={`${shared.secHead} ${shared.secHeadCentre}`}>
          <span className={shared.eyebrow}>Pricing</span>
          <h2>Try any plan free for three days. Keep it when it has saved you a Sunday.</h2>
        </Reveal>

        <Reveal>
          <BillingToggle value={interval} onChange={setBillingInterval} savePercent={savePercent} />
          <PlanCardGrid columns={plans.length}>
            {plans.map((plan) => {
              const shown = interval === "year" && plan.yearly ? plan.yearly : null;
              return (
                <PlanCard
                  key={plan.id}
                  // The Schools card is the anchor target for the Schools nav link.
                  id={plan.id === "school" ? "schools" : undefined}
                  name={plan.name}
                  price={shown?.price ?? plan.price}
                  per={shown?.per ?? plan.per}
                  was={shown?.was}
                  saving={shown?.saving}
                  note={shown?.note}
                  features={plan.features}
                  featured={plan.featured}
                  badge={plan.featured ? "Most popular" : undefined}
                  action={actionFor(plan)}
                  footer={(shown ? shown.trial : plan.trial) ?? undefined}
                />
              );
            })}
          </PlanCardGrid>
        </Reveal>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <p className={styles.note}>
          Prices include VAT. Your card is taken when you start, and nothing is charged until
          the trial ends. Cancel any time before then and you pay nothing.
        </p>
      </div>
    </section>
  );
}
