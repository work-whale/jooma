/*
 * Existing accounts on launch day (Jooma 4.5 spec Step 8).
 *
 *   keep               paying (active or past_due), comped, or an admin
 *   trial_runs_out     an old no-card trial still running: it runs to its end
 *                      as promised, then the new rules move it to Free
 *   free_trial_pending never paid: Free now, and a fresh 10-day Pro trial that
 *                      starts the next time they log in
 *   free               a former payer, or an email that already had the 4.5
 *                      trial: Free, no new trial
 *
 * The SQL twin is launch_v45_move_accounts() in the plans engine migration,
 * which an admin runs on launch day. It is NOT run by the migration itself.
 *
 * E16 goes to the free_trial_pending group only, and only with consent. The
 * conservative reading, until the solicitor answers: "consented" means they
 * did not opt out under the soft opt-in Jooma used at signup before 4.5, and
 * the address is not on the opt-out list. The owner can narrow it further.
 */

export interface LaunchAccount {
  plan: string | null;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  hasPaid: boolean;
  isAdmin: boolean;
  /** The normalised email is already in trial_email_keys. */
  emailHadTrial: boolean;
  /** On the email opt-out list. */
  optedOut: boolean;
}

export type LaunchMove = "keep" | "trial_runs_out" | "free_trial_pending" | "free";

const PAID = new Set(["standard", "pro", "max", "school"]);

export function launchMove(a: LaunchAccount, now: Date): LaunchMove {
  if (a.isAdmin) return "keep";
  const noCardTrial = a.subscriptionStatus === "trialing" && !a.stripeSubscriptionId;
  if (noCardTrial) {
    const end = a.currentPeriodEnd ? new Date(a.currentPeriodEnd).getTime() : NaN;
    if (Number.isFinite(end) && end > now.getTime()) return "trial_runs_out";
  } else if (PAID.has(a.plan ?? "free")) {
    // A real subscription, or a comp (ambassador Pro, admin grant).
    return "keep";
  }
  if (a.hasPaid || a.emailHadTrial) return "free";
  return "free_trial_pending";
}

export function e16Eligible(a: LaunchAccount, now: Date, opts: { consented: boolean }): boolean {
  return launchMove(a, now) === "free_trial_pending" && opts.consented && !a.optedOut;
}

export const E16_COPY = {
  subject: "Jooma now has a free plan",
  preheader: "And 10 days of Pro, on us.",
  body:
    "You tried Jooma a while ago. It's now free to use: 50 resources every Sunday, all 35 tools, no card. " +
    "Log in this week and you'll get 10 days of Pro first.",
  button: "Log in",
  path: "/login",
} as const;
