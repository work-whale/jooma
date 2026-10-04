"use client";

import { useState } from "react";
import { type PlanId, PLANS } from "@/app/lib/plans";
import PlanLosses from "./PlanLosses";

/*
 * "Cancel subscription", with what it costs shown before Stripe's own screen.
 *
 * This used to be "Switch to Free", on a Free card in the plan picker. There is
 * no free plan any more, so leaving is what it always really was: cancelling.
 *
 * WHY THIS ISN'T A NEW ROUTE
 * It hands off to the Stripe portal's subscription_cancel flow. Stripe schedules
 * rather than cancels, so the teacher keeps their plan to the end of the period
 * (or the end of the free trial) and the webhook writes the locked "no plan"
 * state when the subscription finally closes. ResumeButton already undoes it.
 *
 * What this adds on top is the losses panel, so the consequence is in front of
 * them before they arrive at Stripe's confirmation rather than after.
 */

export default function CancelSubscriptionButton({
  from,
  trialing = false,
}: {
  from: PlanId;
  /** Cancelling during the free trial means never being charged at all, which
   *  is worth saying in those words. */
  trialing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = PLANS[from];

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow: "subscription_cancel" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Could not open the billing portal.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer"
        style={{
          backgroundColor: "transparent",
          color: "var(--j-body)",
          border: "1px solid var(--j-line-2)",
        }}
      >
        Cancel subscription
      </button>
    );
  }

  return (
    <div
      className="rounded-xl p-4 border w-full"
      style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
    >
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--j-ink)" }}>
        Cancel your subscription?
      </p>

      <PlanLosses from={from} to="free" />

      <ul className="text-sm mb-4 space-y-1" style={{ color: "var(--j-body)" }}>
        {trialing ? (
          <>
            <li>You keep {current.name} until your free trial ends.</li>
            <li>You won&apos;t be charged anything.</li>
          </>
        ) : (
          <>
            <li>You keep {current.name} until your next renewal date.</li>
            <li>You won&apos;t be charged again.</li>
          </>
        )}
        <li>You can subscribe again any time.</li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
          disabled={loading}
          className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
        >
          Keep {current.name}
        </button>
        <button
          type="button"
          onClick={openPortal}
          disabled={loading}
          className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          style={{
            backgroundColor: "transparent",
            color: "var(--j-body)",
            border: "1px solid var(--j-line-2)",
          }}
        >
          {loading ? "Opening…" : "Continue to cancel"}
        </button>
      </div>

      {error && (
        <p className="text-sm mt-2" style={{ color: "#c2342b" }}>
          {error}
        </p>
      )}
    </div>
  );
}
