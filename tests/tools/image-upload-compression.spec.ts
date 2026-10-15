import { test, expect, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * /api/upload-image: the route the editor posts a background-removed cutout to.
 *
 * Pictures are compressed on the way into Storage. Generated slide images used
 * to be stored as the model's full-colour PNGs (about 1.4 MB each, 70% of the
 * staging bucket); an opaque picture is now stored as a JPEG, and anything with
 * transparency stays PNG. This route shares uploadImageBytes() with generated
 * and Pixabay images, so it is the one place a test can drive that path.
 *
 * The route itself has no auth check: proxy.ts returns 401 for any /api path
 * not on its public list. It does refuse anything but a raster image, since the
 * bucket is public and has no type allowlist of its own.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(180_000);

let teacher: TestTeacher;
const uploaded: string[] = [];

test.beforeAll(async () => {
  teacher = await createTeacher("Upload");
});

test.afterAll(async () => {
  if (uploaded.length) await admin.storage.from("images").remove(uploaded);
  await deleteTeacher(teacher);
});

/** Photo-like: gradients with grain, which is what JPEG wins on. */
async function picture(alpha: boolean): Promise<string> {
  const width = 800;
  const height = 500;
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 7;
  const grain = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 24) - 12;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = Math.max(0, Math.min(255, (x * 255) / width + grain()));
      raw[i + 1] = Math.max(0, Math.min(255, (y * 255) / height + grain()));
      raw[i + 2] = Math.max(0, Math.min(255, 128 + 60 * Math.sin(x / 40) + grain()));
      if (alpha) raw[i + 3] = x < width / 3 ? 0 : 255;
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function upload(request: APIRequestContext, dataUrl: string) {
  const res = await request.post("/api/upload-image", { data: { dataUrl, filenameHint: "e2e-compress" } });
  expect(res.status()).toBe(200);
  const { src } = (await res.json()) as { src: string };
  uploaded.push(decodeURIComponent(src.split("/public/images/")[1]));
  const file = await request.get(src);
  expect(file.ok()).toBe(true);
  return { src, body: await file.body(), sent: Buffer.from(dataUrl.split(",")[1], "base64").length };
}

test("signed out, the upload is refused", async ({ request }) => {
  const res = await request.post("/api/upload-image", { data: { dataUrl: await picture(false) } });
  expect(res.status()).toBe(401);
});

test("signed in: compressed, transparency kept, non-images refused", async ({ page }) => {
  await signIn(page, teacher);

  // An opaque picture is stored as a smaller JPEG.
  const opaque = await upload(page.request, await picture(false));
  expect(opaque.src).toMatch(/\.jpg$/);
  expect(opaque.body.length).toBeLessThan(opaque.sent / 2);
  expect((await sharp(opaque.body).metadata()).format).toBe("jpeg");

  // A cutout keeps its transparency as PNG.
  const cutout = await upload(page.request, await picture(true));
  expect(cutout.src).toMatch(/\.png$/);
  const meta = await sharp(cutout.body).metadata();
  expect(meta.format).toBe("png");
  expect(meta.hasAlpha).toBe(true);

  // HTML or a scripted SVG never reaches the public bucket.
  for (const dataUrl of [
    `data:text/html;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`,
    `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64")}`,
  ]) {
    const res = await page.request.post("/api/upload-image", { data: { dataUrl } });
    expect(res.status()).toBe(415);
  }
});
