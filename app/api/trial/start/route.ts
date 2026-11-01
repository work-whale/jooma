import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { eligibleForTrial, type AccessRow } from "@/app/lib/account-access";
import { sendStartTrialEvent } from "@/app/lib/meta-capi";
import { TRIAL_DAYS } from "@/app/lib/plans";
import { clientIp } from "@/app/lib/guest";

// Start the no-card trial: Standard for TRIAL_DAYS, with nothing in Stripe.
//
// Called by /complete-profile when a teacher finishes signing up, and by the
// "Start your free trial" button for an account that signed up before the card
// was dropped. The session decides who; no plan or date comes from the request.
//
// The row has the shape my_generation_gate() and the ambassador-terms cron
// already end on time: status 'trialing' with no subscription id.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.rpc("my_account_access");
  if (error) {
    console.error("[trial/start] could not read account", error);
    return NextResponse.json({ error: "Could not start your trial." }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as AccessRow | undefined;
  if (!row || !eligibleForTrial(row)) {
    return NextResponse.json({ error: "A free trial is not available on this account." }, { status: 409 });
  }

  const now = new Date();
  const until = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  // The guard is repeated in the WHERE: two tabs both pass the check above, and
  // a subscription can land in between. Only one update can match.
  const { data: granted, error: grantError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "standard",
      subscription_status: "trialing",
      cancel_at_period_end: false,
      current_period_end: until.toISOString(),
      free_trial_started_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", user.id)
    .eq("plan", "free")
    .is("stripe_subscription_id", null)
    .is("stripe_customer_id", null)
    .is("free_trial_started_at", null)
    .select("id");
  if (grantError) {
    console.error("[trial/start] grant failed", grantError);
    return NextResponse.json({ error: "Could not start your trial." }, { status: 500 });
  }
  if (!granted || granted.length === 0) {
    return NextResponse.json({ error: "A free trial is not available on this account." }, { status: 409 });
  }

  await reportStart(user.id, user.email ?? null, req);

  return NextResponse.json({ trialEndsAt: until.toISOString() });
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
