"use client";

// The countdown line in the sidebar's "Your plan" card: how long is left of the
// no-card trial, or of the 50% offer once it has ended. Ticks once a minute so
// it stays true on a tab left open all day.
//
// It replaced the strip that ran across the top of every screen: the plan card
// is where a teacher already looks for what they have and how long for.

import { useCountdown } from "@/app/lib/useCountdown";
import { shortCountdown } from "@/app/lib/trial-offer";
import type { PlanBadge } from "@/app/lib/plan-badge";
import styles from "./SideNavV2.module.css";

const DAY_MS = 86_400_000;

export default function PlanCountdown({
  countdown,
  note,
}: {
  countdown: NonNullable<PlanBadge["countdown"]>;
  /** The badge's own note, shown until the clock has mounted. */
  note: string | null;
}) {
  const left = useCountdown(countdown.endsAt, 30_000);

  if (countdown.kind === "offer") {
    return (
      <div className={styles.planClock} data-testid="sidebar-plan-countdown">
        <p className={styles.planOffer}>{note}</p>
        <p className={styles.planClockText}>
          Ends in <strong>{left === null ? "…" : shortCountdown(left)}</strong>
        </p>
      </div>
    );
  }

  // The trial: whole days while there are some, then hours, so the last
  // afternoon does not still read "1 day left".
  const text =
    left === null
      ? note
      : left >= DAY_MS
        ? `${Math.ceil(left / DAY_MS)} ${Math.ceil(left / DAY_MS) === 1 ? "day" : "days"} left of your free trial`
        : `${shortCountdown(left)} left of your free trial`;

  const total = countdown.startedAt
    ? countdown.endsAt.getTime() - countdown.startedAt.getTime()
    : 3 * DAY_MS;
  const usedPct =
    left === null ? 0 : Math.min(100, Math.max(0, ((total - left) / total) * 100));

  return (
    <div className={styles.planClock} data-testid="sidebar-plan-countdown">
      <p className={styles.planClockText}>{text}</p>
      <span
        className={styles.track}
        role="progressbar"
        aria-label="Free trial used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(usedPct)}
      >
        <span className={styles.trackFill} style={{ width: `${usedPct}%` }} />
      </span>
    </div>
  );
}
