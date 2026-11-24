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
 *   - data/cfe-*.json      Scotland: Curriculum for Excellence experiences and
 *                          outcomes, one file per level (Early, First, Second,
 *                          Third and fourth), built by scripts/build-uk-curricula.mjs
 *   - data/nic-*.json      Northern Ireland: the statutory requirements of the
 *                          Education (Curriculum Minimum Content) Order 2007 for
 *                          the Foundation Stage and Key Stages 1 to 4
 *
 * Statements carry the AGES they apply to, not a grade name, so one file
 * serves "Grade 3" in Texas and "Year 3" in Queensland alike: a year's age
 * comes from the curriculum registry (Northern Ireland's own year list included).
 *
 * Which curricula use which data is the registry's `alignment` field. England
 * (and the islands that teach its curriculum) keep app/lib/national-curriculum.
 * Scotland, Wales and Northern Ireland use their own data when they have it
 * and an honest "not available yet" note when they do not: never England's.
 *
 * Shared by client and server: no server-only imports. The data is loaded on
 * demand, never in the initial bundle.
 */

import { getCurriculum, type Curriculum, type FrameworkId, type YearOption } from "@/app/lib/curricula";

export type { FrameworkId } from "@/app/lib/curricula";
import { FRAMEWORK_PERMITTED } from "./permissions";

export { FRAMEWORK_CREDIT } from "./credits";
export { FRAMEWORK_PERMITTED } from "./permissions";

export interface Statement {
  id: string;
  /** The official code: CCSS.MATH.CONTENT.3.NBT.A.1, 3-PS2-1, AC9M3N01. Empty
   *  where the source has none (Northern Ireland, Wales). */
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
  "cfe-early": "Curriculum for Excellence experiences and outcomes",
  "cfe-first": "Curriculum for Excellence experiences and outcomes",
  "cfe-second": "Curriculum for Excellence experiences and outcomes",
  "cfe-third-fourth": "Curriculum for Excellence experiences and outcomes",
  "nic-fs": "Northern Ireland Curriculum statutory requirements",
  "nic-ks1": "Northern Ireland Curriculum statutory requirements",
  "nic-ks2": "Northern Ireland Curriculum statutory requirements",
  "nic-ks3": "Northern Ireland Curriculum statutory requirements",
  "nic-ks4": "Northern Ireland Curriculum statutory requirements",
};

/** The ages each framework has statements for. */
export const FRAMEWORK_AGES: Record<FrameworkId, readonly number[]> = {
  "ccss-math": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  "ccss-ela": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  ngss: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  ac9: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  // Ages are the registry ages of the England-named years the card shows.
  // Early = to P1, First = P2 to P4, Second = P5 to P7, Third and Fourth =
  // S1 to S3 (S1 starts at about 12). S4 is the senior phase: no Es and Os.
  "cfe-early": [3, 4, 5],
  "cfe-first": [6, 7, 8],
  "cfe-second": [9, 10, 11],
  "cfe-third-fourth": [12, 13, 14],
  // Northern Ireland has its own year list (Year N starts at age N + 3). Foundation
  // Stage = Years 1 and 2, Key Stage 1 = Years 3 and 4, Key Stage 2 = Years 5 to 7,
  // Key Stage 3 = Years 8 to 10, Key Stage 4 = Years 11 and 12 (owner, 2026-11-24).
  // Nursery, Year 13 and Year 14 have no statutory statements.
  "nic-fs": [4, 5],
  "nic-ks1": [6, 7],
  "nic-ks2": [8, 9, 10],
  "nic-ks3": [11, 12, 13],
  "nic-ks4": [14, 15],
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
    case "cfe-early":
      return (await import("./data/cfe-early.json")).default as unknown as FrameworkData;
    case "cfe-first":
      return (await import("./data/cfe-first.json")).default as unknown as FrameworkData;
    case "cfe-second":
      return (await import("./data/cfe-second.json")).default as unknown as FrameworkData;
    case "cfe-third-fourth":
      return (await import("./data/cfe-third-fourth.json")).default as unknown as FrameworkData;
    case "nic-fs":
      return (await import("./data/nic-fs.json")).default as unknown as FrameworkData;
    case "nic-ks1":
      return (await import("./data/nic-ks1.json")).default as unknown as FrameworkData;
    case "nic-ks2":
      return (await import("./data/nic-ks2.json")).default as unknown as FrameworkData;
    case "nic-ks3":
      return (await import("./data/nic-ks3.json")).default as unknown as FrameworkData;
    case "nic-ks4":
      return (await import("./data/nic-ks4.json")).default as unknown as FrameworkData;
  }
}

/** How the card aligns for a curriculum: England's own statements, published
 *  standards, or not at all (yet). */
export type AlignmentMode = "england" | "standards" | "none";

/** The frameworks a curriculum uses that Jooma may show (see permissions.ts:
 *  NGSS is off until written permission). */
export function usableFrameworks(c: Curriculum | null | undefined): FrameworkId[] {
  return (c?.alignment?.frameworks ?? []).filter((f) => FRAMEWORK_PERMITTED[f]);
}

/** The curricula that teach England's own: England and its EYFS (the islands
 *  are matched by region below). Scotland, Wales and Northern Ireland are the
 *  other UK curricula and are NOT here. */
const ENGLAND_ALIGNED = new Set(["england", "england-eyfs"]);

export function alignmentMode(curriculum: unknown): AlignmentMode {
  const c = getCurriculum(curriculum);
  if (!c || ENGLAND_ALIGNED.has(c.id) || c.region === "british-isles") return "england";
  return usableFrameworks(c).length ? "standards" : "none";
}

/** The years of a curriculum the card can list statements for. */
export function alignmentYears(c: Curriculum): YearOption[] {
  const ages = new Set(usableFrameworks(c).flatMap((f) => FRAMEWORK_AGES[f]));
  return c.years.filter((y) => ages.has(y.age));
}

/** The frameworks that cover a curriculum's year, by the year's registry age.
 *  Empty for a year the curriculum does not list. Pure. */
export function frameworksForYear(c: Curriculum | null | undefined, year: string): FrameworkId[] {
  const age = c?.years.find((y) => y.label === year)?.age;
  return age === undefined ? [] : usableFrameworks(c).filter((f) => FRAMEWORK_AGES[f].includes(age));
}

/** A year's statements, from frameworks already loaded. Pure. */
export function statementsForAge(data: FrameworkData[], age: number): Statement[] {
  return data.flatMap((d) => d.statements.filter((s) => s.ages.includes(age)));
}

/** Every statement a curriculum's year can align to. */
export async function loadStandardsFor(curriculum: unknown, year: string): Promise<{ statements: Statement[]; frameworks: FrameworkId[] }> {
  const c = getCurriculum(curriculum);
  const age = c?.years.find((y) => y.label === year)?.age;
  const frameworks = frameworksForYear(c, year);
  if (!c || age === undefined || frameworks.length === 0) return { statements: [], frameworks: [] };
  const data = await Promise.all(frameworks.map(loadFramework));
  return { statements: statementsForAge(data, age), frameworks };
}

/** Every framework id, longest first, so one id that begins with another's
 *  name is never mistaken for it. */
export const FRAMEWORK_IDS = (Object.keys(FRAMEWORK_NAME) as FrameworkId[]).sort((a, b) => b.length - a.length);

/** The framework a statement came from, by its id: every id is the
 *  framework's own id, a hyphen, then what makes the statement unique. */
export function frameworkOf(statementId: string): FrameworkId | null {
  return FRAMEWORK_IDS.find((f) => statementId.startsWith(`${f}-`)) ?? null;
}

/** The stage a framework covers, where its nation names stages (Scotland's
 *  levels, Northern Ireland's key stages). The US and Australian frameworks
 *  have none. */
export const FRAMEWORK_STAGE: Partial<Record<FrameworkId, string>> = {
  "cfe-early": "Early level",
  "cfe-first": "First level",
  "cfe-second": "Second level",
  "cfe-third-fourth": "Third and fourth level",
  "nic-fs": "Foundation Stage",
  "nic-ks1": "Key Stage 1",
  "nic-ks2": "Key Stage 2",
  "nic-ks3": "Key Stage 3",
  "nic-ks4": "Key Stage 4",
};

/** The stage a curriculum's year falls in ("First level", "Key Stage 1"), for
 *  the card's Year options. Null when the curriculum names none for that year. */
export function alignmentStageLabel(c: Curriculum, yearLabel: string): string | null {
  const age = c.years.find((y) => y.label === yearLabel)?.age;
  if (age === undefined) return null;
  const stages = frameworksForYear(c, yearLabel)
    .map((f) => FRAMEWORK_STAGE[f])
    .filter((s): s is string => !!s);
  return stages.length ? [...new Set(stages)].join(" and ") : null;
}

/** The code as teachers write it: 3.NBT.A.1 and RL.3.1, not the full URN. */
export function shortCode(code: string): string {
  return code.replace(/^CCSS\.(?:MATH\.CONTENT|ELA-LITERACY)\./, "");
}
