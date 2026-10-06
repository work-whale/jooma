"use client";

import { useState } from "react";
import { planYearlySavingAmount } from "@/app/lib/plan-copy";
import type { BillingInterval, PlanId } from "@/app/lib/plans";
import BillingChangePanel from "./BillingChangePanel";

/*
 * The Overview card's monthly/yearly switch, on the plan they already have.
 *
 * Only the button lives here. The confirmation, with Stripe's own preview of
 * any charge, is BillingChangePanel, shared with the plan cards below, which
 * offer the same switch (and a plan change with it) when their toggle shows the
 * other interval.
 */
export default function SwitchIntervalButton({
  plan,
  current,
}: {
  plan: PlanId;
  /** The interval they are billed at now. The button offers the other one. */
  current: BillingInterval;
}) {
  const to: BillingInterval = current === "month" ? "year" : "month";
  const [open, setOpen] = useState(false);
  const saving = planYearlySavingAmount(plan);

  if (open) {
    return (
      <BillingChangePanel fromPlan={plan} toPlan={plan} to={to} onClose={() => setOpen(false)} />
    );
  }

  // Monthly to yearly is worth selling, so it gets a real button with the
  // saving on it. The way back is a quiet link: available, not promoted.
  return to === "year" ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer"
      style={{ backgroundColor: "#DDF0E2", color: "#1f6b3b" }}
    >
      {saving ? `Switch to yearly and save ${saving}` : "Switch to yearly billing"}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-sm font-semibold underline transition-opacity hover:opacity-70 cursor-pointer"
      style={{ color: "var(--j-faint)", background: "none", border: 0, padding: 0 }}
    >
      Switch to monthly billing
    </button>
  );
}
