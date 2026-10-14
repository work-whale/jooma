import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { stripe } from "@/app/lib/stripe";
import { grantAmbassadorPro } from "@/app/lib/ambassador-pro";
import {
  describeDiscount,
  yearlyEquivalentDiscount,
  type Discount,
} from "@/app/lib/ambassador-discount";
import { sendTemplate } from "@/app/lib/email";
import { isUndeliverable } from "@/app/lib/email-templates/broadcast";

// Approve or decline an ambassador application.
//
// APPROVING, IN ORDER
//
//   1. Check the code they asked for is free in Stripe. It was reserved in our
//      own database when they applied, but Stripe is where a teacher types it.
//   2. Create two coupons and the promotion code (the code itself):
//        - the code's own coupon, duration "once": the first-month discount;
//        - a hidden yearly coupon worth the same off the first yearly payment
//          (app/lib/ambassador-discount.ts), which checkout uses on yearly plans.
//      The code is first-time-customers-only, so a returning subscriber cannot
//      use it in Stripe's own promo box, and every first subscription starts
//      with a trial, which is what lets the webhook swap a box-typed code onto
//      the yearly coupon before anything is charged.
//   3. One database transaction: create the ambassador against their account,
//      attach the code, start the twelve-month agreement, mark it approved. If
//      that fails the promotion code is deactivated, since Stripe coupons cannot
//      be deleted and an unlinked code would discount without crediting anyone.
//   4. Grant the free Pro year. If they pay through Stripe the approval stands
//      and the admin is told to cancel that first and grant from the table.

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

interface ApplicationDetail {
  id: string;
  status: string;
  first_name: string;
  last_name: string;
  email: string;
  requested_code: string;
  user_id: string | null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "decline") {
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

    // Who to tell, read before the decline so a failed read cannot leave a
    // declined applicant unaware of it.
    const { data: detail } = await gate.supabase.rpc("admin_ambassador_application", { p_id: id });
    const applicant = (detail ?? null) as ApplicationDetail | null;

    const { error } = await gate.supabase.rpc("admin_decline_ambassador_application", {
      p_id: id,
      p_reason: reason || null,
    });
    if (error) {
      console.error("[admin/ambassadors/applications] decline failed", error);
      return badRequest(error.message || "Could not decline the application.");
    }

    // The under-review page promised we would be in touch; this is that. Test
    // addresses (@jooma.test) are skipped, as for the other two emails.
    const emailed =
      Boolean(applicant?.email) &&
      !isUndeliverable(applicant!.email) &&
      (await sendTemplate("ambassador_declined", applicant!.email, {
        firstName: applicant!.first_name,
        reason,
      }));

    return NextResponse.json({
      ok: true,
      emailed,
      message: emailed
        ? "Application declined. They have been emailed."
        : "Application declined. The email could not be sent, so let them know another way.",
    });
  }

  if (action !== "approve") return badRequest("Unknown action.");

  // The discount, checked as the old create route checked it.
  const percentOff = body?.percentOff != null ? Number(body.percentOff) : null;
  const amountOffGbp = body?.amountOffGbp != null ? Number(body.amountOffGbp) : null;
  if ((percentOff == null) === (amountOffGbp == null)) {
    return badRequest("Give either a percentage off or an amount off, not both.");
  }
  if (percentOff != null && (!(percentOff > 0) || percentOff > 100)) {
    return badRequest("A percentage discount must be between 1 and 100.");
  }
  if (amountOffGbp != null && (!(amountOffGbp > 0) || amountOffGbp > 500)) {
    return badRequest("An amount off must be between £0.01 and £500.");
  }
  const monthly: Discount =
    percentOff != null
      ? { percentOff: Math.round(percentOff * 100) / 100 }
      : { amountOffPence: Math.round(Number(amountOffGbp) * 100) };
  const yearly = yearlyEquivalentDiscount(monthly);

  const { data: detail, error: readError } = await gate.supabase.rpc(
    "admin_ambassador_application",
    { p_id: id },
  );
  if (readError || !detail) {
    console.error("[admin/ambassadors/applications] read failed", readError);
    return badRequest("Could not find that application.", 404);
  }
  const application = detail as ApplicationDetail;
  if (application.status !== "pending") return badRequest("This application has already been reviewed.");
  if (!application.user_id) return badRequest("The applicant no longer has a Jooma account.");

  const code = application.requested_code;
  const fullName = `${application.first_name} ${application.last_name}`.trim();

  // 1. Free in Stripe?
  try {
    const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (existing.data.length > 0) {
      return badRequest(
        `${code} is already a live promo code in Stripe. Ask them for another code, or deactivate that one on the promo codes page first.`,
        409,
      );
    }
  } catch (err) {
    console.error("[admin/ambassadors/applications] Stripe lookup failed", err);
    return badRequest("Could not reach Stripe. Try again in a moment.", 502);
  }

  // 2. Coupons and the code.
  let promotionCodeId: string;
  let yearlyCouponId: string;
  try {
    const couponFor = (d: Discount) =>
      "percentOff" in d
        ? { percent_off: d.percentOff }
        : { amount_off: d.amountOffPence, currency: "gbp" as const };

    const monthlyCoupon = await stripe.coupons.create({
      name: code,
      // One payment only. A repeating or forever discount would keep costing
      // on every renewal, which is not the offer.
      duration: "once",
      ...couponFor(monthly),
    });
    const yearlyCoupon = await stripe.coupons.create({
      name: `${code} (yearly)`,
      duration: "once",
      ...couponFor(yearly),
      metadata: { ambassador_code: code, kind: "ambassador_yearly" },
    });
    yearlyCouponId = yearlyCoupon.id;

    const promotionCode = await stripe.promotionCodes.create({
      // The coupon nests under `promotion` on this API version.
      promotion: { type: "coupon", coupon: monthlyCoupon.id },
      code,
      restrictions: { first_time_transaction: true },
      metadata: { channel: `Ambassador: ${fullName}`.slice(0, 200) },
    });
    promotionCodeId = promotionCode.id;
  } catch (err) {
    console.error("[admin/ambassadors/applications] code creation failed", err);
    const message = err instanceof Error ? err.message : "Could not create the code.";
    return badRequest(`The code could not be created in Stripe: ${message}`);
  }

  // 3. Our own records, in one transaction.
  const { data: ambassadorId, error: approveError } = await gate.supabase.rpc(
    "admin_approve_ambassador_application",
    {
      p_id: id,
      p_promotion_code_id: promotionCodeId,
      p_code: code,
      p_yearly_coupon_id: yearlyCouponId,
    },
  );
  if (approveError || !ambassadorId) {
    console.error("[admin/ambassadors/applications] approve failed", approveError);
    try {
      await stripe.promotionCodes.update(promotionCodeId, { active: false });
    } catch (err) {
      console.error("[admin/ambassadors/applications] could not deactivate the orphan code", err);
    }
    return badRequest(approveError?.message || "Could not approve the application.");
  }

  // 4. The free Pro year.
  const pro = await grantAmbassadorPro(
    gate.supabase,
    ambassadorId as string,
    "Approved as a Jooma Ambassador",
  );

  // 5. Tell them. The code is live in Stripe by now, so it can be shared the
  // moment they read this. A failed send does not undo the approval; the
  // admin is told, so they can let the ambassador know another way.
  const longDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const agreementEnds = new Date();
  agreementEnds.setMonth(agreementEnds.getMonth() + 12);
  // Test addresses (@jooma.test) are skipped, as in the apply route.
  const emailed = !isUndeliverable(application.email) && await sendTemplate("ambassador_approved", application.email, {
    firstName: application.first_name,
    code,
    offer: describeDiscount(monthly, "month").replace("your first month", "their first month"),
    agreementEnds: longDate(agreementEnds),
    proLine: pro.ok
      ? "Your Pro account is free until then too."
      : "We will be in touch about your free Pro account.",
  });

  const base = pro.ok
    ? `${fullName} is live with code ${code}. ${pro.message}`
    : `${fullName} is live with code ${code}, but free Pro was not granted: ${pro.error}`;

  return NextResponse.json({
    ok: true,
    ambassadorId,
    code,
    proGranted: pro.ok,
    emailed,
    message: emailed ? `${base} They have been emailed.` : `${base} The approval email could not be sent.`,
  });
}
