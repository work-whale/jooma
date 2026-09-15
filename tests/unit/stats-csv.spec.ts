import { test, expect } from "@playwright/test";
import { conversionOf, toCsv, type MonthRow } from "@/app/admin/stats/export";

// The CSV the Stats page hands an admin. Pure, so it is tested here rather than
// by downloading a file in a browser.

function row(over: Partial<MonthRow> = {}): MonthRow {
  return {
    month_start: "2026-08-01",
    label: "Aug 2026",
    signups: 10,
    free: 6,
    pro: 3,
    max: 1,
    paid: 4,
    visitors: 100,
    ...over,
  };
}

test.describe("conversionOf", () => {
  test("is a percentage of signups", () => {
    expect(conversionOf({ signups: 10, paid: 4 })).toBe("40.0%");
  });

  test("does not divide by zero on an empty month", () => {
    expect(conversionOf({ signups: 0, paid: 0 })).toBe("0.0%");
  });
});

test.describe("toCsv", () => {
  test("starts with a BOM so Excel reads UTF-8", () => {
    // Without this Excel applies the local codepage and mangles anything
    // non-ASCII, which is the usual reason a CSV "looks broken" to finance.
    expect(toCsv([row()]).startsWith("﻿")).toBe(true);
  });

  test("has a header and one line per month, plus totals", () => {
    const lines = toCsv([row(), row({ label: "Sep 2026" })]).split("\r\n");
    expect(lines[0]).toContain("Month");
    expect(lines).toHaveLength(4); // header + 2 rows + totals
    expect(lines[3]).toContain("Total");
  });

  test("totals sum each column", () => {
    const lines = toCsv([
      row({ signups: 10, paid: 4, visitors: 100 }),
      row({ signups: 5, paid: 1, visitors: 50 }),
    ]).split("\r\n");
    const totals = lines[lines.length - 1].split(",");
    expect(totals[1]).toBe("150"); // visitors
    expect(totals[2]).toBe("15"); // signups
    expect(totals[6]).toBe("5"); // paid
  });

  test("a month with no visitor data is blank, not zero", () => {
    // Vercel analytics began partway through the product's life. A month it
    // never recorded is unknown, and exporting 0 would assert nobody visited.
    const lines = toCsv([row({ visitors: null })]).split("\r\n");
    expect(lines[1].split(",")[1]).toBe("");
  });

  test("totals ignore unrecorded months rather than counting them as zero", () => {
    const lines = toCsv([
      row({ visitors: null }),
      row({ visitors: 40 }),
    ]).split("\r\n");
    expect(lines[lines.length - 1].split(",")[1]).toBe("40");
  });

  test("totals stay blank when nothing was ever recorded", () => {
    const lines = toCsv([row({ visitors: null })]).split("\r\n");
    expect(lines[lines.length - 1].split(",")[1]).toBe("");
  });

  test("quotes a cell containing a comma", () => {
    const lines = toCsv([row({ label: "Aug, 2026" })]).split("\r\n");
    expect(lines[1]).toContain('"Aug, 2026"');
  });

  test("doubles a quote inside a cell", () => {
    const lines = toCsv([row({ label: 'Aug "peak" 2026' })]).split("\r\n");
    expect(lines[1]).toContain('"Aug ""peak"" 2026"');
  });

  test("an empty range still produces a header and a totals row", () => {
    const lines = toCsv([]).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Total");
  });
});
