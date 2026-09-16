import { test, expect } from "@playwright/test";
import { createHash } from "crypto";
import type Stripe from "stripe";
// From meta-purchase.ts, not meta-capi.ts: the latter carries `server-only`,
// which is a Next bundler alias rather than a real package and so cannot be
// resolved by a plain Node test runner. The pure half lives apart for exactly
// this reason.
import {
  buildPurchasePayload,
  isReportablePurchase,
  type PurchaseInput,
} from "@/app/lib/meta-purchase";

/*
 * The Purchase payload sent to Meta.
 *
 * Every failure this file guards against is SILENT in production. A wrong hash,
 * a pence error, a hashed cookie: none of them raise, none of them show up in a
 * log. They just report nonsense to the agency for months until somebody
 * notices the revenue column is a hundred times too big. That is why the
 * payload builder is pure and tested here rather than left inside the send.
 */

const EVENT_TIME = 1_757_000_000;

const input = (over: Partial<PurchaseInput> = {}): PurchaseInput => ({
  eventId: "in_1ABCxyz",
  email: "teacher@school.sch.uk",
  fbp: "fb.1.1700000000000.1234567890",
  fbc: "fb.1.1700000000000.IwAR0abc",
  valueMinor: 799,
  currency: "gbp",
  eventTimeUnix: EVENT_TIME,
  ...over,
});

/** The digest Meta itself would compute for the normalised address. Written out
 *  the long way rather than reusing the module's own hasher, so a bug in that
 *  hasher cannot make this test agree with it. */
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

test.describe("Hashing the identifiers", () => {
  test("the email is SHA-256 of the normalised address", () => {
    const payload = buildPurchasePayload(input());
    expect(payload.user_data.em).toBe(sha256("teacher@school.sch.uk"));
  });

  test("case and surrounding space cannot change the digest", () => {
    // Meta normalises before hashing on their side. Skipping it here produces a
    // digest that matches nobody, with no error to show for it.
    const messy = buildPurchasePayload(input({ email: "  Teacher@School.SCH.UK  " }));
    expect(messy.user_data.em).toBe(sha256("teacher@school.sch.uk"));
  });

  test("a missing email is omitted, never sent as the hash of nothing", () => {
    // The digest of "" is a real constant that would match every other user
    // with no email on file, so sending it is worse than sending nothing.
    const none = buildPurchasePayload(input({ email: null, fbp: "fb.1.x.y", fbc: null }));
    expect(none.user_data.em).toBeUndefined();
    expect("em" in none.user_data).toBe(false);

    const empty = buildPurchasePayload(input({ email: "   ", fbp: "fb.1.x.y", fbc: null }));
    expect(empty.user_data.em).toBeUndefined();
  });

  test("the Meta cookies go raw, not hashed", () => {
    // Hashing these destroys the match silently. It is the single easiest
    // mistake to make here, because everything beside them IS hashed.
    const payload = buildPurchasePayload(input());
    expect(payload.user_data.fbp).toBe("fb.1.1700000000000.1234567890");
    expect(payload.user_data.fbc).toBe("fb.1.1700000000000.IwAR0abc");
  });

  test("absent cookies are omitted rather than sent empty", () => {
    // fbc is null for every organic signup, which is the common case, not an
    // edge one.
    const payload = buildPurchasePayload(input({ fbc: null }));
    expect("fbc" in payload.user_data).toBe(false);
    expect(payload.user_data.fbp).toBeTruthy();
  });

  test("request metadata rides along when there is a real request behind it", () => {
    const payload = buildPurchasePayload(
      input({ clientIpAddress: "203.0.113.7", clientUserAgent: "Mozilla/5.0" }),
    );
    expect(payload.user_data.client_ip_address).toBe("203.0.113.7");
    expect(payload.user_data.client_user_agent).toBe("Mozilla/5.0");
  });

  test("and is omitted when there is not, rather than invented", () => {
    // The webhook has no browser. Stripe's own IP is not the teacher's, and
    // sending it would corrupt the match rather than improve it.
    const payload = buildPurchasePayload(input());
    expect("client_ip_address" in payload.user_data).toBe(false);
    expect("client_user_agent" in payload.user_data).toBe(false);
  });
});

test.describe("Value and currency", () => {
  test("pence become pounds", () => {
    // 799 is GBP 7.99. Sending the minor unit overstates revenue a
    // hundredfold, and Meta has no way to know it was wrong.
    expect(buildPurchasePayload(input()).custom_data.value).toBe(7.99);
  });

  test("the currency is uppercased for Meta", () => {
    // Stripe reports "gbp" throughout; Meta expects "GBP".
    expect(buildPurchasePayload(input()).custom_data.currency).toBe("GBP");
  });

  test("a currency that is already uppercase is left alone", () => {
    expect(buildPurchasePayload(input({ currency: "USD" })).custom_data.currency).toBe("USD");
  });

  test("a zero value invoice reports a true zero, not a missing value", () => {
    // A 100 percent ambassador code bills GBP 0.00 on the first month against a
    // real plan. It is still a genuine Free to Paid transition, so it is
    // reported with an honest zero rather than dropped.
    const free = buildPurchasePayload(input({ valueMinor: 0 }));
    expect(free.custom_data.value).toBe(0);
    expect(free.custom_data).toHaveProperty("value");
  });
});

test.describe("The event envelope", () => {
  test("the Stripe invoice id is the event id", () => {
    // This is what makes a webhook retry safe: Meta dedupes on event_id, so the
    // same invoice arriving twice collapses to one conversion.
    expect(buildPurchasePayload(input()).event_id).toBe("in_1ABCxyz");
  });

  test("the event names itself and carries its time", () => {
    const payload = buildPurchasePayload(input());
    expect(payload.event_name).toBe("Purchase");
    expect(payload.event_time).toBe(EVENT_TIME);
    expect(payload.action_source).toBe("website");
  });
});

test.describe("Which invoices are reportable", () => {
  /** Only the field isReportablePurchase reads. A whole Stripe.Invoice is not
   *  needed and would obscure what is actually being tested. */
  const invoice = (parent: unknown) => ({ parent }) as unknown as Stripe.Invoice;

  test("a subscription invoice is a purchase", () => {
    expect(isReportablePurchase(invoice({ type: "subscription_details" }))).toBe(true);
  });

  test("a credit top-up is not", () => {
    // A one-off top-up is not a subscription. Reporting it as a Purchase would
    // mix GBP 1.50 credit buys into subscription conversion reporting.
    expect(isReportablePurchase(invoice({ type: "subscription_details_x" }))).toBe(false);
    expect(isReportablePurchase(invoice({ type: "quote_details" }))).toBe(false);
  });

  test("an invoice with no parent at all is not", () => {
    expect(isReportablePurchase(invoice(undefined))).toBe(false);
    expect(isReportablePurchase({} as Stripe.Invoice)).toBe(false);
  });
});
