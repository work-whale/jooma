import { test, expect } from "@playwright/test";
import { createHash } from "crypto";
import { buildMetaEvent, buildPurchasePayload, metaCookieFrom, metaEventId, metaNameForInvoice } from "@/app/lib/meta-purchase";

/*
 * Jooma 4.5 Step 7: the Meta Conversions API events, server side only.
 *
 *   signup_completed  CompleteRegistration   event id reg:<user>
 *   trial_started     StartTrial             event id <user> (unchanged)
 *   activated         Activated (custom)     event id act:<user>
 *   subscribed        Subscribe              the first payment's invoice id
 *   renewals          Purchase               invoice id (owner kept these)
 *   topup_bought      Purchase               the checkout session id
 *
 * Edge cases: the email is hashed (trimmed, lower case) and the browser ids
 * are not; an event with a value converts pence to pounds and upper-cases the
 * currency; an event without one sends no custom_data at all; billing reasons
 * map first payment to Subscribe and everything else (renewal, upgrade,
 * unknown, missing) to Purchase; the old Purchase builder is unchanged.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

test("event ids are stable per account, so a retry is one event", () => {
  expect(metaEventId("CompleteRegistration", "u1")).toBe("reg:u1");
  expect(metaEventId("Activated", "u1")).toBe("act:u1");
  expect(metaEventId("StartTrial", "u1")).toBe("u1");
});

test("identifiers: email hashed, browser ids raw, nothing invented", () => {
  const e = buildMetaEvent({
    eventName: "CompleteRegistration",
    eventId: "reg:u1",
    email: "  Sam@School.org ",
    fbp: "fb.1.123.456",
    fbc: null,
    eventTimeUnix: 1_800_000_000,
  });
  expect(e.user_data).toEqual({ em: sha("sam@school.org"), fbp: "fb.1.123.456" });
  expect(e.event_name).toBe("CompleteRegistration");
  expect(e.action_source).toBe("website");
  expect("custom_data" in e).toBe(false);
});

test("Activated is a custom event with no value", () => {
  const e = buildMetaEvent({ eventName: "Activated", eventId: "act:u1", email: "a@b.co", fbp: null, fbc: null, eventTimeUnix: 1 });
  expect(e.event_name).toBe("Activated");
  expect("custom_data" in e).toBe(false);
});

test("a valued event sends pounds and an upper-case currency", () => {
  const e = buildMetaEvent({
    eventName: "Subscribe",
    eventId: "in_1",
    email: null,
    fbp: null,
    fbc: "fb.1.x",
    eventTimeUnix: 1,
    valueMinor: 799,
    currency: "gbp",
  });
  expect(e.custom_data).toEqual({ value: 7.99, currency: "GBP" });
});

test("invoices: the first payment is Subscribe; everything else Purchase", () => {
  expect(metaNameForInvoice("subscription_create")).toBe("Subscribe");
  for (const r of ["subscription_cycle", "subscription_update", "manual", null, undefined]) {
    expect(metaNameForInvoice(r), String(r)).toBe("Purchase");
  }
});

test("the Purchase builder still sends the same body, with a name override", () => {
  const input = { eventId: "in_2", email: null, fbp: null, fbc: null, valueMinor: 249, currency: "gbp", eventTimeUnix: 5 };
  expect(buildPurchasePayload(input).event_name).toBe("Purchase");
  expect(buildPurchasePayload({ ...input, eventName: "Subscribe" }).event_name).toBe("Subscribe");
  expect(buildPurchasePayload(input).custom_data).toEqual({ value: 2.49, currency: "GBP" });
});

test("the Meta cookies are read from a raw Cookie header, values kept whole", () => {
  const h = "a=1; _fbp=fb.1.2.3; _fbc=fb.1.2.AbC=x; b=2";
  expect(metaCookieFrom(h, "_fbp")).toBe("fb.1.2.3");
  expect(metaCookieFrom(h, "_fbc")).toBe("fb.1.2.AbC=x");
  expect(metaCookieFrom("x_fbp=1", "_fbp")).toBeNull();
  expect(metaCookieFrom(null, "_fbp")).toBeNull();
  expect(metaCookieFrom("_fbp=", "_fbp")).toBeNull();
});
