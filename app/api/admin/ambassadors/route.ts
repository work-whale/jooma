import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";

// Record ambassador payouts, and pause or resume an ambassador.
//
// Ambassadors are no longer created here. They arrive through an invite link
// and an application (/api/admin/ambassadors/invites and
// /api/admin/ambassadors/applications/[id]).
//
// The payout state is deliberately manual. Jooma never moves money here; an
// admin records that they have paid someone out of band. Each commission row is
// one month of one teacher (or a yearly one-off), so payouts are recorded month
// by month.

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  let body: {
    commissionId?: string;
    status?: string;
    ambassadorId?: string;
    period?: string;
    markAllPaid?: boolean;
    ambassadorStatus?: string;
    applicationId?: string;
    channel?: string;
    verified?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // A channel checked by hand, or unchecked. The RPC refuses a channel the
  // applicant never gave.
  if (body.applicationId && body.channel) {
    const { data: verified, error } = await gate.supabase.rpc("admin_set_channel_verified", {
      p_application_id: body.applicationId,
      p_channel: body.channel,
      p_verified: body.verified === true,
    });
    if (error) {
      console.error("[admin/ambassadors] channel verification failed", error);
      return NextResponse.json(
        { error: error.message || "Could not update that channel." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, verified });
  }

  // One commission row paid or unpaid. The RPC refuses a refunded row.
  if (body.commissionId) {
    const { error } = await gate.supabase.rpc("admin_set_commission_status", {
      p_id: body.commissionId,
      p_status: String(body.status ?? ""),
    });
    if (error) {
      console.error("[admin/ambassadors] payout update failed", error);
      return NextResponse.json(
        { error: error.message || "Could not update the payout." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Everything owed to one ambassador for one month.
  if (body.ambassadorId && body.markAllPaid) {
    if (!/^\d{4}-\d{2}-01$/.test(String(body.period ?? ""))) {
      return NextResponse.json({ error: "Choose a month." }, { status: 400 });
    }
    const { data: moved, error } = await gate.supabase.rpc("admin_mark_commissions_paid", {
      p_ambassador_id: body.ambassadorId,
      p_period: body.period,
    });
    if (error) {
      console.error("[admin/ambassadors] mark all paid failed", error);
      return NextResponse.json(
        { error: error.message || "Could not record the payout." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, moved });
  }

  // Pause or resume. Stops new claims without touching existing referrals; the
  // code itself is deactivated separately in Stripe.
  if (body.ambassadorId) {
    const status = String(body.ambassadorStatus ?? "");
    if (status !== "active" && status !== "paused") {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }

    const { error } = await gate.supabase
      .from("ambassadors")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", body.ambassadorId);

    if (error) {
      console.error("[admin/ambassadors] status update failed", error);
      return NextResponse.json({ error: "Could not update the ambassador." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}
