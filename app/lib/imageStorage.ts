// Helpers for getting AI-generated and user-uploaded images OUT of Postgres
// JSONB columns and INTO Supabase Storage. Saves megabytes per row and lets
// the browser stream image bytes via a public CDN-backed URL instead of
// pulling them through PostgREST for every query that touches the slide JSON.
//
// All helpers are server-only (they need the shared `supabase` client which
// is fine on the server for these public-bucket writes).

import { supabase } from "./supabase";
import { compressImage } from "./imageCompress";

// toThumbnailUrl lives in ./imageUrl: this module imports sharp, so no client
// component may import anything from here.
import "server-only";

const BUCKET = "images";

/** Decodes a `data:<mime>;base64,<data>` URL into its raw bytes + MIME type.
 *  Returns null if the input isn't a recognisable data URL. */
export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  return { bytes: new Uint8Array(buf), mime };
}

/** Pick a file extension for a given image MIME type. Falls back to "png"
 *  (the most common AI-image output) when the MIME is missing or weird. */
function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":  return "png";
    case "image/jpeg":
    case "image/jpg":  return "jpg";
    case "image/webp": return "webp";
    case "image/gif":  return "gif";
    case "image/svg+xml": return "svg";
    default:           return "png";
  }
}

/** Upload raw bytes to the `images` bucket and return the public URL.
 *  Compressed first (see imageCompress.ts), so the stored type and extension
 *  can differ from `mime`: an opaque PNG is stored as a JPEG. */
export async function uploadImageBytes(
  rawBytes: Uint8Array,
  rawMime: string,
  filenameHint?: string,
): Promise<string> {
  const { bytes, mime } = await compressImage(rawBytes, rawMime);
  const ext = extensionForMime(mime);
  const safeHint = (filenameHint ?? "image")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeHint || "image"}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  if (!pub.publicUrl) throw new Error("Storage upload succeeded but no public URL returned");
  return pub.publicUrl;
}

/** Convenience: take a base64 data URL, upload to Storage, return the public
 *  URL. Returns the original string unchanged if it's already an http(s) URL
 *  (i.e. already-uploaded — idempotent), or null if the input doesn't look
 *  like an image at all. */
export async function uploadDataUrlToStorage(
  dataUrl: string,
  filenameHint?: string,
): Promise<string | null> {
  if (!dataUrl) return null;
  // Already a remote URL — assume it's already in Storage or an external CDN
  // (Pixabay etc.). Nothing to do.
  if (/^https?:\/\//i.test(dataUrl)) return dataUrl;
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  return uploadImageBytes(decoded.bytes, decoded.mime, filenameHint);
}
