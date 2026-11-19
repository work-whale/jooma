import { test, expect } from "@playwright/test";
import { p4Line } from "@/app/lib/prompt-views";
import { sourcePrompt } from "@/app/lib/app-event-rules";

/*
 * P4, low resources (Jooma 4.5 spec Step 5, Phase 2): on Free, with a balance
 * under 20, one line in the tool form, every time: "{12} resources left this
 * week. You'll be back to 50 on Sunday." with a "See plans" text link.
 *
 * Edge cases: 20 exactly shows nothing, 19 shows; never on the trial or a paid
 * plan; never when the tool cannot be afforded (the cost line and P3 do that
 * job); "1 resource" in the singular; a fractional balance is floored; the
 * copy keeps the rules; P4 is a known source for checkout_started.
 */

test("Free under 20, when the tool is still affordable", () => {
  expect(p4Line("free", 19, true)).toBe("19 resources left this week. You'll be back to 50 on Sunday.");
  expect(p4Line("free", 12.7, true)).toBe("12 resources left this week. You'll be back to 50 on Sunday.");
  expect(p4Line("free", 1, true)).toBe("1 resource left this week. You'll be back to 50 on Sunday.");
});

test("nothing at 20 or more", () => {
  expect(p4Line("free", 20, true)).toBeNull();
  expect(p4Line("free", 50, true)).toBeNull();
});

test("nothing when the tool costs more than is left: P3's job", () => {
  expect(p4Line("free", 12, false)).toBeNull();
});

test("Free only", () => {
  for (const plan of ["pro_trial", "standard", "pro", "max", "school"] as const) {
    expect(p4Line(plan, 5, true)).toBeNull();
  }
});

test("the copy rules, and P4 counts as a checkout source", () => {
  expect(p4Line("free", 3, true)).not.toMatch(/–|—|\bAI\b|credit|token/i);
  expect(sourcePrompt("P4")).toBe("P4");
});
