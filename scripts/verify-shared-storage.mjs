/*
 * storage_paths_in_use() after 20261118000400_shared_storage_safety.sql.
 *
 *   node scripts/verify-shared-storage.mjs
 *
 * Aims at whatever .env.local holds, which must be staging; it refuses the
 * production project id.
 *
 * Files can now belong to many rows (content-addressed uploads, merged
 * duplicates), so this function is the only thing standing between a sweep and
 * a broken picture on somebody's slide. What it proves:
 *   - A signed-in teacher cannot call it (it reads across every user).
 *   - A path on a deck is live; excluding that deck's id or its owner frees it,
 *     but a second teacher's deck with the same path keeps it live.
 *   - Runs and the image library honour p_exclude_id / p_exclude_user too.
 *   - A share is always live, even when the sender is excluded.
 *   - An unclaimed guest try is live; a claimed one is not.
 *   - An object written in the last hour is live with no reference at all.
 *   - A path nothing mentions is not live.
 *   - The old named call (p_paths, p_exclude_id) still works.
 *   - Upserting identical bytes twice leaves one object (the dedupe upload).
 *
 * Paths other than the uploaded one are never created as objects, so the
 * "written in the last hour" rule cannot mask the reference rules.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (line === "" || line.startsWith("#")) continue;
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing Supabase env.");
  process.exit(1);
}
if (URL.includes("hhgfhhofbhzioywnppzr")) {
  console.error("Refusing to run against PRODUCTION.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

const made = { users: [], trials: [], shares: [], objects: [] };

async function teacher() {
  const email = `verify-storage-${randomUUID()}@jooma.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  made.users.push(id);
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    first_name: "Verify",
    surname: "Testcase",
    username: `vs${randomUUID().replace(/-/g, "").slice(0, 18)}`,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id, client };
}

const tag = randomUUID().slice(0, 8);
const p = (name) => `verify-${tag}-${name}_pixabay.jpg`;
const url = (path) => `${URL}/storage/v1/object/public/images/${path}`;
const slidesWith = (path) => [{ id: "s1", elements: [{ id: "e1", type: "image", src: url(path) }] }];

async function live(paths, extra = {}) {
  const { data, error } = await admin.rpc("storage_paths_in_use", { p_paths: paths, ...extra });
  if (error) throw new Error(`storage_paths_in_use: ${error.message}`);
  return new Set((data ?? []).map((r) => r.path));
}

async function insert(table, row) {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id;
}

async function main() {
  console.log(`Project: ${URL}\n`);
  const a = await teacher();
  const b = await teacher();

  // ── Not callable by a teacher ───────────────────────────────────────────────
  {
    const { error } = await a.client.rpc("storage_paths_in_use", { p_paths: [p("x")] });
    check("a signed-in teacher cannot call it", !!error, error ? "" : "call succeeded");
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: anonErr } = await anon.rpc("storage_paths_in_use", { p_paths: [p("x")] });
    check("a signed-out visitor cannot call it", !!anonErr);
  }

  // ── Decks ───────────────────────────────────────────────────────────────────
  const deckOnly = p("deck-only");
  const shared = p("shared-between-teachers");
  const deckA = await insert("presentations", { user_id: a.id, title: "A", slides: [...slidesWith(deckOnly), ...slidesWith(shared)] });
  await insert("presentations", { user_id: b.id, title: "B", slides: slidesWith(shared) });

  let r = await live([deckOnly, shared]);
  check("a path on a deck is live", r.has(deckOnly) && r.has(shared));
  r = await live([deckOnly, shared], { p_exclude_id: deckA });
  check("excluding the deck frees its own path", !r.has(deckOnly));
  check("...but not one another teacher's deck still uses", r.has(shared));
  r = await live([deckOnly, shared], { p_exclude_user: a.id });
  check("excluding the owner frees their path", !r.has(deckOnly));
  check("...but not one another teacher still uses", r.has(shared));

  // ── Runs ────────────────────────────────────────────────────────────────────
  const runPath = p("run");
  const runA = await insert("tool_runs", { user_id: a.id, tool_slug: "worksheet-generator", title: "R", input: {}, output: `![x](${url(runPath)})` });
  r = await live([runPath]);
  check("a path in a run's output is live", r.has(runPath));
  r = await live([runPath], { p_exclude_id: runA });
  check("excluding the run frees it", !r.has(runPath));
  r = await live([runPath], { p_exclude_user: a.id });
  check("excluding the run's owner frees it", !r.has(runPath));
  r = await live([runPath], { p_exclude_user: b.id });
  check("excluding a different user does not", r.has(runPath));

  // ── Image library ───────────────────────────────────────────────────────────
  const libPath = p("library");
  await insert("generated_images", { user_id: a.id, prompt: "verify", data_url: url(libPath), source: "pixabay" });
  r = await live([libPath]);
  check("a library image is live", r.has(libPath));
  r = await live([libPath], { p_exclude_user: a.id });
  check("excluding the library owner frees it", !r.has(libPath));

  // ── Shares ──────────────────────────────────────────────────────────────────
  const sharePath = p("share");
  const shareId = await insert("shares", { sender_id: a.id, recipient_id: b.id, tool_slug: "worksheet-generator", title: "S", input: {}, output: `![x](${url(sharePath)})` });
  made.shares.push(shareId);
  r = await live([sharePath], { p_exclude_user: a.id });
  check("a share stays live even with the sender excluded", r.has(sharePath));

  // ── Guest tries ─────────────────────────────────────────────────────────────
  const trialPath = p("trial-unclaimed");
  const claimedPath = p("trial-claimed");
  const base = { guest_id: randomUUID(), ip_hash: `verify-${tag}`, tool: "slideshow", run_id: randomUUID(), title: "T", input: {} };
  made.trials.push(await insert("trial_generations", { ...base, status: "done", output: { slides: slidesWith(trialPath) } }));
  made.trials.push(
    await insert("trial_generations", {
      ...base,
      run_id: randomUUID(),
      status: "claimed",
      claimed_by: a.id,
      claimed_at: new Date().toISOString(),
      output: { slides: slidesWith(claimedPath) },
    }),
  );
  r = await live([trialPath, claimedPath]);
  check("an unclaimed guest try is live", r.has(trialPath));
  check("a claimed guest try is not (its deck owns the file now)", !r.has(claimedPath));

  // ── Nothing ─────────────────────────────────────────────────────────────────
  const nothing = p("nothing");
  r = await live([nothing]);
  check("a path nothing mentions is not live", !r.has(nothing));

  // ── Old call shape ──────────────────────────────────────────────────────────
  {
    const { error } = await admin.rpc("storage_paths_in_use", { p_paths: [nothing], p_exclude_id: deckA });
    check("the old (p_paths, p_exclude_id) call still resolves", !error, error?.message);
  }

  // ── Recently written objects, and the dedupe upload ─────────────────────────
  const fresh = `verify-${tag}-fresh_pixabay.jpg`;
  const body = new TextEncoder().encode(`verify ${tag}`);
  for (let i = 0; i < 2; i++) {
    const { error } = await admin.storage.from("images").upload(fresh, body, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`upload: ${error.message}`);
  }
  made.objects.push(fresh);
  const { data: listed } = await admin.storage.from("images").list("", { search: `verify-${tag}-fresh` });
  check("uploading identical bytes twice leaves one object", (listed ?? []).length === 1, `found ${(listed ?? []).length}`);
  r = await live([fresh]);
  check("an object written in the last hour is live with no reference", r.has(fresh));
}

async function cleanup() {
  if (made.objects.length) await admin.storage.from("images").remove(made.objects);
  if (made.trials.length) await admin.from("trial_generations").delete().in("id", made.trials);
  if (made.shares.length) await admin.from("shares").delete().in("id", made.shares);
  for (const id of made.users) {
    await admin.from("presentations").delete().eq("user_id", id);
    await admin.from("generated_images").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

try {
  await main();
} catch (err) {
  failures.push(`setup: ${err.message}`);
  console.error(`\nFailed: ${err.message}`);
} finally {
  await cleanup();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
