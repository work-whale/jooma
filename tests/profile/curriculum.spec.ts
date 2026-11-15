import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  createAdmin,
  createProfilelessTeacher,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * A teacher's curriculum: set once on the profile, started from by every tool,
 * changeable on a tool for one resource.
 *
 *   - an existing teacher is started on one (inferred) and asked once
 *   - the profile's Curriculum section saves the default
 *   - tool forms start from it, and a per-tool change never touches the profile
 *   - regions outside the UK are offered only when switched on, or to admins
 *   - complete-profile saves it at signup
 *
 * Generation requests are answered by page.route: nothing reaches a model. The
 * prompt side (no change for a UK curriculum, one override for the rest) is
 * covered by tests/unit/curricula.spec.ts and curriculum-golden.spec.ts.
 *
 * Needs supabase/migrations/20261114000000_curricula.sql.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Records each request body to `path` and refuses it, so nothing generates. */
async function capture(page: Page, path: string) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${path}`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Stubbed in test" } });
  });
  return bodies;
}

async function profileRow(id: string) {
  const { data } = await admin.from("profiles").select("curriculum_id, curriculum_confirmed_at").eq("id", id).single();
  return data as { curriculum_id: string | null; curriculum_confirmed_at: string | null };
}

async function payingTeacher(name: string) {
  const t = await createTeacher(name);
  await setPlan(t, "max", "paying");
  return t;
}

const people: TestTeacher[] = [];
test.afterAll(async () => {
  for (const p of people) await deleteTeacher(p);
});

test("an existing teacher is started on England and asked once", async ({ page }) => {
  const t = await payingTeacher("CurrBanner");
  people.push(t);
  await signIn(page, t);
  await page.goto("/dashboard", NAV);

  const banner = page.getByTestId("curriculum-banner");
  await expect(banner).toContainText("National Curriculum in England", NAV);
  // Saved straight away, but not yet confirmed.
  await expect.poll(async () => (await profileRow(t.id)).curriculum_id, NAV).toBe("england");
  expect((await profileRow(t.id)).curriculum_confirmed_at).toBeNull();

  await page.getByTestId("curriculum-banner-keep").click();
  await expect(banner).toBeHidden();
  await expect.poll(async () => Boolean((await profileRow(t.id)).curriculum_confirmed_at), NAV).toBe(true);

  await page.reload();
  await expect(page.getByRole("heading").first()).toBeVisible(NAV);
  await expect(page.getByTestId("curriculum-banner")).toBeHidden();
});

test("the curriculum the browser last picked carries over", async ({ page }) => {
  const t = await payingTeacher("CurrCarry");
  people.push(t);
  await page.addInitScript(() => localStorage.setItem("ll:curriculum", JSON.stringify("Welsh Curriculum")));
  await signIn(page, t);
  await page.goto("/dashboard", NAV);
  await expect(page.getByTestId("curriculum-banner")).toContainText("Curriculum for Wales", NAV);
  await expect.poll(async () => (await profileRow(t.id)).curriculum_id, NAV).toBe("wales");
});

test("the profile sets the default every tool starts from, and a tool can change it for one resource", async ({ page }) => {
  const t = await payingTeacher("CurrDefault");
  people.push(t);
  await signIn(page, t);
  await page.goto("/profile?section=curriculum", NAV);

  // Regions are off: one select of the five UK curricula, as before.
  const picker = page.getByTestId("curriculum-picker");
  await expect(picker).toBeEnabled(NAV);
  await expect(page.getByTestId("curriculum-region")).toHaveCount(0);
  await expect(picker.locator("option:not([disabled])")).toHaveCount(5);
  await picker.selectOption("scotland");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  const saved = await profileRow(t.id);
  expect(saved.curriculum_id).toBe("scotland");
  expect(saved.curriculum_confirmed_at).not.toBeNull();
  await expect(page.getByTestId("curriculum-banner")).toBeHidden();

  // A tool opened plainly starts from the profile.
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Scottish Curriculum for Excellence", NAV);

  // Changed on the tool for one resource: that is what is sent, and the
  // profile keeps its default.
  const sent = await capture(page, "/api/worksheet-generator");
  const fields = { curriculum: "Welsh Curriculum", yearGroup: "Year 5", subject: "Science", learningObjective: "The water cycle" };
  await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`, NAV);
  const check = page.getByRole("button", { name: /check the inputs first/i });
  if (await check.isVisible({ timeout: 15_000 }).catch(() => false)) await check.click();
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Welsh Curriculum", NAV);
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Welsh Curriculum", yearGroup: "Year 5" });
  expect((await profileRow(t.id)).curriculum_id).toBe("scotland");
});

test("an admin is offered the islands and Gibraltar before they are switched on", async ({ page }) => {
  const a = await createAdmin("CurrAdmin");
  people.push(a);
  await setPlan(a, "max", "paying");
  await signIn(page, a);
  await page.goto("/profile?section=curriculum", NAV);

  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("british-isles");
  await page.getByTestId("curriculum-picker").selectOption("jersey");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  expect((await profileRow(a.id)).curriculum_id).toBe("jersey");

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  const curriculum = page.getByLabel("Curriculum", { exact: true });
  await expect(curriculum).toHaveValue("Jersey Curriculum", NAV);
  // The islands use England's year names.
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 5");
  await page.getByLabel("Subject", { exact: true }).fill("Science");
  const objective = page.getByLabel("Learning objective", { exact: true });
  await objective.fill("The water cycle");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Jersey Curriculum", yearGroup: "Year 5" });
});

test("switching a region on offers it to every teacher, and off takes it away", async ({ page }) => {
  const t = await payingTeacher("CurrRegion");
  people.push(t);
  await signIn(page, t);
  try {
    await admin.from("app_settings").update({ value: true }).eq("key", "curricula_british_isles");
    await page.goto("/profile?section=curriculum", NAV);
    const region = page.getByTestId("curriculum-region");
    await expect(region).toBeEnabled(NAV);
    await expect(region.locator("option")).toContainText(["United Kingdom", "Channel Islands, Isle of Man and Gibraltar"]);
    // Nothing from a region that is still off.
    await expect(region.locator("option", { hasText: "United States" })).toHaveCount(0);
  } finally {
    await admin.from("app_settings").update({ value: false }).eq("key", "curricula_british_isles");
  }
  await page.reload();
  await expect(page.getByTestId("curriculum-picker")).toBeEnabled(NAV);
  await expect(page.getByTestId("curriculum-region")).toHaveCount(0);
});

test("complete-profile saves the curriculum, confirmed", async ({ page }) => {
  const t = await createProfilelessTeacher("CurrSignup");
  people.push(t);
  await signIn(page, t);
  await page.goto("/complete-profile", NAV);

  const picker = page.getByTestId("curriculum-picker");
  await expect(picker).toHaveValue("england", NAV);
  await picker.selectOption("northern-ireland");

  await page.getByLabel("First name").fill("Signup");
  await page.getByLabel("Surname").fill("Testcase");
  await page.getByLabel("Phone number").fill("7700900123");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect.poll(async () => (await profileRow(t.id))?.curriculum_id, NAV).toBe("northern-ireland");
  expect((await profileRow(t.id)).curriculum_confirmed_at).not.toBeNull();
});

test("a US teacher picks their state, and their tools use grades", async ({ page }) => {
  const a = await createAdmin("CurrUS");
  people.push(a);
  await setPlan(a, "max", "paying");
  await signIn(page, a);
  await page.goto("/profile?section=curriculum", NAV);

  await page.getByTestId("curriculum-region").selectOption("usa");
  // The second step is named for the region.
  await expect(page.getByText("State", { exact: true })).toBeVisible();
  const picker = page.getByTestId("curriculum-picker");
  await expect(picker.locator("option:not([disabled])")).toHaveCount(52);
  await picker.selectOption("us-tx");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  expect((await profileRow(a.id)).curriculum_id).toBe("us-tx");

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Texas: TEKS (Texas Essential Knowledge and Skills)", NAV);
  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["Pre-K", "Kindergarten", "Grade 3", "Grade 12"]);
  await year.selectOption("Grade 3");
  await page.getByLabel("Subject", { exact: true }).fill("Math");
  await page.getByLabel("Learning objective", { exact: true }).fill("Equivalent fractions");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Texas: TEKS (Texas Essential Knowledge and Skills)", yearGroup: "Grade 3" });
});
