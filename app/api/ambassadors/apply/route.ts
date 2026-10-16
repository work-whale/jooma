import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe } from "@/app/lib/stripe";
import {
  personalFromAccount,
  validateApplication,
  type ApplicationInput,
} from "@/app/lib/ambassador-application";
import { profileMobile } from "@/app/lib/dial-codes";
import { grantApplicantTrial } from "@/app/lib/ambassador-pro";
import { AGREEMENT_VERSION } from "@/app/lib/ambassador-agreement";
import { sendTemplate } from "@/app/lib/email";
import { isUndeliverable } from "@/app/lib/email-templates/broadcast";

// Send an ambassador application.
//
// Signed in only, so this is not a public write: the session is the
// applicant's own. The programme has one open link (/ambassador) and an admin
// approves every application, so no invite token is needed.
//
// Name, email and mobile come from the account, never the form: signup already
// asked for them, and it means nobody can apply in someone else's name. The
// form sends a mobile only for an account without a usable one.
//
// THE WRITE IS SERVICE-ROLE ONLY (submit_ambassador_application). This route
// checks the session and passes the user id, and it is the only thing that
// knows the caller's real IP, which is recorded with their typed signature as
// evidence. A browser calling the RPC directly could otherwise supply its own.
//
// The same rules as the form (validateApplication) run here, so nothing the form
// would have refused reaches the database. The database checks again: one live
// application per person, and the code reserved.
//
// Once it is in, an account with no plan gets Standard free while we review
// (grantApplicantTrial).

/** The real peer is the LAST x-forwarded-for entry: Vercel appends it, so a
 *  spoofed header only adds hops in front of it. */
function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { input?: ApplicationInput } | null;
  if (!body?.input?.personal) {
    return NextResponse.json({ error: "Something is missing from the form." }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, surname, dial_code, phone")
    .eq("id", user.id)
    .maybeSingle();

  let result;
  try {
    const personal = personalFromAccount(body.input.personal, {
      first_name: profile?.first_name ?? null,
      surname: profile?.surname ?? null,
      email: user.email ?? null,
      mobile: profileMobile(profile?.dial_code, profile?.phone),
    });
    result = validateApplication({ ...body.input, personal });
  } catch {
    return NextResponse.json({ error: "Something is missing from the form." }, { status: 400 });
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: "Some details need another look.", errors: result.errors },
      { status: 400 },
    );
  }

  // A code already live in Stripe would fail at approval. Better to say so now,
  // while they can still pick another. Stripe being unreachable is not fatal:
  // approval checks again.
  const code = String(result.payload.requested_code);
  try {
    const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (existing.data.length > 0) {
      return NextResponse.json(
        {
          error: "That code is already taken. Go back and try another.",
          errors: { requested_code: "That code is already taken. Try another." },
        },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[ambassadors/apply] Stripe code check failed", err);
  }

  const { data: id, error } = await supabaseAdmin.rpc("submit_ambassador_application", {
    p_user_id: user.id,
    payload: {
      ...result.payload,
      agreement_version: AGREEMENT_VERSION,
      signed_ip: clientIp(req),
      signed_user_agent: req.headers.get("user-agent") ?? null,
    },
  });

  if (error) {
    // The function's own messages are written for the applicant ("You have
    // already applied.", "That code is already taken."). A constraint
    // failure is not, so it gets a general one.
    const friendly = error.code === "P0001" ? error.message : "Could not send your application.";
    console.error("[ambassadors/apply] submit failed", error);
    return NextResponse.json({ error: friendly }, { status: 400 });
  }

  const trialEnds = await grantApplicantTrial(user.id, String(id));

  // Their receipt and record of what they signed. Sent to their account email. A failed send does not
  // undo the application: it is stored, and the page says it is with us.
  // A reserved test address (the e2e fixtures' @jooma.test) is skipped, as bulk
  // email does, so a test run never bounces off the real SendGrid account.
  const p = result.payload;
  const emailed = !isUndeliverable(String(p.email)) && await sendTemplate("ambassador_application_received", String(p.email), {
    firstName: String(p.first_name),
    code: String(p.requested_code),
    paidBy:
      p.payout_method === "paypal"
        ? `PayPal (${p.paypal_email})`
        : `Bank transfer to ${p.bank_name}, account ending ${String(p.account_number).slice(-4)}`,
    signedDate: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/London",
    }),
    trialEnds: trialEnds
      ? new Date(trialEnds).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          timeZone: "Europe/London",
        })
      : "",
  });
  if (!emailed) console.warn("[ambassadors/apply] confirmation email not sent", id);

  return NextResponse.json({ ok: true, id, emailed, trialEnds });
}
