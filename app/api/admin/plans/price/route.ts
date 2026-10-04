import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { replacePrice, assertPriceUsable } from "@/app/lib/stripe-prices";
import { PRICEABLE_PLAN_IDS } from "@/app/lib/plans";

// Changes what a plan actually costs, in Stripe and in our database.
//
// Stripe Price objects are immutable, so this creates a NEW Price on the plan's
// existing Product, archives the old one, records it in plan_price_history and
// repoints plan_config. From the next checkout onward, that is the price
// customers pay.
//
// EXISTING SUBSCRIBERS ARE NOT MOVED. They keep billing on the Price they signed
// up with until their subscription is explicitly migrated — Stripe's behaviour,
// not an omission here. plan_price_history is what keeps them resolving to the
// right plan afterwards; without it the webhook would read their now-superseded
// price as "no subscription" and drop them to Free.
//
// Runs through the service role, so requireAdminRoute IS the security boundary.

/** Plans that can have a self-serve Stripe price. Shared with the Plans admin
 *  screen so the field it offers and the allowlist enforced here cannot drift —
 *  they did before, both stuck on Pro after Max returned to sale. */
const PRICEABLE = new Set<string>(PRICEABLE_PLAN_IDS);

/**
 * The env-var fallback for a plan's CURRENT price, used when plan_config has no
 * stripe_price_monthly recorded yet.
 *
 * Per-plan, and that matters: this was once hardcoded to Pro's env var for
 * every plan. replacePrice() resolves the Stripe PRODUCT from the price id it
 * is given and then archives that price, so saving a Max price while Max's
 * column was empty would have created the new Max price on the PRO product and
 * archived Pro's live price, breaking Pro checkout for every customer.
 *
 * Returning null is safe: replacePrice creates a fresh Product and archives
 * nothing.
 */
function envPriceFor(planId: string): string | null {
  if (planId === "standard") return process.env.STRIPE_PRICE_STANDARD_MONTHLY || null;
  if (planId === "pro") return process.env.STRIPE_PRICE_PRO_MONTHLY || null;
  if (planId === "max") return process.env.STRIPE_PRICE_MAX_MONTHLY || null;
  return null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  let body: { planId?: string; priceMonthly?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const planId = String(body.planId ?? "");
  const amountGbp = Number(body.priceMonthly);

  if (!PRICEABLE.has(planId)) {
    return NextResponse.json(
      {
        error:
          `${planId || "That plan"} has no self-serve Stripe price. ` +
          `Only ${PRICEABLE_PLAN_IDS.join(" and ")} are sold through Checkout.`,
      },
      { status: 400 },
    );
  }

  const { data: plan, error: planErr } = await supabaseAdmin
    .from("plan_config")
    .select("plan_id, name, price_monthly, stripe_price_monthly")
    .eq("plan_id", planId)
    .maybeSingle();

  if (planErr || !plan) {
    return NextResponse.json({ error: "No such plan." }, { status: 404 });
  }

  // Nothing to do — don't churn Stripe prices for a no-op save.
  if (Number(plan.price_monthly) === amountGbp && plan.stripe_price_monthly) {
    return NextResponse.json({
      priceId: plan.stripe_price_monthly,
      unchanged: true,
    });
  }

  const currentPriceId = plan.stripe_price_monthly || envPriceFor(planId);

  try {
    const result = await replacePrice({
      currentPriceId,
      productName: `Jooma ${plan.name}`,
      amountGbp,
      interval: "month",
      label: `${plan.name} monthly price`,
    });

    // Verify what we just made is actually chargeable before storing it. A price
    // that fails this check would break checkout for everyone, so it is worth
    // the extra round trip.
    await assertPriceUsable(result.priceId, { interval: "month" });

    // History first: if the plan_config update below somehow failed, a recorded
    // price is harmless, whereas a live price missing from history is the exact
    // gap that downgrades subscribers.
    const { error: historyErr } = await supabaseAdmin.from("plan_price_history").insert({
      plan_id: planId,
      stripe_price_id: result.priceId,
      price_gbp: amountGbp,
      interval: "month",
      created_by: gate.user.id,
    });
    if (historyErr) throw historyErr;

    if (result.previousPriceId) {
      await supabaseAdmin
        .from("plan_price_history")
        .update({ archived_at: new Date().toISOString() })
        .eq("stripe_price_id", result.previousPriceId);
    }

    const { error: updateErr } = await supabaseAdmin
      .from("plan_config")
      .update({
        price_monthly: amountGbp,
        stripe_price_monthly: result.priceId,
        updated_by: gate.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_id", planId);
    if (updateErr) throw updateErr;

    // Audit trail, same as every other money-moving admin action.
    await gate.supabase.rpc("admin_log", {
      p_action: `Changed ${plan.name} price to £${amountGbp.toFixed(2)}`,
      p_action_type: "billing",
      p_object_type: "plan",
      p_object_id: planId,
      p_object_label: plan.name,
      p_detail: {
        price_gbp: amountGbp,
        new_price_id: result.priceId,
        previous_price_id: result.previousPriceId,
      },
    });

    return NextResponse.json({
      priceId: result.priceId,
      previousPriceId: result.previousPriceId,
    });
  } catch (err) {
    console.error("[admin/plans/price]", err);
    const message =
      err instanceof Error ? err.message : "Could not update the price in Stripe.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
