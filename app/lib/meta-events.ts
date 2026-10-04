// ── Meta ad tracking: shared shapes ──────────────────────────────────────────
// Imported by BOTH the browser and the server, so nothing here may be
// server-only and nothing here may touch process.env or crypto. The server half
// of the work lives in meta-capi.ts, which is server-only.
//
// StartTrial is no longer decided here. It used to fire when a signup finished
// the profile form and landed on Free; there is no free plan now, so it fires
// when Checkout starts the trial, from both sides with one event_id: the
// browser pixel in app/checkout/complete and the server in the Stripe webhook
// (reportTrialStart). See startsTrial and isTrialCheckout in lib/trial.ts.

/**
 * How an account finished signing up. Sent to /api/meta/activation alongside
 * the attribution cookies, for the server log and the tests that pin the
 * signup flow.
 *
 * `invite-failed` is a real and separate case, not an error: see the early
 * return in app/complete-profile/page.tsx, where the profile row is saved but
 * the invite could not be applied.
 */
export type ActivationOutcome =
  | { kind: "self-signup" }
  | { kind: "invite-failed" }
  | { kind: "invite-applied"; plan: string };
