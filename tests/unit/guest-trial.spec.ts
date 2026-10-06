import { test, expect } from "@playwright/test";
import { guestCookieValue, newGuestCookie, verifyGuestCookie } from "@/app/lib/guest-cookie";
import { signTrialToken, verifyTrialToken, TRIAL_TOKEN_TTL_MS } from "@/app/lib/trial-token";
import {
  decideTrial,
  FREE_TRIES_PER_DAY,
  hashIp,
  isTrialTool,
  settingBool,
  settingInt,
  trialRefusalMessage,
} from "@/app/lib/trial-limits";
import { safeNextPath } from "@/app/lib/safe-next";
import { sumVisitors, formatVisitors, topCountries, countryName } from "@/app/lib/visitors";
import { guestSlugFor, appToolPath } from "@/app/lib/guest-tools";

/*
 * The free tries on /create: the signed guest cookie, the token a guest deck's
 * sub-requests carry, the three a day rule, and the pieces of the landing hero
 * around them. All pure.
 */

const SECRET = "a-test-secret-that-is-long-enough";

test.describe("guest cookie", () => {
  test("a minted cookie verifies to its own id", () => {
    const { guestId, value } = newGuestCookie(SECRET);
    expect(verifyGuestCookie(value, SECRET)).toBe(guestId);
    expect(guestCookieValue(guestId, SECRET)).toBe(value);
  });

  test("a tampered id or signature is refused", () => {
    const { value } = newGuestCookie(SECRET);
    const [id, sig] = value.split(".");
    const otherId = "00000000-0000-4000-8000-000000000000";
    // Someone else's id with my signature: the attack the signature exists for.
    expect(verifyGuestCookie(`${otherId}.${sig}`, SECRET)).toBeNull();
    expect(verifyGuestCookie(`${id}.${sig.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(verifyGuestCookie(value, "a-different-secret-entirely")).toBeNull();
  });

  test("junk is refused, not thrown on", () => {
    for (const v of [undefined, null, "", "nodot", ".sig", "not-a-uuid.sig"]) {
      expect(verifyGuestCookie(v as string | null | undefined, SECRET)).toBeNull();
    }
    expect(verifyGuestCookie(newGuestCookie(SECRET).value, "")).toBeNull();
  });
});

test.describe("trial sub-request token", () => {
  const run = "11111111-1111-4111-8111-111111111111";

  test("valid for its own run until it expires", () => {
    const now = 1_000_000;
    const token = signTrialToken(run, SECRET, now);
    expect(verifyTrialToken(token, run, SECRET, now + 1000)).toBe(true);
    expect(verifyTrialToken(token, run, SECRET, now + TRIAL_TOKEN_TTL_MS + 1)).toBe(false);
  });

  test("never valid for another run, secret or a missing header", () => {
    const token = signTrialToken(run, SECRET);
    expect(verifyTrialToken(token, "22222222-2222-4222-8222-222222222222", SECRET)).toBe(false);
    expect(verifyTrialToken(token, run, "another-secret-of-decent-length")).toBe(false);
    expect(verifyTrialToken(null, run, SECRET)).toBe(false);
    expect(verifyTrialToken(token, null, SECRET)).toBe(false);
    expect(verifyTrialToken("garbage", run, SECRET)).toBe(false);
  });

  test("an edited expiry breaks the signature", () => {
    const token = signTrialToken(run, SECRET, 1000);
    const [, sig] = token.split(".");
    expect(verifyTrialToken(`${Date.now() + 10 ** 9}.${sig}`, run, SECRET)).toBe(false);
  });
});

test.describe("decideTrial (three a day, across both tools)", () => {
  const base = { enabled: true, dailyCap: 300, startedToday: 0, guestRuns: 0, ipRuns: 0 };

  test("a first visit may generate", () => {
    expect(decideTrial(base)).toEqual({ ok: true });
  });

  test("the second and third tries are still free", () => {
    expect(FREE_TRIES_PER_DAY).toBe(3);
    expect(decideTrial({ ...base, guestRuns: 1, ipRuns: 1 })).toEqual({ ok: true });
    expect(decideTrial({ ...base, guestRuns: 2, ipRuns: 2 })).toEqual({ ok: true });
  });

  test("the switch and the daily cap come first", () => {
    expect(decideTrial({ ...base, enabled: false })).toEqual({ ok: false, reason: "disabled" });
    expect(decideTrial({ ...base, startedToday: 300 })).toEqual({ ok: false, reason: "daily_cap" });
    expect(decideTrial({ ...base, dailyCap: 0 })).toEqual({ ok: false, reason: "daily_cap" });
  });

  test("the fourth is refused, by this browser OR this network", () => {
    expect(decideTrial({ ...base, guestRuns: 3 })).toEqual({ ok: false, reason: "used" });
    // Clearing cookies does not reset it: the IP still counts.
    expect(decideTrial({ ...base, ipRuns: 3 })).toEqual({ ok: false, reason: "used" });
  });

  test("refusals read cleanly on the signed out surface", () => {
    for (const r of ["used", "daily_cap", "disabled"] as const) {
      const msg = trialRefusalMessage(r);
      expect(msg).not.toMatch(/[–—]/);
      expect(msg).not.toMatch(/\bAI\b/);
    }
    expect(trialRefusalMessage("used")).toContain("three free tries");
  });

  test("settings are read defensively", () => {
    expect(settingBool(false, true)).toBe(false);
    expect(settingBool("false", true)).toBe(true);
    expect(settingInt(250, 300)).toBe(250);
    expect(settingInt("40", 300)).toBe(40);
    expect(settingInt(-5, 300)).toBe(300);
    expect(settingInt("lots", 300)).toBe(300);
  });

  test("only the two guest tools", () => {
    expect(isTrialTool("slideshow")).toBe(true);
    expect(isTrialTool("comprehension-generator")).toBe(true);
    expect(isTrialTool("worksheet-generator")).toBe(false);
  });

  test("an IP is stored as a keyed hash, never as itself", () => {
    const h = hashIp("203.0.113.9", SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203.0.113.9");
    expect(hashIp(" 203.0.113.9 ", SECRET)).toBe(h);
    expect(hashIp("203.0.113.9", "another-secret-of-decent-length")).not.toBe(h);
  });
});

test.describe("safeNextPath (the callback's open redirect)", () => {
  test("keeps an ordinary path", () => {
    expect(safeNextPath("/tools")).toBe("/tools");
    expect(safeNextPath("/editor/abc?then=export")).toBe("/editor/abc?then=export");
  });

  test("refuses anything that leaves the site", () => {
    for (const bad of ["@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "/x@evil.com", "evil.com", ""]) {
      expect(safeNextPath(bad, "/")).toBe("/");
    }
    expect(safeNextPath(null)).toBe("/");
  });
});

test.describe("the landing count", () => {
  test("sums the monthly buckets", () => {
    expect(sumVisitors([{ visitors: 1200 }, { visitors: 800 }, { visitors: 0 }])).toBe(2000);
  });

  test("null rather than zero when there is nothing to say", () => {
    expect(sumVisitors(null)).toBeNull();
    expect(sumVisitors([])).toBeNull();
    expect(sumVisitors([{ visitors: 0 }])).toBeNull();
  });

  test("printed the way the prototype prints it", () => {
    expect(formatVisitors(43271)).toBe("43,271");
  });
});

test.describe("the countries under the landing count", () => {
  test("biggest first, capped, with bars relative to the largest", () => {
    const rows = topCountries(
      [
        { country: "IE", visitors: 250 },
        { country: "GB", visitors: 1000 },
        { country: "US", visitors: 500 },
        { country: "AU", visitors: 100 },
      ],
      3,
    );
    expect(rows.map((r) => r.country)).toEqual(["GB", "US", "IE"]);
    expect(rows.map((r) => r.share)).toEqual([100, 50, 25]);
    expect(rows[0].name).toBe("United Kingdom");
  });

  test("drops rows with nothing to show", () => {
    const rows = topCountries([
      { country: "GB", visitors: 10 },
      { country: "FR", visitors: 0 },
      { country: "", visitors: 40 },
      { country: null, visitors: 40 },
      { country: "DE", visitors: Number.NaN },
    ]);
    expect(rows.map((r) => r.country)).toEqual(["GB"]);
  });

  test("an empty list when Vercel gave nothing", () => {
    expect(topCountries(null)).toEqual([]);
    expect(topCountries([])).toEqual([]);
  });

  test("country names, with anything unknown passed through", () => {
    expect(countryName("gb")).toBe("United Kingdom");
    expect(countryName("Not given")).toBe("Not given");
  });
});

test.describe("guest tool slugs", () => {
  test("hero ids and app slugs both resolve", () => {
    expect(guestSlugFor("slides")).toBe("slideshow");
    expect(guestSlugFor("comp")).toBe("comprehension-generator");
    expect(guestSlugFor("slideshow")).toBe("slideshow");
    expect(guestSlugFor("ws")).toBeNull();
    expect(guestSlugFor(undefined)).toBeNull();
    expect(appToolPath("slideshow")).toBe("/tools/slideshow");
  });
});
