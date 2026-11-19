import { test, expect } from "@playwright/test";
import { NEW_PACK_KINDS, isTopupKind, topupEconomics } from "@/app/lib/topup-margin";

/*
 * Regression (19 Nov): Admin, Top-ups showed every resource pack at a loss
 * (500 for £2.49 at -73%). It costed each resource at COST.text, the old
 * modelled cost of a whole text generation (about 0.86p), when a 4.5 resource
 * is 0.15p of measured spend (PENCE_PER_CREDIT). Now: resources at 0.15p each
 * plus Stripe's UK card fee (1.5% + 20p).
 *
 * Only the 4.5 kind (resources_topup) uses 0.15p: the old "resource" kind
 * counted whole generations, where COST.text was right.
 *
 * Edge cases: the three live packs land on their real margins (positive);
 * the card fee is counted (without it 500 would read 70%, not 60%); a pack
 * priced below its cost still reads negative, so a real loss is never hidden;
 * a credit pack has no margin (it grants what it costs); a zero or missing
 * price has no margin rather than dividing by zero.
 */

const pct = (m: number | null) => (m === null ? null : Math.round(m * 100));

test("the live resource packs make money, fee included", () => {
  const a = topupEconomics("resources_topup", 500, 2.49);
  expect(a.cost).toBeCloseTo(0.75 + 2.49 * 0.015 + 0.2, 4);
  expect(pct(a.margin)).toBe(60);
  expect(pct(topupEconomics("resources_topup", 1500, 5.99).margin)).toBe(58);
  expect(pct(topupEconomics("resources_topup", 4000, 12.99).margin)).toBe(51);
});

test("a pack priced below its cost still reads as a loss", () => {
  expect(topupEconomics("resources_topup", 4000, 5).margin!).toBeLessThan(0);
});

test("a credit pack has no margin to report", () => {
  expect(topupEconomics("credit_gbp", 150, 1.5)).toEqual({ cost: null, margin: null });
});

test("no price, no margin", () => {
  expect(topupEconomics("resources_topup", 500, 0).margin).toBeNull();
  expect(topupEconomics("resources_topup", 500, Number.NaN).margin).toBeNull();
});

test("the old generation-count pack keeps the per-generation cost", () => {
  const old = topupEconomics("resource", 100, 2);
  const fresh = topupEconomics("resources_topup", 100, 2);
  expect(old.cost!).toBeGreaterThan(fresh.cost!);
});

/*
 * Regression (19 Nov): the admin save route only knew credit_gbp, resource
 * and ai_image, so saving a 4.5 pack (resources_topup) failed with "Unknown
 * pack type" and the admin page could never give it a Stripe price. A new
 * pack from the editor's "Resources" option must also be the 4.5 kind.
 */
test("every pack kind on sale can be saved, and nothing else", () => {
  for (const k of ["resources_topup", "credit_gbp", "resource", "ai_image"]) expect(isTopupKind(k), k).toBe(true);
  for (const k of ["", "resources", "Resource", "credits"]) expect(isTopupKind(k), k).toBe(false);
  expect(NEW_PACK_KINDS.find((k) => k.label === "Resources")?.value).toBe("resources_topup");
});
