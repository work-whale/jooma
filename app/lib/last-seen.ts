/*
 * profiles.last_seen_at (Jooma 4.5 Phase 2, for E10: "after 14 days with no
 * visit"). The proxy records a visit at most once a UK day per browser: a day
 * cookie says it already did, so ordinary page loads cost no database write.
 *
 * A visit is a signed-in page load. API calls, router prefetches and form
 * posts do not count (a background fetch is not the teacher coming back).
 *
 * Pure.
 */

import { ukDateKey } from "@/app/lib/prompts";

export const LAST_SEEN_COOKIE = "jooma_seen";

export function shouldRecordVisit(
  r: { method: string; pathname: string; prefetch: boolean; signedIn: boolean; cookie: string | undefined },
  now: Date,
): boolean {
  if (!r.signedIn || r.method !== "GET" || r.prefetch) return false;
  if (r.pathname.startsWith("/api/")) return false;
  return r.cookie !== ukDateKey(now);
}
