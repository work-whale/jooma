import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe } from "@/app/lib/stripe";

// Twelve months of Pro for an ambassador, and taking it back.
//
// The grant is a COMP, the same shape the admin change-plan route writes for a
// teacher with no card (profiles.plan = 'pro', no Stripe subscription), plus
// an end date on the ambassador row. The daily ambassador-terms cron removes
// the comp once that date passes. Nothing here touches ambassador_referrals, so
// a comp can never make anyone payable: first_paid_at is written by the
// invoice.paid webhook alone.
//
// WHY A LIVE SUBSCRIPTION IS REFUSED
// Stripe is the only writer of profiles.plan for a subscriber
// (syncSubscription in the webhook). Comping over a live subscription would
// last until that subscription's next event, then be silently reset, and the
// teacher would still be billed in the meantime. So an admin cancels the
// subscription first, deliberately, and grants after.
//
// WHY A DEAD SUBSCRIPTION ID IS CLEARED
// "Comped" is recognised everywhere by stripe_subscription_id being null (as in
// teacher_mrr()). An id that outlived its subscription would make this comp
// read as a payer. It is cleared only after Stripe confirms the subscription is
// closed.

const TERM_MONTHS = 12;

/** Subscription states that still bill, or will. */
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function readBody(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return {
    ambassadorId: typeof body?.ambassadorId === "string" ? body.ambassadorId : "",
    reason: typeof body?.reason === "string" ? body.reason.trim() : "",
  };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const { ambassadorId, reason } = await readBody(req);
  if (!ambassadorId) {
    return NextResponse.json({ error: "ambassadorId is required." }, { status: 400 });
  }

  // Linked by email if it was not at creation. Through the admin's own
  // session, so is_admin() is checked in the database too.
  const { data: userId, error: linkError } = await gate.supabase.rpc(
    "admin_link_ambassador_account",
    { p_ambassador_id: ambassadorId },
  );
  if (linkError) {
    console.error("[admin/ambassadors/grant-pro] link failed", linkError);
    return NextResponse.json({ error: "Could not find that ambassador." }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json(
      {
        error:
          "They don't have a Jooma account with this email yet. Once they sign up, grant again.",
      },
      { status: 400 },
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan, stripe_subscription_id")
    .eq("id", userId as string)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Could not find their profile." }, { status: 404 });
  }

  if (profile.stripe_subscription_id) {
    let status: string;
    try {
      status = (await stripe.subscriptions.retrieve(profile.stripe_subscription_id)).status;
    } catch (err) {
      // Unreadable is not the same as closed. Refuse rather than guess.
      console.error("[admin/ambassadors/grant-pro] subscription lookup failed", err);
      return NextResponse.json(
        { error: "Could not check their subscription with Stripe. Try again in a moment." },
        { status: 502 },
      );
    }
    if (LIVE.has(status)) {
      return NextResponse.json(
        {
          error:
            "They pay through Stripe. Cancel their subscription first, then grant the free Pro.",
        },
        { status: 409 },
      );
    }
  }

  const now = new Date();
  const until = addMonths(now, TERM_MONTHS);

  const { error: termError } = await supabaseAdmin
    .from("ambassadors")
    .update({
      pro_until: until.toISOString(),
      pro_granted_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", ambassadorId);
  if (termError) {
    console.error("[admin/ambassadors/grant-pro] term write failed", termError);
    return NextResponse.json({ error: "Could not save the free Pro term." }, { status: 500 });
  }

  const { error: planError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "pro",
      subscription_status: "active",
      cancel_at_period_end: false,
      current_period_end: until.toISOString(),
      stripe_subscription_id: null,
      updated_at: now.toISOString(),
    })
    .eq("id", userId as string);
  if (planError) {
    console.error("[admin/ambassadors/grant-pro] plan write failed", planError);
    return NextResponse.json({ error: "Could not update their plan." }, { status: 500 });
  }

  await gate.supabase.rpc("admin_log_plan_change", {
    uid: userId,
    p_from: profile.plan ?? "free",
    p_to: "pro",
    p_reason: `Ambassador, ${TERM_MONTHS} months free${reason ? `: ${reason}` : ""}`,
    p_method: "comp",
  });

  return NextResponse.json({
    ok: true,
    proUntil: until.toISOString(),
    message: `Pro granted until ${until.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}.`,
  });
}

// Revoke: ends the term now. The plan comes off only if it is still the comp;
// an ambassador who has since subscribed keeps what they pay for.
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const { ambassadorId, reason } = await readBody(req);
  if (!ambassadorId) {
    return NextResponse.json({ error: "ambassadorId is required." }, { status: 400 });
  }

  const { data: ambassador } = await supabaseAdmin
    .from("ambassadors")
    .select("user_id, pro_until")
    .eq("id", ambassadorId)
    .maybeSingle();
  if (!ambassador) {
    return NextResponse.json({ error: "Could not find that ambassador." }, { status: 404 });
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("ambassadors")
    .update({ pro_until: now, updated_at: now })
    .eq("id", ambassadorId);

  if (!ambassador.user_id) return NextResponse.json({ ok: true, message: "Free Pro ended." });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan, stripe_subscription_id")
    .eq("id", ambassador.user_id)
    .maybeSingle();

  const stillComped = profile?.plan === "pro" && !profile.stripe_subscription_id;
  if (!stillComped) {
    return NextResponse.json({
      ok: true,
      message: "Free Pro ended. They have their own subscription, which is untouched.",
    });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: null,
      cancel_at_period_end: false,
      current_period_end: null,
      updated_at: now,
    })
    .eq("id", ambassador.user_id)
    .eq("plan", "pro")
    .is("stripe_subscription_id", null);
  if (error) {
    console.error("[admin/ambassadors/grant-pro] revoke failed", error);
    return NextResponse.json({ error: "Could not remove the plan." }, { status: 500 });
  }

  await gate.supabase.rpc("admin_log_plan_change", {
    uid: ambassador.user_id,
    p_from: "pro",
    p_to: "free",
    p_reason: `Ambassador free Pro revoked${reason ? `: ${reason}` : ""}`,
    p_method: "direct",
  });

  return NextResponse.json({ ok: true, message: "Free Pro ended and the plan removed." });
}
