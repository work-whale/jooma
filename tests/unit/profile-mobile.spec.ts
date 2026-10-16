import { test, expect } from "@playwright/test";
import { dialPrefix, profileMobile } from "@/app/lib/dial-codes";

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
