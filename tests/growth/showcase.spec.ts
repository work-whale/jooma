import { test, expect } from "@playwright/test";
import {
  admin,
  asTeacher,
  createAdmin,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * "Made with Jooma": a teacher offers a resource for the landing page, an admin
 * approves it, and it appears on / and on its own public page.
 *
 * Needs 20261005000000_guest_trial_and_showcase.sql on the database these tests
 * hit. Until it is pushed every test here is skipped rather than failed, so the
 * rest of the suite stays green in the meantime.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

// One story told in order: offered, approved, public, withdrawn. Serial so a
// failure stops the rest instead of rerunning beforeAll in a fresh worker,
// which would hand the later steps a new deck with no showcase row.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const SLIDE = {
  shapes: [],
  images: [],
  background: "#ffffff",
  texts: [
    {
      id: "t1",
      x: 80,
      y: 80,
      width: 800,
      text: "Showcase test deck",
      fontSize: 40,
      fontWeight: "800",
      fontStyle: "normal",
      underline: false,
      fontFamily: "Inter, sans-serif",
      color: "#1a1a1a",
      textAlign: "left",
    },
  ],
};

let migrated = false;
let teacher: TestTeacher;
let reviewer: TestTeacher;
let deckId: string;
const title = `Showcase ${Date.now().toString(36)}`;

test.beforeAll(async () => {
  const { error } = await admin.from("showcase_items").select("id").limit(1);
  migrated = !error;
  if (!migrated) return;

  teacher = await createTeacher("Showcaser");
  reviewer = await createAdmin("Reviewer");
  await admin.from("profiles").update({ country: "England" }).eq("id", teacher.id);
  const { data, error: insErr } = await admin
    .from("presentations")
    .insert({
      user_id: teacher.id,
      title,
      slides: [SLIDE],
      generation_params: { topic: title, year: "Year 4", curriculum: { subject: "Geography" } },
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  deckId = data.id as string;
});

test.afterAll(async () => {
  if (!migrated) return;
  await deleteTeacher(teacher);
  await deleteTeacher(reviewer);
});

test("the teacher is asked once, and Yes queues it for review", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");
  await signIn(page, teacher);
  await page.goto(`/editor/${deckId}?fresh=1`);

  const prompt = page.getByTestId("share-prompt");
  await expect(prompt).toBeVisible(NAV);
  await expect(prompt).toContainText("full name");
  await prompt.getByRole("button", { name: "Yes, share it" }).click();
  await expect(prompt).toContainText("Sent for review");

  const { data } = await admin.from("showcase_items").select("status, consent, subject, year_label, region").eq("presentation_id", deckId).single();
  expect(data).toMatchObject({ status: "pending", consent: true, subject: "Geography", year_label: "Year 4", region: "England" });

  // Answered, so never asked again about this deck.
  await page.goto(`/editor/${deckId}?fresh=1`);
  await page.waitForTimeout(4000);
  await expect(page.getByTestId("share-prompt")).toHaveCount(0);
});

test("nothing is public until an admin approves it", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");
  const { data: item } = await admin.from("showcase_items").select("id, slug").eq("presentation_id", deckId).single();
  expect(item).toBeTruthy();

  // Pending: anon cannot see it.
  const anonList = await admin.rpc("public_showcase", { p_limit: 24 });
  expect((anonList.data ?? []).some((r: { slug: string }) => r.slug === item!.slug)).toBe(false);

  // A teacher cannot approve their own.
  const asOwner = await asTeacher(teacher);
  const self = await asOwner.rpc("admin_review_showcase", { p_id: item!.id, p_status: "approved", p_position: 1 });
  expect(self.error).toBeTruthy();

  // The admin approves it in the console.
  await signIn(page, reviewer);
  await page.goto("/admin/showcase?status=pending");
  const row = page.locator("li", { hasText: title });
  await expect(row).toBeVisible(NAV);
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("On the homepage.")).toBeVisible(NAV);
});

test("approved: on the landing page and its own public page, signed out", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");
  const { data: item } = await admin.from("showcase_items").select("slug, status").eq("presentation_id", deckId).single();
  expect(item?.status).toBe("approved");

  await page.goto(`/made/${item!.slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible(NAV);
  await expect(page.getByText(/Geography · Year 4 · England/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Make your own" }).first()).toHaveAttribute("href", /\/create\?tool=slides/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible(NAV);
});

test("a teacher who withdraws drops off the page", async () => {
  test.skip(!migrated, "showcase migration not pushed yet");
  const asOwner = await asTeacher(teacher);
  const { data: status, error } = await asOwner.rpc("set_showcase_consent", {
    p_kind: "slides",
    p_resource_id: deckId,
    p_consent: false,
  });
  expect(error).toBeNull();
  expect(status).toBe("withdrawn");
  const { data: item } = await admin.from("showcase_items").select("slug").eq("presentation_id", deckId).single();
  const after = await admin.rpc("public_showcase_item", { p_slug: item!.slug });
  expect(after.data ?? []).toHaveLength(0);
});
