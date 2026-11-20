/*
 * Accepting a newer ambassador agreement: a check against a real database.
 *
 *   node scripts/verify-agreement-acceptances.mjs
 *
 * Asserts what 20261120000200_ambassador_agreement_acceptances.sql claims:
 *
 *   - nobody reads or writes the acceptances table directly
 *   - a signed-in teacher cannot call accept_ambassador_agreement themselves
 *     (the route is the only caller, as it alone knows the real IP)
 *   - accepting records one row per version, and a repeat is a no-op
 *   - you see your own acceptances and nobody else's
 *   - the admin list refuses a non-admin
 *   - no acceptance without a pending or approved application, of the version
 *     already signed, or with a name too short to be a signature
 *
 * Fixtures are made with the service role; every visibility check runs through
 * the ANON key as a signed-in throwaway user, since the service role bypasses
 * RLS. Cleans up after itself. RUN IT ON STAGING.
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
  console.error("This creates and deletes users. It only runs against STAGING.");
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
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const createdUsers = [];
const createdApps = [];

async function makeUser(label) {
  const email = `e2e-agr-${label}-${tag}@jooma.test`;
  const password = `Pw-${tag}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Could not create ${label}: ${error.message}`);
  createdUsers.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, first_name: label, surname: "Agrtest" });
  return { id: data.user.id, email, password, label };
}

async function asUser(user) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`Could not sign in as ${user.email}: ${error.message}`);
  return client;
}

async function apply(user, version) {
  const code = `ZZA${tag}${user.label.slice(0, 2)}`.toUpperCase().slice(0, 20);
  const { data: id, error } = await admin.rpc("submit_ambassador_application", {
    p_user_id: user.id,
    payload: {
      first_name: user.label,
      last_name: "Agrtest",
      email: user.email,
      mobile: "07700 900412",
      date_of_birth: "1990-04-18",
      address_line: "1 Test Road",
      town: "Leeds",
      postcode: "LS1 1AA",
      instagram: `zzig${tag}${user.label}`,
      reach: "1k_5k",
      payout_method: "paypal",
      account_holder: `${user.label} Agrtest`,
      paypal_email: `pp-${tag}-${user.label}@example.com`,
      tax_status: "self_assessment",
      requested_code: code,
      agreement_version: version,
      signature_name: `${user.label} Agrtest`,
      declarations: { read: true, tax: true, disclosure: true },
    },
  });
  if (error) throw new Error(`Could not submit for ${user.label}: ${error.message}`);
  createdApps.push(id);
  return id;
}

const accept = (userId, version, name) =>
  admin.rpc("accept_ambassador_agreement", {
    p_user_id: userId,
    p_version: version,
    p_signature_name: name,
    p_ip: "203.0.113.7",
    p_user_agent: "verify-agreement-acceptances",
  });

async function main() {
  const priya = await makeUser("Priya");
  const stranger = await makeUser("Stranger");
  const nobody = await makeUser("Nobody");
  await apply(priya, "0.4");
  await apply(stranger, "0.4");

  const priyaClient = await asUser(priya);
  const strangerClient = await asUser(stranger);
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });

  console.log("\nThe table is closed");
  {
    const { data, error } = await priyaClient.from("ambassador_agreement_acceptances").select("*");
    check("a teacher cannot read the table", Boolean(error) || (data ?? []).length === 0, error?.message);
    const { error: ins } = await priyaClient.from("ambassador_agreement_acceptances").insert({
      application_id: createdApps[0],
      user_id: priya.id,
      version: "0.5",
      signature_name: "Priya Agrtest",
    });
    check("a teacher cannot insert into it", Boolean(ins), "insert went through");
  }

  console.log("\nOnly the server can accept");
  {
    const { error } = await priyaClient.rpc("accept_ambassador_agreement", {
      p_user_id: priya.id,
      p_version: "0.5",
      p_signature_name: "Priya Agrtest",
      p_ip: "1.2.3.4",
      p_user_agent: "forged",
    });
    check("a signed-in teacher cannot call accept_ambassador_agreement", Boolean(error), "call went through");
    const { error: anonErr } = await anonClient.rpc("accept_ambassador_agreement", {
      p_user_id: priya.id,
      p_version: "0.5",
      p_signature_name: "Priya Agrtest",
      p_ip: null,
      p_user_agent: null,
    });
    check("a signed-out caller cannot either", Boolean(anonErr), "call went through");
  }

  console.log("\nAccepting");
  {
    const { data: at1, error: e1 } = await accept(priya.id, "0.5", "  Priya Agrtest ");
    check("the server accepts 0.5 for an applicant on 0.4", !e1 && Boolean(at1), e1?.message);
    const { data: at2, error: e2 } = await accept(priya.id, "0.5", "Priya Agrtest");
    check("accepting again is a no-op that returns the first time", !e2 && at2 === at1, `${at1} vs ${at2} ${e2?.message ?? ""}`);
    const { data: rows } = await admin
      .from("ambassador_agreement_acceptances")
      .select("version, signature_name, signed_ip, signed_user_agent")
      .eq("user_id", priya.id);
    check("exactly one row is stored", (rows ?? []).length === 1, JSON.stringify(rows));
    check(
      "it keeps the trimmed name, the IP and the browser",
      rows?.[0]?.signature_name === "Priya Agrtest" &&
        rows?.[0]?.signed_ip === "203.0.113.7" &&
        rows?.[0]?.signed_user_agent === "verify-agreement-acceptances",
      JSON.stringify(rows?.[0]),
    );
    const { data: app } = await admin
      .from("ambassador_applications")
      .select("agreement_version, signature_name")
      .eq("id", createdApps[0])
      .single();
    check("the original signature is untouched", app?.agreement_version === "0.4" && app?.signature_name === "Priya Agrtest", JSON.stringify(app));
  }

  console.log("\nRefusals");
  {
    const { error: same } = await accept(stranger.id, "0.4", "Stranger Agrtest");
    check("refuses the version already signed", Boolean(same), "accepted");
    const { error: short } = await accept(stranger.id, "0.5", " Al ");
    check("refuses a name too short to be a signature", Boolean(short), "accepted");
    const { error: none } = await accept(nobody.id, "0.5", "Nobody Agrtest");
    check("refuses someone with no application", Boolean(none), "accepted");
    await admin.from("ambassador_applications").update({ status: "declined" }).eq("id", createdApps[1]);
    const { error: declined } = await accept(stranger.id, "0.5", "Stranger Agrtest");
    check("refuses a declined applicant", Boolean(declined), "accepted");
  }

  console.log("\nWho sees what");
  {
    const { data: mine, error } = await priyaClient.rpc("my_ambassador_agreement_acceptances");
    check(
      "the teacher sees their own acceptance",
      !error && mine?.length === 1 && mine[0].version === "0.5" && mine[0].signature_name === "Priya Agrtest",
      error?.message ?? JSON.stringify(mine),
    );
    check("and only the three named columns", mine?.[0] && Object.keys(mine[0]).sort().join() === "accepted_at,signature_name,version", JSON.stringify(mine?.[0]));
    const { data: theirs } = await strangerClient.rpc("my_ambassador_agreement_acceptances");
    check("someone else sees none of it", (theirs ?? []).length === 0, JSON.stringify(theirs));
    const { data: anonRows, error: anonErr } = await anonClient.rpc("my_ambassador_agreement_acceptances");
    check("a signed-out caller sees nothing", Boolean(anonErr) || (anonRows ?? []).length === 0, JSON.stringify(anonRows));
    const { error: adminErr } = await priyaClient.rpc("admin_ambassador_agreements");
    check("the admin list refuses a teacher", Boolean(adminErr), "returned rows");
    const staff = await makeUser("Staff");
    await admin.from("profiles").update({ is_admin: true }).eq("id", staff.id);
    const staffClient = await asUser(staff);
    const { data: adminRows, error: staffErr } = await staffClient.rpc("admin_ambassador_agreements");
    check(
      "an admin sees the signed version and the acceptance",
      !staffErr && (adminRows ?? []).some((r) => r.application_id === createdApps[0] && r.version === "0.5" && r.signed_version === "0.4"),
      staffErr?.message,
    );
    check(
      "the admin list leaves out a declined application",
      !(adminRows ?? []).some((r) => r.application_id === createdApps[1]),
      "declined application listed",
    );
  }
}

async function cleanup() {
  for (const id of createdApps) await admin.from("ambassador_applications").delete().eq("id", id);
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
}

try {
  await main();
} catch (err) {
  failures.push(String(err));
  console.error(err);
} finally {
  await cleanup();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
