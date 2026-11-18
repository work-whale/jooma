"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckSquare, ImageSquare, Info, LockSimple } from "@phosphor-icons/react/dist/ssr";
import BillingToggle from "@/app/components/plans/BillingToggle";
import { createClient } from "@/app/lib/auth/client";
import {
  PRICING_HEADER_CTA,
  PRICING_HEADLINE,
  PRICING_NOTE,
  PRICING_SUBHEAD,
  SCHOOLS_ROW,
  maxYearlySaving,
  pricingCards,
  type Interval,
  type PricingCard,
} from "@/app/lib/pricing-view";
import Reveal from "./Reveal";
import shared from "./landing.module.css";
import styles from "./Pricing.module.css";

/*
 * The pricing page (Jooma 4.5 spec Step 4, built to screenshot 2 with the
 * owner's red notes). Every figure comes from plan-config through
 * pricing-view, so this cannot advertise what the plans do not give.
 *
 *   Free     "Start free": signup, which starts the ten days of Pro.
 *   Paid     "Choose X": signed in, the plan picker on that plan. Signed out,
 *            signup first, then /pricing?chosen=X, which says the ten free
 *            days are already on and offers to pay for Pro now instead.
 *
 * Pro is the dark "Recommended" card and comes first on a phone.
 */

export default function Pricing() {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>("month");
  const [pending, setPending] = useState<string | null>(null);
  const cards = pricingCards(interval);

  async function choose(card: PricingCard) {
    setPending(card.id);
    try {
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (card.id === "free") {
        router.push(session ? "/dashboard" : "/signup");
        return;
      }
      router.push(
        session
          ? `/pricing?plan=${card.id}&interval=${interval}`
          : `/signup?next=${encodeURIComponent(`/pricing?chosen=${card.id}`)}`,
      );
    } catch {
      setPending(null);
      router.push("/signup");
    }
  }

  return (
    <section className={`${shared.sec} ${shared.secAlt}`} id="pricing">
      <div className={shared.shell}>
        <Reveal className={`${shared.secHead} ${shared.secHeadCentre}`}>
          <span className={shared.eyebrow}>Pricing</span>
          <h2>{PRICING_HEADLINE}</h2>
          <p className={styles.sub}>{PRICING_SUBHEAD}</p>
          <Link href="/signup" className={styles.headerCta} data-testid="pricing-header-cta">
            {PRICING_HEADER_CTA}
          </Link>
        </Reveal>

        <Reveal>
          <BillingToggle value={interval} onChange={setInterval} savePercent={maxYearlySaving()} />

          <div className={styles.cards}>
            {cards.map((card) => (
              <article
                key={card.id}
                className={`${styles.card} ${card.highlight ? styles.cardPro : ""} ${
                  card.id === "free" ? styles.cardFree : ""
                }`}
                data-plan={card.id}
                data-testid={`pricing-${card.id}`}
              >
                {card.badge && <span className={styles.badge}>{card.badge}</span>}
                <h3 className={styles.name}>{card.name}</h3>
                <p className={styles.tagline}>{card.tagline}</p>
                <p className={styles.price}>
                  <span key={card.price}>{card.price}</span> <small>{card.per}</small>
                </p>
                <p className={styles.note}>{card.note}</p>
                <button
                  type="button"
                  className={`${styles.cta} ${card.id === "free" ? styles.ctaGhost : ""} ${
                    card.highlight ? styles.ctaWhite : ""
                  }`}
                  onClick={() => void choose(card)}
                  disabled={pending !== null}
                >
                  {card.cta}
                </button>
                <ul className={styles.features}>
                  {card.features.map((f) => (
                    <li key={f.text} className={f.kind === "off" ? styles.off : undefined}>
                      {f.kind === "off" ? (
                        <LockSimple weight="fill" className={styles.iconOff} aria-hidden />
                      ) : f.kind === "pic" ? (
                        <ImageSquare weight="fill" className={styles.iconPic} aria-hidden />
                      ) : (
                        <CheckSquare weight="fill" className={styles.iconOn} aria-hidden />
                      )}
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className={styles.school} id="schools">
            <div className={styles.schoolHead}>
              <h3>{SCHOOLS_ROW.name}</h3>
              <p>{SCHOOLS_ROW.per}</p>
            </div>
            <ul className={styles.schoolFeatures}>
              {SCHOOLS_ROW.features.map((f) => (
                <li key={f}>
                  <CheckSquare weight="fill" className={styles.iconOn} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/contact?type=school" className={styles.schoolAction}>
              {SCHOOLS_ROW.cta}
            </Link>
          </div>

          <p className={styles.vat}>
            <Info weight="fill" className={styles.vatIcon} aria-hidden />
            <span>
              <b>{PRICING_NOTE.lead}</b> {PRICING_NOTE.body}
            </span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
