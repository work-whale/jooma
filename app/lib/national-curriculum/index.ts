// The curriculum statements the slides wizard aligns a deck to.
//
// Data, built from the official documents by
// scripts/build-national-curriculum.mjs and checked word for word against them
// by tests/unit/national-curriculum.spec.ts:
//   - data/primary.json      Years 1 to 6, the national curriculum in England
//                            (key stages 1 and 2 framework document, 2013).
//   - data/early-years.json  Reception, the 17 statutory Early Learning Goals
//                            (EYFS framework, September 2026); and Nursery,
//                            DfE Development Matters "3 and 4-year-olds" (2023).
//
// Labels and data are kept apart on purpose. Each statement records the years
// the document applies it to. Which stage a year is SHOWN under is Jooma's
// grouping (stageForYear), which puts Year 3 in Key Stage 1 although the
// national curriculum itself puts it in lower key stage 2. A Year 3 deck still
// aligns to what the curriculum sets for Year 3; only the label differs.

export type Stage = "pre-key-stage" | "key-stage-1" | "key-stage-2";

export const STAGE_LABEL: Record<Stage, string> = {
  "pre-key-stage": "Pre Key Stage",
  "key-stage-1": "Key Stage 1",
  "key-stage-2": "Key Stage 2",
};

/** The years alignment covers, in the order the picker lists them. */
export const CURRICULUM_YEARS = [
  "Nursery", "Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
] as const;
export type CurriculumYear = (typeof CURRICULUM_YEARS)[number];

export interface NcStatement {
  id: string;
  /** A national curriculum subject, or an EYFS area of learning. */
  subject: string;
  /** A programme of study heading, an Early Learning Goal, or "Core" for a
   *  subject the document does not divide. */
  strand: string;
  /** 1 to 6 for the primary curriculum; "Nursery" or "Reception" otherwise. */
  years: (number | "Nursery" | "Reception")[];
  text: string;
  /** Page of the source PDF, for reviewing a statement. Null for Nursery,
   *  whose source is the HTML edition of Development Matters. */
  page: number | null;
}

export function isCurriculumYear(year: string | undefined | null): year is CurriculumYear {
  return !!year && (CURRICULUM_YEARS as readonly string[]).includes(year);
}

/** The stage a year is shown under, or null for a year alignment does not
 *  cover (Years 7 to 13, adult learners, "Any year"). */
export function stageForYear(year: string | undefined | null): Stage | null {
  if (year === "Nursery" || year === "Reception") return "pre-key-stage";
  const n = yearNumber(year);
  if (n === null) return null;
  if (n >= 1 && n <= 3) return "key-stage-1";
  if (n >= 4 && n <= 6) return "key-stage-2";
  return null;
}

function yearNumber(year: string | undefined | null): number | null {
  const m = year?.match(/^Year (\d{1,2})$/);
  return m ? Number(m[1]) : null;
}

/** What the statements for a year come from, in the words a teacher knows. */
export function curriculumNameFor(year: CurriculumYear): string {
  if (year === "Nursery") return "EYFS: Development Matters";
  if (year === "Reception") return "EYFS: Early Learning Goals";
  return "National Curriculum in England";
}

/** Display order of subjects: the order the documents present them. */
const SUBJECT_ORDER = [
  "English", "Maths", "Science", "Art and design", "Computing", "Design and technology",
  "Geography", "History", "Languages", "Music", "Physical education",
  "Communication and Language", "Personal, Social and Emotional Development",
  "Physical Development", "Literacy", "Mathematics", "Understanding the World",
  "Expressive Arts and Design",
];

type DataFile = { statements: NcStatement[] };

function appliesTo(s: NcStatement, year: CurriculumYear): boolean {
  if (year === "Nursery" || year === "Reception") return s.years.includes(year);
  const n = yearNumber(year);
  return n !== null && s.years.includes(n);
}

/** Every statement for a year, from data already in hand. Pure, so the
 *  server routes and the tests can use it without the dynamic import. */
export function statementsForYear(data: DataFile, year: CurriculumYear): NcStatement[] {
  return data.statements.filter((s) => appliesTo(s, year));
}

/**
 * Load a year's statements. The data files are fetched on demand, so the
 * wizard does not carry ~200 KB of curriculum until a teacher opens the card.
 */
export async function loadStatements(year: CurriculumYear): Promise<NcStatement[]> {
  const data: DataFile =
    year === "Nursery" || year === "Reception"
      ? ((await import("./data/early-years.json")).default as unknown as DataFile)
      : ((await import("./data/primary.json")).default as unknown as DataFile);
  return statementsForYear(data, year);
}

export function subjectsIn(statements: NcStatement[]): string[] {
  const set = new Set(statements.map((s) => s.subject));
  return [...set].sort((a, b) => rank(a) - rank(b));
}

function rank(subject: string): number {
  const i = SUBJECT_ORDER.indexOf(subject);
  return i === -1 ? SUBJECT_ORDER.length : i;
}

/** A subject's strands, in document order. */
export function strandsIn(statements: NcStatement[], subject: string): string[] {
  const out: string[] = [];
  for (const s of statements) {
    if (s.subject === subject && !out.includes(s.strand)) out.push(s.strand);
  }
  return out;
}

export function statementsIn(statements: NcStatement[], subject: string, strand?: string | null): NcStatement[] {
  return statements.filter((s) => s.subject === subject && (!strand || s.strand === strand));
}

export function statementsByIds(statements: NcStatement[], ids: string[]): NcStatement[] {
  const want = new Set(ids);
  return statements.filter((s) => want.has(s.id));
}
