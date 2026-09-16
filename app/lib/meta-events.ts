// ── Meta ad tracking: the shared decisions ───────────────────────────────────
// Imported by BOTH the browser and the server, so nothing here may be
// server-only and nothing here may touch process.env or crypto. The server half
// of the work lives in meta-capi.ts, which is server-only; this file holds only
// the judgements both sides have to agree on.
//
// Why a predicate rather than an `if` at the call site: the StartTrial decision
// is made in a client component (app/complete-profile/page.tsx) and asserted in
// tests/unit/meta-events.spec.ts, and the two must not be able to drift. The
// rule is genuinely subtle, so it is stated once and tested directly.

/**
 * How an account finished signing up.
 *
 * `invite-failed` is a real and separate case, not an error: see the early
 * return in app/complete-profile/page.tsx, where the profile row is saved, the
 * invite could not be applied, and the teacher is told they are continuing on
 * the Free plan. They ARE a free activation.
 */
export type ActivationOutcome =
  | { kind: "self-signup" }
  | { kind: "invite-failed" }
  | { kind: "invite-applied"; plan: string };

/** The plans that are not a free activation. `school` is invoiced per seat, so
 *  a teacher handed one of those seats never started a free trial either. */
const PAID_PLANS = new Set(["pro", "max", "school"]);

/**
 * Should this signup report StartTrial to Meta?
 *
 * The spec asks for the event when a Free plan is "successfully activated", so
 * an admin-invited teacher who lands directly on a paid plan is deliberately
 * excluded: they never had a free trial to start, and counting them would
 * inflate the denominator of the Free to Paid rate the agency reports on.
 *
 * KEYED ON THE RESULTING PLAN, not on whether an invite existed. InviteRow.plan
 * is typed as a bare string (see app/lib/invites.ts), so an invite can carry
 * 'free' — and an invited teacher who ends up on Free is exactly as much a free
 * activation as someone who signed up off the landing page.
 */
export function shouldSendStartTrial(outcome: ActivationOutcome): boolean {
  if (outcome.kind === "invite-applied") {
    return !PAID_PLANS.has(outcome.plan);
  }
  return true;
}
