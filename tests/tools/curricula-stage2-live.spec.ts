import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: one real worksheet on STAGING for each new Stage 2 region (plan
 * section 4, "Live"). Skipped unless LIVE_MODEL=1 (it spends real model money,
 * a few pence per worksheet).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-stage2-live --workers=1
 *
 * A mock never proves the model accepts the prompt, so this makes one real
 * generation for each of South Africa, India (CBSE), Jamaica, Malta, the
 * UAE, the Philippines and Singapore, as a plain paying teacher whose region
 * switch is turned on for the test and off again in `finally` and `afterAll`.
 * Checked: the worksheet request carries the curriculum, the response parses
 * and the worksheet renders, and the text never falls back to England's
 * framing ("Key Stage", "Ofsted", "KS2") or England's year names ("Year 4"),
 * except Malta, which really does call its years "Year 4", and the
 * Philippines, which really does have "Key Stage" 1 to 4.
 *
 * Re-diff tool_settings (staging against production) before trusting a run.
 * A results file goes to docs/screenshots/2026-11-25-curricula-stage2-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-25-curricula-stage2-live");

const CASES = [
  { id: "south-africa", region: "africa", label: "South African Curriculum (CAPS)", year: "Grade 4", yearNamesAreEngland: false, keyStageIsReal: false },
  { id: "india-cbse", region: "asia", label: "Indian Curriculum (CBSE)", year: "Class 4", yearNamesAreEngland: false, keyStageIsReal: false },
  { id: "jamaica", region: "caribbean", label: "Jamaican Curriculum (National Standards Curriculum)", year: "Grade 4", yearNamesAreEngland: false, keyStageIsReal: false },
  { id: "malta", region: "europe", label: "Maltese Curriculum (National Curriculum Framework)", year: "Year 4", yearNamesAreEngland: true, keyStageIsReal: false },
  { id: "uae-moe", region: "middle-east", label: "UAE Ministry of Education Curriculum", year: "Grade 4", yearNamesAreEngland: false, keyStageIsReal: false },
  // The Philippines really has "Key Stage 1 to 4" (Grades 4 to 6 are Key Stage 2), so only England's "KS2" shorthand is banned there.
  { id: "philippines", region: "asia", label: "Philippine Curriculum (MATATAG, DepEd)", year: "Grade 4", yearNamesAreEngland: false, keyStageIsReal: true },
  { id: "singapore", region: "asia", label: "Singapore Curriculum (MOE)", year: "Primary 4", yearNamesAreEngland: false, keyStageIsReal: false },
] as const;

const SWITCH_KEYS = [...new Set(CASES.map((c) => `curricula_${c.region.replace(/-/g, "_")}`))];
const switchKey = (region: string) => `curricula_${region.replace(/-/g, "_")}`;
const setSwitch = (key: string, value: boolean) => admin.from("app_settings").update({ value }).eq("key", key);

const people: TestTeacher[] = [];
const results: Record<string, unknown>[] = [];

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
test.afterAll(async () => {
  // The switches are off again whatever happened.
  for (const key of SWITCH_KEYS) await setSwitch(key, false);
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2) + "\n");
  for (const p of people) await deleteTeacher(p);
});

for (const c of CASES) {
  test(`LIVE ${c.id}: a worksheet is written for the system, not for England`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await createTeacher(`Lv${c.id.replace(/-/g, "").slice(0, 6)}`);
    people.push(t);
    await setPlan(t, "max", "paying");
    try {
      await setSwitch(switchKey(c.region), true);
      await admin.from("profiles").update({ curriculum_id: c.id, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
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
      results.push({ case: c.id, chars: text.length, excerpt: text.slice(0, 900) });

      expect(text.length).toBeGreaterThan(300);
      if (!c.keyStageIsReal) expect(text).not.toMatch(/Key Stage/);
      expect(text).not.toMatch(/Ofsted/);
      expect(text).not.toMatch(/KS2/);
      if (!c.yearNamesAreEngland) expect(text).not.toMatch(/\bYear [0-9]/);
    } finally {
      await setSwitch(switchKey(c.region), false);
    }
  });
}
