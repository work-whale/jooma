import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { recordAppEvent } from "@/app/lib/app-events";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { offerEndsAt, runOutDecision } from "@/app/lib/run-out-offer";
import type { AccountPlan } from "@/app/lib/plan-config";

// A teacher has just run out (Jooma 4.5 spec Step 5 P3 and P3b, Step 7
// credits_ran_out). Called by the out-of-resources sheet as it opens, from a
// tool opened with too little left or a refused Make.
//
//   - Logs credits_ran_out with the plan and how many times so far.
//   - Decides P3 or P3b on the SERVER: a second run-out on Free, in a
//     different UK week, opens the half-price first month of Pro, once per
//     account, for seven days (offer_opened). Checkout reads that event, never
//     the request, so the offer cannot be claimed by editing a fetch.
//   - popupAllowed=false (a pop-up was already shown this visit, spec rule 2)
//     shows P3 and keeps the offer for a later run-out.
//
// Spending is not checked here: the balance is read from my_resources, so a
// teacher with resources left gets P3 at most, never the offer.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { popupAllowed?: unknown } | null;
  const popupAllowed = body?.popupAllowed !== false;

  const [{ data: account }, { data: access }, { data: events }] = await Promise.all([
    supabase.rpc("my_resources"),
    supabase.rpc("my_account_access"),
    supabaseAdmin
      .from("app_events")
      .select("name, props, created_at")
      .eq("user_id", user.id)
      .in("name", ["credits_ran_out", "offer_opened"])
      .order("created_at")
      .limit(500),
  ]);
  const acc = (Array.isArray(account) ? account[0] : account) as { plan?: string; total?: number } | undefined;
  const row = (Array.isArray(access) ? access[0] : access) as
    | { is_admin?: boolean; has_paid?: boolean; stripe_subscription_id?: string | null }
    | undefined;
  const plan = (acc?.plan ?? "free") as AccountPlan;
  const list = events ?? [];
  const ranOut = list.filter((e) => e.name === "credits_ran_out");
  const opened = list.find((e) => e.name === "offer_opened");

  await recordAppEvent(user.id, "credits_ran_out", { plan, times_ran_out: ranOut.length + 1 });

  // A teacher who still has a good balance is not out: P3 only, no offer.
  const out = typeof acc?.total === "number" ? acc.total < 50 : true;
  const now = new Date();
  const decision = runOutDecision({
    plan,
    hasPaid: Boolean(row?.has_paid || row?.stripe_subscription_id),
    isAdmin: Boolean(row?.is_admin),
    earlierRunOuts: ranOut
      .filter((e) => (e.props as { plan?: string } | null)?.plan === "free")
      .map((e) => new Date(e.created_at)),
    offerOpenedAt: opened ? new Date(opened.created_at) : null,
    now,
  });

  if (decision.openOffer && popupAllowed && out) {
    const ends = offerEndsAt(now);
    await recordAppEvent(user.id, "offer_opened", { ends_at: ends.toISOString(), code: "PRO-HALF-FIRST-MONTH" });
    return NextResponse.json({ prompt: "P3b", offerEndsAt: ends.toISOString() });
  }
  return NextResponse.json({ prompt: "P3" });
}
