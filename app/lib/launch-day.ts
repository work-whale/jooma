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
 * E16 is a service notice to every group; see e16Group and e16Notice below.
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

/*
 * E16, the launch-day notice. A SERVICE email (owner's decision, 18 Nov): each
 * account is told what launch day did to it, so it goes to every group whatever
 * their marketing consent, and it sells nothing. The group is read back from
 * the profile after launch_v45_move_accounts has run.
 */

export interface LaunchNoticeRow {
  plan: string | null;
  isAdmin: boolean;
  trialPending: boolean;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  deletionScheduled: boolean;
}

/** Which notice an account gets, or null for none. */
export function e16Group(r: LaunchNoticeRow, now: Date): LaunchMove | null {
  if (r.isAdmin || r.deletionScheduled) return null;
  if (r.trialPending) return "free_trial_pending";
  const end = r.currentPeriodEnd ? new Date(r.currentPeriodEnd).getTime() : NaN;
  if (r.subscriptionStatus === "trialing" && !r.stripeSubscriptionId && Number.isFinite(end) && end > now.getTime()) {
    return "trial_runs_out";
  }
  if (PAID.has(r.plan ?? "")) return "keep";
  // A 4.5 signup on its own trial needs no news about launch day.
  if (r.plan === "pro_trial") return null;
  return "free";
}

export interface LaunchNotice {
  subject: string;
  body: string;
  button: string;
  path: string;
}

const FREE_LINE = `50 resources every Sunday and all 35 tools, with no card`;

export function e16Notice(group: LaunchMove, plan: string | null): LaunchNotice {
  switch (group) {
    case "free_trial_pending":
      return {
        subject: "Your Jooma account is now on Free",
        body:
          `Jooma has a Free plan now, and your account is on it: ${FREE_LINE}. ` +
          "The next time you log in, you get 10 days of Pro first. Everything you made is still in your library.",
        button: "Log in",
        path: "/login",
      };
    case "free":
      return {
        subject: "Your Jooma account is now on Free",
        body:
          `Jooma has a Free plan now, and your account is on it: ${FREE_LINE}. ` +
          "Everything you made is still in your library.",
        button: "Open Jooma",
        path: "/dashboard",
      };
    case "trial_runs_out":
      return {
        subject: "Your Jooma trial, and what comes after it",
        body:
          "Your free trial runs to its end, as promised. After that your account moves to Jooma's new Free plan: " +
          `${FREE_LINE}. Nothing is charged.`,
        button: "Open Jooma",
        path: "/dashboard",
      };
    case "keep":
      return {
        subject: "Credits are now called resources",
        body:
          "Nothing changes about your plan or what you pay. What we used to call credits are now called resources, " +
          "and your monthly allowance is the same number as before." +
          (plan === "standard" ? " Your exports also no longer carry a watermark." : ""),
        button: "Open Jooma",
        path: "/dashboard",
      };
  }
}
