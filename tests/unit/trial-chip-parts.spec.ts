import { test, expect } from "@playwright/test";
import { PROMPT_COPY, p1ChipParts } from "@/app/lib/prompts";

/*
 * Regression (Step 10 open item): on a phone the P1 chip "Pro trial until Wed
 * 25 Nov" squeezed the page title in the top bar to "To...". The chip now
 * marks the words a narrow phone can drop ("trial" and the weekday) so it
 * reads "Pro until 25 Nov" there, while the full words stay in the DOM and
 * the label for screen readers.
 *
 * Edge cases: joined, the parts are exactly the spec's chip text (nothing
 * lost or added); the narrow form keeps the actual date (spec: "show that
 * actual date everywhere"); a date with no weekday drops nothing but "trial".
 */

const join = (parts: { text: string }[]) => parts.map((p) => p.text).join("");
const narrow = (parts: { text: string; wide: boolean }[]) => parts.filter((p) => !p.wide).map((p) => p.text).join("");

test("joined, the parts are the spec's chip text", () => {
  const parts = p1ChipParts("Wed 25 Nov");
  expect(join(parts)).toBe(PROMPT_COPY.P1.chip({ ends: "Wed 25 Nov" }));
});

test("a narrow phone reads Pro until and the date", () => {
  expect(narrow(p1ChipParts("Wed 25 Nov"))).toBe("Pro until 25 Nov");
});

test("a date without a weekday keeps all of the date", () => {
  expect(narrow(p1ChipParts("25 Nov"))).toBe("Pro until 25 Nov");
  expect(join(p1ChipParts("25 Nov"))).toBe(PROMPT_COPY.P1.chip({ ends: "25 Nov" }));
});
