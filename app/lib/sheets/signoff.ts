// The parts of a staff document people complete by hand, built in code and
// never by the model: a sign-off table (role, name, signature, date) and a
// response box for the person the document is about (an observed teacher's
// response, an ECT's comments).
//
// Both are ordinary tables. A blank row is drawn tall enough to write in, on
// the page, in print and in Word (sheet-css.ts `tr[data-blank]`, docx.ts), so
// neither needs a block kind of its own.
//
// Pure, free of React, normalize.ts and schema.ts.

type Raw = Record<string, unknown>;

/** A row per [role, name?]: the name printed when the form gave one,
 *  signature and date always blank. Null with no roles. */
export function signOffTable(people: ([string] | [string, string | undefined])[]): Raw | null {
  if (!people.length) return null;
  return {
    type: "table",
    headers: ["Role", "Name", "Signature", "Date"],
    rows: people.map(([role, name]) => [role, name?.trim() ?? "", "", ""]),
  };
}

/** A blank box to write in: one column headed `label`, `rows` blank rows. */
export function responseBox(label: string, rows = 5): Raw {
  return { type: "table", headers: [label], rows: Array.from({ length: Math.max(1, rows) }, () => [""]) };
}
