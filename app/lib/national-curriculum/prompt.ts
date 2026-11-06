// "Align to curriculum": what the card sends, and the prompt block built from
// it. Shared by the slides wizard and the Worksheet form, so a deck and a sheet
// aligned to the same statements are told the same thing.

import { STAGE_LABEL, curriculumNameFor, isCurriculumYear, stageForYear, type NcStatement } from "./index";

/** The most statements a prompt quotes. More than this and the model spreads
 *  itself thin; the card does not stop a teacher ticking more. */
export const MAX_PROMPT_STATEMENTS = 12;

export interface CurriculumAlign {
  countryId: string;
  countryName: string;
  curriculumName: string;
  grade: string;
  year: string;
  stage?: string;
  subject: string;
  strand: string;
  statements: { id: string; text: string }[];
}

/**
 * What the card sends with a generation: the ticked statements, verbatim, with
 * where they come from. Undefined when the card is off, the year is not one
 * alignment covers, or nothing is ticked.
 */
export function curriculumAlignParam(
  on: boolean,
  year: string,
  selection: { subject: string; strand: string },
  statements: NcStatement[],
): CurriculumAlign | undefined {
  if (!on || !isCurriculumYear(year) || statements.length === 0) return undefined;
  const stage = stageForYear(year);
  const strands = new Set(statements.map((s) => s.strand));
  return {
    countryId: "england",
    countryName: "England",
    curriculumName: curriculumNameFor(year),
    grade: year,
    year,
    stage: stage ? STAGE_LABEL[stage] : undefined,
    subject: selection.subject || statements[0].subject,
    strand: selection.strand || (strands.size === 1 ? statements[0].strand : ""),
    statements: statements.map((s) => ({ id: s.id, text: s.text })),
  };
}

type PromptCurriculum = {
  curriculumName?: string;
  stage?: string;
  subject?: string;
  strand?: string;
  statements?: { text?: unknown }[];
} | null | undefined;

/** The statement texts a prompt quotes: trimmed, blanks dropped, capped. */
export function curriculumStatementTexts(cur: PromptCurriculum): string[] {
  return (Array.isArray(cur?.statements) ? cur.statements : [])
    .map((s) => (typeof s?.text === "string" ? s.text.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_PROMPT_STATEMENTS);
}

/** How a slide deck must follow the statements. */
export function deckCurriculumRules(year: string): string[] {
  return [
    `- Pitch every slide at the level these statements set for ${year || "this year group"}. Do NOT introduce content, vocabulary or methods from later years.`,
    "- Every content slide must clearly serve at least one of these statements. Do not drift into other strands or subjects.",
    "- If a learning objectives slide is included, base each objective on these statements, reworded for pupils.",
    "- The activity slides must check understanding of these statements.",
  ];
}

/** How a worksheet must follow the statements. */
export function worksheetCurriculumRules(year: string): string[] {
  return [
    `- Pitch every question at the level these statements set for ${year || "this year group"}. Do NOT introduce content, vocabulary or methods from later years.`,
    "- Every question must clearly practise at least one of these statements. Do not drift into other strands or subjects.",
    "- Base the objective on these statements, reworded for pupils.",
    "- The answers and teacher notes must use the same terms the statements use.",
  ];
}

/**
 * The CURRICULUM ALIGNMENT block, or "" when there are no statements. `noun`
 * names what is being made ("deck", "worksheet"); `rules` are the lines on how
 * that kind of output must follow the statements.
 */
export function curriculumPromptBlock(cur: PromptCurriculum, year: string, noun: string, rules: string[]): string {
  const statements = curriculumStatementTexts(cur);
  if (!cur || statements.length === 0) return "";
  return `═══════════════════════════════════════════════════
CURRICULUM ALIGNMENT (the teacher chose these; follow them exactly)
═══════════════════════════════════════════════════
${[cur.curriculumName, cur.stage, year, cur.subject, cur.strand].filter(Boolean).join(" · ")}
This ${noun} must teach towards these statements, quoted from the curriculum:
${statements.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
${rules.join("\n")}`;
}
