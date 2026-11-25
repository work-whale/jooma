import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe } from "@/app/lib/stripe";
import { adviseCharges } from "@/app/lib/refund-facts";
import { auditReason, parseRule } from "@/app/lib/refund-policy";

// Refunds a charge for a teacher.
//
// Charges are read live from Stripe rather than from our `invoices` mirror:
// stripe_charge_id is only populated by the invoice.paid webhook path, and is
// currently null on every existing row, so a local lookup would show nothing
// refundable. Stripe is the source of truth for money regardless.
//
// The refund itself is NOT mirrored back into `invoices` here — the
// charge.refunded webhook already does that (syncRefund in
// app/api/stripe/webhook/route.ts). Writing it in both places would race.

async function customerIdFor(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

/** Refundable charges for the teacher, newest first. */
export async function GET(req: NextRequest) {
  const gate = await requireAdminRoute("issue_refunds");
  if (gate.error) return gate.error;

  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const customer = await customerIdFor(userId);
  if (!customer) {
    return NextResponse.json({ charges: [] });
  }

  try {
    const charges = await stripe.charges.list({ customer, limit: 10 });
    const refundable = charges.data.filter((c) => c.status === "succeeded" && c.amount > c.amount_refunded);

    // What the refund policy allows for each charge. Best effort: the list
    // loads without it, and adviseCharges never throws (it falls back to the
    // fault option, which is always on offer). The console only ADVISES; POST
    // below never refuses on policy grounds.
    let advice: Awaited<ReturnType<typeof adviseCharges>> = new Map();
    try {
      advice = await adviseCharges(userId, customer, refundable);
    } catch (err) {
      console.error("[admin/refund] advice", err);
    }

    return NextResponse.json({
      charges: refundable.map((c) => {
        const a = advice.get(c.id);
        return {
          id: c.id,
          amount: c.amount,
          amountRefunded: c.amount_refunded,
          currency: c.currency,
          created: c.created,
          description: c.description,
          ...(a ? { label: a.label, facts: a.facts, options: a.options, inPolicy: a.inPolicy } : {}),
        };
      }),
    });
  } catch (err) {
    console.error("[admin/refund] list", err);
    return NextResponse.json({ error: "Could not load charges from Stripe." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("issue_refunds");
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const chargeId = typeof body?.chargeId === "string" ? body.chargeId : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const amountPence =
    typeof body?.amountPence === "number" && Number.isFinite(body.amountPence)
      ? Math.round(body.amountPence)
      : null;
  // Which policy rule the admin picked, if any. Advisory only: it goes in the
  // audit trail, and a value that is present but not a rule is a bad request
  // rather than something to quietly drop.
  const rule = body?.rule === undefined || body?.rule === null ? null : parseRule(body.rule);
  if (body?.rule !== undefined && body?.rule !== null && rule === null) {
    return NextResponse.json({ error: "That is not a refund rule." }, { status: 400 });
  }
  const interval = body?.interval === "month" || body?.interval === "year" ? body.interval : null;

  if (!userId || !chargeId) {
    return NextResponse.json({ error: "userId and chargeId are required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Please give a reason — it goes in the audit log." }, { status: 400 });
  }

  const customer = await customerIdFor(userId);
  if (!customer) {
    return NextResponse.json({ error: "This teacher has no Stripe customer." }, { status: 400 });
  }
  // "Clause 3: <what the admin wrote>" when a policy rule was picked.
  const logged = auditReason(rule, interval, reason);

  try {
    // Re-fetch and verify the charge belongs to THIS teacher. The client sends
    // both ids, but a crafted request could pair one teacher's id with another
    // customer's charge — never trust that pairing.
    const charge = await stripe.charges.retrieve(chargeId);
    const chargeCustomer =
      typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
    if (chargeCustomer !== customer) {
      return NextResponse.json(
        { error: "That charge doesn't belong to this teacher." },
        { status: 400 },
      );
    }
    if (charge.status !== "succeeded") {
      return NextResponse.json({ error: "That charge didn't succeed." }, { status: 400 });
    }

    const refundable = charge.amount - charge.amount_refunded;
    if (refundable <= 0) {
      return NextResponse.json({ error: "That charge is already fully refunded." }, { status: 400 });
    }
    const amount = amountPence ?? refundable;
    if (amount <= 0 || amount > refundable) {
      return NextResponse.json(
        { error: `Refund must be between 1p and ${refundable}p.` },
        { status: 400 },
      );
    }

    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount,
      reason: "requested_by_customer",
      metadata: {
        jooma_admin: gate.user.id,
        jooma_reason: logged,
        ...(rule ? { jooma_rule: rule } : {}),
      },
    });

    await gate.supabase.rpc("admin_log_refund", {
      uid: userId,
      p_charge_id: chargeId,
      p_amount_pence: amount,
      p_reason: logged,
    });

    return NextResponse.json({ ok: true, refundId: refund.id, amount });
  } catch (err) {
    console.error("[admin/refund]", err);
    const msg = err instanceof Error ? err.message : "Could not issue the refund.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
