import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { grantAmbassadorPro } from "@/app/lib/ambassador-pro";

// Twelve months of Pro for an ambassador, and taking it back.
//
// The grant itself, and the rules behind it (a comp, never over a live Stripe
// subscription, a dead subscription id cleared), live in
// app/lib/ambassador-pro.ts, shared with approving an application.

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

  const result = await grantAmbassadorPro(gate.supabase, ambassadorId, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, proUntil: result.proUntil, message: result.message });
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
