/*
 * Published standards for teachers outside England: the statements the
 * "Align to curriculum" card lists for a US state or an Australian state.
 *
 * Data, built from the official documents by scripts/build-standards.mjs and
 * checked word for word against them by tests/unit/standards.spec.ts:
 *   - data/ccss-math.json  Common Core mathematics, K to 8 and high school
 *   - data/ccss-ela.json   Common Core English language arts, K to 12
 *   - data/ngss.json       NGSS performance expectations, K to 12
 *   - data/ac9.json        Australian Curriculum v9.0 English, Mathematics and
 *                          Science content descriptions, Foundation to Year 10
 *
 * Statements carry the AGES they apply to, not a grade name, so one file
 * serves "Grade 3" in Texas and "Year 3" in Queensland alike: a year's age
 * comes from the curriculum registry.
 *
 * Which curricula use which data is the registry's `alignment` field. England
 * (and the islands that teach its curriculum) keep app/lib/national-curriculum.
 *
 * Shared by client and server: no server-only imports. The data is loaded on
 * demand, never in the initial bundle.
 */

import { getCurriculum, type Curriculum, type FrameworkId, type YearOption } from "@/app/lib/curricula";

export type { FrameworkId } from "@/app/lib/curricula";
export { FRAMEWORK_CREDIT } from "./credits";

export interface Statement {
  id: string;
  /** The official code: CCSS.MATH.CONTENT.3.NBT.A.1, 3-PS2-1, AC9M3N01. */
  code: string;
  subject: string;
  strand: string;
  /** Ages at the start of the years the statement applies to. */
  ages: number[];
  text: string;
}

export interface FrameworkData {
  source: { title: string; file: string; url: string; credit: string };
  statements: Statement[];
}

/** What a teacher sees the framework called. */
export const FRAMEWORK_NAME: Record<FrameworkId, string> = {
  "ccss-math": "Common Core State Standards for Mathematics",
  "ccss-ela": "Common Core State Standards for English Language Arts",
  ngss: "Next Generation Science Standards (NGSS)",
  ac9: "Australian Curriculum v9.0",
};

/** The ages each framework has statements for. */
export const FRAMEWORK_AGES: Record<FrameworkId, readonly number[]> = {
  "ccss-math": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  "ccss-ela": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  ngss: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  ac9: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

/** Load one framework's statements. Each file is its own chunk, fetched
 *  only when the card is opened for a curriculum that uses it. */
export async function loadFramework(id: FrameworkId): Promise<FrameworkData> {
  switch (id) {
    case "ccss-math":
      return (await import("./data/ccss-math.json")).default as unknown as FrameworkData;
    case "ccss-ela":
      return (await import("./data/ccss-ela.json")).default as unknown as FrameworkData;
    case "ngss":
      return (await import("./data/ngss.json")).default as unknown as FrameworkData;
    case "ac9":
      return (await import("./data/ac9.json")).default as unknown as FrameworkData;
  }
}

/** How the card aligns for a curriculum: England's own statements, published
 *  standards, or not at all (yet). */
export type AlignmentMode = "england" | "standards" | "none";

export function alignmentMode(curriculum: unknown): AlignmentMode {
  const c = getCurriculum(curriculum);
  if (!c || c.region === "uk" || c.region === "british-isles") return "england";
  return c.alignment?.frameworks.length ? "standards" : "none";
}

/** The years of a curriculum the card can list statements for. */
export function alignmentYears(c: Curriculum): YearOption[] {
  const ages = new Set((c.alignment?.frameworks ?? []).flatMap((f) => FRAMEWORK_AGES[f]));
  return c.years.filter((y) => ages.has(y.age));
}

/** A year's statements, from frameworks already loaded. Pure. */
export function statementsForAge(data: FrameworkData[], age: number): Statement[] {
  return data.flatMap((d) => d.statements.filter((s) => s.ages.includes(age)));
}

/** Every statement a curriculum's year can align to. */
export async function loadStandardsFor(curriculum: unknown, year: string): Promise<{ statements: Statement[]; frameworks: FrameworkId[] }> {
  const c = getCurriculum(curriculum);
  const age = c?.years.find((y) => y.label === year)?.age;
  const frameworks = (c?.alignment?.frameworks ?? []).filter((f) => age !== undefined && FRAMEWORK_AGES[f].includes(age));
  if (!c || age === undefined || frameworks.length === 0) return { statements: [], frameworks: [] };
  const data = await Promise.all(frameworks.map(loadFramework));
  return { statements: statementsForAge(data, age), frameworks };
}

/** The framework a statement came from, by its id. */
export function frameworkOf(statementId: string): FrameworkId | null {
  if (statementId.startsWith("ccss-math-")) return "ccss-math";
  if (statementId.startsWith("ccss-ela-")) return "ccss-ela";
  if (statementId.startsWith("ngss-")) return "ngss";
  if (statementId.startsWith("ac9-")) return "ac9";
  return null;
}

/** The code as teachers write it: 3.NBT.A.1 and RL.3.1, not the full URN. */
export function shortCode(code: string): string {
  return code.replace(/^CCSS\.(?:MATH\.CONTENT|ELA-LITERACY)\./, "");
}
