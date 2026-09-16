// CSV serialisation for the monthly detail table.
//
// Pure and DOM-free so it can be unit tested without a browser, and so the file
// the admin downloads is built from exactly the rows on screen rather than a
// second query that might disagree with them.

export interface MonthRow {
  month_start: string;
  label: string;
  signups: number;
  free: number;
  pro: number;
  max: number;
  paid: number;
  /** Null when Vercel analytics is unavailable, which is not the same as zero
   *  and must not be exported as one. */
  visitors: number | null;
}

const HEADERS = [
  "Month",
  "Visitors",
  "Signups",
  "Free",
  "Pro",
  "Max",
  "Paid total",
  "Conversion",
];

/** Quote a cell if it could otherwise break the row, doubling any quote inside
 *  it. This is the whole of CSV escaping and the usual source of broken files. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function conversionOf(row: { signups: number; paid: number }): string {
  if (row.signups <= 0) return "0.0%";
  return `${((row.paid / row.signups) * 100).toFixed(1)}%`;
}

export interface Delta {
  label: string;
  dir: "up" | "down" | "new" | "flat";
}

/**
 * Month-on-month movement, for the chip under a KPI figure.
 *
 * Three cases the obvious `(cur - prev) / prev` does not survive:
 *
 *   - No previous month at all (`undefined`), or a previous month of zero.
 *     There is no percentage to state, so it reads "new" rather than the
 *     Infinity that division would give.
 *   - A previous month that is null, meaning never recorded. Visitors do this
 *     for any month before analytics began, and treating it as zero would
 *     invent a gain out of a gap in the data.
 *   - No change, which is shown flat rather than as a green "0%".
 */
export function deltaOf(current: number | null, previous: number | null | undefined): Delta | null {
  if (current === null || previous === null || previous === undefined) return null;
  if (previous === 0) return current > 0 ? { label: "new", dir: "new" } : null;

  const change = ((current - previous) / previous) * 100;
  // Rounded before the comparison, so a change that displays as 0% is not
  // labelled as a rise by a difference no one can see.
  const rounded = Math.round(change);
  if (rounded === 0) return { label: "no change", dir: "flat" };

  return {
    label: `${Math.abs(rounded)}%`,
    dir: rounded > 0 ? "up" : "down",
  };
}

/**
 * The monthly table as CSV, with a totals row.
 *
 * Prefixed with a UTF-8 BOM: without it Excel reads the file as the local
 * codepage and mangles any non-ASCII, which is the difference between a file
 * that opens correctly and one the finance team quietly fixes by hand.
 */
export function toCsv(rows: MonthRow[]): string {
  const lines = [HEADERS.join(",")];

  for (const r of rows) {
    lines.push(
      [
        cell(r.label),
        cell(r.visitors),
        cell(r.signups),
        cell(r.free),
        cell(r.pro),
        cell(r.max),
        cell(r.paid),
        cell(conversionOf(r)),
      ].join(","),
    );
  }

  const totals = rows.reduce(
    (a, r) => ({
      signups: a.signups + r.signups,
      free: a.free + r.free,
      pro: a.pro + r.pro,
      max: a.max + r.max,
      paid: a.paid + r.paid,
      // Summed only over months that actually reported. Treating a missing
      // month as zero would understate the total and look like a real dip.
      visitors: r.visitors === null ? a.visitors : (a.visitors ?? 0) + r.visitors,
    }),
    { signups: 0, free: 0, pro: 0, max: 0, paid: 0, visitors: null as number | null },
  );

  lines.push(
    [
      cell("Total"),
      cell(totals.visitors),
      cell(totals.signups),
      cell(totals.free),
      cell(totals.pro),
      cell(totals.max),
      cell(totals.paid),
      cell(conversionOf(totals)),
    ].join(","),
  );

  return `﻿${lines.join("\r\n")}`;
}
