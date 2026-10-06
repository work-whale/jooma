"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { planCardName } from "@/app/lib/plan-copy";
import { PLANS, planCredits, type BillingInterval, type PlanId } from "@/app/lib/plans";
import PlanLosses from "./PlanLosses";

/*
 * The confirmation for a change of billing interval, with or without a change
 * of plan: Standard monthly to Standard yearly, or Standard monthly to Pro
 * yearly. The deciding and the charging happen in /api/stripe/switch-interval;
 * this asks it what would happen, says so, and only then asks it to do it.
 *
 * Opened by the Overview card's switch button and by the profile's plan cards
 * when they show the other interval. Mount it with a key per target, so a new
 * target fetches a fresh preview.
 *
 * Confirms first, like UpgradeButton, and for the same reason: a move to yearly
 * charges a card straight away. The figure quoted is Stripe's own preview of
 * that charge, not an estimate, so what they read is what they pay.
 */

interface Preview {
  kind: "now" | "trial" | "at_renewal";
  amountDuePence: number;
  recurringPence: number;
  startsAt: string | null;
  trialEndsAt?: string | null;
  losesDiscount: boolean;
  prorationDate?: number;
}

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return "your next renewal";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** A year on from an ISO date, for "then £71.99 every year from …". */
function yearAfter(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

export default function BillingChangePanel({
  fromPlan,
  toPlan,
  to,
  onClose,
}: {
  /** The plan they are on. */
  fromPlan: PlanId;
  /** The plan they would end up on. The same plan for a billing-only switch. */
  toPlan: PlanId;
  /** The interval they would be billed at. Always the other one. */
  to: BillingInterval;
  onClose: () => void;
}) {
  const router = useRouter();
  const samePlan = fromPlan === toPlan;
  const cheaper = (PLANS[toPlan].priceMonthly ?? 0) < (PLANS[fromPlan].priceMonthly ?? 0);
  const dearer = (PLANS[toPlan].priceMonthly ?? 0) > (PLANS[fromPlan].priceMonthly ?? 0);
  const period = to === "year" ? "year" : "month";
  const billed = to === "year" ? "yearly" : "monthly";

  const [preview, setPreview] = useState<Preview | null>(null);
  // Starts true: the preview is fetched as soon as the panel opens.
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams({ interval: to, ...(samePlan ? {} : { plan: toPlan }) });
  const previewUrl = `/api/stripe/switch-interval?${query.toString()}`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(previewUrl);
        const data = (await res.json()) as Preview & { error?: string };
        if (!live) return;
        if (res.ok) setPreview(data);
        else setError(data.error ?? "Could not work out the change.");
      } catch {
        if (live) setError("Network error. Please try again.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [previewUrl]);

  async function confirm() {
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/switch-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval: to,
          ...(samePlan ? {} : { plan: toPlan }),
          prorationDate: preview?.prorationDate,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        onClose();
        router.refresh();
        return;
      }
      setError(data.error ?? "Could not change how you're billed.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSwitching(false);
    }
  }

  const credits = planCredits(toPlan);

  return (
    <div
      className="rounded-xl p-4 border w-full"
      style={{ backgroundColor: "var(--j-tint)", borderColor: "var(--j-line)" }}
    >
      <p className="text-sm font-semibold mb-2" style={{ color: "var(--j-ink)" }}>
        {samePlan
          ? `Switch to ${billed} billing?`
          : `Switch to ${planCardName(toPlan)}, billed ${billed}?`}
      </p>

      {/* The honest half first, as on every move down. */}
      {cheaper && <PlanLosses from={fromPlan} to={toPlan} />}

      {loading && (
        <p className="text-sm mb-4" style={{ color: "var(--j-body)" }}>
          Working out the cost…
        </p>
      )}

      {preview && (
        <ul className="text-sm mb-4 space-y-1" style={{ color: "var(--j-body)" }}>
          {preview.kind === "now" && (
            <>
              <li>
                You&apos;ll pay {gbp(preview.amountDuePence)} today, then{" "}
                {gbp(preview.recurringPence)} every year from{" "}
                {longDate(yearAfter(preview.startsAt))}.
              </li>
              <li>Today&apos;s charge is reduced by the unused part of this month.</li>
            </>
          )}
          {preview.kind === "trial" && (
            <li>
              Nothing to pay now. When your trial ends on {longDate(preview.trialEndsAt)},
              you&apos;ll pay {gbp(preview.recurringPence)} a {period}.
            </li>
          )}
          {preview.kind === "at_renewal" && (
            <>
              <li>
                {samePlan
                  ? `You keep ${to === "month" ? "yearly" : "monthly"} billing until ${longDate(preview.startsAt)}, then pay ${gbp(preview.recurringPence)} a ${period}.`
                  : `You keep ${planCardName(fromPlan)} until ${longDate(preview.startsAt)}, then move to ${planCardName(toPlan)} at ${gbp(preview.recurringPence)} a ${period}.`}
              </li>
              <li>You can change your mind any time before then.</li>
            </>
          )}
          {dearer && preview.kind !== "at_renewal" && credits !== null && (
            <li>Your monthly credits go up to {credits.toLocaleString("en-GB")} straight away.</li>
          )}
          {preview.losesDiscount && (
            <li>
              Your code&apos;s discount applies to monthly billing, so it won&apos;t apply to
              yearly.
            </li>
          )}
          <li>Your credits still reset on the 1st of every month.</li>
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={loading || switching || !preview}
          className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
        >
          {switching
            ? "Switching…"
            : preview?.kind === "now"
              ? `Pay ${gbp(preview.amountDuePence)} and switch`
              : "Confirm and switch"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={switching}
          className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
          style={{
            backgroundColor: "transparent",
            color: "var(--j-ink)",
            border: "1px solid var(--j-line)",
          }}
        >
          Not now
        </button>
      </div>

      {error && (
        <p className="text-sm mt-2" role="alert" style={{ color: "#c2342b" }}>
          {error}
        </p>
      )}
    </div>
  );
}
