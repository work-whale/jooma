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
