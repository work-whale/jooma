"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PlanCard, {
  PlanCardGrid,
  type PlanCardAction,
} from "@/app/components/plans/PlanCard";
import BillingToggle from "@/app/components/plans/BillingToggle";
import { DEFAULT_INTERVAL, type BillingInterval } from "@/app/lib/plans";
import { createClient } from "@/app/lib/auth/client";
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
    /** The button with Yearly selected. */
    cta?: string;
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

  /**
   * The trial needs no plan choice and no card, so a visitor just signs up. A
   * teacher who is already signed in goes to /pricing instead of straight to
   * Stripe: paying charges today, which a button saying "free trial" must not
   * spring on them, and that page says so on every card.
   */
  async function start(plan: "standard" | "pro" | "max") {
    setPending(plan);
    setError(null);
    try {
      const {
        data: { session },
      } = await createClient().auth.getSession();
      router.push(session ? "/pricing" : "/signup");
    } catch {
      setError("Network error. Please try again.");
      setPending(null);
    }
  }

  function actionFor(plan: PricingPlan): PlanCardAction {
    if (plan.checkout) {
      const checkout = plan.checkout;
      const cta = (interval === "year" && plan.yearly?.cta) || plan.cta;
      return {
        kind: "button",
        label: pending === checkout ? "Starting..." : cta,
        onClick: () => start(checkout),
        disabled: pending !== null,
        tone: "trial",
      };
    }
    return { kind: "link", label: plan.cta, href: plan.href ?? "/signup" };
  }

  // Three paid cards in a row, and Schools as a full width band beneath them.
  const paid = plans.filter((plan) => plan.id !== "school");
  const school = plans.find((plan) => plan.id === "school");

  return (
    <section className={`${shared.sec} ${shared.secAlt}`} id="pricing">
      <div className={shared.shell}>
        <Reveal className={`${shared.secHead} ${shared.secHeadCentre}`}>
          <span className={shared.eyebrow}>Pricing</span>
          <h2>Try any plan free for three days. Keep it when it has saved you a Sunday.</h2>
        </Reveal>

        <Reveal>
          <BillingToggle value={interval} onChange={setBillingInterval} savePercent={savePercent} />
          <PlanCardGrid columns={paid.length}>
            {paid.map((plan) => {
              const shown = interval === "year" && plan.yearly ? plan.yearly : null;
              return (
                <PlanCard
                  key={plan.id}
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

          {school && (
            // The anchor target for the Schools nav link.
            <div className={styles.school} id="schools">
              <div className={styles.schoolHead}>
                <h3>{school.name}</h3>
                <p>{school.per}, invoiced yearly</p>
              </div>
              <ul className={styles.schoolFeatures}>
                {school.features.map((feature) => (
                  <li key={feature}>
                    <span aria-hidden="true">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href={school.href ?? "/contact?type=school"} className={styles.schoolAction}>
                {school.cta}
              </Link>
            </div>
          )}
        </Reveal>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <p className={styles.note}>
          Prices include VAT. Your free trial needs no card, and nothing is charged unless you
          choose to subscribe. If you do not, your account stays open with three free tools.
        </p>
      </div>
    </section>
  );
}
