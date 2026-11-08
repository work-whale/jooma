// What this account may do right now, from one my_account_access() row.
//
// Pure, with no database, so every state is pinned by
// tests/unit/account-access.spec.ts. Display side only: what stops a request
// reaching a model is checkAllGates in generation-guard.ts, which keeps the same
// rule for when a trial has run out (see effectivePlan).
import { effectivePlan, hasActivePlan, reviewTrialEnd } from "./plans";
import { FREE_TRIES_PER_DAY } from "./free-tries";
import { trialOfferExpiredAt, trialOfferFor, type TrialOffer } from "./trial-offer";

/** The columns my_account_access() returns. */
export interface AccessRow {
  plan: string | null;
  is_admin: boolean | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  free_trial_started_at: string | null;
  has_paid: boolean | null;
  had_ambassador_pro: boolean | null;
  had_review_trial: boolean | null;
  free_tries_used: number | null;
  /** When the no-card trial ends or ended. 20261109000000 and later. */
  trial_ends_at?: string | null;
  /** When its 50% offer runs out, only for someone it could apply to. */
  trial_offer_ends_at?: string | null;
}

/**
 *   subscribed  a plan in force: paid for, comped, or a Stripe trial with a card
 *   trial       the no-card trial, still running
 *   locked      nothing in force, so only the three free tools work
 */
export type AccountState = "subscribed" | "trial" | "locked";

export interface AccountAccess {
  state: AccountState;
  /** When the no-card trial ends. Null in every other state. */
  trialEndsAt: Date | null;
  /** Whole days left, rounded up, so the last hours read as "1 day". */
  trialDaysLeft: number | null;
  /** Locked, and has never had a trial of any kind or been a customer. */
  canStartTrial: boolean;
  /** Whether what is in their library may leave Jooma. */
  canExportLibrary: boolean;
  /** Locked because a plan ended, as opposed to a trial nobody subscribed from. */
  lapsed: boolean;
  /** Runs left today on the free tools. Only meaningful while locked. */
  freeTriesLeft: number;
  /** Had the no-card trial at some point. */
  hadTrial: boolean;
  /** When the no-card trial started, if they had one. */
  trialStartedAt: Date | null;
  /** The end-of-trial offer, while it is open. Only ever set while locked. */
  trialOffer: TrialOffer | null;
  /** When an offer they had ran out. Null if none, or still open. */
  trialOfferExpiredAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One no-card trial per account, and never for someone who has already had the
 * product some other way. A Stripe customer or subscription id means they have
 * been through checkout, and a Stripe trial cancelled before any charge leaves
 * both behind even though no invoice was paid.
 */
export function eligibleForTrial(row: AccessRow): boolean {
  return (
    (row.plan ?? "free") === "free" &&
    !row.is_admin &&
    !row.free_trial_started_at &&
    !row.stripe_customer_id &&
    !row.stripe_subscription_id &&
    !row.had_ambassador_pro &&
    !row.had_review_trial
  );
}

export function accountAccess(row: AccessRow, now = new Date()): AccountAccess {
  const paidEra = Boolean(row.has_paid || row.had_ambassador_pro);
  const freeTriesLeft = Math.max(0, FREE_TRIES_PER_DAY - (row.free_tries_used ?? 0));

  if (row.is_admin) {
    return {
      state: "subscribed",
      trialEndsAt: null,
      trialDaysLeft: null,
      canStartTrial: false,
      canExportLibrary: true,
      lapsed: false,
      freeTriesLeft,
      hadTrial: false,
      trialStartedAt: null,
      trialOffer: null,
      trialOfferExpiredAt: null,
    };
  }

  const hadTrial = Boolean(row.free_trial_started_at);
  const trialStartedAt = row.free_trial_started_at ? new Date(row.free_trial_started_at) : null;

  if (!hasActivePlan(effectivePlan(row, now))) {
    return {
      state: "locked",
      trialEndsAt: null,
      trialDaysLeft: null,
      canStartTrial: eligibleForTrial({ ...row, plan: "free" }),
      // What they made while paying is theirs to take, which the cancel flow
      // tells them. An account that never paid has no such promise.
      canExportLibrary: paidEra,
      lapsed: paidEra,
      freeTriesLeft,
      hadTrial,
      trialStartedAt,
      trialOffer: hadTrial ? trialOfferFor(row, now) : null,
      trialOfferExpiredAt: hadTrial ? trialOfferExpiredAt(row, now) : null,
    };
  }

  // A review trial has the same shape as the no-card trial but no start stamp:
  // it says its own thing on billing, so to everything here it is just a plan.
  const end = row.free_trial_started_at ? reviewTrialEnd(row) : null;
  if (end) {
    return {
      state: "trial",
      trialEndsAt: end,
      trialDaysLeft: Math.ceil((end.getTime() - now.getTime()) / DAY_MS),
      canStartTrial: false,
      canExportLibrary: true,
      lapsed: false,
      freeTriesLeft,
      hadTrial,
      trialStartedAt,
      trialOffer: null,
      trialOfferExpiredAt: null,
    };
  }

  return {
    state: "subscribed",
    trialEndsAt: null,
    trialDaysLeft: null,
    canStartTrial: false,
    canExportLibrary: true,
    lapsed: false,
    freeTriesLeft,
    hadTrial,
    trialStartedAt,
    trialOffer: null,
    trialOfferExpiredAt: null,
  };
}
