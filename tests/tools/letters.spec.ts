import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Letters: designed pages with the date, salutation, sign-off, a trip's
 * details table and consent slip built in code. The model writes only the
 * "Re:" line and the paragraphs. Never in a request: the child's name, the
 * parent's name or the sender's.
 *
 * The screen tests answer /api/letter-writer with page.route: NOTHING IS
 * SPENT. The last test is the live run, skipped unless LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Letters");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => deleteTeacher(teacher));

async function letterRuns() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "letter-writer").order("created_at", { ascending: false });
  return data ?? [];
}

async function mockLetter(page: Page, raw: string[], answer: { subject: string; paragraphs: string[] }) {
  await page.route("**/api/letter-writer", (route) => {
    raw.push(route.request().postData() ?? "");
    return route.fulfill({ contentType: "text/plain; charset=utf-8", body: JSON.stringify(answer) });
  });
}

async function fillSender(page: Page) {
  await page.getByLabel("Your name").fill("Mrs J Patel");
  await page.getByLabel("Your role").fill("Year 5 teacher");
  await page.getByLabel("School name").fill("Oakfield Primary");
}

async function fillTrip(page: Page) {
  await page.getByTestId("letter-type").getByText("Trip or visit").click();
  await page.getByLabel("Who is going").fill("Year 5");
  await page.getByLabel("Where").fill("the Natural History Museum");
  await page.getByLabel("Date of the trip").fill("2027-03-12");
  await page.getByLabel("Leaving school").fill("08:45");
  await page.getByLabel("Back at school").fill("15:30");
  await page.getByLabel("Cost").fill("£12");
  await page.getByLabel("How to pay").fill("ParentPay");
  await page.getByLabel("Lunch").fill("A packed lunch and a waterproof coat");
  await page.getByLabel("Reply by").fill("2027-03-05");
  await page.getByLabel("Why we are going").fill("To see the fossils as part of our Rocks and Soils topic.");
  await fillSender(page);
}

const pages = (page: Page) => page.locator(".js-pages");

test("a trip letter: built salutation, details table, sign-off and consent slip, saved once", async ({ page }) => {
  const raw: string[] = [];
  await mockLetter(page, raw, {
    subject: "Year 5 trip to the Natural History Museum",
    paragraphs: ["We are delighted to tell you that Year 5 will visit the Natural History Museum.", "Please return the consent slip below and pay on ParentPay.", "If you have any questions, please contact the school office."],
  });
  await signIn(page, teacher);
  const before = (await letterRuns()).length;
  await page.goto("/tools/letter-writer");
  await fillTrip(page);
  await page.getByRole("button", { name: /generate/i }).click();

  const head = pages(page).getByTestId("letter-head");
  await expect(head).toContainText("Dear Parents and Carers,", NAV);
  await expect(head).toContainText("Re: Year 5 trip to the Natural History Museum");
  await expect(head).toContainText("Oakfield Primary");
  await expect(pages(page).locator("table")).toContainText("Friday 12 March 2027");
  await expect(pages(page).locator("table")).toContainText("8.45am");
  await expect(pages(page).getByTestId("letter-signoff")).toContainText("Yours sincerely,");
  await expect(pages(page).getByTestId("letter-signoff")).toContainText("Mrs J Patel");
  const slip = pages(page).getByTestId("reply-slip");
  await expect(slip).toContainText("Please return by: Friday 5 March 2027");
  await expect(slip).toContainText("I give permission for my child to go on the trip to the Natural History Museum on Friday 12 March 2027. I understand the cost is £12.");

  // The sender and school never went to the model.
  expect(raw).toHaveLength(1);
  const body = JSON.parse(raw[0]) as { type: string; facts: { label: string; value: string }[] };
  expect(body.type).toBe("trip");
  expect(body.facts.find((f) => f.label === "Date of the trip")?.value).toBe("Friday 12 March 2027");
  for (const s of ["Patel", "Oakfield"]) expect(raw[0]).not.toContain(s);

  await expect.poll(async () => (await letterRuns()).length, NAV).toBe(before + 1);
  const saved = JSON.parse((await letterRuns())[0].output as string);
  expect(saved.tool).toBe("letter");
  expect(saved.letter.slip.returnBy).toBe("Friday 5 March 2027");

  // Design: plain themes only, and the slip can be switched off.
  await page.getByRole("button", { name: /design/i }).first().click();
  const panel = page.getByTestId("sheet-design-panel");
  await expect(panel.getByRole("tab")).toHaveText(["Professional", "Basic"]);
  await expect(panel.getByText("Name and date lines")).toHaveCount(0);
  await panel.getByText("Reply slip").click();
  await expect(pages(page).getByTestId("reply-slip")).toHaveCount(0);
});

test("an attendance letter never sends the child's or parent's name, and keeps Jo off", async ({ page }) => {
  const raw: string[] = [];
  await mockLetter(page, raw, {
    subject: "[PUPIL]'s attendance this term",
    paragraphs: ["We are writing about [PUPIL]'s attendance this term, which is 88%.", "We would like to meet to agree how we can help."],
  });
  await signIn(page, teacher);
  await page.goto("/tools/letter-writer");
  await page.getByTestId("letter-type").getByText("Attendance", { exact: true }).click();
  await expect(page.getByTestId("letter-privacy")).toBeVisible();
  await page.getByLabel("Child's first name").fill("Amira");
  await page.getByLabel("Parent or carer's name (optional)").fill("Mrs Khan");
  await page.getByLabel("Period").fill("this autumn term");
  await page.getByLabel("Attendance", { exact: true }).fill("88%");
  await page.getByLabel("The concern").fill("Amira has missed eight days, mostly Mondays.");
  await fillSender(page);
  await page.getByRole("button", { name: /generate/i }).click();

  await expect(pages(page).getByTestId("letter-head")).toContainText("Dear Mrs Khan,", NAV);
  await expect(pages(page).getByTestId("letter-head")).toContainText("Re: Amira's attendance this term");
  await expect(pages(page)).toContainText("We are writing about Amira's attendance this term");
  await expect(pages(page).getByTestId("reply-slip")).toHaveCount(0);

  expect(raw).toHaveLength(1);
  for (const s of ["Amira", "Khan", "Patel"]) expect(raw[0], `${s} was sent`).not.toContain(s);
  expect(raw[0]).toContain("[PUPIL] has missed eight days");

  await expect(page.getByPlaceholder(/Jo is off for a letter about a named child/)).toBeVisible(NAV);
});

test("a letter saved before the uplift still opens as it was", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "letter-writer", title: "Parents", input: { recipient: "Parents", content: "Sports day is on Friday.", date: "2026-06-01", tone: "Formal" }, output: "# Letter to Parents\n\nDear Parents,\n\nSports day is on Friday 5 June." })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/letter-writer?run=${data.id}`);
  await expect(page.getByText("Sports day is on Friday 5 June.")).toBeVisible(NAV);
  await expect(page.getByTestId("letter-head")).toHaveCount(0);
  // Its free text reopens as a general letter's notes.
  await expect(page.getByLabel("What the letter needs to say")).toHaveValue("Sports day is on Friday.");
});

// ── The live run ────────────────────────────────────────────────────────────

test("LIVE: the real model writes only the body, invents nothing it was not given", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(300_000);
  await signIn(page, teacher);
  const before = (await letterRuns()).length;
  await page.goto("/tools/letter-writer");
  await fillTrip(page);
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(pages(page).getByTestId("reply-slip")).toBeVisible({ timeout: 240_000 });
  await expect.poll(async () => (await letterRuns()).length, { timeout: 120_000 }).toBe(before + 1);

  const saved = JSON.parse((await letterRuns())[0].output as string) as { title: string; sections: { blocks: { type: string; text?: string }[] }[] };
  expect(saved.title.trim().length).toBeGreaterThan(5);
  expect(saved.title).not.toMatch(/^Re:/i);
  const paragraphs = saved.sections.flatMap((s) => s.blocks.filter((b) => b.type === "text").map((b) => b.text ?? ""));
  expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  const all = paragraphs.join("\n");
  expect(all).not.toMatch(/^\s*Dear\b/m);
  expect(all).not.toMatch(/Yours (sincerely|faithfully)|Kind regards/i);
  expect(all).not.toMatch(/\[[^\]]+\]/);
  expect(all).not.toMatch(/[–—]/);
  // No cost, time or phone number it was not given.
  for (const m of all.match(/£\s?\d+(?:\.\d{2})?/g) ?? []) expect(m.replace(/\s/, "")).toBe("£12");
  expect(all).not.toMatch(/\b0\d{3,4}\s?\d{3}\s?\d{3,4}\b/);
  // Nothing about what the cost covers or how they travel: neither was given.
  expect(all).not.toMatch(/covers?\s+(the\s+)?(cost of\s+)?(transport|travel|coach|entry|admission)/i);
  expect(all).not.toMatch(/\bcoach\b/i);
});
