"use client";

import { useId } from "react";
import type { BillingInterval } from "@/app/lib/plans";
import styles from "./PlanCard.module.css";

/*
 * Monthly or yearly, above a grid of plan cards. Shared by the landing page,
 * /welcome and the profile, for a teacher choosing their first plan.
 *
 * Controlled: the caller owns the interval, because the same value also picks
 * the card prices and goes to checkout. Yearly comes first, and the callers
 * open on it (DEFAULT_INTERVAL), since it is the better deal.
 */
export default function BillingToggle({
  value,
  onChange,
  /** The best saving on offer, e.g. 25, for "Save up to 25%". 0 hides it. */
  savePercent,
}: {
  value: BillingInterval;
  onChange: (next: BillingInterval) => void;
  savePercent: number;
}) {
  // Unique per instance, so two toggles on one page never share a radio group.
  const name = useId();

  const options: { id: BillingInterval; label: string }[] = [
    { id: "year", label: "Yearly" },
    { id: "month", label: "Monthly" },
  ];

  return (
    <fieldset className={styles.toggle}>
      <legend className={styles.srOnly}>Billing period</legend>
      <div className={styles.toggleTrack}>
        {options.map((option) => (
          <label key={option.id}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className={styles.toggleInput}
            />
            <span className={styles.toggleOption}>
              {option.label}
              {option.id === "year" && savePercent > 0 && (
                <span className={styles.toggleSave}>Save up to {savePercent}%</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
