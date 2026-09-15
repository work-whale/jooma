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
