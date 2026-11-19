"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SIGNED_OUT_CHOICE } from "@/app/lib/pricing-view";

/*
 * After a signed-out "Choose X" on the pricing page and signup (spec Step 4,
 * rule 4): "Your 10 free days of Pro are already on. Want to pay for Pro now
 * instead?" Pay opens Checkout for Pro monthly; the other button goes to Today.
 */
export default function ChosenPlanScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval: "month" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? "Could not start checkout.");
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  };

  return (
    <div
      className="rounded-2xl px-6 py-6 mb-6 border"
      style={{ backgroundColor: "var(--j-res-soft)", borderColor: "transparent" }}
      data-testid="chosen-plan-screen"
    >
      <h2 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--j-ink)" }}>
        {SIGNED_OUT_CHOICE.title}
      </h2>
      <p className="text-sm mt-1.5" style={{ color: "var(--j-body)" }}>
        {SIGNED_OUT_CHOICE.body}
      </p>
      <div className="flex flex-wrap gap-3 mt-4">
        <button
          type="button"
          onClick={() => void pay()}
          disabled={busy}
          className="rounded-full px-6 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--j-res)" }}
        >
          {busy ? "Starting checkout…" : SIGNED_OUT_CHOICE.pay}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="rounded-full px-6 py-2.5 text-sm font-bold border"
          style={{ color: "var(--j-ink)", borderColor: "var(--j-line-2)", backgroundColor: "var(--j-card)" }}
        >
          {SIGNED_OUT_CHOICE.later}
        </button>
      </div>
      {error && (
        <p className="text-sm mt-3" role="alert" style={{ color: "var(--j-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
