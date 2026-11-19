/*
 * Jooma 4.5 top-up packs (spec Step 2, plan 2e).
 *
 * The packs themselves live in plan-config.ts (TOP_UP_PACKS): what a teacher
 * sees and what the webhook grants both come from there. The database row
 * (topup_packs, kind 'resources_topup', matched on pack_key) only maps a pack
 * to its Stripe price in each environment.
 *
 * Pure: shared by the top-up sheet, /api/stripe/topup and the webhook.
 */

import { TOP_UP_PACKS, topUpsAllowed, type AccountPlan, type TopUpPackId } from "@/app/lib/plan-config";

export type TopUpPackSpec = (typeof TOP_UP_PACKS)[number];

/** The config pack with this id, or null for anything else. */
export function topUpPack(id: string | null | undefined): TopUpPackSpec | null {
  if (!id) return null;
  return TOP_UP_PACKS.find((p) => p.id === id) ?? null;
}

/** Why this plan may not buy this pack, or null when it may. */
export function topUpRefusal(plan: AccountPlan | string, packId: string | null | undefined): string | null {
  if (!topUpsAllowed(plan as AccountPlan)) return "Top ups are for Standard, Pro and Max.";
  if (!topUpPack(packId)) return "That top up is no longer available.";
  return null;
}

/** Resources a bought pack grants: the pack's, never the amount paid. */
export function topUpGrant(packId: string | null | undefined): number | null {
  return topUpPack(packId)?.resources ?? null;
}

export function isTopUpPackId(id: unknown): id is TopUpPackId {
  return typeof id === "string" && topUpPack(id) !== null;
}
