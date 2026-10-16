import { requireSection } from "../access";
import { siteUrl } from "@/app/lib/email-templates/markup";
import { stripe } from "@/app/lib/stripe";
import { addMonths, periodOf } from "@/app/lib/ambassador-commission";
import AmbassadorsView, {
  type AmbassadorRow,
  type ApplicationRow,
  type CodeLive,
  type ProgrammeSummary,
} from "./AmbassadorsView";
import { parseAmbRange, type AmbRange } from "./range";

export const dynamic = "force-dynamic";

/*
 * The ambassador programme: the share link, applications waiting for review,
 * live ambassadors and the teachers under each one, and what it all costs.
 *
 * Two sources, deliberately. The ATTRIBUTION and the MONEY are ours: who
 * redeemed whose code, and the commission ledger the Stripe webhook writes. The
 * OFFER is Stripe's, read live for the same reason /admin/promos does it:
 * Stripe validates the code at checkout, so a local copy of the discount would
 * be a second truth. A Stripe outage costs the offer text and nothing else.
 */

/** The first month a range covers, or null for all time. */
function fromFor(range: AmbRange): string | null {
  const now = periodOf(new Date());
  if (range === "month") return now;
  if (range === "3m") return addMonths(now, -2);
  return null;
}

export default async function AdminAmbassadorsPage(props: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const { supabase } = await requireSection("see_money");
  const searchParams = await props.searchParams;
  const range = parseAmbRange(searchParams?.range);

  const [
    { data: rows, error },
    { data: summaryRows, error: summaryError },
    { data: applications, error: applicationsError },
  ] = await Promise.all([
    supabase.rpc("admin_ambassadors"),
    supabase.rpc("admin_programme_summary", { p_from: fromFor(range) }),
    supabase.rpc("admin_ambassador_applications", { p_status: "pending" }),
  ]);

  for (const [what, err] of [
    ["ambassadors", error],
    ["summary", summaryError],
    ["applications", applicationsError],
  ] as const) {
    if (err) console.error(`[admin/ambassadors] could not load ${what}`, err);
  }

  const ambassadors = (rows ?? []) as AmbassadorRow[];
  const summary = ((summaryRows ?? [])[0] ?? null) as ProgrammeSummary | null;

  // Live offer and redemption count per code, keyed by the code string. Only
  // fetched when there is something to look up.
  const live: Record<string, CodeLive> = {};
  let stripeError: string | null = null;

  if (ambassadors.some((a) => (a.codes?.length ?? 0) > 0)) {
    try {
      const codes = await stripe.promotionCodes.list({
        limit: 100,
        expand: ["data.promotion.coupon"],
      });

      for (const pc of codes.data) {
        // The coupon hangs off `promotion` on this API version, and an
        // unexpanded response leaves it as a bare id string.
        const promotion = (pc as unknown as { promotion?: { coupon?: unknown } }).promotion;
        const coupon =
          promotion && typeof promotion.coupon === "object" && promotion.coupon !== null
            ? (promotion.coupon as {
                percent_off?: number | null;
                amount_off?: number | null;
                currency?: string | null;
              })
            : null;

        const offer =
          coupon?.percent_off != null
            ? `${coupon.percent_off}% off the first month`
            : coupon?.amount_off != null
              ? `${(coupon.amount_off / 100).toLocaleString("en-GB", {
                  style: "currency",
                  currency: (coupon.currency ?? "gbp").toUpperCase(),
                })} off the first month`
              : "Discount";

        const expired = pc.expires_at ? pc.expires_at * 1000 < Date.now() : false;
        const capped =
          pc.max_redemptions != null && (pc.times_redeemed ?? 0) >= pc.max_redemptions;

        live[pc.code.toUpperCase()] = {
          offer,
          redeemed: pc.times_redeemed ?? 0,
          usable: pc.active && !expired && !capped,
        };
      }
    } catch (err) {
      console.error("[admin/ambassadors] could not list Stripe promotion codes", err);
      stripeError = err instanceof Error ? err.message : "Could not reach Stripe.";
    }
  }

  return (
    <AmbassadorsView
      range={range}
      rows={ambassadors}
      summary={summary}
      applications={(applications ?? []) as ApplicationRow[]}
      shareLink={shareLink()}
      live={live}
      stripeError={stripeError}
    />
  );
}

/** The programme's one link. Copied in full so a chat app makes it clickable,
 *  shown short ("jooma.ai/ambassador") so it reads well. */
function shareLink(): { url: string; display: string } {
  const url = `${siteUrl()}/ambassador`;
  return { url, display: url.replace(/^https?:\/\//, "").replace(/^www\./, "") };
}
