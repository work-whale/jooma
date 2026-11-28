/*
 * Curricula: the access rules on profiles.curriculum_id and the region
 * switches, against a real database.
 *
 *   node scripts/verify-curriculum-profile.mjs
 *
 * WHAT THIS IS FOR
 *
 * supabase/migrations/20261114000000_curricula.sql adds two self-service
 * columns to profiles and six region switches read through public_settings();
 * 20261124000000_curricula_stage2_regions.sql adds five more (Africa, Asia,
 * Caribbean, Europe, Middle East), all off; and
 * 20261127000000_curricula_stage3_releases.sql adds five Stage 3 batch
 * switches (curricula_s3_a to _e), all off; and
 * 20261128000000_curricula_latin_america.sql adds the Latin America region
 * switch, ON (its entries are gated by curricula_s3_d).
 * This asserts:
 *
 *   - a teacher sets and reads their own curriculum
 *   - a teacher cannot set another teacher's curriculum
 *   - the format check refuses junk ids, and null is allowed
 *   - the new columns did not open a way round the privileged-column guard
 *     (plan still cannot be changed in the same update)
 *   - anon and teachers read the six switches, and the five Stage 2 ones (all
 *     off on staging), through public_settings(), and that function returns
 *     nothing beyond its named keys
 *   - they read the five Stage 3 batch switches, all off
 *   - they read the Latin America switch, on
 *   - a teacher cannot flip a region switch or a batch switch
 *
 * HOW IT PROVES ANYTHING
 *
 * Users and profiles are seeded with the service role, then every assertion
 * runs through the ANON key as a real signed-in user. The service role
 * bypasses RLS, so a check written against it would pass however wrong the
 * policies were.
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
  ada: { email: `verify-curriculum-a-${stamp}@jooma.test`, password: `pw-${stamp}-aaa` },
  ben: { email: `verify-curriculum-b-${stamp}@jooma.test`, password: `pw-${stamp}-bbb` },
};

const SWITCHES = [
  "curricula_british_isles",
  "curricula_ireland",
  "curricula_international",
  "curricula_australia_nz",
  "curricula_usa",
  "curricula_canada",
];
// Added by 20261124000000_curricula_stage2_regions.sql: Stage 2 regions, off.
const STAGE2_SWITCHES = [
  "curricula_africa",
  "curricula_asia",
  "curricula_caribbean",
  "curricula_europe",
  "curricula_middle_east",
];
// Added by 20261127000000_curricula_stage3_releases.sql: Stage 3 batches, off.
const STAGE3_RELEASES = ["curricula_s3_a", "curricula_s3_b", "curricula_s3_c", "curricula_s3_d", "curricula_s3_e"];
// Added by 20261128000000_curricula_latin_america.sql: seeded ON.
const LATIN_AMERICA = "curricula_latin_america";
const PUBLIC_KEYS = new Set(["signups_open", "maintenance_mode", "google_signin", ...SWITCHES, ...STAGE2_SWITCHES, ...STAGE3_RELEASES, LATIN_AMERICA]);

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
    const { error: pe } = await admin
      .from("profiles")
      .upsert({ id: person.id, first_name: "Verify", surname: name, country: "GB", curriculum_id: "england" });
    if (pe) throw new Error(`Could not seed ${name}'s profile: ${pe.message}`);
  }
}

async function cleanUp() {
  for (const person of Object.values(PEOPLE)) {
    if (person.id) await admin.auth.admin.deleteUser(person.id).catch(() => {});
  }
}

const curriculumOf = async (id) =>
  (await admin.from("profiles").select("curriculum_id, curriculum_confirmed_at, plan").eq("id", id).single()).data;

async function main() {
  await setUp();
  const ada = await signIn(PEOPLE.ada);

  console.log("\nA teacher's own curriculum");
  {
    const at = new Date().toISOString();
    const { error } = await ada
      .from("profiles")
      .update({ curriculum_id: "jersey", curriculum_confirmed_at: at })
      .eq("id", PEOPLE.ada.id);
    const row = await curriculumOf(PEOPLE.ada.id);
    check("a teacher sets their own curriculum", !error && row.curriculum_id === "jersey" && Boolean(row.curriculum_confirmed_at), error?.message ?? JSON.stringify(row));
  }
  {
    const { data, error } = await ada.from("profiles").select("curriculum_id").eq("id", PEOPLE.ada.id).single();
    check("and reads it back", !error && data.curriculum_id === "jersey", error?.message);
  }
  {
    const { error } = await ada.from("profiles").update({ curriculum_id: null }).eq("id", PEOPLE.ada.id);
    check("null is allowed (no curriculum yet)", !error, error?.message);
  }

  console.log("\nThe format check");
  for (const bad of ["Jersey", "england; drop table profiles", "us_tx", "-england", "england-", "a".repeat(41), ""]) {
    const { error } = await ada.from("profiles").update({ curriculum_id: bad }).eq("id", PEOPLE.ada.id);
    check(`refuses ${JSON.stringify(bad.length > 20 ? `${bad.slice(0, 12)}...` : bad)}`, Boolean(error), "update went through");
  }

  console.log("\nSomeone else's curriculum");
  {
    // A refused update under RLS is not an error: it touches zero rows. The
    // proof is that the row is unchanged afterwards.
    await ada.from("profiles").update({ curriculum_id: "gibraltar" }).eq("id", PEOPLE.ben.id);
    const row = await curriculumOf(PEOPLE.ben.id);
    check("a teacher cannot set another teacher's curriculum", row.curriculum_id === "england", JSON.stringify(row));
  }
  {
    const { data } = await ada.from("profiles").select("curriculum_id").eq("id", PEOPLE.ben.id);
    check("or read it", (data ?? []).length === 0, JSON.stringify(data));
  }
  {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    await anon.from("profiles").update({ curriculum_id: "gibraltar" }).eq("id", PEOPLE.ben.id);
    const row = await curriculumOf(PEOPLE.ben.id);
    check("anon cannot set anyone's curriculum", row.curriculum_id === "england", JSON.stringify(row));
  }

  console.log("\nThe privileged-column guard still holds");
  {
    const before = await curriculumOf(PEOPLE.ada.id);
    const { error } = await ada.from("profiles").update({ curriculum_id: "england", plan: "pro" }).eq("id", PEOPLE.ada.id);
    const after = await curriculumOf(PEOPLE.ada.id);
    check("a curriculum update cannot carry a plan change with it", Boolean(error) && after.plan === before.plan, error ? `plan ${after.plan}` : "update went through");
  }

  console.log("\nThe region switches");
  for (const [who, client] of [
    ["anon", createClient(URL, ANON, { auth: { persistSession: false } })],
    ["a teacher", ada],
  ]) {
    const { data, error } = await client.rpc("public_settings");
    const keys = (data ?? []).map((r) => r.key);
    check(`${who} reads all six first-stage switches`, !error && SWITCHES.every((k) => keys.includes(k)), error?.message ?? keys.join(", "));
    check(
      `${who} reads the five Stage 2 switches, all off`,
      !error && STAGE2_SWITCHES.every((k) => (data ?? []).some((r) => r.key === k && r.value === false)),
      JSON.stringify((data ?? []).filter((r) => STAGE2_SWITCHES.includes(r.key))),
    );
    check(
      `${who} reads the five Stage 3 batch switches, all off`,
      !error && STAGE3_RELEASES.every((k) => (data ?? []).some((r) => r.key === k && r.value === false)),
      JSON.stringify((data ?? []).filter((r) => STAGE3_RELEASES.includes(r.key))),
    );
    check(
      `${who} reads the Latin America switch, on`,
      !error && (data ?? []).some((r) => r.key === LATIN_AMERICA && r.value === true),
      JSON.stringify((data ?? []).filter((r) => r.key === LATIN_AMERICA)),
    );
    check(`${who} reads nothing beyond the named keys`, keys.every((k) => PUBLIC_KEYS.has(k)), keys.join(", "));
  }
  {
    const { error } = await ada.rpc("admin_set_setting", { p_key: "curricula_usa", p_value: true });
    const { data } = await admin.from("app_settings").select("value").eq("key", "curricula_usa").single();
    check("a teacher cannot switch a region on", Boolean(error) && data.value === false, error ? JSON.stringify(data) : "rpc went through");
  }
  {
    const { error } = await ada.rpc("admin_set_setting", { p_key: "curricula_s3_a", p_value: true });
    const { data } = await admin.from("app_settings").select("value").eq("key", "curricula_s3_a").single();
    check("a teacher cannot switch a Stage 3 batch on", Boolean(error) && data.value === false, error ? JSON.stringify(data) : "rpc went through");
  }
  {
    const { error } = await ada.rpc("admin_set_setting", { p_key: LATIN_AMERICA, p_value: false });
    const { data } = await admin.from("app_settings").select("value").eq("key", LATIN_AMERICA).single();
    check("a teacher cannot switch the Latin America region off", Boolean(error) && data.value === true, error ? JSON.stringify(data) : "rpc went through");
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
