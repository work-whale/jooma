/*
 * The trial's abuse checks (Jooma 4.5 spec Step 3). Server only in practice:
 * it uses node:crypto, so never import it from a client component.
 *
 *   - One trial per email, ever. The email is normalised and hashed, and the
 *     hash goes in trial_email_keys, a table that outlives account deletion
 *     and never holds the address itself.
 *   - Disposable email domains are refused at signup.
 *   - After the first resource, the second waits until the email is verified.
 *   - More than 2 accounts from one device cookie in 24 hours are FLAGGED for
 *     an admin, never blocked (teachers share school computers).
 */

import { createHash } from "node:crypto";

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** Lower case, trimmed, no +tag; Gmail also loses dots and its alias domain. */
export function normaliseTrialEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/** SHA-256 of the normalised email, hex. Never the address. */
export function trialEmailKey(email: string): string {
  return createHash("sha256").update(`jooma-trial:${normaliseTrialEmail(email)}`).digest("hex");
}

/**
 * Throwaway inbox providers. A short, well-known list: the aim is to stop the
 * casual repeat trial, not to win an arms race. Admins can extend it later
 * (a table), so this list is the floor.
 */
export const DISPOSABLE_DOMAINS: readonly string[] = [
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "yopmail.com",
  "temp-mail.org",
  "tempmail.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
  "mintemail.com",
  "mohmal.com",
  "emailondeck.com",
  "tempail.com",
  "burnermail.io",
  "moakt.com",
];

export function isDisposableEmail(email: string, extra: readonly string[] = []): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return [...DISPOSABLE_DOMAINS, ...extra].some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** The second resource waits for a verified email; the first never does. */
export function needsVerification(p: { resourcesMade: number; emailVerified: boolean }): boolean {
  return !p.emailVerified && p.resourcesMade >= 1;
}

/** Flag (never block) more than 2 accounts from one device in 24 hours. */
export const DEVICE_ACCOUNTS_BEFORE_FLAG = 2;
export function deviceFlagged(accountsIn24h: number): boolean {
  return accountsIn24h > DEVICE_ACCOUNTS_BEFORE_FLAG;
}
