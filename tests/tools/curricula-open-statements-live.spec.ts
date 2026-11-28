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
// Asia and batch B (Japan, Taiwan), Europe and batch C (Norway): put back after.
const KEYS = ["curricula_asia", "curricula_s3_b", "curricula_europe", "curricula_s3_c"];
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

test("LIVE norway: a worksheet aligned to an LK20 aim teaches it, in English, with no England framing", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
  test.setTimeout(600_000);
  const t = await createTeacher("LvNoLk20");
  people.push(t);
  await setPlan(t, "max", "paying");
  for (const key of KEYS) await setSwitch(key, true);
  await admin.from("profiles").update({ curriculum_id: "norway", curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
  await page.route("**/api/suggest-subject", (route) => route.fulfill({ json: { subject: "", strand: "", statementIds: [] } }));

  await signIn(page, t);
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Norwegian Curriculum (LK20)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Grade 5");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Fractions, decimals and percentages");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await card.getByLabel("Subject").selectOption("Mathematics", NAV);
  await card.getByRole("checkbox", { name: /relationships between fractions, decimals, and percentages/ }).click();

  const sentReq = page.waitForRequest((r) => r.url().includes("/api/worksheet-generator") && r.method() === "POST", NAV);
  await page.locator("[data-jo-generate]").click();
  const body = (await sentReq).postDataJSON();
  expect(body.curriculumAlign.statements.map((s: { id: string }) => s.id)).toEqual(["no-lk20-km13265"]);

  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", LIVE);
  const text = (await page.getByTestId("sheet-document").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: join(OUT, "norway-grade5-fractions.png"), fullPage: true });
  results.push({ case: "norway-grade5-fractions", chars: text.length, excerpt: text.slice(0, 1200) });

  expect(text.length).toBeGreaterThan(300);
  expect(text).toMatch(/fraction/i);
  expect(text).toMatch(/decimal|percent|%/i);
  expect(text).toMatch(/\b(the|and|of|to)\b.*\b(the|and|of|to)\b.*\b(the|and|of|to)\b/i);
  expect(text).not.toMatch(/Key Stage|\bKS[1-4]\b|\bYear [0-9]/);
});

test("LIVE taiwan: a worksheet aligned to a Chinese statement is written in English and teaches it", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
  test.setTimeout(600_000);
  const t = await createTeacher("LvTw108");
  people.push(t);
  await setPlan(t, "max", "paying");
  for (const key of KEYS) await setSwitch(key, true);
  await admin.from("profiles").update({ curriculum_id: "taiwan", curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
  await page.route("**/api/suggest-subject", (route) => route.fulfill({ json: { subject: "", strand: "", statementIds: [] } }));

  await signIn(page, t);
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Taiwan 12-Year Basic Education Curriculum (108 curriculum)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Grade 8");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Right-angled triangles");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await card.getByLabel("Subject").selectOption("Mathematics", NAV);
  await card.getByRole("checkbox", { name: /畢氏定理：畢氏定理（勾股弦定理、商高定理）/ }).click();

  const sentReq = page.waitForRequest((r) => r.url().includes("/api/worksheet-generator") && r.method() === "POST", NAV);
  await page.locator("[data-jo-generate]").click();
  const body = (await sentReq).postDataJSON();
  expect(body.curriculumAlign.statements.map((s: { id: string }) => s.id)).toEqual(["tw-108-zh-ce31a3ca1d"]);

  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", LIVE);
  const text = (await page.getByTestId("sheet-document").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: join(OUT, "taiwan-grade8-pythagoras.png"), fullPage: true });
  results.push({ case: "taiwan-grade8-pythagoras", chars: text.length, excerpt: text.slice(0, 1200) });

  expect(text.length).toBeGreaterThan(300);
  // It teaches the ticked statement: Pythagoras' theorem.
  expect(text).toMatch(/Pythagor|hypotenuse/i);
  // In English, with no Chinese script, and not in England's framing.
  expect(text).toMatch(/\b(the|and|of|to)\b.*\b(the|and|of|to)\b.*\b(the|and|of|to)\b/i);
  expect(text, "Chinese or Japanese script").not.toMatch(/[぀-ヿ一-鿿]/);
  expect(text).not.toMatch(/Key Stage|\bKS[1-4]\b|\bYear [0-9]/);
});
