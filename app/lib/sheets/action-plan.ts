// An action plan's tables, shared by the plans for school leaders: the Pupil
// Premium strategy statement, the EYFS action plan, and later the school
// improvement plan and appraisal targets.
//
// A plan has columns the model fills (the action, the evidence) and columns
// the school fills by hand (the budgeted cost, the RAG status, the evidence of
// impact). The second kind is always blank, added here in code, and never
// taken from the model, so a plan never arrives with an invented cost or a
// made-up rating. A row the model left empty is dropped, so a part-streamed
// row does not show as a gap.
//
// Pure, free of React, normalize.ts and schema.ts.

type Raw = Record<string, unknown>;

export interface ActionColumn {
  /** The model's field for this column. Ignored for a blank column. */
  key: string;
  label: string;
  /** Filled in by the school: always blank, whatever the model sent. */
  blank?: boolean;
}

/** A cell's text: a string, or a list of strings joined with semicolons. */
export function cellText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return v.map(cellText).filter(Boolean).join("; ");
  return "";
}

/** The rows the model has filled, as table rows in the columns' order. */
export function actionRows(rows: unknown, columns: ActionColumn[]): string[][] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Raw => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => columns.map((c) => (c.blank ? "" : cellText(r[c.key]))))
    .filter((cells) => cells.some((cell, i) => !columns[i].blank && cell !== ""));
}

/** A draft table block of the model's rows, or null when none has arrived. */
export function actionTable(rows: unknown, columns: ActionColumn[]): Raw | null {
  const body = actionRows(rows, columns);
  return body.length ? { type: "table", headers: columns.map((c) => c.label), rows: body } : null;
}

/** A table of facts, one [label, value] to a row. A detail the form did not
 *  give is left blank, a cell drawn tall enough to write in. */
export function detailsTable(pairs: [string, string][]): Raw {
  return { type: "table", headers: [], rows: pairs.map(([label, value]) => [label, value.trim()]) };
}
