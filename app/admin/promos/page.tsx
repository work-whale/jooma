import { requireSection } from "../access";
import { stripe } from "@/app/lib/stripe";
import PromosView, { type PromoRow } from "./PromosView";

export const dynamic = "force-dynamic";

/** Describe a Stripe coupon the way a human would write the offer. */
function describeOffer(coupon: {
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
  duration?: string;
  duration_in_months?: number | null;
}): string {
  const amount =
    coupon.percent_off != null
      ? `${coupon.percent_off}% off`
      : coupon.amount_off != null
        ? `${(coupon.amount_off / 100).toLocaleString("en-GB", {
            style: "currency",
            currency: (coupon.currency ?? "gbp").toUpperCase(),
          })} off`
        : "Discount";

  const span =
    coupon.duration === "repeating" && coupon.duration_in_months
      ? ` ${coupon.duration_in_months} month${coupon.duration_in_months === 1 ? "" : "s"}`
      : coupon.duration === "forever"
        ? " forever"
        : coupon.duration === "once"
          ? " once"
          : "";

  return `${amount}${span}`;
}

export default async function AdminPromosPage() {
  await requireSection("see_money");

  // Stripe is the source of truth for promotions — it is the system that
  // actually validates a code at checkout. Rather than keep a local copy that
  // can silently drift out of step, this page reads Stripe directly and
  // reports exactly what is live there.
  let rows: PromoRow[] = [];
  let error: string | null = null;

  try {
    // On API version 2026-05-27.dahlia the coupon hangs off `promotion`, not
    // the promotion code itself — `expand: ["data.coupon"]` silently returns
    // nothing. Expanding the nested path is what actually populates it.
    const codes = await stripe.promotionCodes.list({
      limit: 100,
      expand: ["data.promotion.coupon"],
    });

    rows = codes.data.map((pc) => {
      // Narrowed by hand: the SDK types for this API version still describe
      // `promotion` loosely, and an unexpanded response leaves `coupon` as a
      // bare id string rather than an object.
      const promotion = (pc as unknown as { promotion?: { coupon?: unknown } }).promotion;
      const coupon =
        promotion && typeof promotion.coupon === "object" && promotion.coupon !== null
          ? (promotion.coupon as {
              percent_off?: number | null;
              amount_off?: number | null;
              currency?: string | null;
              duration?: string;
              duration_in_months?: number | null;
              applies_to?: { products?: string[] };
            })
          : null;

      return {
        id: pc.id,
        code: pc.code,
        offer: coupon ? describeOffer(coupon) : "Discount",
        // `metadata.channel` is a free-text note set in the Stripe dashboard —
        // that keeps campaign attribution in the same place as the code.
        channel: pc.metadata?.channel ?? null,
        redeemed: pc.times_redeemed ?? 0,
        max_redemptions: pc.max_redemptions ?? null,
        expires_at: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : null,
        active: pc.active,
        duration: coupon?.duration ?? null,
        applies_to_products: coupon?.applies_to?.products?.length ?? 0,
        created_at: new Date(pc.created * 1000).toISOString(),
      };
    });
  } catch (err) {
    // A missing or invalid key shouldn't take the page down — say so plainly.
    console.error("[admin/promos] could not list Stripe promotion codes", err);
    error = err instanceof Error ? err.message : "Could not reach Stripe.";
  }

  return <PromosView rows={rows} error={error} />;
}
