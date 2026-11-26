import { test, expect, type Page } from "@playwright/test";
import { createAdminWithRole, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { refundOptions, inPolicy, describeCharge, type ChargeFacts } from "@/app/lib/refund-policy";

/*
 * The admin refund modal and the refund policy (docs/18-jooma-refund-policy.html).
 *
 * The charges list is mocked (page.route): the real route reads Stripe, and
 * these screen tests are free and repeatable without it. The options on the
 * mocked charges are made by the real engine (refundOptions), so what the modal
 * shows is what the rules say, and the rules themselves are in
 * tests/unit/refund-policy.spec.ts.
 *
 * What must hold: the modal ADVISES and never gets in the way (a charge with no
 * advice, or an "outside the windows" charge, can still be refunded); picking a
 * rule sets the amount and the reason but both stay editable; the rule that was
 * picked reaches the server; ending the plan is optional and off by default;
 * and a refund that went through is never offered a second time if ending the
 * plan fails.
 */

const DAY = 86_400_000;
const now = Date.now();
const unix = (ms: number) => Math.floor(ms / 1000);

function charge(id: string, over: Partial<ChargeFacts>, description: string, label?: string) {
  const facts: ChargeFacts = {
    kind: "subscription",
    interval: "month",
    reason: "renewal",
    chargedAt: new Date(now - 3 * DAY),
    amount: 799,
    amountRefunded: 0,
    periodEnd: new Date(now + 27 * DAY),
    spentSinceCharge: 0,
    topUp: null,
    ...over,
  };
  const options = refundOptions(facts, new Date(now));
  return {
    id,
    amount: facts.amount,
    amountRefunded: facts.amountRefunded,
    currency: "gbp",
    created: unix(facts.chargedAt.getTime()),
    description,
    label: label ?? describeCharge(facts, "Pro", null),
    inPolicy: inPolicy(options),
    options,
    facts: { ...facts, chargedAt: facts.chargedAt.toISOString(), periodEnd: facts.periodEnd?.toISOString() ?? null },
  };
}

// Three charges, one for each case the console has to tell apart.
const FRESH = charge("ch_fresh", {}, "Subscription update");
const YEARLY = charge(
  "ch_yearly",
  {
    interval: "year",
    reason: "first",
    amount: 7199,
    chargedAt: new Date(now - 50 * DAY),
    periodEnd: new Date(now + 315 * DAY),
    spentSinceCharge: null,
  },
  "Subscription creation",
);
const LATE = charge("ch_late", { chargedAt: new Date(now - 90 * DAY), spentSinceCharge: 40 }, "Subscription cycle");

let owner: TestTeacher | null = null;
let payer: TestTeacher | null = null;

test.beforeAll(async () => {
  owner = await createAdminWithRole("Olive", "super_admin");
  payer = await createTeacher("Paula");
  await setPlan(payer, "pro", "paying");
});

test.afterAll(async () => {
  await deleteTeacher(owner);
  await deleteTeacher(payer);
});

async function openModal(page: Page, charges: unknown[]) {
  await page.route("**/api/admin/teachers/refund?*", (route) => route.fulfill({ json: { charges } }));
  await signIn(page, owner!);
  await page.goto("/admin/users");
  await page.getByPlaceholder("Name, email or user ID").fill(payer!.email);
  await page.locator("tr", { hasText: payer!.email }).first().click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByRole("button", { name: "Issue refund" })).toBeVisible();
}

test("each charge says what it was and whether the policy covers it", async ({ page }) => {
  await openModal(page, [FRESH, YEARLY, LATE]);
  const rows = page.locator("label", { has: page.locator('input[name="charge"]') });

  await expect(rows.nth(0)).toContainText("Pro, monthly, renewal");
  await expect(rows.nth(0).getByTestId("policy-chip")).toHaveText("In policy: clause 3");

  await expect(rows.nth(1)).toContainText("Pro, yearly, first payment");
  // 50 days in: past its 14, so the only help is the pro rata, which a person decides.
  await expect(rows.nth(1).getByTestId("policy-chip")).toHaveText("Outside the windows");

  await expect(rows.nth(2).getByTestId("policy-chip")).toHaveText("Outside the windows");
});

test("a fresh charge lists the rules that apply and the fault option last", async ({ page }) => {
  await openModal(page, [FRESH, YEARLY, LATE]);
  const options = page.getByTestId("policy-options").locator("label");
  await expect(options.nth(0)).toContainText("Within 14 days of payment (clause 3)");
  await expect(options.nth(1)).toContainText("Unwanted renewal, plan unused, within 30 days (clause 6)");
  await expect(options.nth(2)).toContainText("Our fault, no time limit (clause 7)");
  await expect(options.nth(3)).toContainText("Another reason");
});

test("a late monthly charge has only the fault option, and can still be refunded", async ({ page }) => {
  await openModal(page, [LATE]);
  const options = page.getByTestId("policy-options").locator("label");
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText("Our fault");

  // Outside the windows is advice, not a wall.
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/admin/teachers/refund", async (route) => {
    if (route.request().method() === "POST") {
      body = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, amount: 799 } });
    }
    return route.fallback();
  });
  await page.getByPlaceholder("Goes in the audit log").fill("Goodwill, asked nicely");
  await page.getByRole("button", { name: "Issue refund" }).click();
  await expect.poll(() => body).not.toBeNull();
  // No rule picked, so none is sent and the amount is left to the server (all of it).
  expect(body).not.toHaveProperty("rule");
  expect(body).not.toHaveProperty("amountPence");
  expect(body).toMatchObject({ chargeId: "ch_late", reason: "Goodwill, asked nicely" });
});

test("picking the yearly pro rata sets the part amount and the reason, and shows the note", async ({ page }) => {
  await openModal(page, [FRESH, YEARLY, LATE]);
  await page.locator("label", { has: page.locator('input[name="charge"]') }).nth(1).click();

  const pro = YEARLY.options.find((o) => o.rule === "yearly_unused_months")!;
  expect(pro.amount).toBeLessThan(7199);
  const option = page.getByTestId("policy-options").locator("label", { hasText: "unused whole months" });
  await expect(option).toContainText(`£${(pro.amount / 100).toFixed(2)}`);

  await expect(page.getByTestId("policy-note")).toHaveCount(0);
  await option.click();

  await expect(page.getByText("Refund part of it")).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveValue((pro.amount / 100).toFixed(2));
  await expect(page.getByPlaceholder("Goes in the audit log")).toHaveValue(pro.label);
  await expect(page.getByTestId("policy-note")).toContainText("No evidence needed");

  // Both stay editable.
  await page.getByPlaceholder("Goes in the audit log").fill("Leaving teaching");
  await page.locator('input[type="number"]').fill("10.00");

  let body: Record<string, unknown> | null = null;
  await page.route("**/api/admin/teachers/refund", async (route) => {
    if (route.request().method() === "POST") {
      body = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, amount: 1000 } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Issue refund" }).click();
  await expect.poll(() => body).not.toBeNull();
  expect(body).toMatchObject({
    chargeId: "ch_yearly",
    rule: "yearly_unused_months",
    interval: "year",
    amountPence: 1000,
    reason: "Leaving teaching",
  });

});

test("a full refund rule sends no part amount, and switching rule keeps what was typed", async ({ page }) => {
  await openModal(page, [FRESH]);
  const options = page.getByTestId("policy-options").locator("label");
  await options.nth(0).click();
  await expect(page.getByPlaceholder("Goes in the audit log")).toHaveValue("Within 14 days of payment (clause 3)");
  // Full amount: the part refund box is off.
  await expect(page.locator('input[type="number"]')).toHaveCount(0);

  // Typed text is the admin's, so a different rule must not overwrite it.
  await page.getByPlaceholder("Goes in the audit log").fill("Wrong plan, said so by email");
  await options.nth(2).click();
  await expect(page.getByPlaceholder("Goes in the audit log")).toHaveValue("Wrong plan, said so by email");

  // But an untouched prefill does follow the rule.
  await page.getByPlaceholder("Goes in the audit log").fill("");
  await options.nth(1).click();
  await expect(page.getByPlaceholder("Goes in the audit log")).toHaveValue(/Unwanted renewal/);
});

test("ending the plan is optional, off by default, and offered for plan charges only", async ({ page }) => {
  const topup = charge(
    "ch_topup",
    {
      kind: "topup",
      interval: null,
      reason: null,
      amount: 499,
      periodEnd: null,
      spentSinceCharge: null,
      topUp: { units: 1500, left: 1500 },
    },
    "Jooma top up",
    "Top up, 1,500 resources",
  );
  await openModal(page, [FRESH, topup]);
  const endPlan = page.getByLabel("Also end their plan now");
  await expect(endPlan).toBeVisible();
  await expect(endPlan).not.toBeChecked();

  await page.locator("label", { has: page.locator('input[name="charge"]') }).nth(1).click();
  await expect(page.getByTestId("policy-options").locator("label").first()).toContainText("Unspent top up");
  await expect(page.getByLabel("Also end their plan now")).toHaveCount(0);
});

test("when the plan cannot be ended the refund is not offered twice", async ({ page }) => {
  let refunds = 0;
  let planBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/teachers/refund", async (route) => {
    if (route.request().method() === "POST") {
      refunds += 1;
      return route.fulfill({ json: { ok: true, amount: 799 } });
    }
    return route.fallback();
  });
  await page.route("**/api/admin/teachers/change-plan", async (route) => {
    planBody = route.request().postDataJSON();
    return route.fulfill({ status: 400, json: { error: "Stripe said no." } });
  });

  await openModal(page, [FRESH]);
  await page.getByPlaceholder("Goes in the audit log").fill("Asked to leave");
  await page.getByLabel("Also end their plan now").check();
  await page.getByRole("button", { name: "Issue refund" }).click();

  await expect(page.getByText("Refunded, but the plan could not be ended: Stripe said no.")).toBeVisible();
  expect(planBody).toMatchObject({ plan: "free", immediate: true, reason: "Asked to leave" });
  expect(refunds).toBe(1);
  await expect(page.getByRole("button", { name: "Issue refund" })).toBeDisabled();
  await expect(page.locator("form").getByText("Close", { exact: true })).toBeVisible();
});

test("a charge with no policy advice behaves as the modal always did", async ({ page }) => {
  await openModal(page, [
    { id: "ch_plain", amount: 799, amountRefunded: 0, currency: "gbp", created: unix(now - 5 * DAY), description: "Plain" },
  ]);
  await expect(page.getByTestId("policy-chip")).toHaveCount(0);
  await expect(page.getByTestId("policy-options")).toHaveCount(0);
  await expect(page.getByLabel("Also end their plan now")).toHaveCount(0);
  await page.getByPlaceholder("Goes in the audit log").fill("Because");
  await expect(page.getByRole("button", { name: "Issue refund" })).toBeEnabled();
});

test("the refund route rejects a rule that is not one of the five, and accepts one that is", async ({ page }) => {
  await signIn(page, owner!);
  // Nothing here reaches Stripe: the rule is checked before anything else.
  const bad = await page.request.post("/api/admin/teachers/refund", {
    data: { userId: payer!.id, chargeId: "ch_x", reason: "x", rule: "goodwill" },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe("That is not a refund rule.");

  const good = await page.request.post("/api/admin/teachers/refund", {
    data: { userId: payer!.id, reason: "x", rule: "cooling_off" },
  });
  expect(good.status()).toBe(400);
  expect((await good.json()).error).toBe("userId and chargeId are required.");
});

test("screenshot: the modal with a rule picked", async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "Only for the before and after pictures");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openModal(page, [FRESH, YEARLY, LATE]);
  await page.locator("label", { has: page.locator('input[name="charge"]') }).nth(1).click();
  await page.getByTestId("policy-options").locator("label", { hasText: "unused whole months" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/2026-11-26-refund-policy/after-admin-refund-modal.png" });
});
