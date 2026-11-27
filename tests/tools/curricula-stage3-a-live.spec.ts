import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: real worksheets on STAGING for Stage 3 batch A
 * (docs/curricula-stage3-build.md A.11). Skipped unless LIVE_MODEL=1 (it spends
 * real model money, a few pence per worksheet).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-stage3-a-live --workers=1
 *
 * Egypt (its own year names, Preparatory 2) and Türkiye (under Europe, on a
 * rolling curriculum), as a plain paying teacher with the region AND the batch A
 * switch on for the test, put back in `afterAll`. Checked: the request carries
 * the curriculum, the worksheet parses and renders, the text never falls back
 * to England's framing or year names, and it is in English, not the country's
 * teaching language.
 *
 * Re-diff tool_settings (staging against production) before trusting a run.
 * A results file goes to docs/screenshots/2026-11-27-curricula-stage3-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-27-curricula-stage3-live");

const CASES = [
  { id: "egypt", region: "middle-east", label: "Egyptian National Curriculum (Education 2.0)", year: "Preparatory 2" },
  { id: "turkey", region: "europe", label: "Turkish National Curriculum (Türkiye Century Education Model)", year: "Grade 7" },
] as const;

const KEYS = ["curricula_middle_east", "curricula_europe", "curricula_s3_a"];
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
  test(`LIVE ${c.id}: a worksheet is written for the system, not for England`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await createTeacher(`Lv${c.id.slice(0, 6)}`);
    people.push(t);
    await setPlan(t, "max", "paying");
    await setSwitch(`curricula_${c.region.replace(/-/g, "_")}`, true);
    await setSwitch("curricula_s3_a", true);
    await admin.from("profiles").update({ curriculum_id: c.id, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
    await signIn(page, t);
    await page.goto("/tools/worksheet-generator", NAV);
    await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue(c.label, NAV);
    await page.getByLabel("Year group", { exact: true }).selectOption(c.year);
    await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
    await page.getByLabel("Learning objective", { exact: true }).fill("Solving simple linear equations");

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
    // Written in English (the default), not the country's teaching language.
    // The first live run (2026-11-27) came back in Turkish and still passed
    // every check above, so these are the ones that would have caught it.
    expect(text).toMatch(/I am learning to [a-z]+ [a-z]+/);
    expect(text, "Turkish letters").not.toMatch(/[şğıŞĞİ]/);
    expect(text, "Arabic script").not.toMatch(/[\u0600-\u06FF]/);
  });
}
