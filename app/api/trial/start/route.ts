import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { type AccessRow } from "@/app/lib/account-access";
import { canStartProTrial } from "@/app/lib/account-plan";
import { trialEmailKey, isDisposableEmail } from "@/app/lib/trial-guard";
import { trialEndsAt } from "@/app/lib/resource-periods";
import { recordAppEvent } from "@/app/lib/app-events";
import { cleanRefCode, isNewSignup } from "@/app/lib/app-event-rules";
import { randomUUID } from "node:crypto";
import { adsConsented, metaEventId, saveAdsConsent, sendMetaEvent, sendStartTrialEvent } from "@/app/lib/meta-capi";
import { readConsent } from "@/app/lib/cookie-consent";
import { TRIAL_DAYS } from "@/app/lib/plans";
import { clientIp } from "@/app/lib/guest";

// Start the Jooma 4.5 Pro trial: 10 days of Pro, 300 resources, no card,
// ending 23:59:59 UK time on the signup date plus 10 days. Nothing in Stripe.
//
// Called by /complete-profile when a teacher finishes signing up, by the
// "Start your free trial" button, and at login for a launch-day account with
// trial_pending. The session decides who; no plan or date comes from the
// request.
//
// Refused (the account simply stays on Free, which is never locked) when:
//   - the email, normalised and hashed, has had a trial before (ever);
//   - the email is on a disposable domain;
//   - the account has paid, held an ambassador's Pro, or is not on Free.
// More than 2 accounts from one device in 24 hours is FLAGGED for admin
// review (admin_flagged_devices), never refused.
//
// Needs migration 20261118000000_plans_engine.sql (plan 'pro_trial',
// trial_ends_at, claim_trial_email). Ship the two together.
const DEVICE_COOKIE = "jooma_device";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // signup_completed (Step 7): /complete-profile calls this the moment a new
  // account is finished. Recorded before the trial checks, so a refused trial
  // still counts the signup. The ref code is whatever the browser kept from
  // ?code= or ?ref=, cleaned; the rest is read from the profile.
  const body = (await req.json().catch(() => null)) as { refCode?: unknown } | null;
  // The cookie banner's choice, made before the account existed, is kept on
  // the profile so later webhooks follow it. No choice: no Meta events at all.
  const cookieHeader = req.headers.get("cookie");
  const choice = readConsent(cookieHeader);
  if (choice !== "undecided") await saveAdsConsent(user.id, choice);
  const metaOk = await adsConsented(user.id, cookieHeader);
  if (await recordSignupCompleted(user.id, user.created_at, cleanRefCode(body?.refCode))) {
    if (metaOk) await reportRegistration(user.id, user.email ?? null, req);
  }

  const { data, error } = await supabase.rpc("my_account_access");
  if (error) {
    console.error("[trial/start] could not read account", error);
    return NextResponse.json({ error: "Could not start your trial." }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as (AccessRow & { trial_pending?: boolean }) | undefined;
  const refused = NextResponse.json(
    { error: "A free trial is not available on this account. You're on Free, with 50 resources every Sunday." },
    { status: 409 },
  );
  if (!row || !user.email) return refused;
  if (isDisposableEmail(user.email)) return refused;

  const key = trialEmailKey(user.email);
  const { data: seen } = await supabaseAdmin.rpc("trial_email_seen", { p_key: key });
  const eligible = canStartProTrial({
    emailSeen: Boolean(seen),
    isAdmin: Boolean(row.is_admin),
    hasPaid: Boolean(row.has_paid || row.had_ambassador_pro || row.stripe_subscription_id),
    plan: row.plan,
  });
  if (!eligible) return refused;

  // The atomic "one per email" gate: only one caller can insert the key.
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_trial_email", { p_key: key });
  if (claimError) {
    console.error("[trial/start] claim failed", claimError);
    return NextResponse.json({ error: "Could not start your trial." }, { status: 500 });
  }
  if (!claimed) return refused;

  const now = new Date();
  const until = trialEndsAt(now, TRIAL_DAYS);

  // The guard is repeated in the WHERE: a subscription can land in between.
  const { data: granted, error: grantError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "pro_trial",
      trial_ends_at: until.toISOString(),
      trial_pending: false,
      subscription_status: null,
      current_period_end: null,
      cancel_at_period_end: false,
      // Kept as the "has had a trial" marker the older screens read.
      free_trial_started_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", user.id)
    .eq("plan", "free")
    .is("stripe_subscription_id", null)
    .select("id");
  if (grantError) {
    console.error("[trial/start] grant failed", grantError);
    return NextResponse.json({ error: "Could not start your trial." }, { status: 500 });
  }
  if (!granted || granted.length === 0) return refused;

  const { error: startError } = await supabaseAdmin.rpc("resources_start", {
    p_uid: user.id,
    p_plan: "pro_trial",
  });
  if (startError) console.error("[trial/start] resources_start failed", startError);

  await recordAppEvent(user.id, "trial_started", { trial_ends_at: until.toISOString() });
  if (metaOk) await reportStart(user.id, user.email ?? null, req);

  const res = NextResponse.json({ trialEndsAt: until.toISOString() });
  await flagDevice(user.id, res);
  return res;
}

/** Record this signup's device and flag (never block) a busy one. */
async function flagDevice(userId: string, res: NextResponse) {
  try {
    const store = await cookies();
    let device = store.get(DEVICE_COOKIE)?.value ?? null;
    if (!device || device.length < 8 || device.length > 80) {
      device = randomUUID();
      res.cookies.set(DEVICE_COOKIE, device, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    const { data: flagged } = await supabaseAdmin.rpc("record_signup_device", {
      p_device: device,
      p_uid: userId,
    });
    if (flagged) console.warn("[trial/start] device flagged for review", userId);
  } catch (err) {
    console.warn("[trial/start] device record failed", err);
  }
}

/**
 * Meta's StartTrial, which used to mean a card on file. The cookies are read off
 * this request: on signup /api/meta/activation is storing them at the same
 * moment, so the profile may not have them yet.
 *
 * Never throws: a marketing event must not fail a trial that has started.
 */
async function reportStart(userId: string, email: string | null, req: Request) {
  try {
    const store = await cookies();
    await sendStartTrialEvent({
      userId,
      email,
      fbp: store.get("_fbp")?.value ?? null,
      fbc: store.get("_fbc")?.value ?? null,
      clientIpAddress: clientIp(req),
      clientUserAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("[trial/start] StartTrial report failed", userId, err);
  }
}

/** Meta's CompleteRegistration, once per account (event id reg:<user>),
 *  with this request's cookies. Never throws. */
async function reportRegistration(userId: string, email: string | null, req: Request) {
  try {
    const store = await cookies();
    await sendMetaEvent({
      eventName: "CompleteRegistration",
      eventId: metaEventId("CompleteRegistration", userId),
      email,
      fbp: store.get("_fbp")?.value ?? null,
      fbc: store.get("_fbc")?.value ?? null,
      eventTimeUnix: Math.floor(Date.now() / 1000),
      clientIpAddress: clientIp(req),
      clientUserAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("[trial/start] CompleteRegistration report failed", userId, err);
  }
}

/** True when this call recorded the signup (the first, for a new account). */
async function recordSignupCompleted(userId: string, createdAt: string | undefined, refCode: string | null): Promise<boolean> {
  try {
    const { count } = await supabaseAdmin
      .from("app_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("name", "signup_completed");
    if (!isNewSignup(createdAt, new Date(), (count ?? 0) > 0)) return false;
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("utm_source, referrer_host, marketing_consent, job_role, school_name")
      .eq("id", userId)
      .maybeSingle();
    await recordAppEvent(userId, "signup_completed", {
      // The Phase 2 signup questions, saved just before this by
      // /complete-profile. Null when skipped.
      role: p?.job_role ?? null,
      school: p?.school_name ?? null,
      source: p?.utm_source ?? p?.referrer_host ?? null,
      ref_code: refCode,
      marketing_consent: Boolean(p?.marketing_consent),
    });
    return true;
  } catch (err) {
    console.warn("[trial/start] signup_completed not recorded", err);
    return false;
  }
}
