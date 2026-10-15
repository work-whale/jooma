// Shrinking an image before it goes into Storage.
//
// Every picture used to be stored exactly as it arrived. Generated images came
// back from the model as full-colour PNGs averaging 1.4 MB, and they were 70%
// of the staging `images` bucket. A photo-like picture is a JPEG's job: at
// quality 80 the same 1536x1024 slide image is a few hundred kB and looks the
// same on a slide.
//
// WHY JPEG AND NOT WEBP
//
// The PPTX export hands the stored URL straight to pptxgenjs (Editor.tsx), and
// the file lands in PowerPoint and Keynote as-is. Older PowerPoint cannot open
// WebP. JPEG and PNG open everywhere.
//
// WHAT IS LEFT ALONE
//
//   - Transparency. A cut-out (rembg) on a JPEG would gain a black or white box,
//     so anything with real alpha stays PNG, palette-quantised instead.
//   - GIF (may be animated) and SVG (vector). Passed through untouched.
//   - Anything sharp cannot read. Uploading the original beats failing the
//     upload over a size saving.
//   - A result that is not meaningfully smaller. Re-encoding an already-small
//     JPEG only loses quality, and this rule is also what makes the one-off
//     backfill (scripts/compact-images.mjs) safe to run twice.
//
// Shared by uploadImageBytes() and the backfill script so both encode alike.
// Server only: sharp is a native module.

import sharp from "sharp";

/** Longest side kept. Slides are 1280 wide; this leaves room for a full-screen
 *  presentation on a 1080p projector without storing camera-sized originals. */
export const MAX_IMAGE_SIDE = 1920;

/** Encoded as JPEG at this quality when the picture has no transparency. */
export const JPEG_QUALITY = 80;

/** Below this saving, keep the original bytes rather than a re-encode. */
const MIN_SAVING = 0.1;

/** A JPEG at or under this many bytes per pixel is treated as already
 *  compressed. Quality-80 output lands well below it (a 1024x1024 slide image
 *  is about 0.07); a Pixabay original at around 0.26 is still re-encoded. */
export const LEAN_JPEG_BYTES_PER_PIXEL = 0.25;

const PASS_THROUGH = new Set(["image/gif", "image/svg+xml"]);

/** Refuse to decode anything bigger (it is stored untouched instead). sharp's
 *  default is 268M pixels, about 1 GB decoded, so a small, highly compressed
 *  PNG could exhaust a function's memory. 40M covers a 24 MP camera photo. */
export const MAX_INPUT_PIXELS = 40_000_000;

export interface CompressedImage {
  bytes: Uint8Array;
  mime: string;
  /** False when the original was kept (unsupported, unreadable or no saving). */
  changed: boolean;
}

export async function compressImage(input: Uint8Array, mime: string): Promise<CompressedImage> {
  const original: CompressedImage = { bytes: input, mime, changed: false };
  if (PASS_THROUGH.has(mime.toLowerCase())) return original;

  try {
    const img = sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await img.metadata();
    if (!meta.format || meta.format === "gif" || meta.format === "svg") return original;

    // Already compressed once: a lean JPEG, or a palette PNG (what the
    // transparent branch below writes). Without this, each pass shaves off just
    // over the minimum saving and degrades the picture a little more every time.
    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    const fits = Math.max(meta.width ?? 0, meta.height ?? 0) <= MAX_IMAGE_SIDE;
    if (fits && meta.format === "png" && meta.isPalette) return original;
    if (fits && meta.format === "jpeg" && pixels > 0 && input.length / pixels <= LEAN_JPEG_BYTES_PER_PIXEL) {
      return original;
    }

    // `isOpaque` reads the alpha channel itself: plenty of PNGs carry an alpha
    // channel that is solid everywhere, and those are safe as JPEG.
    const { isOpaque } = await img.stats();

    const resized = sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // apply EXIF orientation before it is stripped
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true });

    const out = isOpaque
      ? { buf: await resized.flatten({ background: "#ffffff" }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), mime: "image/jpeg" }
      : { buf: await resized.png({ palette: true, quality: 85, compressionLevel: 9, effort: 8 }).toBuffer(), mime: "image/png" };

    if (out.buf.length > input.length * (1 - MIN_SAVING)) return original;
    return { bytes: new Uint8Array(out.buf), mime: out.mime, changed: true };
  } catch {
    return original;
  }
}
