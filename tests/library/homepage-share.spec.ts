import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  createTeacher,
  deleteTeacher,
  seedResource,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Offering a resource for the homepage's "Made with Jooma" row from the
 * Library, not only from the prompt after a generation.
 *
 * Only the kinds the row can show get the menu item (slides, comprehensions,
 * worksheets). Yes queues it for an admin exactly as the prompt does, through
 * set_showcase_consent, and the menu then says where it stands; withdrawing is
 * one click from there.
 *
 * Needs the showcase migration on the database these tests hit, as
 * tests/growth/showcase.spec.ts does, and skips without it.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
const NAV = { timeout: 90_000 };

let migrated = false;
let teacher: TestTeacher;
let comprehensionId: string;
const comprehensionTitle = `Homepage share ${Date.now().toString(36)}`;
const planTitle = `Not shareable ${Date.now().toString(36)}`;

test.beforeAll(async () => {
  const { error } = await admin.from("showcase_items").select("id").limit(1);
  migrated = !error;
  if (!migrated) return;

  teacher = await createTeacher("Sharer");
  const { data, error: insErr } = await admin
    .from("tool_runs")
    .insert({
      user_id: teacher.id,
      tool_slug: "comprehension-generator",
      title: comprehensionTitle,
      input: { topic: comprehensionTitle, yearGroup: "Year 5" },
      output: "A short passage, then three questions.",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  comprehensionId = data.id as string;
  // A lesson plan: a kind the homepage row cannot show.
  await seedResource(teacher, planTitle);
});

test.afterAll(async () => {
  if (!migrated) return;
  // Cascades to the showcase row.
  await deleteTeacher(teacher);
});

/** Open the "..." menu on the Library card with this title. */
async function openMenu(page: Page, title: string) {
  await page.goto("/folders");
  // The draggable card itself, not the face and title inside it, whose class
  // names also contain "filecard".
  const card = page.locator('div[draggable="true"]', { hasText: title });
  await expect(card).toBeVisible(NAV);
  await card.getByRole("button", { name: /menu$/i }).click();
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();
  return menu;
}

async function statusOf(runId: string): Promise<string | null> {
  const { data } = await admin
    .from("showcase_items")
    .select("status")
    .eq("tool_run_id", runId)
    .maybeSingle();
  return (data?.status as string | undefined) ?? null;
}

test("a kind the homepage cannot show has no homepage item", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");
  await signIn(page, teacher);
  const menu = await openMenu(page, planTitle);
  await expect(menu.getByRole("menuitem", { name: /homepage/i })).toHaveCount(0);
});

test("Yes, after the consent wording, queues it for review", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");
  await signIn(page, teacher);
  const menu = await openMenu(page, comprehensionTitle);
  await menu.getByRole("menuitem", { name: "Share on Jooma homepage" }).click();

  const dialog = page.getByRole("dialog", { name: "Share on the Jooma homepage?" });
  await expect(dialog).toBeVisible();
  // The same thing the after-generation prompt says before they answer.
  await expect(dialog).toContainText("full name, subject, year group and country");
  await dialog.getByRole("button", { name: "Yes, share it" }).click();
  await expect(dialog).toHaveCount(0);

  await expect.poll(() => statusOf(comprehensionId)).toBe("pending");
  const { data } = await admin
    .from("showcase_items")
    .select("kind, consent, title")
    .eq("tool_run_id", comprehensionId)
    .single();
  expect(data).toMatchObject({ kind: "comprehension", consent: true, title: comprehensionTitle });

  // The menu now says where it stands.
  const again = await openMenu(page, comprehensionTitle);
  await expect(again.getByRole("menuitem", { name: "Homepage: waiting for review" })).toBeVisible();
});

test("withdrawing is one click, and it can be offered again", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");
  await signIn(page, teacher);
  const menu = await openMenu(page, comprehensionTitle);
  await menu.getByRole("menuitem", { name: "Homepage: waiting for review" }).click();

  const dialog = page.getByRole("dialog", { name: "Waiting for review" });
  await dialog.getByRole("button", { name: "Withdraw" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => statusOf(comprehensionId)).toBe("withdrawn");

  const again = await openMenu(page, comprehensionTitle);
  await expect(again.getByRole("menuitem", { name: "Share on Jooma homepage" })).toBeVisible();
});
