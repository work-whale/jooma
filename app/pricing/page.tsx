"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PLANS } from "@/app/lib/plans";

const MONTHLY_PRO = PLANS.pro.priceMonthly ?? 149;
const YEARLY_PRO = PLANS.pro.priceYearlyPerMonth ?? 119;

const FREE_FEATURES = [
  "5 AI generations per month",
  "Basic lesson format",
  "Limited curriculum alignment",
  "Watermarked export",
];

const PRO_FEATURES = [
  "Unlimited AI generations",
  "Full curriculum alignment",
  "Limited curriculum alignment",
  "Editable outputs",
  "PDF & DOC export",
  "Save library",
  "Priority support",
];

const SCHOOL_FEATURES = [
  "Multi-user accounts",
  "Shared resource library",
  "Admin dashboard",
  "Usage analytics",
  "School branding",
  "Central billing",
];

export default function PricingPage() {
  const router = useRouter();
  const [yearly, setYearly] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proPrice = yearly ? YEARLY_PRO : MONTHLY_PRO;

  async function handleUpgrade() {
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: yearly ? "yearly" : "monthly" }),
      });
      if (res.status === 401) {
        router.push("/login?next=/pricing");
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url; // hand off to Stripe Checkout
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-8 px-4" style={{ backgroundColor: "#F1EFE3" }}>
      <div className="max-w-5xl mx-auto w-full">

        {/* Brand wordmark */}
        <p className="text-center text-xl font-semibold mb-4" style={{ color: "#a8a39a" }}>
          Jooma
        </p>

        {/* Heading */}
        <div className="text-center mb-5">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: "#1a1a1a" }}>
            Simple pricing for smarter<br />lesson planning
          </h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: "#8a8078" }}>
            Choose a plan that saves you time, reduces workload, and helps you
            create better lessons in seconds.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center mb-6">
          <div
            className="flex items-center gap-1 p-1 rounded-full"
            style={{ backgroundColor: "#E8E5D8" }}
          >
            <button
              onClick={() => setYearly(false)}
              className="px-5 py-1.5 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: !yearly ? "#1a1a1a" : "transparent",
                color: !yearly ? "#fff" : "#6b6055",
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className="px-5 py-1.5 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: yearly ? "#1a1a1a" : "transparent",
                color: yearly ? "#fff" : "#6b6055",
              }}
            >
              Yearly -20%
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Free */}
          <PlanCard
            badge="Free Plan"
            badgeBg="#EEECE4"
            badgeInk="#8a8078"
            price="£0"
            priceSuffix="/month"
            cardBg="#FAF9F5"
            cardBorder="#DAD8D0"
            cta="Start for Free"
            ctaHref="/signup"
            ctaBg="#1a1a1a"
            ctaInk="#fff"
            features={FREE_FEATURES}
            featureInk="#3a2f28"
            includesInk="#1a1a1a"
            bulletInk="#3a2f28"
          />

          {/* Pro Teacher */}
          <PlanCard
            badge="Pro Teacher"
            badgeBg="#FAD4C8"
            badgeInk="#c25034"
            price={`£${proPrice}`}
            priceSuffix="/month"
            cardBg="#FDE8E1"
            cardBorder="#F7D3C7"
            cta={upgrading ? "Starting checkout…" : "Unlock Unlimited"}
            onCtaClick={handleUpgrade}
            ctaDisabled={upgrading}
            ctaBg="#E0463F"
            ctaInk="#fff"
            features={PRO_FEATURES}
            featureInk="#3a1a10"
            includesInk="#1a1a1a"
            bulletInk="#3a1a10"
          />

          {/* School */}
          <PlanCard
            badge="School Plan"
            badgeBg="#D2D9F7"
            badgeInk="#3a50b8"
            price="Custom pricing"
            cardBg="#E5E9FB"
            cardBorder="#C8D0F5"
            cta="Contact Sales"
            ctaHref="mailto:sales@jooma.ai"
            ctaBg="#3B6FF5"
            ctaInk="#fff"
            features={SCHOOL_FEATURES}
            featureInk="#1a2050"
            includesInk="#1a1a1a"
            bulletInk="#1a2050"
          />

        </div>

        {/* Checkout error */}
        {error && (
          <p className="text-center text-sm mt-4" style={{ color: "#c2342b" }}>{error}</p>
        )}

        {/* Back */}
        <div className="flex justify-center mt-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-70"
            style={{ color: "#1a1a1a" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>

      </div>
    </div>
  );
}

function PlanCard({
  badge, badgeBg, badgeInk,
  price, priceSuffix,
  cardBg, cardBorder,
  cta, ctaHref, onCtaClick, ctaDisabled, ctaBg, ctaInk,
  features, featureInk, includesInk, bulletInk,
}: {
  badge: string; badgeBg: string; badgeInk: string;
  price: string; priceSuffix?: string;
  cardBg: string; cardBorder: string;
  cta: string; ctaHref?: string; onCtaClick?: () => void; ctaDisabled?: boolean;
  ctaBg: string; ctaInk: string;
  features: string[]; featureInk: string; includesInk: string; bulletInk: string;
}) {
  const isMailto = ctaHref?.startsWith("mailto:") ?? false;
  const ctaClass = "block w-full text-center py-2.5 rounded-xl text-sm font-semibold mb-5 transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed";
  const ctaStyle = { backgroundColor: ctaBg, color: ctaInk };

  return (
    <div
      className="rounded-2xl p-6 flex flex-col border"
      style={{ backgroundColor: cardBg, borderColor: cardBorder }}
    >
      {/* Badge */}
      <div className="flex justify-center mb-4">
        <span
          className="inline-block text-xs font-semibold px-3 py-1 rounded-full"
          style={{ backgroundColor: badgeBg, color: badgeInk }}
        >
          {badge}
        </span>
      </div>

      {/* Price */}
      <div className="text-center mb-4">
        <span className="text-3xl font-bold tracking-tight" style={{ color: "#1a1a1a" }}>
          {price}
        </span>
        {priceSuffix && (
          <span className="text-base font-medium" style={{ color: "#1a1a1a" }}>{priceSuffix}</span>
        )}
      </div>

      <div className="h-px mb-4" style={{ backgroundColor: cardBorder }} />

      {/* CTA */}
      {onCtaClick ? (
        <button type="button" onClick={onCtaClick} disabled={ctaDisabled} className={ctaClass} style={ctaStyle}>{cta}</button>
      ) : isMailto ? (
        <a href={ctaHref} className={ctaClass} style={ctaStyle}>{cta}</a>
      ) : (
        <Link href={ctaHref!} className={ctaClass} style={ctaStyle}>{cta}</Link>
      )}

      {/* Includes */}
      <div className="rounded-xl flex-1">
        <p className="text-sm font-semibold mb-3" style={{ color: includesInk }}>Includes:</p>
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm" style={{ color: featureInk }}>
              <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: bulletInk }} />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
