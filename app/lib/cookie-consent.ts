/*
 * Cookie consent (Jooma 4.5 Step 7: "only fire the pixel once cookie consent
 * has been given"). The Meta pixel is Jooma's one non-essential cookie; Vercel
 * Analytics sets none, and sign-in cookies are essential.
 *
 * The choice is a first-party cookie, readable by the page: it holds no
 * secret, and the pixel must be able to check it before loading. No choice
 * yet means not consented.
 *
 * Pure.
 */

export const CONSENT_COOKIE = "jooma_consent";
/** Fired on window when the choice changes, so the pixel can load at once. */
export const CONSENT_EVENT = "jooma:consent";

export type Consent = "accepted" | "rejected" | "undecided";

export function readConsent(cookieString: string | undefined | null): Consent {
  if (!cookieString) return "undecided";
  for (const part of cookieString.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === CONSENT_COOKIE) return v === "accepted" || v === "rejected" ? v : "undecided";
  }
  return "undecided";
}

const YEAR_S = 365 * 86_400;

export function consentCookie(choice: "accepted" | "rejected"): string {
  return `${CONSENT_COOKIE}=${choice}; Max-Age=${YEAR_S}; Path=/; SameSite=Lax`;
}

/**
 * Whether a server-side Meta event may be sent for this teacher. The same
 * choice as the pixel: a Reject stops the hashed email going too.
 *
 * `cookie` is this request's choice (undecided when there is no browser, as in
 * a webhook); `stored` is the choice saved on the profile. The cookie wins
 * when it says something, being the newer word. No choice anywhere: no event.
 */
export function mayReportToMeta(cookie: Consent, stored: string | null | undefined): boolean {
  if (cookie !== "undecided") return cookie === "accepted";
  return stored === "accepted";
}
