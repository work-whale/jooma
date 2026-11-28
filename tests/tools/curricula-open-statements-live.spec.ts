import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: a real worksheet on STAGING aligned to statements quoted in the
 * curriculum's own language (Japan's Course of Study, in Japanese). Skipped
 * unless LIVE_MODEL=1 (a few pence).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/curricula-open-statements-live --workers=1
 *
 * The risk: the statements sit late in the prompt, in Japanese, and could pull
 * the worksheet into Japanese. Checked: the request carries the Japanese
 * statement, the worksheet renders, it teaches that statement (area units),
 * and it is in English with no Japanese script.
 *
 * Re-diff tool_settings (staging against production) before trusting a run.
 * Results go to docs/screenshots/2026-11-28-open-statements-live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-28-open-statements-live");
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
  if (results.length) writeFileSync(join(OUT, `results-${Date.now()}.json`), JSON.stringify(results, null, 2) + "\n");
  for (const p of people) await deleteTeacher(p);
});

test("LIVE japan: a worksheet aligned to a Japanese statement is written in English and teaches it", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
  test.setTimeout(600_000);
  const t = await createTeacher("LvJpCos");
  people.push(t);
  await setPlan(t, "max", "paying");
  for (const key of KEYS) await setSwitch(key, true);
  await admin.from("profiles").update({ curriculum_id: "japan", curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
  // The topic matcher answers "no match", so the teacher's own tick is what is sent.
  await page.route("**/api/suggest-subject", (route) => route.fulfill({ json: { subject: "", strand: "", statementIds: [] } }));

  await signIn(page, t);
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Japanese Course of Study (MEXT)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Elementary 4");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Units of area");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await card.getByLabel("Subject").selectOption("Mathematics", NAV);
  await card.getByRole("checkbox", { name: /面積の単位（平方センチメートル（cm²）/ }).click();

  const sentReq = page.waitForRequest((r) => r.url().includes("/api/worksheet-generator") && r.method() === "POST", NAV);
  await page.locator("[data-jo-generate]").click();
  const body = (await sentReq).postDataJSON();
  expect(body.curriculumAlign.statements.map((s: { id: string }) => s.id)).toEqual(["jp-cos-10e5f805c0"]);

  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", LIVE);
  const text = (await page.getByTestId("sheet-document").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: join(OUT, "japan-elementary4-area.png"), fullPage: true });
  results.push({ case: "japan-elementary4-area", chars: text.length, excerpt: text.slice(0, 1200) });

  expect(text.length).toBeGreaterThan(300);
  // It teaches the ticked statement: units of area.
  expect(text).toMatch(/square (centi)?met(re|er)s?|cm²|cm2|m²|km²/i);
  // In English, with no Japanese script, and not in England's framing.
  expect(text).toMatch(/\b(the|and|of|to)\b.*\b(the|and|of|to)\b.*\b(the|and|of|to)\b/i);
  expect(text, "Japanese or Chinese script").not.toMatch(/[぀-ヿ一-鿿]/);
  expect(text).not.toMatch(/Key Stage|\bKS[1-4]\b|\bYear [0-9]/);
});
