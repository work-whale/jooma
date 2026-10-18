/**
 * A post sign in destination that can only ever be a path on this site.
 *
 * /auth/callback used to put `?next=` straight into the redirect, so
 * `next=@evil.com` produced `https://www.jooma.ai@evil.com`, which a browser
 * reads as a login to evil.com. Same rule as checkout/complete: a single
 * leading slash, no protocol relative `//`, no backslash (browsers normalise
 * `/\` to `//`), and no `@` or control characters anywhere.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 512) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[@\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

/**
 * Where a signed in teacher lands when nothing more specific applies: the
 * password form, Google's callback, and /login or /signup visited while
 * already signed in. One constant, so the three cannot drift apart again (the
 * callback used to send people to the landing page).
 */
export const SIGNED_IN_HOME = "/dashboard";

/**
 * A `?next=` that /login, /signup and /complete-profile will honour.
 *
 * Deliberately narrow: only the ambassador programme's pages, which is where an
 * invite link sends someone to sign in and come straight back. Everything else
 * keeps landing where it always has, so adding this changed nothing for anyone
 * outside the programme. Widen the prefix list here, nowhere else.
 */
const HONOURED_NEXT = ["/ambassador"];

export function honouredNextPath(next: string | null | undefined): string | null {
  const path = safeNextPath(next, "");
  if (!path) return null;
  return HONOURED_NEXT.some((p) => path === p || path.startsWith(`${p}/`)) ? path : null;
}
