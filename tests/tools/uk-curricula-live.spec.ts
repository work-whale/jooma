import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import cfeFirst from "@/app/lib/standards/data/cfe-first.json";
import nicKs1 from "@/app/lib/standards/data/nic-ks1.json";
import { admin, createAdmin, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * LIVE: real generations on STAGING for the UK nations' "Align to curriculum".
 * Skipped unless LIVE_MODEL=1 (it spends real model money, about a few pence
 * for the worksheets and more for the decks, which make pictures).
 *
 *   LIVE_MODEL=1 npx playwright test tests/tools/uk-curricula-live --workers=1
 *
 * A Scotland teacher (Year 4, Numeracy, MNU 1-02a ticked) and a Northern
 * Ireland teacher (Year 3, a Key Stage 1 maths requirement ticked) each make a
 * worksheet and a deck through the real screens. Nothing is stubbed: the topic
 * matcher, the worksheet route and the deck pipeline all call the model.
 * Checked: the ticked statement is sent word for word with its stage, the
 * output renders, and the output teaches what the statement says.
 *
 * Re-diff tool_settings (staging against production) before trusting a run.
 * Screenshots and a results file go to docs/screenshots/2026-11-20-uk-curricula/live/.
 */

const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };
const OUT = join(process.cwd(), "docs", "screenshots", "2026-11-20-uk-curricula", "live");

type S = { id: string; code: string; subject: string; strand: string; text: string };
const MNU = (cfeFirst as { statements: S[] }).statements.find((s) => s.code === "MNU 1-02a")!;
const NI_FRACTIONS = (nicKs1 as { statements: S[] }).statements.find((s) => s.text === "Recognise and use simple everyday fractions.")!;

const CASES = [
  {
    key: "scotland",
    curriculumId: "scotland",
    label: "Scottish Curriculum for Excellence",
    year: "Year 4",
    stage: "First level",
    subject: "Maths",
    topic: "Place value in whole numbers",
    statement: MNU,
    sentText: `MNU 1-02a: ${MNU.text}`,
    // What the statement asks for: digits, their place and value, and zero.
    follows: [/place value|place and value/i, /\bdigit/i, /\bzero\b|\b0\b/i],
  },
  {
    key: "northern-ireland",
    curriculumId: "northern-ireland",
    label: "Northern Ireland Curriculum",
    year: "Year 3",
    stage: "Key Stage 1",
    subject: "Maths",
    topic: "Simple everyday fractions",
    statement: NI_FRACTIONS,
    sentText: NI_FRACTIONS.text,
    follows: [/\bhalf\b|\bhalves\b|1\/2/i, /\bquarter|1\/4/i, /fraction/i],
  },
] as const;

const people: TestTeacher[] = [];
const results: Record<string, unknown>[] = [];

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
test.afterAll(async () => {
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2) + "\n");
  for (const p of people) await deleteTeacher(p);
});

async function teacherOn(curriculumId: string, name: string) {
  const t = await createAdmin(name);
  people.push(t);
  await setPlan(t, "max", "paying");
  await admin.from("profiles").update({ curriculum_id: curriculumId, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
  return t;
}

/** Every model and picture cost logged for the teacher, by tool. */
async function spent(userId: string) {
  const [t, a] = await Promise.all([
    admin.from("token_usage").select("tool_slug, cost_usd").eq("user_id", userId),
    admin.from("asset_cost").select("tool_slug, cost_usd").eq("user_id", userId),
  ]);
  const by: Record<string, number> = {};
  for (const r of [...(t.data ?? []), ...(a.data ?? [])]) by[r.tool_slug ?? "?"] = (by[r.tool_slug ?? "?"] ?? 0) + Number(r.cost_usd ?? 0);
  return { usd: Object.values(by).reduce((x, y) => x + y, 0), by };
}

/** Usage rows land as streams end: wait for the total to stop moving. */
async function settledSpend(userId: string) {
  let last = await spent(userId);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const now = await spent(userId);
    if (now.usd === last.usd && now.usd > 0) return now;
    last = now;
  }
  return last;
}

/** Open the card, let the real topic matcher answer, then make sure the
 *  statement is ticked. Returns what the matcher picked. */
async function tickStatement(page: Page, c: (typeof CASES)[number]) {
  const card = page.getByTestId("curriculum-alignment");
  const suggested = page.waitForResponse((r) => r.url().includes("/api/suggest-subject"), NAV);
  const asked = page.waitForRequest((r) => r.url().includes("/api/suggest-subject"), NAV);
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  const req = (await asked).postDataJSON();
  const pick = (await (await suggested).json()) as { subject: string; strand: string; statementIds: string[] };
  await expect(card.getByLabel("Year", { exact: true }).locator("option:checked")).toHaveText(`${c.stage} · ${c.year}`, NAV);
  const box = card.getByRole("checkbox", { name: new RegExp(c.statement.text.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  if (!(await box.count()) || (await box.getAttribute("aria-checked")) !== "true") {
    await card.getByLabel("Subject").selectOption(c.statement.subject);
    await card.getByLabel("Strand").selectOption(c.statement.strand);
    await expect(box).toBeVisible(NAV);
    if ((await box.getAttribute("aria-checked")) !== "true") await box.click();
  }
  await expect(box).toHaveAttribute("aria-checked", "true");
  return { req, pick, card };
}

const hits = (text: string, res: readonly RegExp[]) => res.map((r) => r.test(text));

for (const c of CASES) {
  test(`LIVE ${c.key}: a worksheet follows the ticked statement`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(600_000);
    const t = await teacherOn(c.curriculumId, `Lv${c.key.slice(0, 3)}W`);
    await signIn(page, t);
    await page.goto("/tools/worksheet-generator", NAV);
    await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue(c.label, NAV);
    await page.getByLabel("Year group", { exact: true }).selectOption(c.year);
    await page.getByLabel("Subject", { exact: true }).fill(c.subject);
    await page.getByLabel("Learning objective", { exact: true }).fill(c.topic);
    const { req, pick, card } = await tickStatement(page, c);
    // The matcher was asked with the teacher's subject, so it saw that subject's statements only.
    expect(req).toMatchObject({ curriculumId: c.curriculumId, year: c.year, subject: c.subject });
    await card.screenshot({ path: join(OUT, `${c.key}-worksheet-card.png`) });

    const sentReq = page.waitForRequest((r) => r.url().includes("/api/worksheet-generator") && r.method() === "POST", NAV);
    await page.locator("[data-jo-generate]").click();
    const body = (await sentReq).postDataJSON();
    const align = body.curriculumAlign as { stage: string; year: string; statements: { id: string; text: string }[] };
    expect(align).toMatchObject({ stage: c.stage, year: c.year });
    expect(align.statements).toContainEqual({ id: c.statement.id, text: c.sentText });

    await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", LIVE);
    const text = (await page.getByTestId("sheet-document").innerText()).replace(/\s+/g, " ");
    await page.screenshot({ path: join(OUT, `${c.key}-worksheet.png`), fullPage: true });
    const cost = await settledSpend(t.id);
    const follows = hits(text, c.follows);
    results.push({ case: `${c.key} worksheet`, matcherPick: pick, sentStatements: align.statements, follows, chars: text.length, cost, excerpt: text.slice(0, 600) });
    expect(text.length).toBeGreaterThan(300);
    expect(text).not.toMatch(/National Curriculum in England/);
    expect(follows.filter(Boolean).length, `${c.key}: ${follows}`).toBeGreaterThanOrEqual(2);
  });

  test(`LIVE ${c.key}: a deck follows the ticked statement`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (spends real money on staging).");
    test.setTimeout(900_000);
    const t = await teacherOn(c.curriculumId, `Lv${c.key.slice(0, 3)}D`);
    await signIn(page, t);
    const prefill = Buffer.from(JSON.stringify({ slug: "slideshow", fields: { topic: c.topic, year: c.year } }), "utf8")
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await page.goto(`/tools/slideshow?prefill=${prefill}`, NAV);
    const wizard = page.getByRole("dialog");
    await expect(wizard).toBeVisible(NAV);
    await wizard.getByRole("button", { name: /^Continue/ }).click();
    const { req, pick, card } = await tickStatement(page, c);
    // The slides wizard has no Subject field: the body is topic, year and curriculum.
    expect(req).toEqual({ topic: c.topic, year: c.year, curriculumId: c.curriculumId });
    await card.screenshot({ path: join(OUT, `${c.key}-deck-card.png`) });

    const deckReq = page.waitForRequest((r) => r.url().includes("/api/generate-slideshow") && r.method() === "POST", NAV);
    await wizard.getByRole("button", { name: /^Continue/ }).click();
    await wizard.getByRole("button", { name: /Generate slideshow/ }).click();
    const body = (await deckReq).postDataJSON();
    const align = body.curriculum as { stage: string; year: string; statements: { id: string; text: string }[] };
    expect(align).toMatchObject({ stage: c.stage, year: c.year });
    expect(align.statements).toContainEqual({ id: c.statement.id, text: c.sentText });

    await page.waitForURL(/\/editor\//, NAV);
    await expect(page.getByText("Deck ready", { exact: false })).toBeVisible(LIVE);
    await expect(page.getByTestId("slide-editor")).toBeVisible();
    await page.screenshot({ path: join(OUT, `${c.key}-deck-editor.png`), fullPage: true });
    const id = page.url().split("/editor/")[1].split(/[?#]/)[0];
    const { data } = await admin.from("presentations").select("slides").eq("id", id).single();
    const slides = (data?.slides ?? []) as unknown[];
    const text = JSON.stringify(slides);
    const cost = await settledSpend(t.id);
    const follows = hits(text, c.follows);
    results.push({ case: `${c.key} deck`, matcherPick: pick, sentStatements: align.statements, slides: slides.length, follows, cost });
    expect(slides.length).toBeGreaterThanOrEqual(4);
    expect(follows.filter(Boolean).length, `${c.key}: ${follows}`).toBeGreaterThanOrEqual(2);
  });
}
