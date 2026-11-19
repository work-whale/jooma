import { NextRequest, NextResponse } from "next/server";
import { isTopupKind } from "@/app/lib/topup-margin";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { replacePrice, assertPriceUsable, assertSaneAmount } from "@/app/lib/stripe-prices";
import { SELECTABLE_PLAN_IDS } from "@/app/lib/plans";

// Create or edit a top-up pack, keeping Stripe in step.
//
// Same immutability rule as plans: a price change means a new Stripe Price, the
// old one archived, and the pack repointed. Top-up prices must be ONE-TIME —
// Checkout's `mode: "payment"` rejects a recurring price at the moment a teacher
// tries to pay, which is the worst possible time to find out.
//
// Runs through the service role, so requireAdminRoute IS the security boundary.


export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  let body: {
    id?: string;
    kind?: string;
    name?: string;
    priceGbp?: number;
    unit?: number;
    active?: boolean;
    availableTo?: string[];
    sort?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = body.id?.trim() || null;
  const name = String(body.name ?? "").trim();
  const amountGbp = Number(body.priceGbp);
  const unit = Number(body.unit);
  const active = body.active !== false;

  // Validated against the real plan ids rather than stored as sent: this array
  // is what decides who is offered the pack, and a typo ("Pro", "max ") would
  // match no plan and silently hide the pack from everyone.
  let availableTo: string[] | null = null;
  if (body.availableTo !== undefined) {
    if (!Array.isArray(body.availableTo)) {
      return NextResponse.json({ error: "availableTo must be a list of plans." }, { status: 400 });
    }
    const unknown = body.availableTo.filter(
      (p) => !(SELECTABLE_PLAN_IDS as string[]).includes(p),
    );
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Not a plan we sell: ${unknown.join(", ")}.` },
        { status: 400 },
      );
    }
    availableTo = body.availableTo;
  }

  // Blank means "leave it alone" (edit) or "append at the end" (create), which
  // the RPC works out. Only a real number is passed through.
  const sort =
    body.sort === undefined || body.sort === null || !Number.isFinite(Number(body.sort))
      ? null
      : Math.trunc(Number(body.sort));

  if (!name) {
    return NextResponse.json({ error: "A pack name is required." }, { status: 400 });
  }
  if (!Number.isFinite(unit) || unit <= 0) {
    return NextResponse.json({ error: "Units must be greater than zero." }, { status: 400 });
  }

  try {
    assertSaneAmount(amountGbp, name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid price." },
      { status: 400 },
    );
  }

  // Existing pack, if this is an edit. `available_to` is selected so an edit can
  // CARRY IT FORWARD — see the note where it is written below.
  const existing = id
    ? (
        await supabaseAdmin
          .from("topup_packs")
          .select("id, kind, name, price_gbp, stripe_price_id, available_to")
          .eq("id", id)
          .maybeSingle()
      ).data
    : null;

  if (id && !existing) {
    return NextResponse.json({ error: "No such pack." }, { status: 404 });
  }

  const kind = existing?.kind ?? String(body.kind ?? "credit_gbp");
  if (!isTopupKind(kind)) {
    return NextResponse.json({ error: `Unknown pack type "${kind}".` }, { status: 400 });
  }

  // A credit pack's units ARE its price in pence — the two cannot disagree, or
  // a teacher pays one amount and receives a different amount of credit.
  if (kind === "credit_gbp" && unit !== Math.round(amountGbp * 100)) {
    return NextResponse.json(
      {
        error:
          `A credit pack must grant exactly what it costs: £${amountGbp.toFixed(2)} ` +
          `is ${Math.round(amountGbp * 100)}p, but the pack grants ${unit}p.`,
      },
      { status: 400 },
    );
  }

  try {
    // Only touch Stripe when the money actually changes, so renaming a pack or
    // toggling it inactive doesn't churn Price objects.
    const priceChanged = !existing || Number(existing.price_gbp) !== amountGbp;
    let stripePriceId = existing?.stripe_price_id ?? null;

    if (priceChanged || !stripePriceId) {
      const result = await replacePrice({
        currentPriceId:
          stripePriceId ||
          (kind === "credit_gbp" ? process.env.STRIPE_PRICE_CREDIT_TOP_UP || null : null),
        productName: `Jooma ${name}`,
        amountGbp,
        interval: "one_time",
        label: name,
      });

      await assertPriceUsable(result.priceId, { interval: "one_time" });
      stripePriceId = result.priceId;
    }

    const { data: packId, error } = await gate.supabase.rpc("admin_upsert_topup_pack", {
      payload: {
        id: existing?.id ?? null,
        kind,
        name,
        price_gbp: amountGbp,
        unit,
        active,
        // Preserved when not sent, never defaulted to a narrower list. The
        // fallback here used to be ["free","pro"], which meant EVERY save
        // rewrote the row: credit packs silently lost "max", and the image
        // packs (seeded ["pro","max"]) were flipped to ["free","pro"], handing
        // them to Free users and taking them from Max. The editor now sends
        // this explicitly, but a caller that omits it still leaves it alone.
        available_to: availableTo ?? existing?.available_to ?? SELECTABLE_PLAN_IDS,
        // Omitted rather than nulled when absent, so the RPC keeps the current
        // value on an edit and appends at the end on a create.
        ...(sort === null ? {} : { sort }),
        stripe_price_id: stripePriceId,
      },
    });
    if (error) throw error;

    return NextResponse.json({ id: packId, stripePriceId });
  } catch (err) {
    console.error("[admin/topups/pack]", err);
    const message = err instanceof Error ? err.message : "Could not save the pack.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
