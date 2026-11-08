"use client";

// Phones only: the trial or offer countdown as a chip in the top bar.
//
// On a desktop it lives in the sidebar's plan card (PlanCountdown), but below
// 900px the sidebar is a drawer nobody sees until they open it, so the clock
// that matters would be hidden. CSS hides this chip from 901px up.

import Link from "next/link";
import { useAccountAccess } from "@/app/lib/useAccountAccess";
import { useCountdown } from "@/app/lib/useCountdown";
import { shortCountdown } from "@/app/lib/trial-offer";
import styles from "./TopBarV2.module.css";

const DAY_MS = 86_400_000;

export default function TrialChip() {
  const access = useAccountAccess();
  const offerEnd = access?.trialOffer?.endsAt ?? null;
  const trialEnd = access?.state === "trial" ? access.trialEndsAt : null;
  const left = useCountdown(offerEnd ?? trialEnd, 30_000);

  if (left === null || left <= 0) return null;

  const offer = offerEnd !== null;
  const label = offer
    ? `50% off: ${shortCountdown(left)}`
    : left >= DAY_MS
      ? `${Math.ceil(left / DAY_MS)}d left`
      : `${shortCountdown(left)} left`;

  return (
    <Link
      href="/pricing"
      className={`${styles.chip} ${offer ? styles.chipOffer : ""}`}
      data-testid="trial-chip"
      aria-label={offer ? `50% off your first month, ends in ${shortCountdown(left)}` : `Free trial, ${label}`}
    >
      {label}
    </Link>
  );
}
