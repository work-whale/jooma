// The range control's vocabulary, shared by the page and the switcher.
//
// Kept out of StatsView so the server page can validate `?range=` without
// pulling a client component onto the server, and so the mapping from a label
// to a month count lives in exactly one place.

export const RANGES = ["30d", "90d", "12mo", "all"] as const;

export type Range = (typeof RANGES)[number];

// Labelled in months rather than days, because months are the unit this page
// actually counts in: every RPC buckets by month, so "30 days" promised a
// precision the data never had.
export const RANGE_LABEL: Record<Range, string> = {
  "30d": "1 month",
  "90d": "3 months",
  "12mo": "12 months",
  all: "All time",
};

/** How the KPI tiles name the window under a figure covering the whole range,
 *  e.g. "in the last 3 months". "All time" has no such phrasing, so it keeps
 *  its own wording. */
export const RANGE_PHRASE: Record<Range, string> = {
  "30d": "in the last month",
  "90d": "in the last 3 months",
  "12mo": "in the last 12 months",
  all: "all time",
};

/** Months of history each range asks the RPCs for. "all" is capped at the
 *  function's own ceiling rather than being unbounded: ten years of empty
 *  months is not more honest than one, it is just a wider chart. */
const MONTHS: Record<Range, number> = {
  "30d": 1,
  "90d": 3,
  "12mo": 12,
  all: 120,
};

export const DEFAULT_RANGE: Range = "12mo";

/** Narrow an untrusted `?range=` to a Range. A hand edited URL falls back to
 *  the default rather than reaching the RPC with an arbitrary value. */
export function parseRange(value: string | undefined): Range {
  return (RANGES as readonly string[]).includes(value ?? "")
    ? (value as Range)
    : DEFAULT_RANGE;
}

export function monthsFor(range: Range): number {
  return MONTHS[range];
}
