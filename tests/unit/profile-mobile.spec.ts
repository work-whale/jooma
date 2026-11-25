import { test, expect } from "@playwright/test";
import { COUNTRIES, dialPrefix, profileMobile } from "@/app/lib/dial-codes";

/*
 * profiles.dial_code holds the country ("GB"), not the prefix. The ambassador
 * application used to glue the two together as "GB 0893...", which its own
 * validator then refused as not a number.
 */

test.describe("profileMobile", () => {
  test("a UK number gets +44 and loses its leading 0", () => {
    expect(profileMobile("GB", "07700 900412")).toBe("+447700900412");
    expect(profileMobile("GB", "0893123456")).toBe("+44893123456");
  });

  test("a number typed with a plus or 00 is kept as typed", () => {
    expect(profileMobile("GB", "+353 85 123 4567")).toBe("+353851234567");
    expect(profileMobile("GB", "0033 6 12 34 56 78")).toBe("+33612345678");
  });

  test("other countries use their own prefix", () => {
    expect(profileMobile("IE", "085 123 4567")).toBe("+353851234567");
    expect(profileMobile("US", "(415) 555-0100")).toBe("+14155550100");
  });

  test("an old prefix-style dial code still works", () => {
    expect(profileMobile("+44", "07700900412")).toBe("+447700900412");
    expect(dialPrefix("44")).toBe("+44");
  });

  test("no number is empty, and an unknown country leaves the digits", () => {
    expect(profileMobile("GB", "")).toBe("");
    expect(profileMobile(null, null)).toBe("");
    expect(profileMobile(null, "07700 900412")).toBe("07700900412");
  });
});

test.describe("the African countries", () => {
  const AFRICA = [
    ["South Africa", "ZA", "+27"],
    ["Nigeria", "NG", "+234"],
    ["Ghana", "GH", "+233"],
    ["Kenya", "KE", "+254"],
    ["Uganda", "UG", "+256"],
  ] as const;

  test("are offered once each, with their own dial code", () => {
    for (const [name, code, dial] of AFRICA) {
      expect(COUNTRIES.filter((c) => c.code === code), code).toEqual([{ name, code, dial }]);
      expect(dialPrefix(code), code).toBe(dial);
    }
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a local number gets the country prefix and loses its leading 0", () => {
    expect(profileMobile("NG", "0803 123 4567")).toBe("+2348031234567");
    expect(profileMobile("GH", "024 123 4567")).toBe("+233241234567");
    expect(profileMobile("KE", "0712 345678")).toBe("+254712345678");
    expect(profileMobile("UG", "0772 123456")).toBe("+256772123456");
    expect(profileMobile("ZA", "082 123 4567")).toBe("+27821234567");
  });
});

test.describe("the Asian countries", () => {
  const ASIA = [
    ["India", "IN", "+91"],
    ["Pakistan", "PK", "+92"],
    ["Philippines", "PH", "+63"],
    ["Malaysia", "MY", "+60"],
    ["Singapore", "SG", "+65"],
    ["Hong Kong", "HK", "+852"],
  ] as const;

  test("are offered once each, with their own dial code", () => {
    for (const [name, code, dial] of ASIA) {
      expect(COUNTRIES.filter((c) => c.code === code), code).toEqual([{ name, code, dial }]);
      expect(dialPrefix(code), code).toBe(dial);
    }
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a local number gets the country prefix and loses its leading 0", () => {
    expect(profileMobile("PK", "0300 1234567")).toBe("+923001234567");
    expect(profileMobile("PH", "0917 123 4567")).toBe("+639171234567");
    expect(profileMobile("MY", "012 345 6789")).toBe("+60123456789");
    expect(profileMobile("IN", "98765 43210")).toBe("+919876543210");
  });
});
