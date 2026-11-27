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

test.describe("Jamaica, Trinidad and Tobago and Malta", () => {
  const CE = [
    // Both are +1 like the United States and Canada: numbers are written with
    // their area code (876, 868), so a "+1876" prefix would double it.
    ["Jamaica", "JM", "+1"],
    ["Trinidad and Tobago", "TT", "+1"],
    ["Malta", "MT", "+356"],
  ] as const;

  test("are offered once each, with their own dial code", () => {
    for (const [name, code, dial] of CE) {
      expect(COUNTRIES.filter((c) => c.code === code), code).toEqual([{ name, code, dial }]);
      expect(dialPrefix(code), code).toBe(dial);
    }
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a local number gets the country prefix", () => {
    expect(profileMobile("JM", "(876) 555 1234")).toBe("+18765551234");
    expect(profileMobile("TT", "868-555-1234")).toBe("+18685551234");
    expect(profileMobile("MT", "7912 3456")).toBe("+35679123456");
    // The United States and Canada keep +1 alone, untouched by the new codes.
    expect(dialPrefix("US")).toBe("+1");
    expect(dialPrefix("CA")).toBe("+1");
  });
});

test.describe("the United Arab Emirates", () => {
  test("is offered once, with +971", () => {
    expect(COUNTRIES.filter((c) => c.code === "AE")).toEqual([{ name: "United Arab Emirates", code: "AE", dial: "+971" }]);
    expect(dialPrefix("AE")).toBe("+971");
  });

  test("a local number gets the country prefix", () => {
    expect(profileMobile("AE", "50 123 4567")).toBe("+971501234567");
  });
});

test.describe("Stage 3 batch A: the Gulf, the Middle East and Türkiye", () => {
  const A = [
    ["Saudi Arabia", "SA", "+966"],
    ["Qatar", "QA", "+974"],
    ["Kuwait", "KW", "+965"],
    ["Oman", "OM", "+968"],
    ["Bahrain", "BH", "+973"],
    ["Jordan", "JO", "+962"],
    ["Egypt", "EG", "+20"],
    ["Israel", "IL", "+972"],
    ["Türkiye", "TR", "+90"],
  ] as const;

  test("are offered once each, with their own dial code", () => {
    for (const [name, code, dial] of A) {
      expect(COUNTRIES.filter((c) => c.code === code), code).toEqual([{ name, code, dial }]);
      expect(dialPrefix(code), code).toBe(dial);
    }
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a local number drops its trunk 0 behind the country prefix", () => {
    expect(profileMobile("SA", "050 123 4567")).toBe("+966501234567");
    expect(profileMobile("EG", "010 1234 5678")).toBe("+201012345678");
    expect(profileMobile("TR", "0532 123 45 67")).toBe("+905321234567");
    // Gulf numbers have no trunk 0 and are kept whole.
    expect(profileMobile("QA", "3312 3456")).toBe("+97433123456");
  });
});

test.describe("Stage 3 batch B: Asia", () => {
  const B = [
    ["China", "CN", "+86"],
    ["Japan", "JP", "+81"],
    ["South Korea", "KR", "+82"],
    ["Taiwan", "TW", "+886"],
    ["Vietnam", "VN", "+84"],
    ["Thailand", "TH", "+66"],
    ["Indonesia", "ID", "+62"],
    ["Sri Lanka", "LK", "+94"],
    ["Nepal", "NP", "+977"],
  ] as const;

  test("are offered once each, with their own dial code", () => {
    for (const [name, code, dial] of B) {
      expect(COUNTRIES.filter((c) => c.code === code), code).toEqual([{ name, code, dial }]);
      expect(dialPrefix(code), code).toBe(dial);
    }
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a local number drops its trunk 0 behind the country prefix", () => {
    expect(profileMobile("JP", "090 1234 5678")).toBe("+819012345678");
    expect(profileMobile("KR", "010-1234-5678")).toBe("+821012345678");
    expect(profileMobile("ID", "0812 3456 7890")).toBe("+6281234567890");
  });
});
