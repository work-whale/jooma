import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: real worksheets on STAGING for Stage 3 batch C (Europe). Skipped unless
 * LIVE_MODEL=1 (a few pence per worksheet).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-stage3-c-live --workers=1
 *
 *   - France with French chosen (its default): the worksheet is in French and
 *     uses French year names. Proves the "output language is unchanged" line
 *     does not push a chosen language back to English.
 *   - Denmark, English default (Danish is not a Jooma language): in English.
 *   - Switzerland, English default though three of its languages are Jooma
 *     languages: in English.
 *
 * Europe and the batch C switch are on for the test, put back in `afterAll`.
 * Results go to docs/screenshots/2026-11-27-curricula-stage3-c-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-27-curricula-stage3-c-live");

const CASES = [
  { id: "france", label: "French National Curriculum (programmes scolaires)", year: "CM1", language: "fr" },
  { id: "denmark", label: "Danish Curriculum (Common Objectives)", year: "Grade 5", language: "en-GB" },
  { id: "switzerland", label: "Swiss Curriculum (Lehrplan 21, PER or Piano di studio)", year: "HarmoS 7", language: "en-GB" },
] as const;

const KEYS = ["curricula_europe", "curricula_s3_c"];
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

for (const c of CASES) {
  test(`LIVE ${c.id}: a worksheet in ${c.language}, for the system`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await createTeacher(`Lv${c.id.slice(0, 6)}`);
    people.push(t);
    await setPlan(t, "max", "paying");
    for (const key of KEYS) await setSwitch(key, true);
    await admin.from("profiles").update({ curriculum_id: c.id, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
    const lang = c.language;
    await page.addInitScript((value) => localStorage.setItem("ll:language", JSON.stringify(value)), lang);
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
    if (c.language === "fr") {
      // In French: the objective pattern in French, not the English one.
      expect(text).not.toMatch(/I am learning to/);
      expect(text).toMatch(/J'apprends|J’apprends|fractions?/i);
      expect(text).toMatch(/\b(les|des|une|avec)\b/);
    } else {
      expect(text).toMatch(/I am learning to [a-z]+ [a-z]+/);
      // Judged by counting words that only those languages use. Not letters: a
      // Danish name such as Søren is local colour the profile asks for. Not
      // "die" either: an English worksheet can roll a die.
      const count = (re: RegExp) => (text.match(re) ?? []).length;
      expect(count(/\b(og|ikke|til|med|det)\b/g), "Danish words").toBeLessThan(4);
      expect(count(/\b(und|nicht|oder|ist)\b/g), "German words").toBeLessThan(4);
      expect(count(/\b(avec|une|est|les)\b/g), "French words").toBeLessThan(4);
    }
  });
}
