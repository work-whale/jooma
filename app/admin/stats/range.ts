// The range control's vocabulary, shared by the page and the switcher.
//
// Kept out of StatsView so the server page can validate `?range=` without
// pulling a client component onto the server, and so the mapping from a label
// to a month count lives in exactly one place.

export const RANGES = ["30d", "90d", "12mo", "all"] as const;

export type Range = (typeof RANGES)[number];

export const RANGE_LABEL: Record<Range, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "12mo": "12 months",
  all: "All time",
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
