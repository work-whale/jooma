import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: real worksheets on STAGING for Stage 3 batch D (Latin America). Skipped
 * unless LIVE_MODEL=1 (a few pence per worksheet).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-stage3-d-live --workers=1
 *
 *   - Mexico with Spanish chosen (its default): the worksheet is in Spanish,
 *     with Latin American usage (no vosotros forms, no "ordenador").
 *   - Brazil with Brazilian Portuguese chosen (its default): in Portuguese.
 *   - Chile with English chosen: stays in English. Proves the Spanish usage
 *     note ("If you write in Spanish ...") does not switch the output language.
 *
 * Latin America and the batch D switch are on for the test, put back in
 * `afterAll`. Results go to docs/screenshots/2026-11-28-curricula-stage3-d-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-28-curricula-stage3-d-live");

const CASES = [
  { id: "mexico", label: "Mexican Curriculum (Nueva Escuela Mexicana)", year: "Primaria 4", language: "es" },
  { id: "brazil", label: "Brazilian Curriculum (BNCC)", year: "4º ano", language: "pt-BR" },
  { id: "chile", label: "Chilean Curriculum (Bases Curriculares)", year: "4º básico", language: "en-GB" },
] as const;

const KEYS = ["curricula_latin_america", "curricula_s3_d"];
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
  test(`LIVE ${c.id}: a worksheet in ${c.language}, for the system`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await createTeacher(`Lv${c.id.slice(0, 6)}`);
    people.push(t);
    await setPlan(t, "max", "paying");
    for (const key of KEYS) await setSwitch(key, true);
    await admin.from("profiles").update({ curriculum_id: c.id, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
    await page.addInitScript((value) => localStorage.setItem("ll:language", JSON.stringify(value)), c.language);
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
    if (c.language === "es") {
      expect(text).not.toMatch(/I am learning to/);
      expect(count(text, /\b(los|las|una|con|para|del)\b/gi), "Spanish words").toBeGreaterThan(5);
      // Latin American, not Spain: no vosotros forms and no "ordenador".
      expect(text).not.toMatch(/\b(vosotros|vosotras|habéis|podéis|sois|tenéis|ordenador)\b/i);
    } else if (c.language === "pt-BR") {
      expect(text).not.toMatch(/I am learning to/);
      expect(count(text, /\b(uma|com|não|para|são)\b/gi), "Portuguese words").toBeGreaterThan(5);
      expect(count(text, /\b(los|las|del|una)\b/gi), "Spanish words").toBeLessThan(4);
    } else {
      // English chosen: the Spanish usage note must not pull it into Spanish.
      expect(text).toMatch(/I am learning to [a-z]+ [a-z]+/);
      expect(count(text, /\b(los|las|una|con|para|del)\b/gi), "Spanish words").toBeLessThan(4);
    }
  });
}
