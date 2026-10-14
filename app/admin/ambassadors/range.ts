// The ambassador page's range control. Kept out of the client view so the
// server page can validate `?range=` without importing a client component.

export const AMB_RANGES = ["month", "3m", "all"] as const;
export type AmbRange = (typeof AMB_RANGES)[number];

export const AMB_RANGE_LABEL: Record<AmbRange, string> = {
  month: "This month",
  "3m": "Last 3 months",
  all: "All time",
};

export function parseAmbRange(value: string | undefined): AmbRange {
  return (AMB_RANGES as readonly string[]).includes(value ?? "") ? (value as AmbRange) : "month";
}
