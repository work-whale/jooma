import { test, expect } from "@playwright/test";
import {
  EXEMPT_OVER,
  REVIEW_DAYS,
  activityStage,
  quietMonths,
  reviewDeadline,
  versionAtLeast,
  type ActivityFacts,
} from "@/app/lib/ambassador-activity";

/*
 * Clause 5 of the ambassador agreement: one quiet month is a heads-up, two is
 * Under review, August does not count, and big codes are exempt.
 */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

const facts = (over: Partial<ActivityFacts>): ActivityFacts => ({
  approvedAt: at("2026-10-15"),
  lastFirstPaidAt: null,
  activeSubscribers: 0,
  agreementVersion: "0.4",
  now: at("2026-11-20"),
  ...over,
});

test.describe("quiet months", () => {
  test("count only full calendar months after the anchor", () => {
    expect(quietMonths(at("2026-10-15"), at("2026-10-31"))).toBe(0);
    expect(quietMonths(at("2026-10-15"), at("2026-11-30"))).toBe(0);
    expect(quietMonths(at("2026-10-15"), at("2026-12-01"))).toBe(1);
    expect(quietMonths(at("2026-10-15"), at("2027-01-01"))).toBe(2);
  });

  test("skip August", () => {
    // June, July, (August), September.
    expect(quietMonths(at("2027-05-20"), at("2027-10-02"))).toBe(3);
    expect(quietMonths(at("2027-07-20"), at("2027-09-02"))).toBe(0);
  });

  test("use London months, not UTC", () => {
    // 23:30 UTC on 30 June is already 1 July in London (BST), so June is full.
    expect(quietMonths(at("2027-05-10"), new Date("2027-06-30T23:30:00Z"))).toBe(1);
  });
});

test.describe("activity stage", () => {
  test("moves from ok to quiet to review", () => {
    expect(activityStage(facts({ now: at("2026-11-20") }))).toBe("ok");
    expect(activityStage(facts({ now: at("2026-12-01") }))).toBe("quiet");
    expect(activityStage(facts({ now: at("2027-01-01") }))).toBe("review");
  });

  test("a new subscriber resets the clock", () => {
    expect(
      activityStage(facts({ now: at("2027-01-01"), lastFirstPaidAt: at("2026-12-10") })),
    ).toBe("ok");
  });

  test("holds in August, but a new subscriber still counts", () => {
    expect(activityStage(facts({ approvedAt: at("2027-05-10"), now: at("2027-08-05") }))).toBe("hold");
    expect(
      activityStage(
        facts({ approvedAt: at("2027-05-10"), lastFirstPaidAt: at("2027-08-03"), now: at("2027-08-05") }),
      ),
    ).toBe("ok");
  });

  test(`is exempt over ${EXEMPT_OVER} active subscribers`, () => {
    const now = at("2027-01-01");
    expect(activityStage(facts({ now, activeSubscribers: EXEMPT_OVER }))).toBe("review");
    expect(activityStage(facts({ now, activeSubscribers: EXEMPT_OVER + 1 }))).toBe("exempt");
  });

  test("does not apply to agreements signed before 0.4", () => {
    const now = at("2027-01-01");
    expect(activityStage(facts({ now, agreementVersion: "0.3" }))).toBe("exempt");
    expect(activityStage(facts({ now, agreementVersion: null }))).toBe("exempt");
    expect(activityStage(facts({ now, agreementVersion: "0.10" }))).toBe("review");
  });
});

test.describe("review deadline", () => {
  test(`is ${REVIEW_DAYS} days`, () => {
    expect(reviewDeadline(at("2026-11-01")).toISOString()).toBe(at("2026-11-15").toISOString());
  });

  test("stops over August", () => {
    // 25 to 31 July is seven days, then August is skipped, then seven more.
    expect(reviewDeadline(at("2027-07-25")).toISOString()).toBe(at("2027-09-08").toISOString());
  });
});

test("versions compare part by part", () => {
  expect(versionAtLeast("0.4", "0.4")).toBe(true);
  expect(versionAtLeast("1.0", "0.4")).toBe(true);
  expect(versionAtLeast("0.3", "0.4")).toBe(false);
});
