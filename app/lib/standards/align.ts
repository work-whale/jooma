/*
 * What "Align to curriculum" sends with a generation, for any curriculum.
 *
 * England (and the islands) go through curriculumAlignParam unchanged, so an
 * English deck or worksheet sends exactly what it always has. A curriculum
 * with published standards sends the ticked statements with their codes
 * ("3.NBT.A.1: Use place value ..."), named by framework. Any other sends
 * nothing: the card shows a note instead of statements.
 *
 * Shared by client and server: no server-only imports.
 */

import { getCurriculum } from "@/app/lib/curricula";
import type { NcStatement } from "@/app/lib/national-curriculum";
import { curriculumAlignParam, type CurriculumAlign } from "@/app/lib/national-curriculum/prompt";

import { FRAMEWORK_NAME, alignmentMode, frameworkOf, shortCode, usableFrameworks, type FrameworkId } from "./index";

/** A statement as the card holds it: England's have no code. */
export interface AlignStatement {
  id: string;
  subject: string;
  strand: string;
  text: string;
  code?: string;
}

export function alignParamFor(
  curriculum: unknown,
  on: boolean,
  year: string,
  selection: { subject: string; strand: string },
  statements: AlignStatement[],
): CurriculumAlign | undefined {
  const mode = alignmentMode(curriculum);
  if (mode === "england") return curriculumAlignParam(on, year, selection, statements as NcStatement[]);
  const c = getCurriculum(curriculum);
  // Only statements from a framework this curriculum may use (NGSS is off).
  const usable = new Set(usableFrameworks(c));
  statements = statements.filter((s) => {
    const f = frameworkOf(s.id);
    return f !== null && usable.has(f);
  });
  if (mode === "none" || !c || !on || statements.length === 0 || !c.years.some((y) => y.label === year)) return undefined;

  const frameworks = [...new Set(statements.map((s) => frameworkOf(s.id)).filter((f): f is FrameworkId => f !== null))];
  const strands = new Set(statements.map((s) => s.strand));
  const place = c.place ?? c.name;
  return {
    countryId: c.country.toLowerCase(),
    countryName: place,
    curriculumName: frameworks.map((f) => FRAMEWORK_NAME[f]).join(" and ") + (c.alignment?.adapted ? ` (as adapted in ${place})` : ""),
    grade: year,
    year,
    subject: selection.subject || statements[0].subject,
    strand: selection.strand || (strands.size === 1 ? statements[0].strand : ""),
    statements: statements.map((s) => ({ id: s.id, text: s.code ? `${shortCode(s.code)}: ${s.text}` : s.text })),
  };
}
