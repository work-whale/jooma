import { test, expect } from "@playwright/test";
import { signerIp } from "@/app/lib/signer-ip";

// The IP kept beside a typed signature. Moved out of the apply route so
// accepting a new agreement records it the same way; behaviour unchanged.

const req = (headers: Record<string, string>) => new Request("https://www.jooma.ai/api/x", { headers });

test.describe("the signer's IP", () => {
  test("is the last x-forwarded-for entry, which Vercel appends", () => {
    expect(signerIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(signerIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  test("ignores empty hops", () => {
    expect(signerIp(req({ "x-forwarded-for": "203.0.113.7, ," }))).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip, then to nothing", () => {
    expect(signerIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(signerIp(req({}))).toBeNull();
  });

  test("never stores more than 64 characters", () => {
    expect(signerIp(req({ "x-forwarded-for": "a".repeat(100) }))).toHaveLength(64);
  });
});
