/*
 * Ambassadors: an end to end check against a real database.
 *
 *   node scripts/verify-ambassadors.mjs
 *
 * WHAT THIS IS FOR
 *
 * The schema can look right and still be wrong. This asserts the BEHAVIOUR the
 * migration's comments claim, and in particular the things that would be a
 * security or an accounting bug rather than a broken feature:
 *
 *   - the three tables are unreadable by an ordinary teacher
 *   - a teacher cannot forge a referral, or point one at a different ambassador
 *   - the admin RPCs refuse a non-admin caller
 *   - a referral that has never PAID can never be marked payable, which is what
 *     stops a free signup and an admin comp from earning somebody money
 *   - attribution is first-code-wins and is never reassigned
 *
 * HOW IT PROVES ANYTHING
 *
 * Fixtures are created with the service role, then every assertion runs through
 * the ANON key as one of those users. That distinction is the whole point: the
 * service role bypasses RLS, so a test written against it would pass no matter
 * how wrong the policies were.
 *
 * It cleans up after itself, including when it fails part way through.
 *
 * RUN IT ON STAGING. It creates and deletes users.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/* ── Environment ─────────────────────────────────────────────────────────── */

// .env.local by hand: this is a standalone script, so there is no Next.js
// runtime to load it. The \r strip matters on Windows, where the file has CRLF
// endings and a trailing carriage return otherwise ends up inside every value.
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
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );
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

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const created = { users: [], ambassadors: [] };

async function makeUser(label) {
  const email = `e2e-amb-${label}-${tag}@jooma.test`;
  const password = `Pw-${tag}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not create ${label}: ${error.message}`);
  created.users.push(data.user.id);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    first_name: label,
    surname: "Ambtest",
  });
  if (profileError) throw new Error(`Could not write ${label}'s profile: ${profileError.message}`);

  return { id: data.user.id, email, password };
}

/** A client signed in AS that user, so RLS applies exactly as in the browser. */
async function asUser(user) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`Could not sign in as ${user.email}: ${error.message}`);
  return client;
}

async function cleanup() {
  // Referrals and codes cascade from the ambassador; profiles cascade from the
  // auth user. Delete the parents and the rest goes with them.
  for (const id of created.ambassadors) {
    await admin.from("ambassadors").delete().eq("id", id);
  }
  for (const id of created.users) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

/* ── The run ─────────────────────────────────────────────────────────────── */

async function main() {
  console.log("\nAmbassadors\n");

  const teacher = await makeUser("teacher");
  const other = await makeUser("other");
  const staff = await makeUser("staff");

  // One admin, so the admin-only RPCs have a caller that should succeed.
  await admin.from("profiles").update({ is_admin: true }).eq("id", staff.id);

  const teacherClient = await asUser(teacher);
  const otherClient = await asUser(other);
  const staffClient = await asUser(staff);

  // Two ambassadors with a code each, written through the service role because
  // that is what the admin route does.
  const { data: amb1, error: ambError } = await admin
    .from("ambassadors")
    .insert({ full_name: `ZZ Amb One ${tag}`, email: `zz-one-${tag}@example.com` })
    .select()
    .single();
  if (ambError) throw new Error(`Could not create ambassador: ${ambError.message}`);
  created.ambassadors.push(amb1.id);

  const { data: amb2 } = await admin
    .from("ambassadors")
    .insert({ full_name: `ZZ Amb Two ${tag}`, email: `zz-two-${tag}@example.com` })
    .select()
    .single();
  created.ambassadors.push(amb2.id);

  const codeOne = `ZZAMBONE${tag}`.toUpperCase().slice(0, 40);
  const codeTwo = `ZZAMBTWO${tag}`.toUpperCase().slice(0, 40);

  const { data: code1 } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: amb1.id, promotion_code_id: `promo_zz1${tag}`, code: codeOne })
    .select()
    .single();

  await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: amb2.id, promotion_code_id: `promo_zz2${tag}`, code: codeTwo });

  /* ── 1. The tables are invisible to a teacher ──────────────────────────── */
  console.log("Reading as an ordinary teacher");

  for (const table of ["ambassadors", "ambassador_codes", "ambassador_referrals"]) {
    const { data, error } = await teacherClient.from(table).select("*");
    // RLS with no matching policy returns an empty set rather than an error.
    // Either is fine; rows are not.
    check(
      `${table} returns nothing to a teacher`,
      error !== null || (data ?? []).length === 0,
      error ? undefined : `got ${(data ?? []).length} rows`,
    );
  }

  /* ── 2. A teacher cannot forge a referral ──────────────────────────────── */
  console.log("\nForging a referral");

  const { error: forgeError } = await teacherClient
    .from("ambassador_referrals")
    .insert({ ambassador_id: amb1.id, code_id: code1.id, user_id: teacher.id });
  check("a teacher cannot insert their own referral", forgeError !== null);

  /* ── 3. The admin RPCs refuse a non-admin ──────────────────────────────── */
  console.log("\nAdmin RPCs");

  const { error: listError } = await teacherClient.rpc("admin_ambassadors");
  check("admin_ambassadors() refuses a teacher", listError !== null, listError?.message);

  const { error: refError } = await teacherClient.rpc("admin_ambassador_referrals", {
    p_ambassador_id: amb1.id,
  });
  check("admin_ambassador_referrals() refuses a teacher", refError !== null);

  const { error: createError } = await teacherClient.rpc("admin_create_ambassador", {
    payload: { full_name: "Hacker", email: "hacker@example.com" },
  });
  check("admin_create_ambassador() refuses a teacher", createError !== null);

  const { data: adminList, error: adminListError } = await staffClient.rpc("admin_ambassadors");
  check(
    "admin_ambassadors() works for an admin",
    !adminListError && Array.isArray(adminList),
    adminListError?.message,
  );

  /* ── 4. Claiming ───────────────────────────────────────────────────────── */
  console.log("\nClaiming a code");

  const { data: claim1, error: claim1Error } = await teacherClient.rpc("claim_ambassador_code", {
    p_code: codeOne,
  });
  check("a teacher can claim a code", !claim1Error && claim1?.claimed === true, claim1Error?.message);

  // Case-insensitively, the way Stripe matches at checkout.
  const { data: claimLower } = await otherClient.rpc("claim_ambassador_code", {
    p_code: codeOne.toLowerCase(),
  });
  check("a code matches regardless of case", claimLower?.claimed === true);

  const { data: claimAgain } = await teacherClient.rpc("claim_ambassador_code", {
    p_code: codeTwo,
  });
  check(
    "a second code does NOT reassign attribution",
    claimAgain?.claimed === false && claimAgain?.reason === "already_claimed",
    JSON.stringify(claimAgain),
  );

  const { data: stillFirst } = await admin
    .from("ambassador_referrals")
    .select("ambassador_id")
    .eq("user_id", teacher.id)
    .single();
  check("the original ambassador still owns the referral", stillFirst?.ambassador_id === amb1.id);

  const { data: unknown } = await teacherClient.rpc("claim_ambassador_code", {
    p_code: `NOSUCHCODE${tag}`,
  });
  check("an unknown code is refused", unknown?.claimed === false && unknown?.reason === "unknown_code");

  // A paused ambassador stops taking new referrals.
  await admin.from("ambassadors").update({ status: "paused" }).eq("id", amb2.id);
  const third = await makeUser("third");
  const thirdClient = await asUser(third);
  const { data: pausedClaim } = await thirdClient.rpc("claim_ambassador_code", { p_code: codeTwo });
  check(
    "a paused ambassador takes no new referrals",
    pausedClaim?.claimed === false && pausedClaim?.reason === "inactive",
    JSON.stringify(pausedClaim),
  );
  await admin.from("ambassadors").update({ status: "active" }).eq("id", amb2.id);

  /* ── 5. THE PAYOUT RULE ────────────────────────────────────────────────── */
  // The one this whole feature rests on: no payment, no payout. A free signup
  // and an admin comp must both be unpayable.
  console.log("\nPayouts");

  const { data: referral } = await admin
    .from("ambassador_referrals")
    .select("id, payout_status, first_paid_at")
    .eq("user_id", teacher.id)
    .single();

  check("a new referral starts as N/A", referral?.payout_status === "na" && referral?.first_paid_at === null);

  const { error: prematureError } = await staffClient.rpc("admin_set_referral_payout", {
    p_referral_id: referral.id,
    p_status: "unpaid",
  });
  check(
    "an unpaid teacher cannot be marked payable, even by an admin",
    prematureError !== null,
    prematureError ? undefined : "the RPC allowed it",
  );

  // A COMP: plan says pro, but there is no Stripe subscription behind it. This
  // is the shape teacher_mrr() calls out, and it must not become payable either.
  await admin
    .from("profiles")
    .update({ plan: "pro", subscription_status: "active", stripe_subscription_id: null })
    .eq("id", teacher.id);

  const { error: compError } = await staffClient.rpc("admin_set_referral_payout", {
    p_referral_id: referral.id,
    p_status: "paid",
  });
  check(
    "a comped teacher is still not payable",
    compError !== null,
    compError ? undefined : "the RPC allowed a payout for a comp",
  );

  // The database constraint holds even against a direct service-role write,
  // so a future code path cannot create the bad state either.
  const { error: constraintError } = await admin
    .from("ambassador_referrals")
    .update({ payout_status: "paid" })
    .eq("id", referral.id);
  check(
    "the table itself refuses a payout with no payment",
    constraintError !== null,
    constraintError ? undefined : "the constraint did not fire",
  );

  // Now simulate what the Stripe webhook does on invoice.paid.
  await admin
    .from("ambassador_referrals")
    .update({ first_paid_at: new Date().toISOString(), first_paid_plan: "pro", payout_status: "unpaid" })
    .eq("id", referral.id);

  const { error: payError } = await staffClient.rpc("admin_set_referral_payout", {
    p_referral_id: referral.id,
    p_status: "paid",
  });
  check("a paid subscriber CAN be marked paid", payError === null, payError?.message);

  const { data: afterPay } = await admin
    .from("ambassador_referrals")
    .select("payout_status, payout_at")
    .eq("id", referral.id)
    .single();
  check(
    "marking paid records when",
    afterPay?.payout_status === "paid" && afterPay?.payout_at !== null,
  );

  const { error: teacherPayoutError } = await teacherClient.rpc("admin_set_referral_payout", {
    p_referral_id: referral.id,
    p_status: "paid",
  });
  check("a teacher cannot move a payout", teacherPayoutError !== null);

  /* ── 6. The counts an admin sees ───────────────────────────────────────── */
  console.log("\nWhat the admin page reports");

  const { data: rows } = await staffClient.rpc("admin_ambassadors");
  const mine = (rows ?? []).find((r) => r.id === amb1.id);
  check("the ambassador lists their referrals", Number(mine?.referrals) === 2, `got ${mine?.referrals}`);
  check("only the paying one counts as a subscriber", Number(mine?.subscribers) === 1, `got ${mine?.subscribers}`);
  // v2: money is in pence, from the commission ledger, which is empty here.
  check(
    "commission figures come from the ledger",
    Number(mine?.this_month_pence) === 0 && Number(mine?.owed_pence) === 0,
    JSON.stringify({ this_month: mine?.this_month_pence, owed: mine?.owed_pence }),
  );

  const { data: detail } = await staffClient.rpc("admin_ambassador_referrals", {
    p_ambassador_id: amb1.id,
    p_period: new Date().toISOString().slice(0, 8) + "01",
  });
  check("the referral list names the teacher", (detail ?? []).some((r) => r.teacher_email === teacher.email));
  check(
    "a free referral reports no first payment",
    (detail ?? []).some((r) => r.user_id === other.id && r.first_paid_at === null),
  );

  /* ── 7. The ambassador's own view (20261012000000_ambassador_pro) ──────── */
  // my_ambassador() and my_ambassador_referrals() are definer functions, so
  // they are the one way an ambassador reads these tables. They must return
  // the caller's own rows only, and nothing identifying about the teachers.
  console.log("\nWhat an ambassador sees of their own");

  const ambUser = await makeUser("ambassador");
  await admin.from("ambassadors").update({ user_id: ambUser.id }).eq("id", amb1.id);
  // `other` runs the second ambassador, which nobody has used.
  await admin.from("ambassadors").update({ user_id: other.id }).eq("id", amb2.id);
  const ambClient = await asUser(ambUser);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: anonMe, error: anonMeError } = await anon.rpc("my_ambassador");
  check("my_ambassador() gives the public nothing", anonMeError !== null || (anonMe ?? []).length === 0);
  const { data: anonRefs, error: anonRefsError } = await anon.rpc("my_ambassador_referrals");
  check(
    "my_ambassador_referrals() gives the public nothing",
    anonRefsError !== null || (anonRefs ?? []).length === 0,
  );

  const { data: notMe, error: notMeError } = await teacherClient.rpc("my_ambassador");
  check("a teacher who is not an ambassador gets no row", !notMeError && (notMe ?? []).length === 0, notMeError?.message);
  const { data: notMyRefs } = await teacherClient.rpc("my_ambassador_referrals");
  check("and no referrals", (notMyRefs ?? []).length === 0);

  const { data: me, error: meError } = await ambClient.rpc("my_ambassador");
  check("the ambassador gets their own row", !meError && (me ?? []).length === 1, meError?.message);
  check("with their own counts", Number(me?.[0]?.referrals) === 2 && Number(me?.[0]?.subscribers) === 1);
  check("and their own code", (me?.[0]?.codes ?? []).includes(codeOne));
  check("but not the admin notes or email", me?.[0] && !("notes" in me[0]) && !("email" in me[0]));

  const { data: myRefs, error: myRefsError } = await ambClient.rpc("my_ambassador_referrals");
  check("the ambassador sees their two referrals", !myRefsError && (myRefs ?? []).length === 2, myRefsError?.message);
  // v2: the dashboard never names a referred teacher at all.
  check(
    "never named",
    (myRefs ?? []).every((r) => !("display_name" in r)),
    JSON.stringify(myRefs ?? []),
  );
  check(
    "with no email, id or surname in the payload",
    (myRefs ?? []).every(
      (r) => !("user_id" in r) && !("email" in r) && !JSON.stringify(r).includes("Ambtest"),
    ),
  );

  const { data: emptyRefs } = await otherClient.rpc("my_ambassador_referrals");
  check("another ambassador does not see them", (emptyRefs ?? []).length === 0);

  const { error: linkError } = await teacherClient.rpc("admin_link_ambassador_account", {
    p_ambassador_id: amb1.id,
  });
  check("admin_link_ambassador_account() refuses a teacher", linkError !== null);

  await ambClient
    .from("ambassadors")
    .update({ pro_until: "2099-01-01T00:00:00Z" })
    .eq("id", amb1.id);
  const { data: term } = await admin.from("ambassadors").select("pro_until").eq("id", amb1.id).single();
  check("an ambassador cannot extend their own free Pro", term?.pro_until === null, term?.pro_until);

  await verifyProgrammeV2({ teacher, teacherClient, staffClient, ambUser, ambClient, amb1, referralId: referral.id });
}

/* ── 8. Programme v2 (20261014000000_ambassador_programme_v2) ─────────────── */
// Invites, applications and the commission ledger. An application holds a date
// of birth, a home address and bank details, so the bar is: nothing readable
// by anyone but an admin, and the applicant's own row only through functions
// that mask the account number.
async function verifyProgrammeV2({ teacher, teacherClient, staffClient, ambUser, ambClient, amb1, referralId }) {
  console.log("\nProgramme v2: invites, applications, commission");

  for (const table of ["ambassador_invites", "ambassador_applications", "ambassador_commissions"]) {
    const { data, error } = await teacherClient.from(table).select("*");
    check(`${table} returns nothing to a teacher`, error !== null || (data ?? []).length === 0);
    const { error: insertError } = await teacherClient.from(table).insert({});
    check(`${table} refuses a teacher's insert`, insertError !== null);
  }

  // An invite, made the way the admin route makes it.
  const { createHash, randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: inviteId, error: inviteError } = await staffClient.rpc("admin_create_ambassador_invite", {
    p_full_name: `ZZ Invitee ${tag}`,
    p_source: "instagram",
    p_token_hash: tokenHash,
  });
  check("an admin can create an invite", !inviteError && Boolean(inviteId), inviteError?.message);
  const { error: teacherInviteError } = await teacherClient.rpc("admin_create_ambassador_invite", {
    p_full_name: "Nope",
    p_source: "instagram",
    p_token_hash: "b".repeat(64),
  });
  check("a teacher cannot create one", teacherInviteError !== null);

  const code = `ZZV2${tag}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18);
  const payload = {
    first_name: "Vee", last_name: "Two", email: `vee-${tag}@example.com`, mobile: "07700 900000",
    date_of_birth: "1990-01-01", address_line: "1 Test Road", town: "Leeds", postcode: "LS1 1AA",
    instagram: "veetwo", reach: "1k_5k", payout_method: "bank", account_holder: "Vee Two",
    sort_code: "04-00-75", account_number: "12345678", bank_name: "Test Bank",
    tax_status: "self_assessment", requested_code: code, agreement_version: "test",
    signature_name: "Vee Two", declarations: { read: true, tax: true, disclosure: true },
  };

  const { error: directSubmit } = await teacherClient.rpc("submit_ambassador_application", {
    p_user_id: teacher.id, p_token_hash: tokenHash, payload,
  });
  check("a browser cannot call the submit function directly", directSubmit !== null);

  const { data: appId, error: submitError } = await admin.rpc("submit_ambassador_application", {
    p_user_id: teacher.id, p_token_hash: tokenHash, payload,
  });
  check("the apply route (service role) can submit", !submitError && Boolean(appId), submitError?.message);

  const { error: reuseError } = await admin.rpc("submit_ambassador_application", {
    p_user_id: ambUser.id, p_token_hash: tokenHash, payload: { ...payload, requested_code: `${code}X` },
  });
  check("an invite link works once", reuseError !== null);

  const { error: unknownError } = await admin.rpc("submit_ambassador_application", {
    p_user_id: ambUser.id, p_token_hash: "c".repeat(64), payload,
  });
  check("an unknown link is refused", unknownError !== null);

  const { data: free } = await teacherClient.rpc("ambassador_code_available", { p_code: code });
  check("a requested code is reserved", free === false);

  const { data: mineApp } = await teacherClient.rpc("my_ambassador_application");
  check("the applicant sees their own application as pending", mineApp?.[0]?.status === "pending");
  const { data: someoneElses } = await ambClient.rpc("my_ambassador_application");
  check("nobody else sees it", (someoneElses ?? []).length === 0);

  const { data: details } = await teacherClient.rpc("my_ambassador_details");
  check(
    "their own details come back with the account number masked",
    details?.[0]?.account_last4 === "5678" && !JSON.stringify(details).includes("12345678"),
    JSON.stringify(details?.[0] ?? {}),
  );

  const { error: teacherRead } = await teacherClient.rpc("admin_ambassador_application", { p_id: appId });
  check("a teacher cannot read an application through the admin function", teacherRead !== null);
  const { data: full } = await staffClient.rpc("admin_ambassador_application", { p_id: appId });
  check("an admin can, in full", full?.account_number === "12345678");

  const { error: teacherDecline } = await teacherClient.rpc("admin_decline_ambassador_application", {
    p_id: appId, p_reason: "no",
  });
  check("a teacher cannot decline an application", teacherDecline !== null);
  const { error: declineError } = await staffClient.rpc("admin_decline_ambassador_application", {
    p_id: appId, p_reason: "e2e",
  });
  check("an admin can", !declineError, declineError?.message);

  // The ledger: one commission row for amb1's paying referral, this month.
  const period = new Date().toISOString().slice(0, 8) + "01";
  const { data: row, error: rowError } = await admin
    .from("ambassador_commissions")
    .insert({
      ambassador_id: amb1.id, referral_id: referralId, stripe_invoice_id: `in_zz${tag}`,
      period, kind: "recurring", plan: "pro", billing_interval: "month", amount_pence: 200,
    })
    .select()
    .single();
  check("the webhook can write a commission row", !rowError, rowError?.message);

  const { error: dupMonth } = await admin.from("ambassador_commissions").insert({
    ambassador_id: amb1.id, referral_id: referralId, stripe_invoice_id: `in_zz2${tag}`,
    period, kind: "recurring", plan: "pro", billing_interval: "month", amount_pence: 200,
  });
  check("a teacher earns at most once a month", dupMonth?.code === "23505", dupMonth?.message);

  const { error: teacherPay } = await teacherClient.rpc("admin_set_commission_status", {
    p_id: row?.id, p_status: "paid",
  });
  check("a teacher cannot mark commission paid", teacherPay !== null);
  const { error: ambPay } = await ambClient.rpc("admin_mark_commissions_paid", {
    p_ambassador_id: amb1.id, p_period: period,
  });
  check("nor can the ambassador it belongs to", ambPay !== null);

  const { data: ledger } = await ambClient.rpc("my_ambassador_commissions");
  check(
    "the ambassador sees their own ledger, with nothing about the teacher",
    (ledger ?? []).length === 1 && !("referral_id" in (ledger?.[0] ?? {})),
    JSON.stringify(ledger),
  );
  const { data: otherLedger } = await teacherClient.rpc("my_ambassador_commissions");
  check("nobody else sees it", (otherLedger ?? []).length === 0);

  const { data: moved, error: moveError } = await staffClient.rpc("admin_mark_commissions_paid", {
    p_ambassador_id: amb1.id, p_period: period,
  });
  check("an admin can mark the month paid", !moveError && moved === 1, moveError?.message);

  await admin.from("ambassador_applications").delete().eq("id", appId);
  await admin.from("ambassador_invites").delete().eq("id", inviteId);
}


main()
  .then(async () => {
    await cleanup();
    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    if (failures.length > 0) {
      for (const f of failures) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
      process.exit(1);
    }
  })
  .catch(async (err) => {
    // Clean up even when a fixture blew up half way through, so a failed run
    // does not leave test users behind.
    await cleanup();
    console.error("\nRun failed:", err.message, "\n");
    process.exit(1);
  });
