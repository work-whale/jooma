import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import Stripe from "stripe";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { trialEndsAt } from "@/app/lib/resource-periods";
import { LIFECYCLE_IDS, renderLifecycleEmail, lifecycleOutgoing, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { e16Notice } from "@/app/lib/launch-day";
import { lifecycleHtml } from "@/app/lib/lifecycle-html";
import { LIFECYCLE_CATALOGUE } from "@/app/lib/lifecycle-switch";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Screenshots of every Jooma 4.5 automation, for the owner's overview page:
 * each lifecycle email (E1 to E14, E16) rendered from the real templates, and
 * the in-app prompts the 19 Nov shots (v45-signed-in.spec.ts) did not cover:
 * P1 chip, P3 trial version, P4, P6, P7 line and sheet, P8, P9, P10, P11.
 *
 * Not a test: skipped unless SCREENSHOTS=1. Accounts are throwaway, on
 * STAGING; the P11 Stripe customer is a sandbox one and is deleted after.
 *
 *   SCREENSHOTS=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/screens/v45-automations.spec.ts
 */

if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("hhgfhhofbhzioywnppzr")) {
  throw new Error("Refusing to run against PRODUCTION.");
}

test.skip(process.env.SCREENSHOTS !== "1", "Screenshots only: set SCREENSHOTS=1");
test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const OUT = `docs/screenshots/${process.env.SHOTS_DIR ?? "2026-11-23-v45-automations"}`;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const RESOURCE_GBP = 0.0015;

const made: TestTeacher[] = [];
const customers: string[] = [];
test.afterEach(async () => {
  for (const t of made.splice(0)) await deleteTeacher(t);
  if (customers.length) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
    for (const id of customers.splice(0)) await stripe.customers.del(id).catch(() => {});
  }
});

async function teacher(name: string, profile: Record<string, unknown> = {}) {
  const t = await createTeacher(name);
  made.push(t);
  if (Object.keys(profile).length) {
    const { error } = await admin.from("profiles").update(profile).eq("id", t.id);
    if (error) throw error;
  }
  return t;
}

/** Start the plan's allowance, then spend down to `left`. */
async function withLeft(t: TestTeacher, plan: "free" | "pro_trial" | "standard", allowance: number, left: number) {
  await admin.rpc("resources_start", { p_uid: t.id, p_plan: plan });
  if (left >= allowance) return;
  const { data: fx } = await admin.rpc("fx_usd_to_gbp");
  await admin.from("token_usage").insert({
    user_id: t.id,
    tool_slug: "worksheet-generator",
    model: "e2e",
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: ((allowance - left) * RESOURCE_GBP) / Number(fx ?? 0.79),
  });
}

async function onFree(t: TestTeacher) {
  await admin
    .from("profiles")
    .update({ plan: "free", subscription_status: null, stripe_subscription_id: null, current_period_end: null, trial_ends_at: null })
    .eq("id", t.id);
}

async function shoot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/prompts/${name}.png`, fullPage: opts.fullPage });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

const SHEET = {
  title: "Adding fractions",
  objective: "I am learning to add fractions with the same denominator.",
  intro: { variant: "fact", label: "Did you know?", text: "A pizza cut into 8 slices shows eighths.", emoji: "🍕" },
  sections: [
    {
      title: "Warm up",
      emoji: "🔥",
      instructions: "Circle the right answer.",
      blocks: [
        { type: "mcq", prompt: "What is 1/4 + 2/4?", options: ["3/4", "3/8", "1/2"], answers: [0], marks: 1 },
        { type: "short", prompt: "Explain how you added them.", lines: 2, answer: "Add the numerators.", marks: 1 },
      ],
    },
  ],
  teacherNotes: [],
};

// ── Emails: rendered from the real templates, no server or account needed ──

test("emails: every lifecycle email and the four E16 versions", async ({ page }) => {
  mkdirSync(`${OUT}/emails`, { recursive: true });
  const site = "https://www.jooma.ai";
  const v: LifecycleVars = {
    firstName: "Sam",
    trialEnds: "Wednesday 25 November",
    trialEndsDay: "Wednesday",
    made: 12,
    hours: 4,
    plan: "Pro",
    resources: 1000,
    refill: "12 December",
    planEnds: "3 December",
    firstTitle: "Year 4 states of matter",
    offerEnds: "Sunday 6 December",
    offerEndsDay: "Sunday",
    used: 400,
    idea: { text: "a retrieval quiz on last week's topic", href: "/tools/quiz-generator", cost: 1 },
  };
  const out: Record<string, unknown>[] = [];
  await page.setViewportSize({ width: Number(process.env.EMAIL_WIDTH ?? 640), height: 400 });

  for (const id of LIFECYCLE_IDS) {
    // E11 is Standard's email: its allowance is 500, not Pro's 1,000.
    const vars = id === "E11" ? { ...v, plan: "Standard", resources: 500 } : v;
    const m = renderLifecycleEmail(id, vars, { unsubToken: "sample" });
    const { rendered } = lifecycleOutgoing(m, site);
    await page.setContent(rendered.html);
    await page.screenshot({ path: `${OUT}/emails/${id}.png`, fullPage: true });
    const cat = LIFECYCLE_CATALOGUE.find((c) => c.id === id);
    out.push({ id, subject: m.subject, preheader: m.preheader, body: m.body, button: m.button, path: m.path, kind: m.kind, footer: m.footerLabel, when: cat?.when, to: cat?.to });
  }

  for (const group of ["free_trial_pending", "free", "trial_runs_out", "keep"] as const) {
    const n = e16Notice(group, "Pro");
    await page.setContent(lifecycleHtml(n.subject, n.body, n.button, site + n.path, `${site}/profile#email-settings`));
    await page.screenshot({ path: `${OUT}/emails/E16-${group}.png`, fullPage: true });
    out.push({ id: `E16 ${group}`, subject: n.subject, body: n.body, button: n.button, path: n.path, kind: "service" });
  }
  writeFileSync(`${OUT}/emails/emails.json`, JSON.stringify(out, null, 2));
});

// ── Prompts: real screens on real (throwaway) staging accounts ─────────────

for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test("P1 chip, P3 trial version", async ({ page }) => {
      const t = await teacher("Tara", { plan: "pro_trial", free_trial_started_at: daysAgo(3).toISOString(), trial_ends_at: trialEndsAt(daysAgo(3)).toISOString() });
      await withLeft(t, "pro_trial", 300, 12);
      await signIn(page, t);
      await page.goto("/dashboard");
      await expect(page.locator("body")).toContainText("Pro", NAV);
      await shoot(page, `${label}-P1-chip`);
      await page.goto("/tools/lesson-planner");
      await page.getByTestId("tool-cost-line").getByRole("button", { name: "See options" }).click(NAV);
      await expect(page.getByTestId("prompt-P3")).toBeVisible(NAV);
      await shoot(page, `${label}-P3-trial`);
    });

    test("P4 low resources line", async ({ page }) => {
      const t = await teacher("Lowe");
      await onFree(t);
      await withLeft(t, "free", 50, 15);
      await signIn(page, t);
      await page.goto("/tools/quiz-generator");
      await expect(page.getByTestId("prompt-P4")).toBeVisible(NAV);
      await page.getByTestId("prompt-P4").scrollIntoViewIfNeeded();
      await shoot(page, `${label}-P4-low`);
    });

    test("P6 export note, P8 time saved", async ({ page }) => {
      const t = await teacher("Sixer");
      await onFree(t);
      await withLeft(t, "free", 50, 50);
      for (const slug of ["slideshow", "worksheet-generator", "quiz-generator"]) {
        await admin.from("tool_runs").insert({ user_id: t.id, tool_slug: slug, title: `Sample ${slug}`, input: {}, output: "x" });
      }
      await signIn(page, t);
      await page.goto("/dashboard");
      await expect(page.getByTestId("today-saved")).toBeVisible(NAV);
      await page.getByTestId("today-saved").scrollIntoViewIfNeeded();
      await shoot(page, `${label}-P8-time-saved`);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("jooma:exported")));
      await expect(page.getByTestId("prompt-P6")).toBeVisible(NAV);
      await shoot(page, `${label}-P6-export`);
    });

    test("P7 refines: the line, then the sheet", async ({ page }) => {
      const t = await teacher("Reef");
      await onFree(t);
      await withLeft(t, "free", 50, 50);
      await admin.from("resource_accounts").update({ refines_used: 8, refines_week_start: new Date().toISOString() }).eq("user_id", t.id);
      const doc = normalizeDraft(SHEET, sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" }));
      const { data: run } = await admin
        .from("tool_runs")
        .insert({ user_id: t.id, tool_slug: "worksheet-generator", title: "Adding fractions", input: {}, output: serializeSheet(doc) })
        .select("id")
        .single();
      await signIn(page, t);
      await page.goto(`/tools/worksheet-generator?run=${run!.id}`);
      await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", NAV);
      const rail = page.getByTestId("jo-rail");
      if (await rail.isVisible().catch(() => false)) await rail.click();
      const line = page.getByTestId("prompt-P7-line");
      if (await line.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false)) {
        await line.scrollIntoViewIfNeeded();
        await shoot(page, `${label}-P7-line`);
      }

      await admin.from("resource_accounts").update({ refines_used: 10 }).eq("user_id", t.id);
      const status = await page.evaluate(async () => {
        const res = await fetch("/api/jo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        return res.status;
      });
      expect(status).toBe(402);
      await expect(page.getByTestId("prompt-P7")).toBeVisible(NAV);
      await shoot(page, `${label}-P7-sheet`);
    });

    test("P9 Standard running low, P10 top-up line", async ({ page }) => {
      const t = await teacher("Nina");
      await setPlan(t, "standard", "paying");
      await withLeft(t, "standard", 500, 100);
      await signIn(page, t);
      if (!new URL(page.url()).pathname.startsWith("/dashboard")) await page.goto("/dashboard", NAV);
      const p9 = page.getByTestId("prompt-P9");
      await expect(p9).toBeVisible(NAV);
      await shoot(page, `${label}-P9-standard-low`);
      await p9.getByRole("button", { name: "Top up" }).click();
      await expect(page.getByTestId("prompt-P10")).toBeVisible(NAV);
      await shoot(page, `${label}-P10-topup`);
    });

    test("P11 cancel options", async ({ page }) => {
      const key = process.env.STRIPE_SECRET_KEY ?? "";
      test.skip(!key.startsWith("sk_test_"), "Needs a Stripe test key");
      const stripe = new Stripe(key);
      const t = await teacher("Casey");
      const customer = await stripe.customers.create({
        email: t.email,
        payment_method: "pm_card_visa",
        invoice_settings: { default_payment_method: "pm_card_visa" },
      });
      customers.push(customer.id);
      const sub = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: process.env.STRIPE_PRICE_PRO_MONTHLY! }],
        metadata: { userId: t.id },
      });
      await admin
        .from("profiles")
        .update({
          plan: "pro",
          subscription_status: sub.status,
          stripe_customer_id: customer.id,
          stripe_subscription_id: sub.id,
          cancel_at_period_end: false,
          current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
        })
        .eq("id", t.id);
      await signIn(page, t);
      await page.goto("/profile/cancel");
      await expect(page.getByTestId("cancel-flow")).toHaveAttribute("data-step", "reason", NAV);
      await shoot(page, `${label}-P11-cancel`, { fullPage: label === "desktop" });
    });
  });
}
