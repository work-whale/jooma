import { test, expect } from "@playwright/test";
import { canShowPrompt, limitKey, promptAudience, PROMPT_COPY, type PromptContext } from "@/app/lib/prompts";
import { p6View, p7Sheet, p8Totals, p8View, p9View, p10Line, runningLow } from "@/app/lib/prompt-views";
import { sourcePrompt } from "@/app/lib/app-event-rules";

/*
 * Phase 2 prompts (spec Step 5): P6 export mark, P7 refines, P8 time saved,
 * P9 Standard running low, P10 top-up nudge.
 *
 * Owner decisions applied: Standard exports are clean (red note), so P6 is for
 * Free and the Pro trial only, and P10 does not sell "no Jooma mark". The trial
 * IS Pro to the teacher, so its P6 says "once you choose Pro" and its button is
 * "Keep Pro".
 *
 * Edge cases: each prompt only to its audience; presenting blocks all of them;
 * "once a day" (P6) is the UK date, so 23:30 and 00:30 UK are different days
 * even in BST; "once per month" (P9, P10) is the allowance period, so a
 * refill opens a new month even mid calendar month; P9 at exactly 80% shows,
 * just under does not; exactly 7 days to refill does not ("more than 7");
 * a missing refill date or a zero allowance never shows; P8 counts only this
 * UK calendar month, uses the spec's band minutes, never says "0 hours" once
 * something was made, and offers the Pro link on Free and Standard only;
 * P7's sheet; the new ids are accepted as a checkout's source prompt.
 */

const now = new Date("2026-11-19T10:00:00Z");
const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({
  plan: "free",
  presenting: false,
  popupShownThisVisit: false,
  dismissedUntil: null,
  shownBefore: false,
  now,
  ...over,
});

test.describe("audiences", () => {
  test("P6 to P10 go to the plans the spec and the red notes name", () => {
    expect(promptAudience("P6")).toEqual(["free", "pro_trial"]);
    expect(promptAudience("P7")).toEqual(["free"]);
    expect(promptAudience("P8")).toEqual(["pro_trial", "free", "standard", "pro", "max"]);
    expect(promptAudience("P9")).toEqual(["standard"]);
    expect(promptAudience("P10")).toEqual(["standard"]);
  });

  test("presenting blocks every one of them", () => {
    for (const id of ["P6", "P7", "P8", "P9", "P10"] as const) {
      const plan = promptAudience(id)[0];
      expect(canShowPrompt(id, ctx({ plan })), id).toBe(true);
      expect(canShowPrompt(id, ctx({ plan, presenting: true })), id).toBe(false);
    }
  });
});

test.describe("once a day, once a month", () => {
  test("P6: the UK date, across midnight in summer time", () => {
    // 22:30Z on 1 July is 23:30 BST; 23:30Z is 00:30 BST the next day.
    const late = new Date("2026-07-01T22:30:00Z");
    const after = new Date("2026-07-01T23:30:00Z");
    expect(limitKey("P6", late)).toBe("2026-07-01");
    expect(limitKey("P6", after)).toBe("2026-07-02");
    const k = limitKey("P6", late);
    expect(canShowPrompt("P6", ctx({ now: late, limitKey: k, lastShownKey: k }))).toBe(false);
    expect(canShowPrompt("P6", ctx({ now: after, limitKey: limitKey("P6", after), lastShownKey: k }))).toBe(true);
  });

  test("P9 and P10: the allowance period, not the calendar month", () => {
    const start = new Date("2026-11-12T00:00:00Z");
    const next = new Date("2026-12-12T00:00:00Z");
    expect(limitKey("P9", now, start)).toBe(start.toISOString());
    const shown = limitKey("P10", now, start);
    const std = { plan: "standard" as const };
    expect(canShowPrompt("P10", ctx({ ...std, limitKey: shown, lastShownKey: shown }))).toBe(false);
    expect(canShowPrompt("P10", ctx({ ...std, limitKey: limitKey("P10", now, next), lastShownKey: shown }))).toBe(true);
  });

  test("with no period known, P9 falls back to the UK calendar month", () => {
    expect(limitKey("P9", new Date("2026-11-30T23:30:00Z"))).toBe("2026-11");
    expect(limitKey("P9", new Date("2026-05-31T23:30:00Z"))).toBe("2026-06");
  });

  test("prompts with no limit ignore the keys", () => {
    expect(canShowPrompt("P8", ctx({ limitKey: "x", lastShownKey: "x" }))).toBe(true);
  });
});

test.describe("P6, the export mark note", () => {
  test("Free: Pro exports are clean; Go Pro", () => {
    expect(p6View("free")).toEqual({ text: "Exported. Pro exports don't have the Jooma mark.", button: "Go Pro" });
  });
  test("the trial: once you choose Pro; Keep Pro", () => {
    expect(p6View("pro_trial")).toEqual({
      text: "Exported. Once you choose Pro, exports don't have the Jooma mark.",
      button: "Keep Pro",
    });
  });
  test("clean plans see nothing", () => {
    for (const plan of ["standard", "pro", "max", "school"]) expect(p6View(plan), plan).toBeNull();
  });
});

test.describe("P7, refines", () => {
  test("the sheet once all 10 are used", () => {
    expect(p7Sheet()).toEqual({
      title: "That's this week's 10 refines.",
      body: "They come back on Sunday. Pro refines as often as you like.",
      buttons: ["Go Pro", "OK"],
    });
  });
});

test.describe("P8, time saved", () => {
  const runs = [
    { tool_slug: "slideshow", created_at: "2026-11-02T09:00:00Z" }, // decks 45
    { tool_slug: "worksheet-generator", created_at: "2026-11-18T09:00:00Z" },
    { tool_slug: "slideshow", created_at: "2026-10-31T23:30:00Z" }, // 23:30 GMT 31 Oct: October
    { tool_slug: "slideshow", created_at: "2026-12-01T00:00:00Z" }, // future month
  ];

  test("counts this UK month only, with the band minutes", () => {
    const t = p8Totals(runs, now);
    expect(t.made).toBe(2);
    expect(t.minutes).toBeGreaterThanOrEqual(45 + 10);
  });

  test("the first of the month in summer time starts at 23:00Z the day before", () => {
    const bst = [{ tool_slug: "slideshow", created_at: "2026-05-31T23:30:00Z" }];
    expect(p8Totals(bst, new Date("2026-06-10T10:00:00Z")).made).toBe(1);
    expect(p8Totals(bst, new Date("2026-05-20T10:00:00Z")).made).toBe(0);
  });

  test("the line, with the Pro link on Free and Standard only", () => {
    expect(p8View({ plan: "free", made: 9, minutes: 180 })).toEqual({
      text: "This month: 9 resources, about 3 hours saved.",
      link: "See what Pro adds",
    });
    expect(p8View({ plan: "standard", made: 1, minutes: 10 }).text).toBe("This month: 1 resource, about 1 hour saved.");
    expect(p8View({ plan: "standard", made: 1, minutes: 10 }).link).toBe("See what Pro adds");
    for (const plan of ["pro_trial", "pro", "max"]) expect(p8View({ plan, made: 3, minutes: 60 }).link, plan).toBeNull();
  });

  test("nothing made yet never reads as zero hours", () => {
    const v = p8View({ plan: "free", made: 0, minutes: 0 });
    expect(v.text).toBe("Nothing made yet this month.");
    expect(v.text).not.toMatch(/\b0\b/);
  });
});

test.describe("P9, Standard running low", () => {
  const refill = new Date("2026-12-03T00:00:00Z"); // 13+ days away
  const base = { plan: "standard", allowance: 500, nextRefillAt: refill, now };

  test("at exactly 80% it shows, with the real numbers and the refill date", () => {
    const v = p9View({ ...base, allowanceLeft: 100 });
    expect(v?.text).toBe(
      "You've used 400 of your 500 resources, and they refill on 3 December. " +
        "Pro gives you double the resources and generated pictures for £3 more a month.",
    );
    expect(v?.buttons).toEqual(["Switch to Pro", "Top up"]);
  });

  test("just under 80% it does not", () => {
    expect(p9View({ ...base, allowanceLeft: 101 })).toBeNull();
  });

  test("all used still shows", () => {
    expect(p9View({ ...base, allowanceLeft: 0 })?.text).toContain("used 500 of your 500");
  });

  test("seven days or fewer to the refill: nothing", () => {
    const seven = new Date(now.getTime() + 7 * 86_400_000);
    expect(p9View({ ...base, allowanceLeft: 50, nextRefillAt: seven })).toBeNull();
    expect(p9View({ ...base, allowanceLeft: 50, nextRefillAt: new Date(seven.getTime() + 60_000) })).not.toBeNull();
  });

  test("not Standard, no refill date, or no allowance: nothing", () => {
    for (const plan of ["free", "pro", "max", "pro_trial"]) expect(p9View({ ...base, plan, allowanceLeft: 0 }), plan).toBeNull();
    expect(p9View({ ...base, allowanceLeft: 0, nextRefillAt: null })).toBeNull();
    expect(p9View({ ...base, allowance: 0, allowanceLeft: 0 })).toBeNull();
  });

  test("runningLow is the same rule E11 uses", () => {
    expect(runningLow({ allowance: 500, allowanceLeft: 100, nextRefillAt: refill, now })).toBe(true);
    expect(runningLow({ allowance: 500, allowanceLeft: 101, nextRefillAt: refill, now })).toBe(false);
  });
});

test.describe("P10, the top-up nudge", () => {
  test("Standard only, without the Jooma mark (Standard is clean)", () => {
    expect(p10Line("standard")).toBe("Pro gives you 500 more resources every month for £3 more, plus generated pictures.");
    for (const plan of ["free", "pro", "max", "pro_trial"]) expect(p10Line(plan), plan).toBeNull();
    expect(PROMPT_COPY.P10.buttons).toEqual(["Switch to Pro instead", "Buy top-up"]);
  });
});

test.describe("copy and logging", () => {
  test("no dashes, no AI, no credits or tokens in any Phase 2 copy", () => {
    const all = [
      p6View("free")!.text,
      p6View("pro_trial")!.text,
      JSON.stringify(p7Sheet()),
      p8View({ plan: "free", made: 2, minutes: 90 }).text,
      p9View({ plan: "standard", allowance: 500, allowanceLeft: 0, nextRefillAt: new Date("2026-12-03T00:00:00Z"), now })!.text,
      p10Line("standard")!,
    ].join(" ");
    expect(all).not.toMatch(/–|—|\bAI\b|credit|token/i);
  });

  test("P6 to P10 count as a checkout's source prompt", () => {
    for (const id of ["P6", "P7", "P8", "P9", "P10"]) expect(sourcePrompt(id)).toBe(id);
    expect(sourcePrompt("P99")).toBeNull();
  });
});
