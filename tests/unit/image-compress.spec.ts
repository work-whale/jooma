import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { compressImage, MAX_IMAGE_SIDE, MAX_INPUT_PIXELS } from "@/app/lib/imageCompress";

/*
 * Images are compressed on the way into Storage (uploadImageBytes), and the
 * same function backfilled the existing bucket (scripts/compact-images.mjs).
 *
 * Generated slide images were stored as the model's full-colour PNGs, about
 * 1.4 MB each and 70% of the staging bucket. An opaque picture now becomes a
 * JPEG; anything with transparency stays PNG so a cut-out never gains a box.
 */

/** A photo-like picture: smooth gradients with grain. Flat colour or repeating
 *  patterns compress so well as PNG that JPEG would not win, unlike a photo. */
async function photo(width: number, height: number, alpha = false): Promise<Uint8Array> {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 1;
  const grain = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 24) - 12;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = Math.max(0, Math.min(255, (x * 255) / width + grain()));
      raw[i + 1] = Math.max(0, Math.min(255, (y * 255) / height + grain()));
      raw[i + 2] = Math.max(0, Math.min(255, 128 + 60 * Math.sin(x / 40 + y / 60) + grain()));
      if (alpha) raw[i + 3] = x < width / 4 ? 0 : 255;
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
  return new Uint8Array(png);
}

test("an opaque PNG becomes a much smaller JPEG", async () => {
  const input = await photo(600, 400);
  const out = await compressImage(input, "image/png");
  expect(out.changed).toBe(true);
  expect(out.mime).toBe("image/jpeg");
  expect(out.bytes.length).toBeLessThan(input.length / 2);
  expect((await sharp(out.bytes).metadata()).format).toBe("jpeg");
});

test("transparency is kept as PNG", async () => {
  const out = await compressImage(await photo(300, 200, true), "image/png");
  expect(out.mime).toBe("image/png");
  const meta = await sharp(out.bytes).metadata();
  expect(meta.format).toBe("png");
  expect(meta.hasAlpha).toBe(true);
});

test("an oversized picture is scaled to fit, keeping its shape", async () => {
  const out = await compressImage(await photo(MAX_IMAGE_SIDE * 2, MAX_IMAGE_SIDE), "image/png");
  const meta = await sharp(out.bytes).metadata();
  expect(meta.width).toBe(MAX_IMAGE_SIDE);
  expect(meta.height).toBe(MAX_IMAGE_SIDE / 2);
});

test("a second pass changes nothing, so the backfill is safe to re-run", async () => {
  for (const alpha of [false, true]) {
    const once = await compressImage(await photo(500, 500, alpha), "image/png");
    const twice = await compressImage(once.bytes, once.mime);
    expect(twice.changed).toBe(false);
    expect(twice.bytes).toBe(once.bytes);
  }
});

test("a picture past the pixel limit is stored untouched, never decoded", async () => {
  // 8000x6000 is 48M pixels. Flat colour, so it is tiny on disk: exactly the
  // shape of a decompression bomb.
  const big = new Uint8Array(
    await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "#888" } }).png().toBuffer(),
  );
  expect(8000 * 6000).toBeGreaterThan(MAX_INPUT_PIXELS);
  const out = await compressImage(big, "image/png");
  expect(out.changed).toBe(false);
  expect(out.bytes).toBe(big);
});

test("GIF, SVG and unreadable bytes pass through untouched", async () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  expect((await compressImage(svg, "image/svg+xml")).bytes).toBe(svg);

  const gif = new Uint8Array(await sharp(await photo(20, 20)).gif().toBuffer());
  expect((await compressImage(gif, "image/gif")).bytes).toBe(gif);

  const junk = new Uint8Array([1, 2, 3, 4]);
  const out = await compressImage(junk, "image/png");
  expect(out.changed).toBe(false);
  expect(out.bytes).toBe(junk);
});
