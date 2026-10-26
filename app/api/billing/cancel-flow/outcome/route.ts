import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { asCancelReason, asReportableOutcome } from "@/app/lib/cancel-flow";
import { loadCancelContext, recordEvent } from "@/app/lib/cancel-flow-server";

// Records the cancel flow outcomes that change nothing in Stripe: kept the plan
// at the offer, at "what you lose" or at the confirm; a message to support; a
// hand-off to the schools team; and, after the existing routes have done the
// work, a downgrade or a switch to yearly.
//
// The browser may only report the outcomes in REPORTABLE_OUTCOMES. "discount"
// and "cancelled" are written by the routes that do those things, never on the
// browser's word, because the discount row is what the 12-month cap reads.
//
// A support message is also sent as a contact enquiry through submit_enquiry(),
// with the caller's own client so the enquiry is stamped with their user id
// and its per-address throttle applies. If that fails the outcome still counts:
// the teacher is told, and can still go on to cancel or keep their plan.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { reason?: unknown; outcome?: unknown; detail?: unknown }
    | null;
  const reason = asCancelReason(body?.reason);
  const outcome = asReportableOutcome(body?.outcome);
  if (!reason || !outcome) {
    return NextResponse.json({ error: "That isn't something this flow records." }, { status: 400 });
  }
  const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, 2000) || null : null;
  if (outcome === "support_message" && !detail) {
    return NextResponse.json({ error: "Tell us what happened first." }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await loadCancelContext(supabase, user.id);
  } catch (err) {
    console.error("[cancel-flow/outcome] context", err);
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  let reference: string | null = null;
  if (outcome === "support_message") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, surname")
      .eq("id", user.id)
      .maybeSingle();
    const name =
      [profile?.first_name, profile?.surname].filter(Boolean).join(" ").trim() || user.email || "Teacher";
    const { data, error } = await supabase.rpc("submit_enquiry", {
      payload: {
        kind: "contact",
        name,
        email: user.email,
        message: `From the cancel flow (${reason === "missing" ? "something is missing" : "something went wrong"}):\n\n${detail}`,
      },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    reference = data as string;
  }

  try {
    await recordEvent({
      userId: user.id,
      reason,
      outcome,
      plan: ctx.plan,
      interval: ctx.subscriptionId ? ctx.interval : null,
      detail,
    });
  } catch (err) {
    console.error("[cancel-flow/outcome] insert", err);
    // The enquiry, if any, already went through; say so rather than failing.
    if (reference) return NextResponse.json({ ok: true, reference });
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reference });
}
