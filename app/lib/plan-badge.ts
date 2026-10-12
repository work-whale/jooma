import { hasActivePlan, type PlanId } from "./plans";

/*
 * What the sidebar says about a teacher's plan, and where its button goes.
 *
 * Pure, so it can be unit tested without a session: usePlanBadge() reads the
 * plan and the ambassador row and hands both here.
 *
 * AMBASSADORS
 * An ambassador is a teacher who represents Jooma. An admin grants them twelve
 * months of Pro as a comp (ambassadors.pro_until), and the daily
 * ambassador-terms cron takes it off once that date passes. The badge counts
 * down over the last AMBASSADOR_ENDING_DAYS so the end of the free year is
 * never a surprise, and the button turns into "Keep Pro".
 *
 * Branding (the gold lockup, the nav item) follows `status === "active"` only.
 * A paused ambassador keeps whatever plan they hold until it ends, but stops
 * being presented as one.
 */

/** Start counting down this many days before the free Pro ends. */
export const AMBASSADOR_ENDING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Short names: the pill has room for one word, not "Pro Teacher". */
const SHORT_NAME: Record<PlanId, string> = {
  free: "No plan",
  standard: "Standard",
  pro: "Pro",
  max: "Max",
  school: "School",
};

export interface AmbassadorTerm {
  status: string;
  /** When the free Pro ends. Null when it was never granted. */
  proUntil: Date | null;
}

export interface PlanBadge {
  plan: PlanId;
  /** The pill: "Pro", "No plan", "Ambassador · Pro". */
  label: string;
  /** Shown with the gold treatment and the ambassador lockup. */
  ambassador: boolean;
  /** One line under the pill, or null for none. */
  note: string | null;
  /** The sidebar button. Always /pricing, which is where plans change. */
  cta: { label: string; href: "/pricing" };
  /** Whole days of free Pro left, or null when not on an ambassador term. */
  daysLeft: number | null;
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Days until `end`, rounded up so the last afternoon still reads "1 day". */
export function daysUntil(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

/** True while the teacher is on Pro because they are an ambassador. */
export function onAmbassadorPro(
  plan: PlanId,
  term: AmbassadorTerm | null,
  now: Date = new Date(),
): boolean {
  return (
    plan === "pro" &&
    term !== null &&
    term.proUntil !== null &&
    term.proUntil.getTime() > now.getTime()
  );
}

export function planBadgeFor(
  plan: PlanId,
  term: AmbassadorTerm | null,
  now: Date = new Date(),
): PlanBadge {
  const ambassador = term?.status === "active";
  const short = SHORT_NAME[plan];

  if (onAmbassadorPro(plan, term, now)) {
    const end = term!.proUntil!;
    const daysLeft = daysUntil(end, now);
    const ending = daysLeft <= AMBASSADOR_ENDING_DAYS;
    return {
      plan,
      label: ambassador ? "Ambassador · Pro" : "Pro",
      ambassador,
      note: ending
        ? `Free Pro ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
        : `Free until ${longDate(end)}`,
      cta: { label: ending ? "Keep Pro" : "See plans", href: "/pricing" },
      daysLeft,
    };
  }

  // Everyone else, ambassador or not. An ambassador who pays for their own
  // plan, or whose free year is over, still wears the badge.
  const label = ambassador && hasActivePlan(plan) ? `Ambassador · ${short}` : short;

  const ctaLabel = !hasActivePlan(plan)
    ? "Choose a plan"
    : plan === "standard" || plan === "pro"
      ? "Upgrade"
      : "See plans";

  return {
    plan,
    label,
    ambassador,
    note: null,
    cta: { label: ctaLabel, href: "/pricing" },
    daysLeft: null,
  };
}
