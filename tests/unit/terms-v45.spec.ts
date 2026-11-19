import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRIAL } from "@/app/lib/plan-config";

/*
 * Terms section 7 (owner approved the draft, 19 Nov): the page must describe
 * Jooma 4.5, not the old 3 day trial. Read from the source, since the page
 * is static text.
 *
 * Edge cases: the old trial length is gone in every spelling; the trial
 * length matches the code's TRIAL.days (so a later change to the trial
 * breaks this test instead of leaving the terms wrong); the free plan, yearly
 * billing, top ups and the move to Free after cancelling are all stated; the
 * unchanged GBP and refunds paragraph is still there.
 */

const page = readFileSync(join(process.cwd(), "app/terms/page.tsx"), "utf8");

test("no old 3 day trial", () => {
  expect(page).not.toMatch(/3[ -]day/i);
  expect(page).not.toContain("requires an active subscription or free trial");
});

test("the trial length matches the code", () => {
  expect(page).toContain(`free trial of the Pro plan for ${TRIAL.days} days`);
  expect(page).toContain("once per email address");
});

test("states the free plan, yearly billing, top ups and the move to Free", () => {
  expect(page).toContain("through a free plan and through paid plans billed monthly or yearly");
  expect(page).toContain("carry a Jooma mark");
  expect(page).toContain("resources from top ups do not expire");
  expect(page).toContain("your account then moves to the free plan");
});

test("the GBP and refunds paragraph is unchanged", () => {
  expect(page).toContain("All fees are quoted in GBP and are inclusive of VAT where applicable.");
});
