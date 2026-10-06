"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { planYearlySavingAmount } from "@/app/lib/plan-copy";
import type { BillingInterval, PlanId } from "@/app/lib/plans";

/*
 * Switches a subscriber between monthly and yearly billing on the plan they
 * already have. The deciding and the charging happen in
 * /api/stripe/switch-interval; this asks it what would happen, says so, and
 * only then asks it to do it.
 *
 * Confirms first, like UpgradeButton, and for the same reason: monthly to
 * yearly charges a card straight away. The figure quoted is Stripe's own
 * preview of that charge, not an estimate, so what they read is what they pay.
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

export default function SwitchIntervalButton({
  plan,
  current,
}: {
  plan: PlanId;
  /** The interval they are billed at now. The button offers the other one. */
  current: BillingInterval;
}) {
  const router = useRouter();
  const to: BillingInterval = current === "month" ? "year" : "month";

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = planYearlySavingAmount(plan);

  async function openPanel() {
    setOpen(true);
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/stripe/switch-interval?interval=${to}`);
      const data = (await res.json()) as Preview & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not work out the change.");
        return;
      }
      setPreview(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setPreview(null);
    setError(null);
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/switch-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: to, prorationDate: preview?.prorationDate }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        close();
        router.refresh();
        return;
      }
      setError(data.error ?? "Could not change how you're billed.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    // Monthly to yearly is worth selling, so it gets a real button with the
    // saving on it. The way back is a quiet link: available, not promoted.
    return to === "year" ? (
      <button
        type="button"
        onClick={openPanel}
        className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer"
        style={{ backgroundColor: "#DDF0E2", color: "#1f6b3b" }}
      >
        {saving ? `Switch to yearly and save ${saving}` : "Switch to yearly billing"}
      </button>
    ) : (
      <button
        type="button"
        onClick={openPanel}
        className="text-sm font-semibold underline transition-opacity hover:opacity-70 cursor-pointer"
        style={{ color: "var(--j-faint)", background: "none", border: 0, padding: 0 }}
      >
        Switch to monthly billing
      </button>
    );
  }

  return (
    <div
      className="rounded-xl p-4 border w-full"
      style={{ backgroundColor: "var(--j-tint)", borderColor: "var(--j-line)" }}
    >
      <p className="text-sm font-semibold mb-2" style={{ color: "var(--j-ink)" }}>
        {to === "year" ? "Switch to yearly billing?" : "Switch to monthly billing?"}
      </p>

      {loading && !preview && (
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
              you&apos;ll pay {gbp(preview.recurringPence)} a {to === "year" ? "year" : "month"}.
            </li>
          )}
          {preview.kind === "at_renewal" && (
            <>
              <li>
                You keep yearly billing until {longDate(preview.startsAt)}, then pay{" "}
                {gbp(preview.recurringPence)} a month.
              </li>
              <li>You can change your mind any time before then.</li>
            </>
          )}
          {preview.losesDiscount && (
            <li>Your code&apos;s discount applies to monthly billing, so it won&apos;t apply to yearly.</li>
          )}
          <li>Your credits still reset on the 1st of every month.</li>
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={loading || !preview}
          className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
        >
          {loading && preview
            ? "Switching…"
            : preview?.kind === "now"
              ? `Pay ${gbp(preview.amountDuePence)} and switch`
              : "Confirm and switch"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={loading && !!preview}
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
