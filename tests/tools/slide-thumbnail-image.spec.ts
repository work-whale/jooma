import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Slide thumbnails (the slide tray, the Slideshows list, Made with Jooma) all
 * draw through MiniSlide. A generated deck often saves its pictures without
 * their natural size, and MiniSlide used to fall back to the frame's size, so
 * a wide photo in a square frame was squashed to a square in every thumbnail
 * while the editor, which measures the picture, showed it properly.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

// A 4:1 picture, inline so nothing depends on storage.
const WIDE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#c33"/></svg>',
)}`;

let teacher: TestTeacher;
const title = `Thumb ${Date.now().toString(36)}`;

test.beforeAll(async () => {
  teacher = await createTeacher("Thumbs");
  const { error } = await admin.from("presentations").insert({
    user_id: teacher.id,
    title,
    slides: [
      {
        shapes: [],
        texts: [],
        background: "#ffffff",
        // A square frame, and no naturalWidth / naturalHeight.
        images: [{ id: "im1", x: 100, y: 100, width: 300, height: 300, src: WIDE, opacity: 1 }],
      },
    ],
  });
  if (error) throw new Error(error.message);
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test("a picture saved without its size keeps its shape in the thumbnail (regression)", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/tools/slideshow");

  const img = page.locator('img[src^="data:image/svg+xml"]').first();
  await expect(img).toBeVisible(NAV);

  // Cover-fitted into the square frame: drawn 4:1 and cropped, not squashed.
  await expect
    .poll(async () => {
      const box = await img.boundingBox();
      return box ? Math.round((box.width / box.height) * 10) / 10 : 0;
    }, NAV)
    .toBe(4);
});
