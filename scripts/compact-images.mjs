/*
 * Shrink the `images` bucket: re-encode what is there, drop duplicates and
 * orphans, and optionally clear out everything older than a date.
 *
 *   node --experimental-strip-types scripts/compact-images.mjs
 *       dry run: reports what it would do, changes nothing
 *   node --experimental-strip-types scripts/compact-images.mjs --apply
 *   node --experimental-strip-types scripts/compact-images.mjs --apply --delete-before 2026-07-01
 *
 * WHY THIS EXISTS
 *
 * Until uploadImageBytes() compressed on the way in, every picture was stored
 * exactly as it arrived. Measured on staging (Oct 2026): 905 objects, 737 MB,
 * of which generated PNGs averaging 1.4 MB were 511 MB, 97 byte-identical extra
 * copies were 40 MB, and 53 files nothing pointed at were 30 MB. New uploads are
 * compressed now; this fixes what was stored before.
 *
 * WHAT IT DOES, IN ORDER
 *
 *   1. --delete-before: removes every object created before that date. Rows that
 *      point at them are NOT edited, so those pictures show as broken. Meant for
 *      staging test data, never production.
 *   2. Orphans: removes objects older than 24h that no row references.
 *   3. Duplicates: byte-identical objects (same eTag) collapse onto one file.
 *   4. Compression: each remaining file goes through compressImage(), the same
 *      function the upload path uses. An opaque PNG becomes a JPEG at a new path
 *      (same name, .jpg); a file that stays the same type is overwritten in place.
 *   5. References: every row naming an old path is rewritten to the new one.
 *   6. Only then are the old objects deleted, so a crash part-way through leaves
 *      every row pointing at a file that still exists.
 *
 * WHERE REFERENCES LIVE
 *
 * Found by scanning every text and jsonb column on staging for
 * "/public/images/": presentations.slides, generated_images.data_url and
 * trial_generations.output. The other columns below are checked as well because
 * the app can write image URLs there. Note storage_paths_in_use() (and so
 * scripts/sweep-orphans.mjs) does not look at trial_generations, which is why
 * this script does its own reference check rather than calling it.
 *
 * SAFETY
 *
 *   - Dry run by default.
 *   - Before anything is changed, every original file it is about to replace
 *     and every row it is about to edit are written to --backup-dir (default:
 *     a timestamped folder in the OS temp directory, outside the repo).
 *   - Idempotent: compressImage() keeps the original unless the saving is over
 *     10%, so a second run re-encodes nothing.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local,
 * so it runs against whichever project that file points at. Check the
 * "Project:" line it prints first.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compressImage } from "../app/lib/imageCompress.ts";

/* ── Environment ─────────────────────────────────────────────────────────── */

// Same hand-rolled loader as sweep-orphans.mjs: no Next.js runtime here.
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (line === "" || line.startsWith("#")) continue;
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
  process.exit(1);
}

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

/* ── Options ─────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const deleteBeforeArg = opt("--delete-before");
const DELETE_BEFORE = deleteBeforeArg ? new Date(deleteBeforeArg) : null;
if (DELETE_BEFORE && Number.isNaN(DELETE_BEFORE.getTime())) {
  console.error("--delete-before needs a date, e.g. 2026-07-01.");
  process.exit(1);
}

const BACKUP_DIR =
  opt("--backup-dir") ?? join(tmpdir(), `jooma-image-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const MIN_AGE_MS = 24 * 3600 * 1000;
const BUCKET = "images";

/** Every column an `images` URL can be written into, by table. All key on `id`. */
const REF_COLUMNS = {
  presentations: ["slides", "generation_params"],
  generated_images: ["data_url"],
  trial_generations: ["output", "input"],
  tool_runs: ["output", "input"],
  shares: ["output", "input"],
};

// Both URL shapes, as in app/lib/storageRefs.ts.
const IMAGE_URL = /(\/storage\/v1\/(?:object|render\/image)\/public\/images\/)([^"'\s)\\?#]+)/g;

const bytes = (n) =>
  n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n > 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} kB`;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

async function listAll() {
  const out = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list("", { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Could not list ${BUCKET}: ${error.message}`);
    if (!data || data.length === 0) break;
    // Folders come back as entries with no id.
    out.push(...data.filter((o) => o.id));
    if (data.length < PAGE) break;
  }
  return out;
}

async function removeAll(names, label) {
  let done = 0;
  for (let i = 0; i < names.length; i += 100) {
    const slice = names.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(slice);
    if (error) {
      console.error(`  could not remove a batch (${label}): ${error.message}`);
      continue;
    }
    done += slice.length;
  }
  return done;
}

/** Every row that mentions an images URL, with just the columns that can. */
async function loadRows() {
  const rows = [];
  for (const [table, cols] of Object.entries(REF_COLUMNS)) {
    // Paged small: presentations.slides runs to hundreds of kB a row.
    const PAGE = 25;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from(table)
        .select(["id", ...cols].join(","))
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Could not read ${table}: ${error.message}`);
      for (const row of data ?? []) {
        const text = cols.map((c) => (row[c] == null ? "" : typeof row[c] === "string" ? row[c] : JSON.stringify(row[c])));
        if (text.some((t) => t.includes("/public/images/"))) rows.push({ table, cols, row, text });
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

function referencedNames(rows) {
  const names = new Set();
  for (const { text } of rows) {
    for (const t of text) {
      for (const m of t.matchAll(IMAGE_URL)) {
        let name = m[2];
        try {
          name = decodeURIComponent(name);
        } catch {}
        names.add(name);
      }
    }
  }
  return names;
}

const extFor = (mime) => (mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : null);

/** Runs `fn` over `items`, `n` at a time. */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`Project: ${URL}`);
  console.log(APPLY ? "Mode:    APPLY" : "Mode:    dry run (pass --apply to change anything)");
  if (DELETE_BEFORE) console.log(`Deleting everything created before ${DELETE_BEFORE.toISOString().slice(0, 10)}.`);
  console.log("");

  let objects = await listAll();
  const sizeOf = (o) => o.metadata?.size ?? 0;
  const total = objects.reduce((a, o) => a + sizeOf(o), 0);
  console.log(`${BUCKET}: ${objects.length} objects, ${bytes(total)}`);

  if (APPLY) mkdirSync(BACKUP_DIR, { recursive: true });

  /* 1. Old test data */
  if (DELETE_BEFORE) {
    const old = objects.filter((o) => new Date(o.created_at).getTime() < DELETE_BEFORE.getTime());
    console.log(`1. Before cutoff: ${old.length} objects, ${bytes(old.reduce((a, o) => a + sizeOf(o), 0))}`);
    if (APPLY) console.log(`   removed ${await removeAll(old.map((o) => o.name), "cutoff")}`);
    const gone = new Set(old.map((o) => o.name));
    objects = objects.filter((o) => !gone.has(o.name));
  }

  /* 2. Orphans */
  const rows = await loadRows();
  const live = referencedNames(rows);
  const cutoff = Date.now() - MIN_AGE_MS;
  const orphans = objects.filter((o) => !live.has(o.name) && new Date(o.created_at).getTime() < cutoff);
  console.log(`2. Orphans: ${orphans.length} objects, ${bytes(orphans.reduce((a, o) => a + sizeOf(o), 0))}`);
  if (APPLY && orphans.length) console.log(`   removed ${await removeAll(orphans.map((o) => o.name), "orphans")}`);
  const orphanSet = new Set(orphans.map((o) => o.name));
  objects = objects.filter((o) => !orphanSet.has(o.name));

  /* 3 + 4. Duplicates and compression */
  const groups = new Map();
  for (const o of objects) {
    const key = o.metadata?.eTag ?? o.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }

  /** old name -> new name, for every reference that has to move. */
  const rename = new Map();
  /** Objects to delete once rows no longer point at them. */
  const retire = [];
  let before = 0;
  let after = 0;
  let dupBytes = 0;
  let compressed = 0;
  let failed = 0;

  const work = [...groups.values()].map((g) =>
    g.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  );

  let done = 0;
  await pool(work, 4, async (group) => {
    const keep = group[0];
    const dups = group.slice(1);
    dupBytes += dups.reduce((a, o) => a + sizeOf(o), 0);

    let target = keep.name;
    try {
      const { data: blob, error } = await db.storage.from(BUCKET).download(keep.name);
      if (error || !blob) throw new Error(error?.message ?? "no data");
      const original = new Uint8Array(await blob.arrayBuffer());
      const mime = keep.metadata?.mimetype ?? blob.type ?? "application/octet-stream";
      const out = await compressImage(original, mime);

      before += original.length;
      after += out.changed ? out.bytes.length : original.length;

      if (out.changed) {
        compressed++;
        const ext = extFor(out.mime);
        target = ext ? keep.name.replace(/\.[a-z0-9]+$/i, "") + "." + ext : keep.name;
        if (APPLY) {
          writeFileSync(join(BACKUP_DIR, keep.name), original);
          const { error: upErr } = await db.storage
            .from(BUCKET)
            .upload(target, out.bytes, { contentType: out.mime, upsert: target === keep.name });
          if (upErr) throw new Error(`upload ${target}: ${upErr.message}`);
        }
      }
    } catch (err) {
      failed++;
      target = keep.name;
      console.error(`\n  skipped ${keep.name}: ${err.message}`);
    }

    for (const o of group) {
      if (o.name !== target) {
        rename.set(o.name, target);
        retire.push(o.name);
      }
    }
    process.stdout.write(`\r   processed ${++done}/${work.length}`);
  });
  process.stdout.write("\r".padEnd(40) + "\r");

  console.log(`3. Duplicates: ${objects.length - groups.size} extra copies, ${bytes(dupBytes)}`);
  console.log(`4. Compression: ${compressed} of ${groups.size} files re-encoded, ${bytes(before)} -> ${bytes(after)}` + (failed ? `, ${failed} skipped` : ""));

  /* 5. References */
  const edits = [];
  for (const entry of rows) {
    const patch = {};
    entry.cols.forEach((col, i) => {
      const t = entry.text[i];
      if (!t) return;
      const next = t.replace(IMAGE_URL, (whole, prefix, name) => (rename.has(name) ? prefix + rename.get(name) : whole));
      if (next !== t) patch[col] = typeof entry.row[col] === "string" ? next : JSON.parse(next);
    });
    if (Object.keys(patch).length) edits.push({ entry, patch });
  }
  console.log(`5. Rows to rewrite: ${edits.length}`);

  if (APPLY && edits.length) {
    writeFileSync(
      join(BACKUP_DIR, "rows-before.json"),
      JSON.stringify(edits.map(({ entry }) => ({ table: entry.table, row: entry.row })), null, 2),
    );
    let ok = 0;
    for (const { entry, patch } of edits) {
      const { error } = await db.from(entry.table).update(patch).eq("id", entry.row.id);
      if (error) {
        console.error(`  could not update ${entry.table} ${entry.row.id}: ${error.message}`);
        // Leave this row's old files in place: it still points at them.
        for (const [col] of Object.entries(patch)) {
          const t = entry.text[entry.cols.indexOf(col)];
          for (const m of t.matchAll(IMAGE_URL)) {
            const idx = retire.indexOf(m[2]);
            if (idx >= 0) retire.splice(idx, 1);
          }
        }
        continue;
      }
      ok++;
    }
    console.log(`   rewrote ${ok}`);
  }

  /* 6. Retire replaced objects */
  console.log(`6. Old objects to remove: ${retire.length}`);
  if (APPLY && retire.length) console.log(`   removed ${await removeAll(retire, "retired")}`);

  const finalTotal = APPLY ? (await listAll()).reduce((a, o) => a + sizeOf(o), 0) : null;
  console.log(
    APPLY
      ? `\nDone. ${bytes(total)} -> ${bytes(finalTotal)}. Backups in ${BACKUP_DIR}`
      : "\nNothing was changed. Re-run with --apply.",
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
