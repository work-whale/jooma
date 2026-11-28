import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: real worksheets on STAGING for Stage 3 batch E (the rest of Africa).
 * Skipped unless LIVE_MODEL=1 (a few pence per worksheet).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-stage3-e-live --workers=1
 *
 *   - Tanzania, English default: in English, though primary schools teach in
 *     Kiswahili and the context says so.
 *   - Rwanda, English default: in English, though early primary is taught in
 *     Kinyarwanda.
 *   - Zambia: in English, with a year from the transition list (Form 2).
 *
 * Africa and the batch E switch are on for the test, put back in `afterAll`.
 * Results go to docs/screenshots/2026-11-28-curricula-stage3-e-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-28-curricula-stage3-e-live");

const CASES = [
  { id: "tanzania", label: "Tanzanian Curriculum (Tanzania Institute of Education)", year: "Standard 4" },
  { id: "rwanda", label: "Rwandan Competence-Based Curriculum (REB)", year: "P4" },
  { id: "zambia", label: "Zambian Competence-Based Curriculum", year: "Form 2" },
] as const;

const KEYS = ["curricula_africa", "curricula_s3_e"];
const setSwitch = (key: string, value: unknown) => admin.from("app_settings").update({ value }).eq("key", key);

const before: Record<string, unknown> = {};
const people: TestTeacher[] = [];
const results: Record<string, unknown>[] = [];

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const { data } = await admin.from("app_settings").select("key, value").in("key", KEYS);
  for (const row of data ?? []) before[row.key] = row.value;
});
test.afterAll(async () => {
  for (const key of KEYS) if (key in before) await setSwitch(key, before[key]);
  // One file per run, so a later run never overwrites an earlier failure.
  if (results.length) writeFileSync(join(OUT, `results-${Date.now()}.json`), JSON.stringify(results, null, 2) + "\n");
  for (const p of people) await deleteTeacher(p);
});

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

for (const c of CASES) {
  test(`LIVE ${c.id}: a worksheet in English, for the system`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await createTeacher(`Lv${c.id.slice(0, 6)}`);
    people.push(t);
    await setPlan(t, "max", "paying");
    for (const key of KEYS) await setSwitch(key, true);
    await admin.from("profiles").update({ curriculum_id: c.id, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
    await page.addInitScript(() => localStorage.setItem("ll:language", JSON.stringify("en-GB")));
    await signIn(page, t);
    await page.goto("/tools/worksheet-generator", NAV);
    await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue(c.label, NAV);
    await page.getByLabel("Year group", { exact: true }).selectOption(c.year);
    await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
    await page.getByLabel("Learning objective", { exact: true }).fill("Adding fractions with the same denominator");

    const sentReq = page.waitForRequest((r) => r.url().includes("/api/worksheet-generator") && r.method() === "POST", NAV);
    await page.locator("[data-jo-generate]").click();
    const body = (await sentReq).postDataJSON();
    expect(body).toMatchObject({ curriculum: c.label, yearGroup: c.year });

    await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", LIVE);
    const text = (await page.getByTestId("sheet-document").innerText()).replace(/\s+/g, " ");
    await page.screenshot({ path: join(OUT, `${c.id}-worksheet.png`), fullPage: true });
    results.push({ case: c.id, chars: text.length, text });

    expect(text.length).toBeGreaterThan(300);
    expect(text).not.toMatch(/Key Stage|Ofsted|GCSE/);
    expect(text).not.toMatch(/\bKS[1-4]\b/);
    expect(text).not.toMatch(/\bYear [0-9]/);
    expect(text).toMatch(/I am learning to [a-z]+ [a-z]+/);
    // Judged by words only those languages use, so local names stay allowed.
    expect(count(text, /\b(kwa|katika|hii|ni|na)\b/gi), "Kiswahili words").toBeLessThan(4);
    expect(count(text, /\b(kandi|cyangwa|ni|mu)\b/gi), "Kinyarwanda words").toBeLessThan(4);
  });
}
