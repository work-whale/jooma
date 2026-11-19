import { test, expect } from "@playwright/test";
import { LAST_SEEN_COOKIE, shouldRecordVisit } from "@/app/lib/last-seen";

/*
 * profiles.last_seen_at, for E10 ("after 14 days with no visit"). The proxy
 * writes it at most once a UK day per browser, using a day cookie, so normal
 * page loads cost no database write.
 *
 * Edge cases: no cookie; yesterday's cookie; today's cookie; the UK date (not
 * UTC) across midnight in summer time; API calls, prefetches and non-GETs
 * never count; signed out never counts; junk cookie values.
 */

const page = { method: "GET", pathname: "/dashboard", prefetch: false, signedIn: true };
const at = (iso: string) => new Date(iso);

test("records with no cookie, or yesterday's; not with today's", () => {
  const now = at("2026-11-19T10:00:00Z");
  expect(shouldRecordVisit({ ...page, cookie: undefined }, now)).toBe(true);
  expect(shouldRecordVisit({ ...page, cookie: "2026-11-18" }, now)).toBe(true);
  expect(shouldRecordVisit({ ...page, cookie: "2026-11-19" }, now)).toBe(false);
  expect(shouldRecordVisit({ ...page, cookie: "junk" }, now)).toBe(true);
});

test("the day is the UK date: 23:30Z on 1 July is already 2 July in BST", () => {
  expect(shouldRecordVisit({ ...page, cookie: "2026-07-01" }, at("2026-07-01T23:30:00Z"))).toBe(true);
  expect(shouldRecordVisit({ ...page, cookie: "2026-07-02" }, at("2026-07-01T23:30:00Z"))).toBe(false);
});

test("only a signed-in page load counts", () => {
  const now = at("2026-11-19T10:00:00Z");
  expect(shouldRecordVisit({ ...page, cookie: undefined, signedIn: false }, now)).toBe(false);
  expect(shouldRecordVisit({ ...page, cookie: undefined, pathname: "/api/jo" }, now)).toBe(false);
  expect(shouldRecordVisit({ ...page, cookie: undefined, method: "POST" }, now)).toBe(false);
  expect(shouldRecordVisit({ ...page, cookie: undefined, prefetch: true }, now)).toBe(false);
});

test("the cookie has a stable name", () => {
  expect(LAST_SEEN_COOKIE).toBe("jooma_seen");
});
