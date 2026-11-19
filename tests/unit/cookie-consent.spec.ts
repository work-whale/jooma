import { test, expect } from "@playwright/test";
import { CONSENT_COOKIE, consentCookie, mayReportToMeta, readConsent } from "@/app/lib/cookie-consent";

/*
 * The cookie banner (Jooma 4.5 Step 7: "only fire the pixel once cookie
 * consent has been given"). The Meta pixel is the one non-essential cookie;
 * Vercel Analytics sets none.
 *
 * Edge cases: no choice yet means NOT consented (the pixel waits); only the
 * exact word "accepted" counts; "rejected" is remembered so the banner does not
 * come back; junk or a tampered value is treated as no choice; the cookie
 * lasts a year, site wide, readable by the page (it has no secret in it).
 */

test("no choice yet: undecided, and the pixel waits", () => {
  expect(readConsent(undefined)).toBe("undecided");
  expect(readConsent("")).toBe("undecided");
  expect(readConsent("other=1")).toBe("undecided");
});

test("accepted and rejected are read from a cookie string", () => {
  expect(readConsent(`a=1; ${CONSENT_COOKIE}=accepted; b=2`)).toBe("accepted");
  expect(readConsent(`${CONSENT_COOKIE}=rejected`)).toBe("rejected");
});

test("anything else is no choice", () => {
  expect(readConsent(`${CONSENT_COOKIE}=yes`)).toBe("undecided");
  expect(readConsent(`${CONSENT_COOKIE}=Accepted`)).toBe("undecided");
  expect(readConsent(`x${CONSENT_COOKIE}=accepted`)).toBe("undecided");
});

test("the cookie written: a year, site wide, lax", () => {
  const c = consentCookie("accepted");
  expect(c).toContain(`${CONSENT_COOKIE}=accepted`);
  expect(c).toContain("Max-Age=31536000");
  expect(c).toContain("Path=/");
  expect(c).toContain("SameSite=Lax");
});

/*
 * Server-side Meta events follow the same choice (privacy policy section 9).
 * A request's cookie is the latest word when it says something; otherwise the
 * choice saved on the profile (webhooks have no browser). Edge cases: no
 * choice anywhere means NO event; a Reject in this browser beats an older
 * Accept on the profile; junk on the profile is no choice.
 */
test("Meta events: only on an Accept", () => {
  expect(mayReportToMeta("undecided", null)).toBe(false);
  expect(mayReportToMeta("undecided", "accepted")).toBe(true);
  expect(mayReportToMeta("undecided", "rejected")).toBe(false);
  expect(mayReportToMeta("accepted", null)).toBe(true);
  expect(mayReportToMeta("accepted", "rejected")).toBe(true);
  expect(mayReportToMeta("rejected", "accepted")).toBe(false);
  expect(mayReportToMeta("undecided", "yes")).toBe(false);
});
