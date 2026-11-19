import { test, expect } from "@playwright/test";
import { emailResults, freeFunnel, promptResults, trialCohorts, type AppEventRow, type SentRow } from "@/app/lib/admin-v45-reports";

/*
 * The admin console reports (spec Step 9, Phase 2): Free back in the funnel,
 * trial cohorts, and results for each prompt and email. Pure, from app_events
 * and lifecycle_email_log rows.
 *
 * Edge cases. Prompts: counts per id; "paid" needs a click by THAT teacher
 * within 7 days before paying (a payment 8 days later, or by someone who never
 * clicked, does not count; a teacher who clicked twice counts once); checkouts
 * come from source_prompt. Emails: grouped by id from the key ("E9a:..."
 * is E9a); only status sent counts as sent; paid within 7 days of the send.
 * Cohorts: by the UK week the trial started (Sunday to Saturday); activated
 * and paid counted once per teacher; paid during the trial means before its
 * end. Free funnel: the LATEST move to Free per teacher; only what happened
 * after that move counts; split by where they came from.
 */

const ev = (user: string, name: string, at: string, props: Record<string, unknown> = {}): AppEventRow => ({
  user_id: user,
  name,
  props,
  created_at: at,
});

test.describe("prompt results", () => {
  const events = [
    ev("a", "prompt_shown", "2026-11-01T10:00:00Z", { prompt: "P3" }),
    ev("a", "prompt_clicked", "2026-11-01T10:01:00Z", { prompt: "P3" }),
    ev("a", "prompt_clicked", "2026-11-02T10:01:00Z", { prompt: "P3" }),
    ev("a", "checkout_started", "2026-11-02T10:02:00Z", { source_prompt: "P3" }),
    ev("a", "subscribed", "2026-11-05T10:00:00Z", { plan: "pro" }),
    ev("b", "prompt_shown", "2026-11-01T10:00:00Z", { prompt: "P3" }),
    ev("b", "prompt_dismissed", "2026-11-01T10:00:30Z", { prompt: "P3" }),
    ev("c", "prompt_clicked", "2026-11-01T10:00:00Z", { prompt: "P6" }),
    ev("c", "subscribed", "2026-11-09T10:00:01Z", { plan: "pro" }), // 8 days later
    ev("d", "subscribed", "2026-11-02T10:00:00Z", { plan: "pro" }), // never clicked
  ];

  test("counts, checkouts by source, and paid within 7 days of a click", () => {
    const rows = promptResults(events);
    const p3 = rows.find((r) => r.id === "P3")!;
    expect(p3).toEqual({ id: "P3", shown: 2, clicked: 2, dismissed: 1, checkouts: 1, paid: 1 });
    const p6 = rows.find((r) => r.id === "P6")!;
    expect(p6.paid).toBe(0);
  });

  test("every prompt id appears, in spec order, even with no events", () => {
    expect(promptResults([]).map((r) => r.id)).toEqual(["P1", "P2", "P3", "P3b", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12"]);
  });
});

test.describe("email results", () => {
  const sent: SentRow[] = [
    { user_id: "a", key: "E9a:2026-11-01", sent_at: "2026-11-02T16:30:00Z", status: "sent" },
    { user_id: "b", key: "E9a:2026-11-08", sent_at: "2026-11-09T16:30:00Z", status: "sent" },
    { user_id: "c", key: "E9a:2026-11-08", sent_at: "2026-11-09T16:30:00Z", status: "failed" },
    { user_id: "a", key: "E5", sent_at: "2026-11-03T16:30:00Z", status: "sent" },
  ];
  const events = [ev("a", "subscribed", "2026-11-04T09:00:00Z"), ev("b", "subscribed", "2026-11-20T09:00:00Z")];

  test("grouped by id, only real sends, paid within 7 days of the send", () => {
    const rows = emailResults(sent, events);
    expect(rows.find((r) => r.id === "E9a")).toEqual({ id: "E9a", sent: 2, notSent: 1, paid: 1 });
    expect(rows.find((r) => r.id === "E5")).toEqual({ id: "E5", sent: 1, notSent: 0, paid: 1 });
  });
});

test.describe("trial cohorts", () => {
  const events = [
    // Week of Sun 15 Nov.
    ev("a", "trial_started", "2026-11-15T09:00:00Z", { trial_ends_at: "2026-11-25T23:59:59Z" }),
    ev("a", "activated", "2026-11-16T09:00:00Z"),
    ev("a", "activated", "2026-11-16T10:00:00Z"),
    ev("a", "subscribed", "2026-11-20T09:00:00Z"),
    ev("b", "trial_started", "2026-11-21T22:00:00Z", { trial_ends_at: "2026-12-01T23:59:59Z" }),
    ev("b", "moved_to_free", "2026-12-02T00:00:00Z", { from: "trial" }),
    ev("b", "subscribed", "2026-12-10T09:00:00Z"),
    // Week of Sun 22 Nov.
    ev("c", "trial_started", "2026-11-22T00:30:00Z", { trial_ends_at: "2026-12-02T23:59:59Z" }),
  ];

  test("by UK week, each teacher once per measure, newest first", () => {
    const rows = trialCohorts(events);
    expect(rows.map((r) => r.week)).toEqual(["2026-11-22", "2026-11-15"]);
    expect(rows[1]).toEqual({ week: "2026-11-15", started: 2, activated: 1, paidInTrial: 1, paid: 2, movedToFree: 1 });
    expect(rows[0]).toEqual({ week: "2026-11-22", started: 1, activated: 0, paidInTrial: 0, paid: 0, movedToFree: 0 });
  });
});

test.describe("Free back in the funnel", () => {
  const events = [
    // a: trial to Free, then back, made, ran out, checkout, paid.
    ev("a", "moved_to_free", "2026-11-01T00:00:00Z", { from: "trial" }),
    ev("a", "resource_made", "2026-11-03T10:00:00Z"),
    ev("a", "credits_ran_out", "2026-11-03T11:00:00Z", { plan: "free" }),
    ev("a", "checkout_started", "2026-11-03T11:05:00Z"),
    ev("a", "subscribed", "2026-11-03T11:10:00Z"),
    // b: made something BEFORE the move only: not back.
    ev("b", "resource_made", "2026-10-30T10:00:00Z"),
    ev("b", "moved_to_free", "2026-11-01T00:00:00Z", { from: "cancel" }),
    // c: two moves; only after the latest counts.
    ev("c", "moved_to_free", "2026-10-01T00:00:00Z", { from: "trial" }),
    ev("c", "resource_made", "2026-10-05T00:00:00Z"),
    ev("c", "moved_to_free", "2026-11-01T00:00:00Z", { from: "failed_payment" }),
  ];
  const lastSeen = new Map([
    ["a", new Date("2026-11-03T09:00:00Z")],
    ["b", new Date("2026-10-31T09:00:00Z")],
    ["c", new Date("2026-11-10T09:00:00Z")],
  ]);

  test("stages after the latest move, split by where they came from", () => {
    const f = freeFunnel(events, lastSeen);
    expect(f.all).toEqual({ from: "all", moved: 3, cameBack: 2, made: 1, ranOut: 1, checkout: 1, paid: 1 });
    expect(f.byFrom.find((r) => r.from === "trial")).toEqual({ from: "trial", moved: 1, cameBack: 1, made: 1, ranOut: 1, checkout: 1, paid: 1 });
    expect(f.byFrom.find((r) => r.from === "cancel")).toEqual({ from: "cancel", moved: 1, cameBack: 0, made: 0, ranOut: 0, checkout: 0, paid: 0 });
    expect(f.byFrom.find((r) => r.from === "failed_payment")).toEqual({
      from: "failed_payment",
      moved: 1,
      cameBack: 1,
      made: 0,
      ranOut: 0,
      checkout: 0,
      paid: 0,
    });
  });
});
