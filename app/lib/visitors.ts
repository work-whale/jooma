/**
 * The all time visitor figure shown on the landing page, from Vercel's monthly
 * buckets.
 *
 * Null rather than zero when nothing usable came back: the page hides the
 * count in that case, and "0 teachers using Jooma" would be worse than no
 * claim at all.
 */
export function sumVisitors(
  rows: { visitors?: number | null; count?: number | null }[] | null | undefined,
): number | null {
  if (!rows || rows.length === 0) return null;
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const n = typeof row.visitors === "number" ? row.visitors : row.count;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      total += n;
      seen = true;
    }
  }
  return seen && total > 0 ? Math.round(total) : null;
}

/** "43,271", the way the prototype prints it. */
export function formatVisitors(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Built in, so a two letter code becomes a country without a lookup table to
 *  maintain. Constructed once rather than per row. */
const COUNTRY_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en-GB"], { type: "region" })
    : null;

/**
 * "GB" as "United Kingdom".
 *
 * Anything that is not a resolvable region code passes through unchanged, which
 * covers the two values this data actually carries besides real codes: the
 * literal "Not given" from a teacher who never set one, and a stray code Intl
 * does not know. `of()` throws on a malformed input rather than returning
 * undefined, hence the try.
 */
export function countryName(code: string): string {
  if (!COUNTRY_NAMES || code.length !== 2) return code;
  try {
    return COUNTRY_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export interface TopCountry {
  country: string;
  name: string;
  visitors: number;
  /** Width of the bar, as a percentage of the largest row. */
  share: number;
}

/**
 * The strip under the landing count: the biggest countries first, rows Vercel
 * could not place or that rounded to nothing dropped, so the strip never shows
 * "0" beside a country or a blank name.
 */
export function topCountries(
  rows: { country?: string | null; visitors?: number | null }[] | null | undefined,
  limit = 5,
): TopCountry[] {
  const clean = (rows ?? [])
    .filter(
      (r): r is { country: string; visitors: number } =>
        typeof r.country === "string" &&
        r.country.trim() !== "" &&
        typeof r.visitors === "number" &&
        Number.isFinite(r.visitors) &&
        r.visitors > 0,
    )
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, Math.max(0, limit));

  const top = clean[0]?.visitors ?? 0;
  return clean.map((r) => ({
    country: r.country,
    name: countryName(r.country),
    visitors: Math.round(r.visitors),
    share: top > 0 ? (r.visitors / top) * 100 : 0,
  }));
}
