/*
 * Jooma 4.5 plans engine, checked through the ANON key as throwaway users.
 *
 *   node scripts/verify-resources.mjs
 *
 * WAITING ON THE MIGRATION: needs 20261118000000_plans_engine.sql pushed to
 * STAGING. Not yet run. Aims at whatever .env.local holds, which must be
 * staging; it refuses the production project id.
 *
 * What it proves (each assertion as the signed-in teacher, so RLS and the
 * definer functions are really exercised; the service role only sets up):
 *   - my_resources(): a new trial shows 300; an expired trial moves to Free
 *     with 50 and logs moved_to_free; Free shows 50.
 *   - A teacher cannot read resource_accounts, trial_email_keys,
 *     signup_devices, app_events or lifecycle_email_log directly.
 *   - A teacher cannot set their own plan, trial_ends_at or payment_failed_at.
 *   - A teacher cannot call claim_trial_email, resources_start,
 *     resources_change_plan or record_signup_device.
 *   - use_refine(): Free stops at 10; a paid plan returns null (unlimited).
 *   - A Standard to Pro change adds 500 and keeps the refill date.
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

const made = [];
async function teacher(profile) {
  const email = `verify-resources-${randomUUID()}@jooma.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  made.push(id);
  const { error: pErr } = await admin.from("profiles").upsert({ id, first_name: "Verify", ...profile });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id, client };
}
const one = (d) => (Array.isArray(d) ? d[0] : d);

try {
  console.log("Trial");
  const soon = new Date(Date.now() + 5 * 864e5).toISOString();
  const t = await teacher({ plan: "pro_trial", trial_ends_at: soon });
  let r = await t.client.rpc("my_resources");
  check("trial shows 300", !r.error && one(r.data)?.total === 300 && one(r.data)?.plan === "pro_trial", r.error?.message);

  await admin.from("profiles").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", t.id);
  r = await t.client.rpc("my_resources");
  check("expired trial moves to Free with 50", one(r.data)?.plan === "free" && one(r.data)?.total === 50 && one(r.data)?.trial_ended_now === true, JSON.stringify(r.data));
  const { data: ev } = await admin.from("app_events").select("name").eq("user_id", t.id);
  check("moved_to_free and trial_ended logged", ev?.some((e) => e.name === "moved_to_free") && ev?.some((e) => e.name === "trial_ended"));

  console.log("Nothing readable or callable that should not be");
  for (const table of ["resource_accounts", "trial_email_keys", "signup_devices", "app_events", "lifecycle_email_log"]) {
    const { data, error } = await t.client.from(table).select("*").limit(1);
    check(`${table} not readable`, Boolean(error) || (data ?? []).length === 0, error?.message);
  }
  for (const [fn, args] of [
    ["claim_trial_email", { p_key: "a".repeat(64) }],
    ["resources_start", { p_uid: t.id, p_plan: "max" }],
    ["resources_change_plan", { p_uid: t.id, p_from: "free", p_to: "max" }],
    ["record_signup_device", { p_device: "device-12345", p_uid: t.id }],
    ["launch_v45_move_accounts", { p_apply: false }],
  ]) {
    const { error } = await t.client.rpc(fn, args);
    check(`${fn} refused to a teacher`, Boolean(error), "it ran");
  }
  for (const [col, val] of [
    ["plan", "max"],
    ["trial_ends_at", new Date(Date.now() + 365 * 864e5).toISOString()],
    ["payment_failed_at", new Date().toISOString()],
  ]) {
    const { error } = await t.client.from("profiles").update({ [col]: val }).eq("id", t.id);
    check(`teacher cannot set ${col}`, Boolean(error));
  }

  console.log("Refines");
  for (let i = 0; i < 10; i++) await t.client.rpc("use_refine");
  const { error: eleventh } = await t.client.rpc("use_refine");
  check("Free stops at 10 refines", Boolean(eleventh) && eleventh.message.includes("refine_limit"), eleventh?.message);

  console.log("Upgrade");
  const s = await teacher({ plan: "standard" });
  const before = one((await s.client.rpc("my_resources")).data);
  await admin.from("profiles").update({ plan: "pro" }).eq("id", s.id);
  await admin.rpc("resources_change_plan", { p_uid: s.id, p_from: "standard", p_to: "pro" });
  const after = one((await s.client.rpc("my_resources")).data);
  check("Standard to Pro adds 500", after?.allowance === before?.allowance + 500, `${before?.allowance} -> ${after?.allowance}`);
  check("refill date unchanged", after?.next_refill_at === before?.next_refill_at);
  const { data: unlimited } = await s.client.rpc("use_refine");
  check("paid refines are unlimited (null)", unlimited === null);
} catch (err) {
  failures.push(String(err));
  console.error(err);
} finally {
  for (const id of made) await admin.auth.admin.deleteUser(id);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
