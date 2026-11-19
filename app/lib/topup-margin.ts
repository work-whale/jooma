/*
 * What a top-up pack costs Jooma and its margin, for Admin, Top-ups.
 *
 * A resource pack costs its resources at 0.15p each (PENCE_PER_CREDIT, the
 * rate the whole 4.5 allowance is built on) plus Stripe's UK card fee. That
 * is the most a pack can cost: a teacher who leaves some unused costs less.
 * Until 19 Nov the page used COST.text (the old cost of a whole generation,
 * about 0.86p) per resource and showed every pack at a loss.
 *
 * Kinds (topup_packs.kind): resources_topup is the 4.5 pack (0.15p each);
 * resource is the old pack of whole generations (COST.text each); ai_image
 * the old AI deck pack (COST.deckAI each); credit_gbp grants exactly the
 * spend it costs, so it has no margin.
 *
 * Pure.
 */

import { COST } from "@/app/lib/costs";
import { PENCE_PER_CREDIT } from "@/app/lib/plans";

export function topupEconomics(
  kind: string,
  unit: number,
  price: number,
): { cost: number | null; margin: number | null } {
  if (kind === "credit_gbp") return { cost: null, margin: null };
  const spend =
    kind === "resources_topup"
      ? (unit * PENCE_PER_CREDIT) / 100
      : kind === "ai_image"
        ? unit * COST.deckAI
        : unit * COST.text;
  const fee = Number.isFinite(price) && price > 0 ? price * COST.cardPct + COST.cardFixed : 0;
  const cost = spend + fee;
  const margin = Number.isFinite(price) && price > 0 ? (price - cost) / price : null;
  return { cost, margin };
}
