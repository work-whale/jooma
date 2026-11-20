import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, seedResource, signIn, type TestTeacher } from "../support/users";

/*
 * Share a resource by link, from the Library: WhatsApp, Viber, Messenger,
 * Instagram, Copy link.
 *
 * The main path: Library menu, Share, Link, Create link; the WhatsApp button
 * carries the real link; a signed-out visitor opens it and sees the resource
 * with no teacher name and no private input; another teacher saves a copy;
 * Turn off link and the page is a 404.
 *
 * Must never happen: a report (pupil details) offering a Link at all, and the
 * owner's name or a private field reaching the public page.
 *
 * The URL building per app and device is unit tested in
 * tests/unit/resource-links.spec.ts, and the database rules by
 * scripts/verify-resource-links.mjs. Opening the apps themselves cannot be
 * tested headless and is left out.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
const NAV = { timeout: 90_000 };

let owner: TestTeacher | null = null;
let saver: TestTeacher | null = null;
const stamp = Date.now().toString(36);
const TITLE = `Share link ${stamp}`;
const REPORT = `Class reports ${stamp}`;
const SECRET = `private-note-${stamp}`;
let linkUrl = "";

test.beforeAll(async () => {
  owner = await createTeacher("Linkowner");
  saver = await createTeacher("Linksaver");
  const { error } = await admin.from("tool_runs").insert({
    user_id: owner.id,
    tool_slug: "worksheet-generator",
    title: TITLE,
    input: { topic: TITLE, yearGroup: "Year 4", subject: "Maths", notes: SECRET },
    output: `# ${TITLE}\n\n1. What is 7 times 8?\n2. What is 9 times 6?`,
  });
  if (error) throw new Error(error.message);
  const reportId = await seedResource(owner, REPORT, "Amelia worked hard this term.");
  await admin.from("tool_runs").update({ tool_slug: "report-writer" }).eq("id", reportId);
});

test.afterAll(async () => {
  await deleteTeacher(owner);
  await deleteTeacher(saver);
});

test("make a link, share it, a stranger opens it, then turn it off", async ({ page, browser }) => {
  await signIn(page, owner!);
  await page.goto("/folders", NAV);
  await page.getByRole("button", { name: `${TITLE} menu` }).first().click(NAV);
  await page.getByRole("menuitem", { name: "Share", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Share", exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "Link" }).click();
  await dialog.getByRole("button", { name: "Create link" }).click();

  const urlBox = dialog.getByTestId("share-link-url");
  await expect(urlBox).toHaveValue(/\/share\/[A-Za-z0-9_-]{22}$/);
  linkUrl = await urlBox.inputValue();

  // WhatsApp carries the title and the real link.
  const wa = dialog.locator('[data-target="whatsapp"]');
  const href = await wa.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(new URL(href!).searchParams.get("text")).toBe(`${TITLE}\n${linkUrl}`);
  for (const id of ["viber", "messenger", "instagram", "copy"]) {
    await expect(dialog.locator(`[data-target="${id}"]`)).toBeVisible();
  }

  // Closing and reopening shows the same link, not a new one.
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: `${TITLE} menu` }).first().click();
  await page.getByRole("menuitem", { name: "Share", exact: true }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "Link" }).click();
  await expect(page.getByRole("dialog").getByTestId("share-link-url")).toHaveValue(linkUrl);
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  // A stranger, signed out.
  const stranger = await browser.newContext({ storageState: "tests/support/consent-state.json" });
  const s = await stranger.newPage();
  const res = await s.goto(linkUrl, NAV);
  expect(res?.status()).toBe(200);
  await expect(s.getByRole("heading", { name: TITLE, level: 1 }).first()).toBeVisible();
  await expect(s.getByText("What is 7 times 8?")).toBeVisible();
  await expect(s.getByRole("link", { name: "Make your own" }).first()).toBeVisible();
  await expect(s.getByTestId("save-copy-signin")).toBeVisible();
  const html = await s.content();
  expect(html).not.toContain(SECRET);
  expect(html).not.toContain("Linkowner");
  expect(html).not.toContain(owner!.email);
  // Kept out of search engines, with a preview card for the chat app.
  await expect(s.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(s.locator('meta[property="og:title"]')).toHaveAttribute("content", TITLE);
  await expect(s.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /.+/);

  // Another teacher saves a copy into their own library.
  await signIn(s, saver!);
  await s.goto(linkUrl, NAV);
  await s.getByTestId("save-copy").click();
  await expect(s.getByTestId("open-copy")).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await admin.from("tool_runs").select("title, input").eq("user_id", saver!.id);
      return data ?? [];
    })
    .toHaveLength(1);
  const { data: copies } = await admin.from("tool_runs").select("title, input").eq("user_id", saver!.id);
  expect(copies![0].title).toBe(TITLE);
  expect(JSON.stringify(copies![0].input)).not.toContain(SECRET);

  // Turn it off: the link is dead for everyone.
  await page.getByRole("button", { name: `${TITLE} menu` }).first().click();
  await page.getByRole("menuitem", { name: "Share", exact: true }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "Link" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn off link" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Create link" })).toBeVisible();

  const dead = await s.goto(linkUrl, NAV);
  expect(dead?.status()).toBe(404);
  await stranger.close();
});

test("a report never offers a link", async ({ page }) => {
  await signIn(page, owner!);
  await page.goto("/folders", NAV);
  await page.getByRole("button", { name: `${REPORT} menu` }).first().click(NAV);
  await page.getByRole("menuitem", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Share with colleagues" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Link" })).toHaveCount(0);
});

test("a made-up token is a 404", async ({ page }) => {
  const res = await page.goto("/share/AAAAAAAAAAAAAAAAAAAAAA", NAV);
  expect(res?.status()).toBe(404);
  const bad = await page.goto("/share/not-a-token", NAV);
  expect(bad?.status()).toBe(404);
});
