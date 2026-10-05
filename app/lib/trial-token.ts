// ── The internal token a guest deck's sub-requests carry ─────────────────────
//
// A deck calls /api/generate-audio and /api/find-youtube over HTTP, forwarding
// the teacher's session cookie so the proxy lets the call through. A guest has
// no session to forward, so /api/try/slideshow mints one of these instead and
// the proxy accepts it in place of a session for those two paths only.
//
// Bound to the run it was minted for and short lived, so a token lifted from a
// log cannot be replayed into free audio for long, and never for another run.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TRIAL_TOKEN_HEADER = "x-jooma-trial";
export const TRIAL_RUN_HEADER = "x-jooma-trial-run";
/** A deck with audio takes a couple of minutes at most. */
export const TRIAL_TOKEN_TTL_MS = 15 * 60 * 1000;

function sign(runId: string, exp: number, secret: string): string {
  return createHmac("sha256", secret).update(`trial:${runId}:${exp}`).digest("base64url");
}

export function signTrialToken(runId: string, secret: string, now = Date.now()): string {
  const exp = now + TRIAL_TOKEN_TTL_MS;
  return `${exp}.${sign(runId, exp, secret)}`;
}

/** True when `token` was minted for `runId` with `secret` and has not expired. */
export function verifyTrialToken(
  token: string | null | undefined,
  runId: string | null | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || !runId || !secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < now) return false;

  const expected = Buffer.from(sign(runId, exp, secret));
  const actual = Buffer.from(token.slice(dot + 1));
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
