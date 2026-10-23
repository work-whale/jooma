import { test, expect } from "@playwright/test";
import { generateKeyPairSync, sign } from "node:crypto";
import { MAX_SKEW_SECONDS, mapEvents, verifySendgridSignature } from "@/app/lib/sendgrid-events";

// SendGrid's event webhook. The signature check is the only thing between a
// public URL and our opt-out list, so it is pinned with a real P-256 key pair
// signed exactly the way SendGrid signs: base64 DER signature over
// timestamp + raw body, verified with a base64 DER public key.

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

function signed(body: string, timestamp: string) {
  return sign("sha256", Buffer.from(timestamp + body), privateKey).toString("base64");
}

const NOW = 1_800_000_000;
const TS = String(NOW);
const BODY = JSON.stringify([{ event: "delivered", email: "a@b.co", recipient_id: "7" }]);

test.describe("verifySendgridSignature", () => {
  test("accepts a correctly signed request", () => {
    expect(verifySendgridSignature(publicKeyB64, signed(BODY, TS), TS, BODY, NOW)).toBe(true);
  });

  test("refuses a body changed after signing", () => {
    const sig = signed(BODY, TS);
    const tampered = BODY.replace("delivered", "spamreport");
    expect(verifySendgridSignature(publicKeyB64, sig, TS, tampered, NOW)).toBe(false);
  });

  test("refuses a signature replayed with a different timestamp", () => {
    const sig = signed(BODY, TS);
    expect(verifySendgridSignature(publicKeyB64, sig, String(NOW + 1), BODY, NOW)).toBe(false);
  });

  test("refuses a timestamp far outside the allowed window", () => {
    const old = String(NOW - MAX_SKEW_SECONDS - 60);
    expect(verifySendgridSignature(publicKeyB64, signed(BODY, old), old, BODY, NOW)).toBe(false);
  });

  test("refuses a different key, and garbage, without throwing", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
      .publicKey.export({ format: "der", type: "spki" })
      .toString("base64");
    expect(verifySendgridSignature(other, signed(BODY, TS), TS, BODY, NOW)).toBe(false);
    expect(verifySendgridSignature("not-a-key", "not-a-sig", TS, BODY, NOW)).toBe(false);
    expect(verifySendgridSignature(publicKeyB64, "", TS, BODY, NOW)).toBe(false);
    expect(verifySendgridSignature(publicKeyB64, signed(BODY, TS), "abc", BODY, NOW)).toBe(false);
  });
});

test.describe("mapEvents", () => {
  test("maps the delivery outcomes and ignores the rest", () => {
    const rows = mapEvents([
      { event: "processed", email: "a@b.co", recipient_id: "1" },
      { event: "deferred", email: "a@b.co", recipient_id: "1" },
      { event: "open", email: "a@b.co", recipient_id: "1" },
      { event: "click", email: "a@b.co", recipient_id: "1" },
      { event: "delivered", email: "A@B.co", recipient_id: "1", timestamp: NOW },
      { event: "spamreport", email: "c@d.co", recipient_id: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ recipient_id: 1, email: "a@b.co", delivery: "delivered", opt_out: null });
    expect(rows[0].at).toBe(new Date(NOW * 1000).toISOString());
    expect(rows[1]).toMatchObject({ recipient_id: 2, delivery: "spam", opt_out: "spam" });
  });

  test("a hard bounce opts out, a blocked one does not", () => {
    const [hard, blocked] = mapEvents([
      { event: "bounce", type: "bounce", email: "x@y.co", recipient_id: "3", reason: "550 no such user" },
      { event: "bounce", type: "blocked", email: "z@y.co", recipient_id: "4", reason: "421 try later" },
    ]);
    expect(hard).toMatchObject({ delivery: "bounced", opt_out: "bounce", reason: "550 no such user" });
    expect(blocked).toMatchObject({ delivery: "bounced", opt_out: null });
  });

  test("drops copy SendGrid's own bounce and spam suppressions into ours", () => {
    const rows = mapEvents([
      { event: "dropped", email: "a@b.co", recipient_id: "5", reason: "Bounced Address" },
      { event: "dropped", email: "c@d.co", recipient_id: "6", reason: "Spam Reporting Address" },
      { event: "dropped", email: "e@f.co", recipient_id: "7", reason: "Unsubscribed Address" },
    ]);
    expect(rows.map((r) => r.opt_out)).toEqual(["bounce", "spam", null]);
    expect(rows.every((r) => r.delivery === "dropped")).toBe(true);
  });

  test("transactional email: a spam complaint still opts out, a delivery is dropped", () => {
    // No recipient_id: a password reset or invite, which has no recipient row.
    const rows = mapEvents([
      { event: "delivered", email: "a@b.co" },
      { event: "spamreport", email: "c@d.co" },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ recipient_id: null, email: "c@d.co", opt_out: "spam" }),
    ]);
  });

  test("ignores malformed input instead of throwing", () => {
    expect(mapEvents(null)).toEqual([]);
    expect(mapEvents({ event: "delivered" })).toEqual([]);
    expect(mapEvents([null, 5, { event: "delivered" }, { event: "delivered", email: "a@b.co", recipient_id: "-1" }])).toEqual([]);
  });
});
