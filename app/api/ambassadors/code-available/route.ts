import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { stripe } from "@/app/lib/stripe";
import { codeProblem, normaliseAmbassadorCode } from "@/app/lib/ambassador-application";

// Is a code free to ask for? Backs the live check under the code field.
//
// Signed in only. Codes are public by nature (they are shared on social media),
// so answering for one typed code reveals nothing that is not already out there.
// Free means: not an ambassador's code, not reserved by another application, and
// not a live promo code in Stripe.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const code = normaliseAmbassadorCode(req.nextUrl.searchParams.get("code") ?? "");
  const problem = codeProblem(code);
  if (problem) return NextResponse.json({ available: false, reason: problem });

  const { data: free, error } = await supabase.rpc("ambassador_code_available", { p_code: code });
  if (error) {
    console.error("[ambassadors/code-available] lookup failed", error);
    return NextResponse.json({ error: "Could not check that code." }, { status: 500 });
  }
  if (!free) return NextResponse.json({ available: false });

  try {
    const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (existing.data.length > 0) return NextResponse.json({ available: false });
  } catch (err) {
    // Unreachable Stripe does not make a free code look taken; the apply route
    // and approval both check again.
    console.error("[ambassadors/code-available] Stripe lookup failed", err);
  }

  return NextResponse.json({ available: true });
}
