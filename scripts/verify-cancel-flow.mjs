/*
 * Cancel flow: the access rules on cancellation_events, against a real database.
 *
 *   node scripts/verify-cancel-flow.mjs
 *
 * WHAT THIS IS FOR
 *
 * The 12-month cap on the retention discount is read from this table. A
 * teacher who could write to it, even to their own rows, could delete their
 * last `discount` row and take the offer again, or forge a `cancelled` row to
 * reopen the 14-day window. So the migration gives teachers read on their own
 * rows and nothing else, and this asserts exactly that:
 *
 *   - a teacher reads their own rows, and not another teacher's
 *   - a teacher cannot insert, update or delete, even their own rows
 *   - anon reads nothing
 *
 * HOW IT PROVES ANYTHING
 *
 * Rows are seeded with the service role, then every assertion runs through the
 * ANON key as a real signed-in user. The service role bypasses RLS, so a check
 * written against it would pass however wrong the policies were.
 *
 * RUN IT ON STAGING. It creates and deletes users, and cleans up on failure.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (line === "" || line.startsWith("#")) continue;
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const PEOPLE = {
  ada: { email: `verify-cancel-a-${stamp}@jooma.test`, password: `pw-${stamp}-aaa` },
  ben: { email: `verify-cancel-b-${stamp}@jooma.test`, password: `pw-${stamp}-bbb` },
};

async function signIn(person) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: person.email, password: person.password });
  if (error) throw new Error(`Could not sign in ${person.email}: ${error.message}`);
  return client;
}

async function setUp() {
  for (const [name, person] of Object.entries(PEOPLE)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
    });
    if (error) throw new Error(`Could not create ${name}: ${error.message}`);
    person.id = data.user.id;

    const { data: row, error: re } = await admin
      .from("cancellation_events")
      .insert({ user_id: person.id, reason: "cost", outcome: "discount", plan: "pro", interval: "month" })
      .select("id")
      .single();
    if (re) throw new Error(`Could not seed ${name}'s row: ${re.message}`);
    person.rowId = row.id;
  }
}

async function cleanUp() {
  for (const person of Object.values(PEOPLE)) {
    if (person.id) await admin.auth.admin.deleteUser(person.id).catch(() => {});
  }
}

async function main() {
  await setUp();
  const ada = await signIn(PEOPLE.ada);

  console.log("\nReading");
  {
    const { data, error } = await ada.from("cancellation_events").select("id, user_id");
    check("a teacher reads their own row", !error && data?.some((r) => r.id === PEOPLE.ada.rowId), error?.message);
    check(
      "and never another teacher's",
      !error && !data?.some((r) => r.user_id === PEOPLE.ben.id),
      JSON.stringify(data),
    );
  }
  {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from("cancellation_events").select("id");
    check("anon reads nothing", (data ?? []).length === 0, JSON.stringify(data));
  }

  console.log("\nWriting (all refused)");
  {
    const { error } = await ada
      .from("cancellation_events")
      .insert({ user_id: PEOPLE.ada.id, reason: "cost", outcome: "cancelled" });
    check("a teacher cannot insert, even for themselves", Boolean(error), "insert went through");
  }
  {
    // A refused update or delete under RLS is not an error: it touches zero
    // rows. So the proof is that the row is unchanged afterwards.
    await ada
      .from("cancellation_events")
      .update({ created_at: "2020-01-01T00:00:00Z" })
      .eq("id", PEOPLE.ada.rowId);
    const { data } = await admin.from("cancellation_events").select("created_at").eq("id", PEOPLE.ada.rowId).single();
    check("a teacher cannot back-date their own discount", !data.created_at.startsWith("2020"), data.created_at);
  }
  {
    await ada.from("cancellation_events").delete().eq("id", PEOPLE.ada.rowId);
    const { data } = await admin.from("cancellation_events").select("id").eq("id", PEOPLE.ada.rowId).maybeSingle();
    check("a teacher cannot delete their own discount row", Boolean(data), "row was deleted");
  }
  {
    await ada.from("cancellation_events").delete().eq("id", PEOPLE.ben.rowId);
    const { data } = await admin.from("cancellation_events").select("id").eq("id", PEOPLE.ben.rowId).maybeSingle();
    check("or anyone else's", Boolean(data), "row was deleted");
  }
}

try {
  await main();
} catch (err) {
  failures.push({ name: "setup", detail: err.message });
  console.log(`\n  FAIL  ${err.message}`);
} finally {
  await cleanUp();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
