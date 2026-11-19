import { test, expect } from "@playwright/test";
import { offerEndsAt, offerIsOpen, runOutDecision, ukWeekKey } from "@/app/lib/run-out-offer";
import { dueEmails, type LifecycleTeacher } from "@/app/lib/lifecycle";

/*
 * The second run-out offer (Jooma 4.5 spec Step 5 P3b, Step 6 E9a and E9b,
 * config OFFER): a Free teacher who runs out a second time, in a different UK
 * week, is offered their first month of Pro at half price, once per account,
 * for seven days.
 *
 * Edge cases: the UK week edge (Saturday 23:59 against Sunday 00:00) in GMT and
 * BST; a second run-out in the SAME week; run-outs on the trial or a paid plan
 * not counting; once per account even after the offer has lapsed; never for a
 * teacher who has paid or an admin; the offer end on day 7 at 23:59:59 UK
 * time, open before it and shut at it; E9a once a UK week, an hour after,
 * marketing only, and not in the week E9b covers; E9b once, while open.
 */

const at = (iso: string) => new Date(iso);
const base = { plan: "free" as const, hasPaid: false, isAdmin: false, offerOpenedAt: null };

test.describe("which sheet a run-out shows", () => {
  test("the first run-out on Free is P3, and opens nothing", () => {
    expect(runOutDecision({ ...base, earlierRunOuts: [], now: at("2026-11-29T10:00:00Z") })).toEqual({
      prompt: "P3",
      openOffer: false,
    });
  });

  test("a second run-out in a different UK week is P3b, and opens the offer", () => {
    const d = runOutDecision({ ...base, earlierRunOuts: [at("2026-11-23T10:00:00Z")], now: at("2026-11-29T10:00:00Z") });
    expect(d).toEqual({ prompt: "P3b", openOffer: true });
  });

  test("a second run-out in the same week is still P3", () => {
    // Sunday 22 Nov and Saturday 28 Nov are one UK week.
    const d = runOutDecision({ ...base, earlierRunOuts: [at("2026-11-22T00:00:00Z")], now: at("2026-11-28T23:59:00Z") });
    expect(d.prompt).toBe("P3");
  });

  test("Sunday 00:00 UK time starts a new week, in GMT and in BST", () => {
    // GMT: Saturday 28 Nov 23:59 then Sunday 29 Nov 00:00.
    expect(ukWeekKey(at("2026-11-28T23:59:59Z"))).not.toBe(ukWeekKey(at("2026-11-29T00:00:00Z")));
    expect(runOutDecision({ ...base, earlierRunOuts: [at("2026-11-28T23:59:59Z")], now: at("2026-11-29T00:00:00Z") }).prompt).toBe("P3b");
    // BST: Sunday 4 April 2027 00:00 UK is 23:00 UTC on the Saturday.
    expect(ukWeekKey(at("2027-04-03T22:59:59Z"))).not.toBe(ukWeekKey(at("2027-04-03T23:00:00Z")));
    expect(ukWeekKey(at("2027-04-03T23:00:00Z"))).toBe("2027-04-04");
  });

  test("only Free counts: a run-out on the trial or a paid plan never opens it", () => {
    const earlier = [at("2026-11-16T10:00:00Z")];
    for (const plan of ["pro_trial", "standard", "pro", "max"] as const) {
      expect(runOutDecision({ ...base, plan, earlierRunOuts: earlier, now: at("2026-11-29T10:00:00Z") })).toEqual({ prompt: "P3", openOffer: false });
    }
  });

  test("once per account: after it has opened, even once it has lapsed, P3 again", () => {
    const d = runOutDecision({
      ...base,
      earlierRunOuts: [at("2026-11-16T10:00:00Z"), at("2026-11-23T10:00:00Z")],
      offerOpenedAt: at("2026-11-23T10:00:00Z"),
      now: at("2027-01-10T10:00:00Z"),
    });
    expect(d).toEqual({ prompt: "P3", openOffer: false });
  });

  test("never for a teacher who has paid, or an admin", () => {
    const earlier = [at("2026-11-16T10:00:00Z")];
    const now = at("2026-11-29T10:00:00Z");
    expect(runOutDecision({ ...base, hasPaid: true, earlierRunOuts: earlier, now }).prompt).toBe("P3");
    expect(runOutDecision({ ...base, isAdmin: true, earlierRunOuts: earlier, now }).prompt).toBe("P3");
  });

  test("an earlier run-out stamped in the future is not a different week", () => {
    const d = runOutDecision({ ...base, earlierRunOuts: [at("2026-12-20T10:00:00Z")], now: at("2026-11-29T10:00:00Z") });
    expect(d.prompt).toBe("P3");
  });
});

test.describe("how long the offer lasts", () => {
  test("ends at 23:59:59 UK time seven days after it opened", () => {
    // Opened Sunday 29 Nov: ends Sunday 6 Dec, as in the spec's P3b copy.
    expect(offerEndsAt(at("2026-11-29T10:00:00Z")).toISOString()).toBe("2026-12-06T23:59:59.000Z");
    // Opened late on a UK day in BST: the UK date counts, not the UTC one.
    expect(offerEndsAt(at("2027-04-03T23:30:00Z")).toISOString()).toBe("2027-04-11T22:59:59.000Z");
  });

  test("open before the end, shut at it, and shut once they have paid", () => {
    const end = at("2026-12-06T23:59:59Z");
    const row = { offerEndsAt: end, hasPaid: false, hasSubscription: false };
    expect(offerIsOpen(row, at("2026-12-06T23:59:58Z"))).toBe(true);
    expect(offerIsOpen(row, end)).toBe(false);
    expect(offerIsOpen({ ...row, hasPaid: true }, at("2026-12-01T00:00:00Z"))).toBe(false);
    expect(offerIsOpen({ ...row, hasSubscription: true }, at("2026-12-01T00:00:00Z"))).toBe(false);
    expect(offerIsOpen({ ...row, offerEndsAt: null }, at("2026-12-01T00:00:00Z"))).toBe(false);
  });
});

test.describe("E9a and E9b", () => {
  const free = (over: Partial<LifecycleTeacher> = {}): LifecycleTeacher => ({
    plan: "free",
    signupAt: at("2026-11-01T09:00:00Z"),
    trialEndsAt: at("2026-11-11T23:59:59Z"),
    fromTrial: true,
    hasPaid: false,
    marketingConsent: true,
    sundayEmails: false,
    ranOutAt: [],
    offerOpenedAt: null,
    offerEndsAt: null,
    ...over,
  });
  const keys = (t: LifecycleTeacher, now: Date, sent: string[] = []) => dueEmails(t, new Set(sent), now).map((e) => e.key);

  test("E9a an hour after running out, as marketing, once a UK week", () => {
    const t = free({ ranOutAt: [at("2026-11-24T10:00:00Z")] });
    expect(keys(t, at("2026-11-24T10:59:00Z"))).toEqual([]);
    expect(keys(t, at("2026-11-24T11:00:00Z"))).toEqual(["E9a:2026-11-22"]);
    expect(dueEmails(t, new Set(), at("2026-11-24T11:00:00Z"))[0].kind).toBe("marketing");
    // Sent once; a second run-out the same week sends nothing more.
    const twice = free({ ranOutAt: [at("2026-11-24T10:00:00Z"), at("2026-11-26T10:00:00Z")] });
    expect(keys(twice, at("2026-11-26T11:30:00Z"), ["E9a:2026-11-22"])).toEqual([]);
  });

  test("E9a needs the box ticked, and nothing once they have paid", () => {
    const ran = [at("2026-11-24T10:00:00Z")];
    expect(keys(free({ ranOutAt: ran, marketingConsent: false }), at("2026-11-24T11:00:00Z"))).toEqual([]);
    expect(keys(free({ ranOutAt: ran, hasPaid: true }), at("2026-11-24T11:00:00Z"))).toEqual([]);
    expect(keys(free({ ranOutAt: ran, marketingSentToday: true }), at("2026-11-24T11:00:00Z"))).toEqual([]);
  });

  test("E9b an hour after the offer opens, once, instead of that week's E9a", () => {
    const t = free({
      ranOutAt: [at("2026-11-16T10:00:00Z"), at("2026-11-29T10:00:00Z")],
      offerOpenedAt: at("2026-11-29T10:00:00Z"),
      offerEndsAt: at("2026-12-06T23:59:59Z"),
    });
    expect(keys(t, at("2026-11-29T11:00:00Z"), ["E9a:2026-11-15"])).toEqual(["E9b"]);
    expect(keys(t, at("2026-11-29T11:15:00Z"), ["E9a:2026-11-15", "E9b"])).toEqual([]);
  });

  test("E9b not once the offer has closed or they have paid", () => {
    const t = free({
      ranOutAt: [at("2026-11-29T10:00:00Z")],
      offerOpenedAt: at("2026-11-29T10:00:00Z"),
      offerEndsAt: at("2026-11-29T10:30:00Z"),
    });
    expect(keys(t, at("2026-11-29T11:00:00Z"))).not.toContain("E9b");
    expect(keys({ ...t, offerEndsAt: at("2026-12-06T23:59:59Z"), hasPaid: true }, at("2026-11-29T11:00:00Z"))).toEqual([]);
  });

  test("an hour after a run-out at 20:30 lands in quiet hours, and goes at 07:00", () => {
    const t = free({ ranOutAt: [at("2026-11-24T20:30:00Z")] });
    expect(keys(t, at("2026-11-24T21:30:00Z"))).toEqual([]);
    expect(keys(t, at("2026-11-25T07:00:00Z"))).toEqual(["E9a:2026-11-22"]);
  });
});
