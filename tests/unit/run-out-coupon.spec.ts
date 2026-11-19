import { test, expect } from "@playwright/test";
import { ensureRunOutCoupon, type RunOutCouponClient } from "@/app/lib/trial-offer";
import { OFFER } from "@/app/lib/plan-config";

/*
 * The second run-out offer's coupon (P3b, E9b): PRO-HALF-FIRST-MONTH, made in
 * Stripe by the app the first time a teacher uses the offer, so the owner
 * does not create it by hand in live Stripe (owner asked, 19 Nov).
 *
 * Edge cases: an existing coupon is used as it is and nothing is created; a
 * missing one is created with the exact id checkout sends, 50% off, the first
 * payment only, and restricted to the PRO product (read from the Pro monthly
 * price being charged), so Stripe itself refuses it on Standard or Max; two
 * teachers at once (the second create finds it already made) both get it;
 * any other Stripe error is thrown, never swallowed into a full-price sale
 * that looks discounted.
 */

function fakeClient(opts: { exists?: boolean; createError?: string; retrieveError?: string } = {}) {
  const calls = { created: [] as unknown[], retrieved: 0, pricesRead: [] as string[] };
  let made = opts.exists ?? false;
  const client: RunOutCouponClient = {
    coupons: {
      async retrieve(id: string) {
        calls.retrieved += 1;
        if (opts.retrieveError) throw Object.assign(new Error("boom"), { code: opts.retrieveError });
        if (!made) throw Object.assign(new Error("No such coupon"), { code: "resource_missing" });
        return { id };
      },
      async create(params) {
        calls.created.push(params);
        if (opts.createError) {
          if (opts.createError === "resource_already_exists") made = true;
          throw Object.assign(new Error("create failed"), { code: opts.createError });
        }
        made = true;
        return { id: params.id };
      },
    },
    prices: {
      async retrieve(id: string) {
        calls.pricesRead.push(id);
        return { product: "prod_PRO" };
      },
    },
  };
  return { client, calls };
}

test("an existing coupon is used and nothing is created", async () => {
  const { client, calls } = fakeClient({ exists: true });
  expect(await ensureRunOutCoupon(client, "price_pro_month")).toBe(OFFER.code);
  expect(calls.created).toHaveLength(0);
  expect(calls.pricesRead).toHaveLength(0);
});

test("a missing coupon is made: half off, first payment, Pro product only", async () => {
  const { client, calls } = fakeClient();
  expect(await ensureRunOutCoupon(client, "price_pro_month")).toBe("PRO-HALF-FIRST-MONTH");
  expect(calls.pricesRead).toEqual(["price_pro_month"]);
  expect(calls.created).toEqual([
    expect.objectContaining({
      id: "PRO-HALF-FIRST-MONTH",
      percent_off: 50,
      duration: "once",
      applies_to: { products: ["prod_PRO"] },
    }),
  ]);
});

test("two at once: the one that loses the race still gets the coupon", async () => {
  const { client } = fakeClient({ createError: "resource_already_exists" });
  expect(await ensureRunOutCoupon(client, "price_pro_month")).toBe(OFFER.code);
});

test("any other Stripe error is thrown", async () => {
  await expect(ensureRunOutCoupon(fakeClient({ createError: "api_error" }).client, "p")).rejects.toThrow();
  await expect(ensureRunOutCoupon(fakeClient({ retrieveError: "api_error" }).client, "p")).rejects.toThrow();
});
