/*
 * Usage rows: an end to end check that the browser cannot write spend.
 *
 *   node scripts/verify-usage-writes.mjs
 *
 * WHAT THIS IS FOR
 *
 * The monthly credit ceiling is the sum of a teacher's token_usage and
 * asset_cost rows. If a teacher can write those rows, they can write a negative
 * cost and never meet the ceiling. This asserts what
 * supabase/migrations/20261111000000_lock_usage_writes.sql claims:
 *
 *   - a signed-in teacher cannot insert, update or delete a usage row, positive
 *     cost or negative
 *   - they can still read their own rows (the billing page and the follow-up
 *     budget depend on that), and never another teacher's
 *   - even the service role cannot store a negative cost
 *
 * HOW IT PROVES ANYTHING
 *
 * Two throwaway users are created with the service role, then every browser
 * assertion runs through the ANON key as one of them. The service role
 * bypasses RLS, so a check written against it would pass however wrong the
 * policies were.
 *
 * It cleans up after itself, including when it fails part way through.
 *
 * RUN IT ON STAGING. It creates and deletes users.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/* ── Environment ─────────────────────────────────────────────────────────── */

// .env.local by hand: no Next.js runtime here. The \r strip matters on
// Windows, where CRLF endings otherwise leave a carriage return in each value.
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

/* ── Reporting ───────────────────────────────────────────────────────────── */

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

function section(title) {
  console.log(`\n${title}`);
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const stamp = Date.now();
const PEOPLE = {
  alice: { email: `verify-usage-a-${stamp}@jooma.test`, password: `pw-${stamp}-aaa` },
  bob: { email: `verify-usage-b-${stamp}@jooma.test`, password: `pw-${stamp}-bbb` },
};

const TOOL = "verify-usage-writes";

function usageRow(userId, cost) {
  return {
    user_id: userId,
    tool_slug: TOOL,
    model: "gpt-4o",
    prompt_tokens: 10,
    completion_tokens: 10,
    cost_usd: cost,
  };
}

function assetRow(userId, cost) {
  return { user_id: userId, tool_slug: TOOL, kind: "image", units: 1, cost_usd: cost };
}

async function signIn(person) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: person.email, password: person.password });
  if (error) throw new Error(`Could not sign in ${person.email}: ${error.message}`);
  return client;
}

async function createPeople() {
  for (const [name, person] of Object.entries(PEOPLE)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
    });
    if (error) throw new Error(`Could not create ${name}: ${error.message}`);
    person.id = data.user.id;
  }
}

async function cleanUp() {
  // Rows first: token_usage keeps a row (owner nulled) when its user goes.
  await admin.from("token_usage").delete().eq("tool_slug", TOOL);
  await admin.from("asset_cost").delete().eq("tool_slug", TOOL);
  for (const person of Object.values(PEOPLE)) {
    if (person.id) await admin.auth.admin.deleteUser(person.id).catch(() => {});
  }
}

/** Rows of TOOL the service role can see, so a write that reports an error but
 *  landed anyway is still caught. */
async function countAsAdmin(table, userId) {
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tool_slug", TOOL)
    .eq("user_id", userId);
  return count ?? 0;
}

/* ── The checks ──────────────────────────────────────────────────────────── */

async function run() {
  await createPeople();
  const A = PEOPLE.alice.id;
  const B = PEOPLE.bob.id;
  const alice = await signIn(PEOPLE.alice);

  section("A teacher cannot write spend");

  {
    const { error } = await alice.from("token_usage").insert(usageRow(A, -100));
    const landed = await countAsAdmin("token_usage", A);
    check("token_usage INSERT with a negative cost is refused", error !== null && landed === 0,
      landed ? "A NEGATIVE COST ROW WAS WRITTEN FROM THE BROWSER. Unlimited credits." : "No error returned.");
  }

  {
    const { error } = await alice.from("token_usage").insert(usageRow(A, 0.01));
    const landed = await countAsAdmin("token_usage", A);
    check("token_usage INSERT with a positive cost is refused", error !== null && landed === 0,
      "The browser can still write usage rows.");
  }

  {
    const { error } = await alice.from("asset_cost").insert(assetRow(A, -100));
    const landed = await countAsAdmin("asset_cost", A);
    check("asset_cost INSERT with a negative cost is refused", error !== null && landed === 0,
      landed ? "A NEGATIVE ASSET COST WAS WRITTEN FROM THE BROWSER. Unlimited credits." : "No error returned.");
  }

  {
    const { error } = await alice.from("asset_cost").insert(assetRow(A, 0.01));
    const landed = await countAsAdmin("asset_cost", A);
    check("asset_cost INSERT with a positive cost is refused", error !== null && landed === 0,
      "The browser can still write asset cost rows.");
  }

  // Seed real rows the way the server does, then try to change them.
  const { data: seeded, error: seedErr } = await admin
    .from("token_usage")
    .insert([usageRow(A, 0.5), usageRow(B, 0.5)])
    .select("id, user_id");
  if (seedErr) throw new Error(`Could not seed usage rows: ${seedErr.message}`);
  const ownId = seeded.find((r) => r.user_id === A).id;
  const otherId = seeded.find((r) => r.user_id === B).id;

  const { data: seededAsset, error: assetErr } = await admin
    .from("asset_cost")
    .insert(assetRow(A, 0.5))
    .select("id")
    .single();
  if (assetErr) throw new Error(`Could not seed an asset row: ${assetErr.message}`);

  {
    await alice.from("token_usage").update({ cost_usd: -100 }).eq("id", ownId);
    const { data } = await admin.from("token_usage").select("cost_usd").eq("id", ownId).single();
    check("token_usage UPDATE of an own row changes nothing", Number(data?.cost_usd) === 0.5,
      `Cost is now ${data?.cost_usd}.`);
  }

  {
    await alice.from("token_usage").delete().eq("id", ownId);
    const { data } = await admin.from("token_usage").select("id").eq("id", ownId);
    check("token_usage DELETE of an own row removes nothing", data?.length === 1,
      "A teacher can delete their own spend.");
  }

  {
    await alice.from("asset_cost").update({ cost_usd: -100 }).eq("id", seededAsset.id);
    await alice.from("asset_cost").delete().eq("id", seededAsset.id);
    const { data } = await admin.from("asset_cost").select("cost_usd").eq("id", seededAsset.id);
    check("asset_cost UPDATE and DELETE of an own row change nothing",
      data?.length === 1 && Number(data[0].cost_usd) === 0.5,
      `Row is now ${JSON.stringify(data)}.`);
  }

  section("Reading still works, for own rows only");

  {
    const { data, error } = await alice.from("token_usage").select("id").eq("tool_slug", TOOL);
    const ids = (data ?? []).map((r) => r.id);
    check("a teacher reads their own usage row", !error && ids.includes(ownId), error?.message);
    check("a teacher cannot read another teacher's usage row", !ids.includes(otherId),
      "Another teacher's spend is readable.");
  }

  {
    const { data, error } = await alice.from("asset_cost").select("id").eq("tool_slug", TOOL);
    check("a teacher reads their own asset cost row",
      !error && (data ?? []).some((r) => r.id === seededAsset.id), error?.message);
  }

  section("No negative cost, even from the server");

  {
    const { error } = await admin.from("token_usage").insert(usageRow(A, -0.01));
    check("token_usage refuses a negative cost from the service role", error !== null,
      "token_usage_cost_nonneg is missing.");
  }

  {
    const { error } = await admin.from("asset_cost").insert(assetRow(A, -0.01));
    check("asset_cost refuses a negative cost from the service role", error !== null,
      "asset_cost_cost_nonneg is missing.");
  }

  {
    const { error } = await admin.from("token_usage").insert(usageRow(A, 0));
    check("a zero cost is still accepted", error === null, error?.message);
  }
}

/* ── Go ──────────────────────────────────────────────────────────────────── */

console.log(`Verifying usage writes against ${URL}\n`);

try {
  await run();
} catch (error) {
  console.error(`\nThe run stopped early: ${error.message}`);
  failures.push({ name: "the script itself", detail: error.message });
} finally {
  await cleanUp();
}

console.log(`\n${"─".repeat(60)}`);
if (failures.length === 0) {
  console.log(`All ${passed} checks passed. Test users and rows removed.`);
  process.exit(0);
} else {
  console.log(`${passed} passed, ${failures.length} FAILED. Test users and rows removed.\n`);
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `\n    ${f.detail}` : ""}`);
  process.exit(1);
}
