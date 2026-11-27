import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: real worksheets on STAGING for Stage 3 batch B (Asia). Skipped unless
 * LIVE_MODEL=1 (a few pence per worksheet).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-stage3-b-live --workers=1
 *
 * Japan (its own year names, Junior High 2), Thailand (romanised year names,
 * Mathayom 2) and Sri Lanka (Grade 1 at five, so Grade 7 is age 11), as a
 * paying teacher with Asia and the batch B switch on for the test, put back in
 * `afterAll`. Checked: the request carries the curriculum, the worksheet
 * renders, it never falls back to England's framing or year names, and it is in
 * English, not Japanese, Thai or Sinhala.
 *
 * Re-diff tool_settings (staging against production) before trusting a run.
 * Results go to docs/screenshots/2026-11-27-curricula-stage3-b-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-27-curricula-stage3-b-live");

const CASES = [
  { id: "japan", label: "Japanese Course of Study (MEXT)", year: "Junior High 2" },
  { id: "thailand", label: "Thai Basic Education Core Curriculum", year: "Mathayom 2" },
  { id: "sri-lanka", label: "Sri Lankan National Curriculum", year: "Grade 7" },
] as const;

const KEYS = ["curricula_asia", "curricula_s3_b"];
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
  if (results.length) writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2) + "\n");
  for (const p of people) await deleteTeacher(p);
});

for (const c of CASES) {
  test(`LIVE ${c.id}: a worksheet is written for the system, in English`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await createTeacher(`Lv${c.id.replace(/-/g, "").slice(0, 6)}`);
    people.push(t);
    await setPlan(t, "max", "paying");
    for (const key of KEYS) await setSwitch(key, true);
    await admin.from("profiles").update({ curriculum_id: c.id, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
    await signIn(page, t);
    await page.goto("/tools/worksheet-generator", NAV);
    await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue(c.label, NAV);
    await page.getByLabel("Year group", { exact: true }).selectOption(c.year);
    await page.getByLabel("Subject", { exact: true }).fill("Science");
    await page.getByLabel("Learning objective", { exact: true }).fill("Parts of a plant and what they do");

    const sentReq = page.waitForRequest((r) => r.url().includes("/api/worksheet-generator") && r.method() === "POST", NAV);
    await page.locator("[data-jo-generate]").click();
    const body = (await sentReq).postDataJSON();
    expect(body).toMatchObject({ curriculum: c.label, yearGroup: c.year });

    await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", LIVE);
    const text = (await page.getByTestId("sheet-document").innerText()).replace(/\s+/g, " ");
    await page.screenshot({ path: join(OUT, `${c.id}-worksheet.png`), fullPage: true });
    results.push({ case: c.id, chars: text.length, excerpt: text.slice(0, 900) });

    expect(text.length).toBeGreaterThan(300);
    expect(text).not.toMatch(/Key Stage/);
    expect(text).not.toMatch(/Ofsted/);
    expect(text).not.toMatch(/\bKS[1-4]\b/);
    expect(text).not.toMatch(/\bYear [0-9]/);
    expect(text).not.toMatch(/GCSE/);
    // In English, not the country's teaching language.
    expect(text).toMatch(/I am learning to [a-z]+ [a-z]+/);
    expect(text, "Japanese or Chinese script").not.toMatch(/[぀-ヿ一-鿿]/);
    expect(text, "Thai script").not.toMatch(/[฀-๿]/);
    expect(text, "Sinhala script").not.toMatch(/[඀-෿]/);
  });
}
