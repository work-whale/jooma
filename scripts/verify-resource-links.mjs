/*
 * Favourites and public share links: an end to end check against staging.
 *
 *   node scripts/verify-resource-links.mjs
 *
 * Asserts the behaviour supabase/migrations/20261120000300_favourites_and_
 * resource_links.sql claims, above all the parts that would be a privacy bug
 * rather than a broken feature:
 *
 *   - a link cannot be made for someone else's resource, or signed out
 *   - a report (pupil details) can never get a link
 *   - the public read leaks no owner id, no teacher name and no private input
 *   - a link that is turned off, or whose owner is suspended, reads as nothing
 *   - a run pointing at another teacher's presentation does not publish it
 *   - nobody reads anyone else's resource_links rows
 *   - favourite_tools only takes /tools/<slug> links, at most 50
 *
 * Throwaway users are made with the service role; every assertion runs through
 * the ANON key as one of them, since the service role bypasses RLS. Cleans up
 * after itself, failures included. STAGING ONLY: it refuses any other project.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!URL.includes("tkvzsqtgsesodifcakko")) {
  console.error(`Refusing: ${URL} is not staging.`);
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

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

const stamp = Date.now();
const PEOPLE = {
  alice: { email: `verify-links-a-${stamp}@jooma.test`, password: `pw-${stamp}-aaa` },
  bob: { email: `verify-links-b-${stamp}@jooma.test`, password: `pw-${stamp}-bbb` },
};

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
    const { error: pe } = await admin.from("profiles").upsert({
      id: person.id,
      first_name: name[0].toUpperCase() + name.slice(1),
      surname: "Linkerson",
      country: "GB",
    });
    if (pe) throw new Error(`Could not write ${name}'s profile: ${pe.message}`);
  }
}

async function cleanUp() {
  for (const person of Object.values(PEOPLE)) {
    if (person.id) await admin.auth.admin.deleteUser(person.id).catch(() => {});
  }
}

async function insertRun(client, row) {
  const { data, error } = await client.from("tool_runs").insert(row).select("id").single();
  if (error) throw new Error(`Could not insert run: ${error.message}`);
  return data.id;
}

async function run() {
  await createPeople();
  const alice = await signIn(PEOPLE.alice);
  const bob = await signIn(PEOPLE.bob);
  const A = PEOPLE.alice.id;
  const B = PEOPLE.bob.id;

  const SECRET = `private-note-${stamp}`;
  const sheetRun = await insertRun(alice, {
    tool_slug: "worksheet-generator",
    title: "Fractions",
    input: { topic: "Fractions", yearGroup: "Year 5", subject: "Maths", notes: SECRET },
    output: "# Fractions\n\nQuestion one.",
  });
  const reportRun = await insertRun(alice, {
    tool_slug: "report-writer",
    title: "Class reports",
    input: {},
    output: "Amelia worked hard.",
  });

  /* ── Favourites ─────────────────────────────────────────────────────── */
  section("Favourites");
  {
    const { data } = await alice.from("profiles").select("favourite_tools").eq("id", A).single();
    check("a new profile has no list (null, so the defaults show)", data?.favourite_tools === null);

    let r = await alice.from("profiles").update({ favourite_tools: ["/tools/quiz-generator", "/tools/slideshow"] }).eq("id", A);
    check("a teacher can save their own stars", r.error === null, r.error?.message);

    r = await alice.from("profiles").update({ favourite_tools: [] }).eq("id", A);
    const { data: empty } = await alice.from("profiles").select("favourite_tools").eq("id", A).single();
    check("an empty list saves as empty, not null", r.error === null && Array.isArray(empty?.favourite_tools) && empty.favourite_tools.length === 0, r.error?.message);

    for (const bad of [["javascript:alert(1)"], ["/admin"], ["/tools/Slides"], ["/tools/a,/tools/b"]]) {
      r = await alice.from("profiles").update({ favourite_tools: bad }).eq("id", A);
      check(`a bad value is refused: ${JSON.stringify(bad)}`, r.error !== null);
    }
    const tooMany = Array.from({ length: 51 }, (_, i) => `/tools/t${i}`);
    r = await alice.from("profiles").update({ favourite_tools: tooMany }).eq("id", A);
    check("51 stars are refused", r.error !== null);

    await bob.from("profiles").update({ favourite_tools: ["/tools/letter-writer"] }).eq("id", A);
    const { data: after } = await admin.from("profiles").select("favourite_tools").eq("id", A).single();
    check("another teacher cannot change them", Array.isArray(after?.favourite_tools) && after.favourite_tools.length === 0);
  }

  /* ── Making a link ──────────────────────────────────────────────────── */
  section("Making a link");
  let token = null;
  {
    const { error } = await anon.rpc("create_resource_link", { p_run_id: sheetRun });
    check("signed out cannot make a link", error !== null);
  }
  {
    const { data, error } = await bob.rpc("create_resource_link", { p_run_id: sheetRun });
    check("another teacher cannot make a link to it", error !== null && !data, error ? "" : `GOT ${data}`);
  }
  {
    const { data, error } = await alice.rpc("create_resource_link", { p_run_id: reportRun });
    check("a report can never get a link", error !== null && !data, error ? "" : "A REPORT GOT A PUBLIC LINK");
  }
  {
    const { data, error } = await alice.rpc("create_resource_link", { p_run_id: sheetRun });
    token = data;
    check("the owner gets a token of the right shape", !error && /^[A-Za-z0-9_-]{22}$/.test(token ?? ""), error?.message ?? String(data));
    const again = await alice.rpc("create_resource_link", { p_run_id: sheetRun });
    check("asking again returns the same token", again.data === token);
  }
  {
    const { data } = await bob.from("resource_links").select("id");
    check("another teacher reads none of the link rows", (data ?? []).length === 0);
    const { data: own } = await alice.from("resource_links").select("token").eq("tool_run_id", sheetRun);
    check("the owner reads their own", own?.length === 1 && own[0].token === token);
    const ins = await alice.from("resource_links").insert({ token: "a".repeat(22), user_id: A, tool_run_id: sheetRun });
    check("resource_links cannot be written directly", ins.error !== null);
    const { error: rowErr } = await anon.rpc("resource_link_row", { p_token: token });
    check("the internal row function is not callable", rowErr !== null);
  }

  /* ── Reading it ─────────────────────────────────────────────────────── */
  section("Reading it, signed out");
  {
    const { data, error } = await anon.rpc("public_resource_link", { p_token: token });
    const row = data?.[0];
    check("anyone with the link reads it", !error && row?.title === "Fractions" && row?.output?.includes("Question one"), error?.message);
    const flat = JSON.stringify(data ?? []);
    check("no owner id in the result", !flat.includes(A));
    check("no teacher name in the result", !flat.includes("Alice") && !flat.includes("Linkerson"));
    check("no private input in the result", !flat.includes(SECRET));
    check("the quiz heading fields come through", row?.input?.topic === "Fractions" && row?.input?.yearGroup === "Year 5");
    check("no columns beyond the named ones", row && Object.keys(row).sort().join(",") === "created_at,input,output,slides,title,tool_slug", row && Object.keys(row).join(","));
  }
  for (const bad of ["", "x", "' or 1=1 --", "A".repeat(22)]) {
    const { data, error } = await anon.rpc("public_resource_link", { p_token: bad });
    check(`a wrong token reads nothing: ${JSON.stringify(bad.slice(0, 12))}`, !error && (data ?? []).length === 0, error?.message);
  }

  /* ── Decks ──────────────────────────────────────────────────────────── */
  section("Decks");
  const slides = [{ id: "s1", elements: [{ type: "text", text: "Hello deck" }] }];
  let deckRun;
  {
    const { data: pres, error } = await alice.from("presentations").insert({ user_id: A, title: "Volcanoes", slides }).select("id").single();
    if (error) throw new Error(`presentation: ${error.message}`);
    deckRun = await insertRun(alice, {
      tool_slug: "slideshow",
      title: "Volcanoes",
      input: { presentationId: pres.id, slideCount: 1 },
      output: "Generated a 1-slide deck.",
    });
    const t = (await alice.rpc("create_resource_link", { p_run_id: deckRun })).data;
    const { data } = await anon.rpc("public_resource_link", { p_token: t });
    check("a deck's slides come from its presentation", JSON.stringify(data?.[0]?.slides ?? null).includes("Hello deck"));

    // Bob points his own run at Alice's presentation and shares it.
    const theft = await insertRun(bob, {
      tool_slug: "slideshow",
      title: "Borrowed",
      input: { presentationId: pres.id },
      output: "Generated a 1-slide deck.",
    });
    const bt = (await bob.rpc("create_resource_link", { p_run_id: theft })).data;
    const { data: stolen } = await anon.rpc("public_resource_link", { p_token: bt });
    check("a run pointing at someone else's presentation does not publish it", stolen?.length === 1 && stolen[0].slides === null,
      stolen?.[0]?.slides ? "ALICE'S DECK WAS PUBLISHED THROUGH BOB'S LINK" : JSON.stringify(stolen));

    // A garbage id must not break the read.
    const junk = await insertRun(bob, { tool_slug: "slideshow", title: "Junk", input: { presentationId: "not-a-uuid" }, output: "x" });
    const jt = (await bob.rpc("create_resource_link", { p_run_id: junk })).data;
    const { data: jd, error: je } = await anon.rpc("public_resource_link", { p_token: jt });
    check("a malformed presentation id still reads (with no slides)", !je && jd?.length === 1 && jd[0].slides === null, je?.message);

    // Bob saves a copy of Alice's deck.
    const { data: copy, error: ce } = await bob.rpc("save_resource_link_copy", { p_token: t });
    const c = copy?.[0];
    check("a signed-in teacher saves a copy of a deck", !ce && c?.run_id && c?.presentation_id, ce?.message);
    if (c?.presentation_id) {
      const { data: p } = await bob.from("presentations").select("user_id, slides").eq("id", c.presentation_id).single();
      check("the copy is a new presentation they own", p?.user_id === B && JSON.stringify(p.slides).includes("Hello deck"));
      const { data: r } = await bob.from("tool_runs").select("user_id, input").eq("id", c.run_id).single();
      check("its run points at the copy", r?.user_id === B && r.input?.presentationId === c.presentation_id);
      check("the copy is not the original", c.presentation_id !== pres.id);
    }
  }

  /* ── Saving a copy ──────────────────────────────────────────────────── */
  section("Saving a copy");
  {
    const { error } = await anon.rpc("save_resource_link_copy", { p_token: token });
    check("signed out cannot save a copy", error !== null);

    const { data, error: e2 } = await bob.rpc("save_resource_link_copy", { p_token: token });
    const id = data?.[0]?.run_id;
    const { data: r } = await bob.from("tool_runs").select("user_id, tool_slug, output, input").eq("id", id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
    check("a signed-in teacher saves a copy into their own library", !e2 && r?.user_id === B && r.output.includes("Question one"), e2?.message);
    check("the copy does not carry the private input", r && !JSON.stringify(r.input).includes(SECRET));
  }

  /* ── Turning it off ─────────────────────────────────────────────────── */
  section("Turning it off");
  {
    await bob.rpc("revoke_resource_link", { p_run_id: sheetRun });
    const { data: still } = await anon.rpc("public_resource_link", { p_token: token });
    check("another teacher cannot turn it off", still?.length === 1);

    const { error } = await alice.rpc("revoke_resource_link", { p_run_id: sheetRun });
    check("the owner turns it off", error === null, error?.message);
    const { data } = await anon.rpc("public_resource_link", { p_token: token });
    check("a turned-off link reads nothing", (data ?? []).length === 0);
    const { error: se } = await bob.rpc("save_resource_link_copy", { p_token: token });
    check("a turned-off link cannot be copied", se !== null);

    const { data: fresh } = await alice.rpc("create_resource_link", { p_run_id: sheetRun });
    check("turning it back on makes a new token", fresh && fresh !== token);
    const { data: old } = await anon.rpc("public_resource_link", { p_token: token });
    check("the old token stays dead", (old ?? []).length === 0);
    token = fresh;
  }

  /* ── The owner's account ────────────────────────────────────────────── */
  section("The owner's account");
  {
    await admin.from("profiles").update({ suspended_at: new Date().toISOString(), suspended_reason: "verify" }).eq("id", A);
    const { data } = await anon.rpc("public_resource_link", { p_token: token });
    check("a suspended owner's links read nothing", (data ?? []).length === 0);
    await admin.from("profiles").update({ suspended_at: null, suspended_reason: null }).eq("id", A);

    await alice.from("tool_runs").delete().eq("id", sheetRun);
    const { data: gone } = await anon.rpc("public_resource_link", { p_token: token });
    check("deleting the resource kills its link", (gone ?? []).length === 0);
  }
}

console.log(`Verifying favourites and resource links against ${URL}\n`);
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
  console.log(`All ${passed} checks passed. Test users removed.`);
  process.exit(0);
} else {
  console.log(`${passed} passed, ${failures.length} FAILED. Test users removed.\n`);
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `\n    ${f.detail}` : ""}`);
  process.exit(1);
}
