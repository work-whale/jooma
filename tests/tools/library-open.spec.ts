import { test, expect } from "@playwright/test";
import {
  admin,
  connect,
  createTeacher,
  deleteTeacher,
  seedResource,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Opening a resource a colleague shared, once it is in your library.
 *
 * The Library used to read these through SharedResourceModal, the same
 * read-only dialog the Colleagues feed uses. That dialog exists so a teacher
 * can judge an offer BEFORE accepting it. By the time a share reaches the
 * Library it has been added, so it is the teacher's own copy, and the dialog
 * made it the one resource in their library they could not edit.
 *
 * Two halves, and both matter: the Library opens the tool page, and Colleagues
 * still opens the dialog. Fixing the first by breaking the second would lose
 * the add-or-dismiss decision entirely.
 */

let alice: TestTeacher;
let bob: TestTeacher;

test.beforeAll(async () => {
  alice = await createTeacher("Alice");
  bob = await createTeacher("Bob");
  /*
   * Connected, and not incidentally: sender names are read through
   * colleague_profiles, which only answers for CURRENT connections (see
   * listSharedWithMe). Without this the share still arrives, but its sender is
   * unreadable and the dialog says "a colleague" instead of the name.
   */
  await connect(alice, bob);
});

test.afterAll(async () => {
  await deleteTeacher(alice);
  await deleteTeacher(bob);
});

const BODY = "# Rivers\n\nThe body of the shared lesson.\n\n## Erosion\n\nMore body.";

/**
 * A share that Bob has already added to his library.
 *
 * saved_run_id is what makes it a LIBRARY row rather than a pending offer:
 * sharedRunsById() keys on it, and the Folders page reads that map to mark a
 * row as having come from a colleague. A share without it is still in the feed.
 */
async function shareAlreadyAdded(): Promise<string> {
  const sourceRunId = await seedResource(alice, "Alice's rivers lesson", BODY);
  // Bob's own copy, which is what "added to the library" produces.
  const savedRunId = await seedResource(bob, "Alice's rivers lesson", BODY);

  const { error } = await admin.from("shares").insert({
    sender_id: alice.id,
    recipient_id: bob.id,
    source_run_id: sourceRunId,
    tool_slug: "lesson-planner",
    title: "Alice's rivers lesson",
    input: {},
    output: BODY,
    saved_at: new Date().toISOString(),
    saved_run_id: savedRunId,
  });
  if (error) throw new Error(`Could not seed a share: ${error.message}`);

  return savedRunId;
}

test("a shared resource in the library opens on the tool page, editable", async ({ page }) => {
  const savedRunId = await shareAlreadyAdded();

  await signIn(page, bob);
  await page.goto("/folders");

  // "Shared with me" is a filter, not a folder: the row only appears once it
  // is selected, because provenance is tested instead of folder_id.
  await page.getByRole("button", { name: /shared with me/i }).click();
  /*
   * The card FACE, not the row's menu button.
   *
   * A Folders row renders two buttons carrying the title: the face, which
   * opens, and a menu whose accessible name is "<title> menu". A bare title
   * match is a strict mode violation against both. The face's name continues
   * into the tool label, which is what distinguishes it.
   */
  await page.getByRole("button", { name: /Alice's rivers lesson Lesson/ }).click();

  // The tool page, carrying the run id. This is the whole point: the same
  // route any other resource opens through.
  await page.waitForURL(`**/tools/lesson-planner?run=${savedRunId}`);

  // No dialog. The read-only modal must not be what opened.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The document arrived, and the panel around it is the editable one, with
  // the outline and the actions every other generation gets.
  await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rivers", level: 1, exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: /copy to clipboard/i })).toBeVisible();

  // Editable in place: the Tiptap editor, not a read-only render.
  await expect(page.locator(".prose-editor")).toBeVisible();
  await expect(page.locator(".prose-editor")).toHaveAttribute("contenteditable", "true");
});

test("the same share still opens as a dialog in the colleagues feed", async ({ page }) => {
  // A pending offer this time: no saved_at, no saved_run_id, so it sits in the
  // feed where the add-or-dismiss decision still exists.
  const sourceRunId = await seedResource(alice, "Alice's pending lesson", BODY);
  const { error } = await admin.from("shares").insert({
    sender_id: alice.id,
    recipient_id: bob.id,
    source_run_id: sourceRunId,
    tool_slug: "lesson-planner",
    title: "Alice's pending lesson",
    input: {},
    output: BODY,
  });
  if (error) throw new Error(`Could not seed a share: ${error.message}`);

  await signIn(page, bob);
  await page.goto("/colleagues");

  await page.getByRole("button", { name: /Alice's pending lesson/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/shared by alice/i)).toBeVisible();
  // Still offering the decision, which is the reason this presentation exists.
  await expect(dialog.getByRole("button", { name: /add to library/i })).toBeVisible();
});
