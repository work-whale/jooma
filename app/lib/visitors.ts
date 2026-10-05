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
