import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { stripe } from "@/app/lib/stripe";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { sendTemplate } from "@/app/lib/email";
import { isUndeliverable } from "@/app/lib/email-templates/broadcast";

// Record ambassador payouts, pause or resume an ambassador, and end an
// agreement for inactivity (agreement clauses 5 and 6).
//
// Ambassadors are no longer created here. They arrive through the programme's
// link (/ambassador) and an application, approved in
// /api/admin/ambassadors/applications/[id].
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
    endForInactivity?: boolean;
    reason?: string;
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

  // End for inactivity, once the review has run out. The RPC refuses anything
  // earlier, ends the status and moves free Pro to the end of the month; here
  // the code is switched off in Stripe and the written notice goes out.
  if (body.ambassadorId && body.endForInactivity) {
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      return NextResponse.json({ error: "Give the reason. It goes in the written notice." }, { status: 400 });
    }
    const { data: ended, error } = await gate.supabase.rpc("admin_end_ambassador_for_inactivity", {
      p_id: body.ambassadorId,
      p_reason: reason,
    });
    if (error) {
      console.error("[admin/ambassadors] end for inactivity failed", error);
      return NextResponse.json(
        { error: error.message || "Could not end the agreement." },
        { status: 400 },
      );
    }
    const result = ended as { pro_until: string | null; promotion_code_ids: string[] };

    // Already ended in the database, so a Stripe failure is logged, not
    // undone: claim_ambassador_code already refuses an ended code, and the
    // webhook credits nobody for it.
    for (const id of result.promotion_code_ids ?? []) {
      try {
        await stripe.promotionCodes.update(id, { active: false });
      } catch (err) {
        console.error("[admin/ambassadors] could not deactivate the code in Stripe", id, err);
      }
    }

    const emailed = await sendEndedNotice(body.ambassadorId, reason, result.pro_until);
    return NextResponse.json({ ok: true, emailed });
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
      .eq("id", body.ambassadorId)
      // An agreement ended for inactivity is not a pause: it stays ended.
      .neq("status", "ended");

    if (error) {
      console.error("[admin/ambassadors] status update failed", error);
      return NextResponse.json({ error: "Could not update the ambassador." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}

const longDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** The written notice clause 5 requires, with the reason. False when not sent. */
async function sendEndedNotice(ambassadorId: string, reason: string, proUntil: string | null): Promise<boolean> {
  const { data: a } = await supabaseAdmin
    .from("ambassadors")
    .select("full_name, email, agreement_ends_at, application_id")
    .eq("id", ambassadorId)
    .maybeSingle();
  if (!a) return false;
  const { data: app } = a.application_id
    ? await supabaseAdmin
        .from("ambassador_applications")
        .select("first_name, email")
        .eq("id", a.application_id)
        .maybeSingle()
    : { data: null };

  const email = app?.email ?? a.email;
  if (!email || isUndeliverable(email)) return false;

  // pro_until is the first moment of next month, so the last day of Pro is
  // the day before.
  const proEnds = proUntil ? longDate(new Date(new Date(proUntil).getTime() - 1)) : "the end of this month";
  return sendTemplate("ambassador_ended_inactivity", email, {
    firstName: app?.first_name ?? String(a.full_name).split(" ")[0],
    reason,
    proEnds,
    agreementEnds: a.agreement_ends_at ? longDate(new Date(a.agreement_ends_at)) : "the end of your agreement",
  });
}
