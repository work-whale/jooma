// Which agreement an ambassador is on, and whether to offer them the new one.
//
// Signing happens once, on the application (agreement_version). When the text
// changes, nobody is moved across on their own: they are offered the new
// version and stay on the one they signed until they accept it. Each
// acceptance is its own dated row (ambassador_agreement_acceptances), so the
// original signature is never overwritten.
//
// Pure, so every rule is pinned by tests/unit/ambassador-agreement-status.spec.ts.
import { AGREEMENT_VERSION } from "./ambassador-agreement";
import { MIN_VERSION, versionAtLeast } from "./ambassador-activity";

export interface Acceptance {
  version: string;
  signature_name: string;
  accepted_at: string;
}

export interface AgreementInForce {
  version: string;
  /** Null when the version in force is the one signed on the application. */
  acceptedAt: string | null;
  signatureName: string | null;
}

/** What changed in the current version, in the words the prompt shows. */
export const AGREEMENT_CHANGES = [
  "Jooma Ltd is named by its company number, 17204207.",
  "Your commission rates are fixed for the whole agreement. We cannot change them while it runs.",
  "When your agreement ends, your account moves to the Free plan and you can keep creating. It no longer moves to no plan.",
  "A new clause says your content is yours. You do not need our approval to post, and we ask before we reshare any of it.",
] as const;

/** The newest version they have agreed to: the signed one, or a later acceptance. */
export function agreementInForce(signedVersion: string, acceptances: Acceptance[]): AgreementInForce {
  let best: AgreementInForce = { version: signedVersion, acceptedAt: null, signatureName: null };
  for (const a of acceptances) {
    // Strictly newer only, so the original signature wins a tie.
    // versionAtLeast(x, "0") is false for anything that is not a version.
    if (versionAtLeast(a.version, "0") && !versionAtLeast(best.version, a.version)) {
      best = { version: a.version, acceptedAt: a.accepted_at, signatureName: a.signature_name };
    }
  }
  return best;
}

/** True when they are on an older version than the current one. */
export function needsNewAgreement(inForceVersion: string | null, current: string = AGREEMENT_VERSION): boolean {
  if (!inForceVersion) return false;
  return !versionAtLeast(inForceVersion, current);
}

export interface OfferFacts {
  ambassador: { status: string; agreement_ends_at: string | null } | null;
  applicationStatus: string | null;
  inForceVersion: string | null;
  now: Date;
}

/**
 * Offer the new version to a live ambassador, or to an applicant still waiting,
 * who signed an older one. Never to an ended, paused or expired agreement, a
 * declined applicant, or anyone with no signed application on file.
 */
export function offerNewAgreement(f: OfferFacts): boolean {
  if (!needsNewAgreement(f.inForceVersion)) return false;
  if (f.ambassador) {
    if (f.ambassador.status !== "active") return false;
    if (f.ambassador.agreement_ends_at && new Date(f.ambassador.agreement_ends_at).getTime() <= f.now.getTime()) {
      return false;
    }
    return f.applicationStatus === "approved" || f.applicationStatus === "pending";
  }
  return f.applicationStatus === "pending";
}

/**
 * For someone who signed before clause 5 existed: the day they came under it,
 * by accepting a version that has it. The inactivity clock starts no earlier,
 * so quiet months before they agreed to the clause never count against them.
 * Null when they signed a version with clause 5 already, or have not accepted.
 */
export function clauseFiveFrom(signedVersion: string | null, acceptances: Acceptance[]): Date | null {
  if (versionAtLeast(signedVersion, MIN_VERSION)) return null;
  const times = acceptances
    .filter((a) => versionAtLeast(a.version, MIN_VERSION))
    .map((a) => new Date(a.accepted_at).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.min(...times)) : null;
}

export type AcceptanceCheck = { ok: true; signature_name: string } | { ok: false; error: string };

/** The same name rule as signing (validateApplication), and only the current version. */
export function validateAcceptance(input: { version?: unknown; signature_name?: unknown }): AcceptanceCheck {
  if (input.version !== AGREEMENT_VERSION) {
    return { ok: false, error: "That version of the agreement is out of date. Reload the page and try again." };
  }
  const name = typeof input.signature_name === "string" ? input.signature_name.trim() : "";
  if (name.length < 4) return { ok: false, error: "Type your full name to accept." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };
  return { ok: true, signature_name: name };
}
