// ── The signed guest cookie ─────────────────────────────────────────────────
//
// A signed out visitor who makes something on /create is a guest, and the
// guest is nothing more than this cookie: a random id plus an HMAC of it. The
// id keys their rows in trial_generations, and on sign in every row carrying
// it moves into the new account.
//
// The signature is the whole point. Without it, anyone who learned (or
// guessed) another visitor's guest id could set it in their own browser, sign
// in, and have that visitor's decks claimed into their account.
//
// Pure: no cookies() call, no env read. The request-bound half is guest.ts,
// which passes the secret in. That keeps these testable in tests/unit.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE = "jooma_guest";
/** Readable by the page, carries no identity: it only says "there is guest
 *  work waiting", so the signed in shell knows to call the claim route rather
 *  than calling it on every page load for every teacher. */
export const GUEST_WORK_FLAG = "jooma_guest_has_work";
/** As long as the work itself is kept. Unclaimed rows are purged at 30 days. */
export const GUEST_MAX_AGE_S = 60 * 60 * 24 * 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(`guest:${value}`).digest("base64url");
}

/** A new guest id and the cookie value that carries it. */
export function newGuestCookie(secret: string): { guestId: string; value: string } {
  const guestId = randomUUID();
  return { guestId, value: `${guestId}.${sign(guestId, secret)}` };
}

/** The cookie value for an existing id. */
export function guestCookieValue(guestId: string, secret: string): string {
  return `${guestId}.${sign(guestId, secret)}`;
}

/**
 * The guest id inside a cookie value, or null if it is missing, malformed or
 * signed with anything other than `secret`. Constant time on the comparison.
 */
export function verifyGuestCookie(
  value: string | null | undefined,
  secret: string,
): string | null {
  if (!value || !secret) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!UUID_RE.test(id)) return null;

  const expected = Buffer.from(sign(id, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? id : null;
}
