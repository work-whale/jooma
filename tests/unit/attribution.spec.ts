import { test, expect } from "@playwright/test";
import {
  bucketFor,
  decodeAttribution,
  encodeAttribution,
  labelForSource,
  normaliseUtm,
  parseAttribution,
  referrerHost,
} from "@/app/lib/attribution";

/*
 * Where a teacher came from.
 *
 * Most of the value of this feature is in rules that are one line each and wrong
 * in ways nothing would notice: a referrer that records our own hostname, a
 * campaign tag that splits into three rows because someone typed a capital, a
 * search query smuggled into the database on the end of a referrer URL. None of
 * those throw. They just quietly produce a panel that reads plausibly and is
 * wrong.
 */

test.describe("normaliseUtm", () => {
  test("folds case, so one campaign is one row", () => {
    // The whole of the "normalise silently" decision. Without it an agency that
    // types Facebook on Monday and facebook on Tuesday gets two rows.
    expect(normaliseUtm("Facebook")).toBe("facebook");
    expect(normaliseUtm("FACEBOOK")).toBe("facebook");
    expect(normaliseUtm("  facebook  ")).toBe("facebook");
  });

  test("an empty tag is nothing, not a nameless row", () => {
    // ?utm_source= is what ad builders emit when the field is left blank.
    expect(normaliseUtm("")).toBeNull();
    expect(normaliseUtm("   ")).toBeNull();
    expect(normaliseUtm(null)).toBeNull();
    expect(normaliseUtm(undefined)).toBeNull();
  });

  test("collapses internal whitespace", () => {
    expect(normaliseUtm("spring   2026")).toBe("spring 2026");
  });

  test("caps an over-long value rather than rejecting it", () => {
    const long = "a".repeat(300);
    expect(normaliseUtm(long)).toHaveLength(128);
  });

  test("is not fooled by a non-string", () => {
    expect(normaliseUtm(42 as unknown as string)).toBeNull();
  });
});

test.describe("referrerHost", () => {
  test("keeps the host and discards everything else", () => {
    // The query string is the PRIVACY property, not a tidiness one: for a search
    // engine it is the search terms, and for a partner site it can be a session
    // token. We group by host and have no use for the rest.
    expect(referrerHost("https://www.google.com/search?q=lesson+plans", "jooma.ai"))
      .toBe("google.com");
  });

  test("strips www", () => {
    expect(referrerHost("https://www.bing.com/", "jooma.ai")).toBe("bing.com");
  });

  test("our own host is not a referrer", () => {
    // Without this, every visitor who clicks a second page before signing up
    // records jooma.ai as their source and the panel fills with our own name.
    expect(referrerHost("https://jooma.ai/pricing", "jooma.ai")).toBeNull();
    expect(referrerHost("https://www.jooma.ai/pricing", "jooma.ai")).toBeNull();
  });

  test("a subdomain of ours is still us", () => {
    expect(referrerHost("https://app.jooma.ai/tools", "jooma.ai")).toBeNull();
  });

  test("localhost does not attribute itself during a test run", () => {
    expect(referrerHost("http://localhost:3000/", "localhost")).toBeNull();
  });

  test("a malformed header is not an error, just nothing learned", () => {
    expect(referrerHost("not a url", "jooma.ai")).toBeNull();
    expect(referrerHost("", "jooma.ai")).toBeNull();
    expect(referrerHost(null, "jooma.ai")).toBeNull();
  });
});

test.describe("parseAttribution", () => {
  const at = new Date("2026-09-16T10:00:00.000Z");

  test("reads a tagged link", () => {
    const url = new URL(
      "https://jooma.ai/?utm_source=Facebook&utm_medium=CPC&utm_campaign=Autumn",
    );
    const attr = parseAttribution(url, null, at);
    expect(attr).toEqual({
      s: "facebook",
      m: "cpc",
      c: "autumn",
      r: null,
      t: "2026-09-16T10:00:00.000Z",
    });
  });

  test("an untagged link from elsewhere still records the referrer", () => {
    // This is the half that needs no cooperation from the agency. If they link
    // bare jooma.ai from an ad, this is what still catches it.
    const url = new URL("https://jooma.ai/");
    const attr = parseAttribution(url, "https://www.google.com/search?q=x", at);
    expect(attr?.r).toBe("google.com");
    expect(attr?.s).toBeNull();
  });

  test("returns null when there is nothing to record", () => {
    // Null means "do not set a cookie at all", which is different from an object
    // of nulls. The proxy's skip logic depends on the distinction.
    const url = new URL("https://jooma.ai/");
    expect(parseAttribution(url, null, at)).toBeNull();
  });

  test("an internal navigation is nothing to record", () => {
    const url = new URL("https://jooma.ai/signup");
    expect(parseAttribution(url, "https://jooma.ai/", at)).toBeNull();
  });
});

test.describe("the cookie round trip", () => {
  test("survives encoding", () => {
    const attr = { s: "facebook", m: "cpc", c: "autumn 2026", r: null, t: "2026-09-16T10:00:00.000Z" };
    expect(decodeAttribution(encodeAttribution(attr))).toEqual(attr);
  });

  test("a campaign containing a semicolon does not truncate the cookie", () => {
    const attr = { s: "email", m: null, c: "a;b", r: null, t: "2026-09-16T10:00:00.000Z" };
    expect(decodeAttribution(encodeAttribution(attr))?.c).toBe("a;b");
  });

  test("garbage decodes to nothing rather than throwing", () => {
    // A user can put anything in their own cookie. This runs on the signup path,
    // so a throw here would be a 500 on a working signup.
    expect(decodeAttribution("garbage")).toBeNull();
    expect(decodeAttribution("%7Bbroken")).toBeNull();
    expect(decodeAttribution("")).toBeNull();
    expect(decodeAttribution(null)).toBeNull();
  });

  test("a hand-edited cookie is re-normalised on the way out", () => {
    const forged = encodeURIComponent(JSON.stringify({ s: "  FACEBOOK  ", t: "x" }));
    expect(decodeAttribution(forged)?.s).toBe("facebook");
  });

  test("a cookie with no usable fields is nothing", () => {
    expect(decodeAttribution(encodeURIComponent(JSON.stringify({ t: "x" })))).toBeNull();
  });
});

test.describe("labelForSource", () => {
  test("names the buckets honestly", () => {
    // "Not recorded" rather than "Not attributed": we were not recording, we did
    // not try and fail. "Direct or unknown" rather than "Direct" for the same
    // reason, since a bookmark and an ad blocker both land there.
    expect(labelForSource("unattributed")).toBe("Not recorded");
    expect(labelForSource("direct")).toBe("Direct or unknown");
    expect(labelForSource("invited")).toBe("Invited by someone");
    expect(labelForSource("ambassador")).toBe("Ambassador code");
  });

  test("folds the Facebook link shims into one row", () => {
    // l.facebook.com and lm.facebook.com are very common in real traffic and
    // would otherwise be three separate Facebook rows.
    expect(labelForSource("ref:facebook.com")).toBe("Facebook");
    expect(labelForSource("ref:l.facebook.com")).toBe("Facebook");
    expect(labelForSource("ref:lm.facebook.com")).toBe("Facebook");
  });

  test("an assistant referral is not Google search", () => {
    // The ordering trap: gemini.google.com must be matched exactly, before any
    // generic google rule, or a referral from an assistant is counted as search.
    expect(labelForSource("ref:gemini.google.com")).toBe("Assistant referral");
    expect(labelForSource("ref:google.com")).toBe("Google search");
  });

  test("an unmapped host passes through as itself", () => {
    expect(labelForSource("ref:some-blog.example")).toBe("some-blog.example");
  });

  test("an unmapped campaign tag reads as a name", () => {
    expect(labelForSource("utm:facebook")).toBe("Facebook");
    expect(labelForSource("utm:spring_launch")).toBe("Spring Launch");
  });
});

test.describe("bucketFor, the ladder mirrored from SQL", () => {
  const base = {
    invited: false,
    ambassador: false,
    utmSource: null as string | null,
    referrerHost: null as string | null,
    attributedAt: null as string | null,
  };

  test("a campaign tag beats everything", () => {
    // The marketing team reads this panel to decide which ads to keep running.
    // If an ambassador promotes a code inside a paid campaign, burying those
    // signups under the code would have the agency kill an ad that was working.
    expect(
      bucketFor({ ...base, invited: true, ambassador: true, utmSource: "facebook" }),
    ).toBe("utm:facebook");
    expect(bucketFor({ ...base, ambassador: true, utmSource: "facebook" })).toBe(
      "utm:facebook",
    );
  });

  test("an invite beats an ambassador code when neither came from a campaign", () => {
    expect(bucketFor({ ...base, invited: true, ambassador: true })).toBe("invited");
  });

  test("ambassador and invite rows survive, so the column still sums", () => {
    // They now mean "arrived this way and ONLY this way". Every teacher still
    // lands in exactly one bucket, so the panel reconciles with the signup total.
    expect(bucketFor({ ...base, ambassador: true })).toBe("ambassador");
    expect(bucketFor({ ...base, invited: true })).toBe("invited");
  });

  test("a campaign beats a referrer", () => {
    expect(
      bucketFor({ ...base, utmSource: "facebook", referrerHost: "google.com" }),
    ).toBe("utm:facebook");
  });

  test("a referrer is used when nothing was tagged", () => {
    expect(bucketFor({ ...base, referrerHost: "google.com" })).toBe("ref:google.com");
  });

  test("recorded but empty is direct, not unattributed", () => {
    // The distinction attributed_at exists for. These two look identical without
    // it, and one is a real finding while the other is just history.
    expect(bucketFor({ ...base, attributedAt: "2026-09-16T10:00:00Z" })).toBe("direct");
    expect(bucketFor(base)).toBe("unattributed");
  });

  test("normalises on the way into a bucket key", () => {
    expect(bucketFor({ ...base, utmSource: "  FaceBook " })).toBe("utm:facebook");
  });
});
