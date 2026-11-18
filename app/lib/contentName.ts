// Naming an uploaded image by what is in it.
//
// Uploads used to be named `<timestamp>_<random>_<hint>.<ext>`, so every upload
// was a new object even when the bytes were identical. A popular Pixabay photo
// pulled into ten decks was stored ten times: on production in Nov 2026 that
// was 911 extra copies, 169 MB of a 1 GB quota.
//
// Now the name is a hash of the ORIGINAL bytes (before compression), so the same
// source always lands on the same object and a repeat upload overwrites it with
// identical content instead of adding a copy. Hashing the original rather than
// the compressed output means a change of encoder settings cannot split one
// photo into two names.
//
// Sharing is safe only because every delete path asks storage_paths_in_use()
// whether anything else still points at a file (see storageSweep.ts).
//
// Pure, no imports beyond node:crypto, so the unit tests can call it directly.

import { createHash } from "node:crypto";

/** Hash length kept in the name: 128 bits, far past any chance of collision. */
const HASH_CHARS = 32;

/** Lowercase, [a-z0-9_-] only, trimmed of dashes, at most 40 characters. */
export function safeHint(hint: string | undefined): string {
  const cleaned = (hint ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "image";
}

/** `<sha256 prefix>_<hint>.<ext>`. The hint keeps the source (ai, pixabay,
 *  sheet...) readable in the bucket; it plays no part in deduplication beyond
 *  being part of the name. */
export function contentAddressedName(raw: Uint8Array, hint: string | undefined, ext: string): string {
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, HASH_CHARS);
  return `${hash}_${safeHint(hint).replace(/_/g, "-")}.${ext}`;
}
