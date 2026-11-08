"use client";

// Days, hours, minutes and seconds left on the end-of-trial offer, as four
// boxes. Shared by the popup and the /pricing banner so the two never disagree.

import { useEffect } from "react";
import { useCountdown } from "@/app/lib/useCountdown";
import { countdownParts } from "@/app/lib/trial-offer";
import styles from "./TrialOffer.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

export default function OfferCountdown({
  endsAt,
  onExpire,
}: {
  endsAt: Date | string;
  /** Called once when the clock reaches zero. */
  onExpire?: () => void;
}) {
  const left = useCountdown(endsAt);
  useEffect(() => {
    if (left === 0) onExpire?.();
  }, [left, onExpire]);
  const parts = left === null ? null : countdownParts(left);

  const units: [string, number | undefined][] = [
    ["days", parts?.days],
    ["hours", parts?.hours],
    ["mins", parts?.minutes],
    ["secs", parts?.seconds],
  ];

  return (
    <div
      className={styles.countdown}
      data-testid="offer-countdown"
      // Read out once, not every second.
      role="timer"
      aria-live="off"
      aria-label={
        parts
          ? `${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes left`
          : "Time left"
      }
    >
      {units.map(([label, value]) => (
        <span
          key={label}
          className={`${styles.unit} ${value === undefined ? styles.unitPending : ""}`}
        >
          <span className={styles.unitValue}>{value === undefined ? "00" : pad(value)}</span>
          <span className={styles.unitLabel}>{label}</span>
        </span>
      ))}
    </div>
  );
}
