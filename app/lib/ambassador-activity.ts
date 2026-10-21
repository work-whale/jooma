// Keeping your place: the inactivity clock in clause 5 of the agreement.
//
// Pure, so every rule is pinned by tests/unit/ambassador-activity.spec.ts. The
// daily ambassador-terms cron asks activityStage() where each ambassador is,
// and the agreement reads REVIEW_DAYS and EXEMPT_OVER from here, so the text an
// ambassador signs cannot drift from what the cron does.
//
// THE RULES
//
//   The clock starts from the later of the approval date and the most recent
//   new subscriber, counted on their first cleared payment, never a sign-up.
//
//   One full London calendar month with no new subscriber: a heads-up email.
//   Two: Under review, with REVIEW_DAYS days to bring one in. An admin decides
//   what happens after that; nothing here ends an agreement.
//
//   August does not count, in the months or in the review days. A new
//   subscriber in August still closes a review, but nothing new starts.
//
//   More than EXEMPT_OVER active subscribers, or an agreement signed before
//   MIN_VERSION (which had no such clause), and the clock does not apply.
import { periodOf } from "./ambassador-commission";

/** The first agreement version with clause 5. Earlier signers are exempt. */
export const MIN_VERSION = "0.4";
/** More active subscribers than this and clause 5 does not apply. */
export const EXEMPT_OVER = 50;
/** Days an ambassador has to bring in one subscriber once under review. */
export const REVIEW_DAYS = 14;

const DAY_MS = 86_400_000;
const AUGUST = 8;

/**
 * - exempt: clause 5 does not apply
 * - ok: a subscriber within the last full month
 * - quiet: one full month without one
 * - review: two or more
 * - hold: quiet, but it is August, so nothing moves
 */
export type ActivityStage = "exempt" | "ok" | "quiet" | "review" | "hold";

export interface ActivityFacts {
  approvedAt: Date;
  /** The newest first_paid_at among the ambassador's referrals. */
  lastFirstPaidAt: Date | null;
  activeSubscribers: number;
  /** agreement_version on the signed application. */
  agreementVersion: string | null;
  now: Date;
}

/** 1 to 12, in London. */
function londonMonth(at: Date): number {
  return Number(periodOf(at).slice(5, 7));
}

function monthIndex(at: Date): number {
  const [y, m] = periodOf(at).split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Full calendar months strictly between the anchor's month and now's, not counting August. */
export function quietMonths(anchor: Date, now: Date): number {
  let count = 0;
  for (let i = monthIndex(anchor) + 1; i < monthIndex(now); i++) {
    if ((i % 12) + 1 !== AUGUST) count += 1;
  }
  return count;
}

/** True when `version` is `min` or later, comparing each dotted part as a number. */
export function versionAtLeast(version: string | null, min: string): boolean {
  if (!version) return false;
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Number.isNaN(x)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

export function activityStage(f: ActivityFacts): ActivityStage {
  if (!versionAtLeast(f.agreementVersion, MIN_VERSION)) return "exempt";
  if (f.activeSubscribers > EXEMPT_OVER) return "exempt";

  const anchor =
    f.lastFirstPaidAt && f.lastFirstPaidAt.getTime() > f.approvedAt.getTime()
      ? f.lastFirstPaidAt
      : f.approvedAt;
  const quiet = quietMonths(anchor, f.now);

  if (quiet === 0) return "ok";
  if (londonMonth(f.now) === AUGUST) return "hold";
  return quiet === 1 ? "quiet" : "review";
}

/** REVIEW_DAYS days from `start`, skipping any days that fall in August. */
export function reviewDeadline(start: Date): Date {
  let at = start.getTime();
  let counted = 0;
  // Bounded: at most REVIEW_DAYS plus one August.
  while (counted < REVIEW_DAYS) {
    if (londonMonth(new Date(at)) !== AUGUST) counted += 1;
    at += DAY_MS;
  }
  return new Date(at);
}
