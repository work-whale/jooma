// The soft opt-in for product email, shared by /signup, /complete-profile and
// the Emails section of /profile so all three say the same thing.
//
// The choice is asked once, on /signup, and carried to /complete-profile in
// sessionStorage, which is where the account first exists to record it
// against (set_my_product_emails). /complete-profile only asks again when the
// key is absent: a brand new Google account started from /login never saw
// /signup. sessionStorage survives the same-tab Google round trip.
//
// Stored as "rather not" because that is the box: unticked means product email
// is on, which is what the soft opt-in allows, and ticking it is the refusal
// the law asks us to offer at the point of signup.

export const PRODUCT_EMAILS_KEY = "jooma:product-emails";

export const OPT_OUT_LABEL = "I'd rather not get product news and tips by email.";

export const PREFERENCE_LABEL = "Product news and updates";

export const PREFERENCE_HINT =
  "New features, teaching ideas and the occasional offer. Messages about your account, billing and our terms always reach you, whatever you choose here.";

/** "on" or "off", as stored. */
export type ProductEmailsChoice = "on" | "off";

export function saveProductEmailsChoice(optedOut: boolean): void {
  try {
    sessionStorage.setItem(PRODUCT_EMAILS_KEY, optedOut ? "off" : "on");
  } catch {
    // Private mode or blocked storage: /complete-profile will simply ask again.
  }
}

/** The answer given on /signup, or null if it was never asked. */
export function readProductEmailsChoice(): ProductEmailsChoice | null {
  try {
    const v = sessionStorage.getItem(PRODUCT_EMAILS_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function clearProductEmailsChoice(): void {
  try {
    sessionStorage.removeItem(PRODUCT_EMAILS_KEY);
  } catch {
    // Nothing to clear.
  }
}
