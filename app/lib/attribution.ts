// ── Where a teacher came from ────────────────────────────────────────────────
//
// A UTM is not detected, it is DECLARED. Whoever builds a link types the label
// into it: jooma.ai?utm_source=facebook&utm_medium=cpc&utm_campaign=autumn. The
// browser sends that URL to us like any other, the proxy reads the label, and
// this module decides what is worth keeping.
//
// Referrer is the other half, and it needs no cooperation: browsers volunteer
// the previous page on a click through. That is what catches organic search,
// where there is no link for anyone to tag.
//
// NO "server-only" AND NO IMPORTS. The proxy needs it, the activation route
// needs it, the Stats view needs labelForSource, and the unit tests need all of
// it without a browser or a database. Everything here is pure.

/** The cookie the proxy writes and the activation route reads. */
export const ATTRIBUTION_COOKIE = "jooma_attr";

/** Thirty days, in seconds. Long enough that a teacher who sees an ad on Monday
 *  and signs up on Thursday is still credited to it. */
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * When attribution started being recorded.
 *
 * Hardcoded rather than derived from min(attributed_at): a derived date would
 * shift if one early row were deleted, and would read as an ongoing measurement
 * rather than the fixed historical fact it is. Every account created before this
 * carries no source and never will.
 */
export const ATTRIBUTION_SINCE = "2026-09-16";

/** A first touch, as stored in the cookie. Short keys because this rides in a
 *  cookie on every request; the meanings are one line away. */
export interface Attribution {
  /** utm_source */
  s: string | null;
  /** utm_medium */
  m: string | null;
  /** utm_campaign */
  c: string | null;
  /** referrer hostname, never a full URL */
  r: string | null;
  /** ISO timestamp of the first touch */
  t: string;
}

/** Longest value we will store. Ad platforms occasionally emit very long
 *  campaign ids, and a cookie has a 4KB ceiling to stay inside. */
const MAX_LEN = 128;

/**
 * Fold a UTM value to its canonical form.
 *
 * "Facebook", "facebook" and "  FACEBOOK  " are the same campaign typed three
 * ways, and without this they are three rows in the Stats table that no one
 * reconciles. Lowercasing is the whole of the "normalise silently" decision.
 *
 * Empty string becomes null deliberately: `?utm_source=` is a real thing ad
 * builders emit when a field is left blank, and an empty string would render as
 * a nameless row on the panel.
 */
export function normaliseUtm(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, MAX_LEN);
  return cleaned === "" ? null : cleaned;
}

/**
 * The hostname of a referring page, or null when it is not worth recording.
 *
 * HOSTNAME ONLY, never the full URL. A referrer URL carries the query string of
 * the page that linked here, which for a search engine is the search terms and
 * for a badly built partner site can be a session token. We need "google.com"
 * to group by; we do not need, and must not store, the rest.
 *
 * Our own host returns null. Without that rule every visitor who clicks a second
 * page before signing up records jooma.ai as their referrer, and the panel fills
 * with our own name.
 */
export function referrerHost(
  referer: string | null | undefined,
  selfHost: string,
): string | null {
  if (!referer) return null;

  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    // A malformed Referer header is not an error worth surfacing. Browsers and
    // proxies send odd things; the answer is simply that we learned nothing.
    return null;
  }

  host = host.replace(/^www\./, "");
  const self = selfHost.toLowerCase().replace(/^www\./, "");

  if (host === self) return null;
  if (host === "localhost" && self === "localhost") return null;
  // A subdomain of ourselves is still ourselves.
  if (self !== "" && host.endsWith(`.${self}`)) return null;

  return host.slice(0, MAX_LEN) || null;
}

/**
 * Read a first touch out of an incoming request.
 *
 * Returns null when there is nothing worth recording, which is the signal not to
 * set a cookie at all. That is different from an object whose fields are all
 * null, and the proxy's skip logic depends on the distinction.
 */
export function parseAttribution(
  url: URL,
  referer: string | null,
  now: Date = new Date(),
): Attribution | null {
  const s = normaliseUtm(url.searchParams.get("utm_source"));
  const m = normaliseUtm(url.searchParams.get("utm_medium"));
  const c = normaliseUtm(url.searchParams.get("utm_campaign"));
  const r = referrerHost(referer, url.hostname);

  if (!s && !m && !c && !r) return null;

  return { s, m, c, r, t: now.toISOString() };
}

/**
 * For the cookie. Plain JSON, NOT percent-encoded here.
 *
 * Next's `cookies.set` percent-encodes the value on the way out and
 * `cookies.get` decodes it on the way back, so encoding here too would store a
 * double-encoded string (%257B rather than %7B). It survives the round trip
 * either way, which is precisely why it is worth being deliberate: the wasted
 * layer is invisible until someone reads the raw header and doubts themselves.
 *
 * decodeAttribution still tolerates a percent-encoded value, so a cookie written
 * by an older deploy keeps working.
 */
export function encodeAttribution(attr: Attribution): string {
  return JSON.stringify(attr);
}

/**
 * Read the cookie back.
 *
 * Never throws. A user can put anything in their own cookie, and a malformed one
 * must mean "no attribution" rather than a 500 on the signup path.
 */
export function decodeAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    // Try the value as given first. A cookie read back through Next arrives
    // already decoded; one written by an older deploy, or read straight from a
    // raw header, may still be percent-encoded. Accept both rather than pick.
    let text = raw;
    if (!text.trimStart().startsWith("{")) {
      text = decodeURIComponent(text);
    }

    const parsed = JSON.parse(text) as Partial<Attribution>;
    if (!parsed || typeof parsed !== "object") return null;

    // Re-normalise on the way out. The value has been in a place the user can
    // edit, so it is untrusted input however it got there.
    const s = normaliseUtm(parsed.s);
    const m = normaliseUtm(parsed.m);
    const c = normaliseUtm(parsed.c);
    const r = normaliseUtm(parsed.r);
    if (!s && !m && !c && !r) return null;

    const t = typeof parsed.t === "string" && !Number.isNaN(Date.parse(parsed.t))
      ? parsed.t
      : new Date().toISOString();

    return { s, m, c, r, t };
  } catch {
    return null;
  }
}

// ── Display ──────────────────────────────────────────────────────────────────
//
// The Stats RPC returns machine keys ('utm:facebook', 'ref:google.com'). Turning
// those into human labels is a presentation concern and lives here, so changing
// "Google search" to "Google organic" is an edit rather than a migration the
// user has to push.

/** Hosts that mean the same place under several names. Matched before the
 *  generic rules below, so gemini.google.com does not land in Google search. */
const REFERRER_LABEL: Record<string, string> = {
  "google.com": "Google search",
  "bing.com": "Bing search",
  "duckduckgo.com": "DuckDuckGo",
  "facebook.com": "Facebook",
  // Facebook's link shims. Very common in real traffic, and without these they
  // appear as three separate Facebook rows.
  "m.facebook.com": "Facebook",
  "l.facebook.com": "Facebook",
  "lm.facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "l.instagram.com": "Instagram",
  "t.co": "X",
  "x.com": "X",
  "twitter.com": "X",
  "linkedin.com": "LinkedIn",
  "lnkd.in": "LinkedIn",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "tiktok.com": "TikTok",
  "reddit.com": "Reddit",
  "out.reddit.com": "Reddit",
  "chatgpt.com": "Assistant referral",
  "chat.openai.com": "Assistant referral",
  "perplexity.ai": "Assistant referral",
  "claude.ai": "Assistant referral",
  "gemini.google.com": "Assistant referral",
};

/** Sources worth naming properly when they arrive as a UTM tag. */
const UTM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  meta: "Meta",
  google: "Google",
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  newsletter: "Newsletter",
  email: "Email",
};

/** Title case for a label we have no mapping for, so an unknown source reads as
 *  a name rather than a slug. */
function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Human label for a bucket key from admin_signup_stats_by_source.
 *
 * Keys are 'invited' | 'ambassador' | 'utm:<source>' | 'ref:<host>' | 'direct'
 * | 'unattributed'.
 */
export function labelForSource(source: string): string {
  if (source === "invited") return "Invited by someone";
  if (source === "ambassador") return "Ambassador code";
  // Not bare "Direct": we know they arrived with nothing recorded, not that they
  // typed the address in. A bookmark, a no-referrer browser and an ad blocker
  // all land here too.
  if (source === "direct") return "Direct or unknown";
  // Not "Not attributed", which implies we tried and failed. We were not
  // recording at all when these teachers signed up.
  if (source === "unattributed") return "Not recorded";

  if (source.startsWith("utm:")) {
    const key = source.slice(4);
    return UTM_LABEL[key] ?? titleCase(key);
  }

  if (source.startsWith("ref:")) {
    const host = source.slice(4);
    return REFERRER_LABEL[host] ?? host;
  }

  return source;
}

/** Coarse grouping, so the panel can be read at a glance when it has fifteen
 *  rows. Mirrors the `channel` column the RPC returns. */
export const CHANNEL_LABEL: Record<string, string> = {
  invite: "Invite",
  ambassador: "Ambassador",
  campaign: "Campaign",
  referral: "Referral",
  direct: "Direct",
  unknown: "Not recorded",
};

/**
 * The precedence ladder, mirrored from SQL.
 *
 * NOT CALLED IN PRODUCTION. admin_signup_stats_by_source owns this rule; this is
 * a twin that exists so the ladder is written down twice and the unit test fails
 * if someone changes one copy without the other. The rule is subtle enough to be
 * worth that, and SQL is a place nothing else can assert against.
 *
 * Do not delete this as dead code. Do not call it either.
 */
export function bucketFor(row: {
  invited: boolean;
  ambassador: boolean;
  utmSource: string | null;
  referrerHost: string | null;
  attributedAt: string | null;
}): string {
  // The campaign tag FIRST, because this page is read by the marketing team to
  // decide which ads to keep running. If an ambassador promotes their code
  // inside a paid campaign, an ambassador-first ladder would file those signups
  // under the code and the campaign would look like it produced nothing.
  //
  // The cost is that this panel can no longer report total ambassador signups,
  // since a code redeemed after an ad click counts as the ad. That question has
  // a better home at /admin/ambassadors, with payouts attached.
  const utm = normaliseUtm(row.utmSource);
  if (utm) return `utm:${utm}`;

  // Still present, so every teacher lands in exactly one row and the column
  // sums to the signup total. These now mean "arrived this way and ONLY this
  // way", rather than "used a code at all".
  if (row.invited) return "invited";
  if (row.ambassador) return "ambassador";

  const ref = normaliseUtm(row.referrerHost);
  if (ref) return `ref:${ref}`;
  // We were recording, and there was genuinely nothing to record.
  if (row.attributedAt) return "direct";
  // We were not recording yet.
  return "unattributed";
}
