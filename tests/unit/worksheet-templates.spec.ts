import { test, expect } from "@playwright/test";
import { QUESTION_TYPES } from "@/app/components/fields/QuestionTypesField";
import {
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_GROUPS,
  WORKSHEET_TEMPLATES,
  isTemplateId,
  templateById,
} from "@/app/lib/sheets/worksheet-templates";
import { kindsForTypes } from "@/app/lib/sheets/schema";
import { worksheetRequest, type WorksheetRequest } from "@/app/lib/worksheet-prompt";
import { sheetContext } from "@/app/lib/sheets/context";
import {
  MAX_PROMPT_STATEMENTS,
  curriculumAlignParam,
  curriculumPromptBlock,
  deckCurriculumRules,
} from "@/app/lib/national-curriculum/prompt";
import { ASSISTANT_TOOLS } from "@/app/lib/assistant-tools";

/*
 * Worksheet types and "Align to curriculum" on the Worksheet form: the
 * catalogue, the prompt each builds, and the curriculum block slides and
 * worksheets now share.
 */

const base: WorksheetRequest = {
  curriculum: "2014 National Curriculum",
  yearGroup: "Year 4",
  subject: "Maths",
  learningObjective: "Multiply a two-digit number by a one-digit number",
};

const userPrompt = (req: WorksheetRequest): string => {
  const built = worksheetRequest(req);
  if ("error" in built) throw new Error(built.error);
  return built.messages[1].content;
};

const CLASSIC_SECTIONS =
  `- sections: 3 or 4 that build from recall, to understanding, to applying, to a challenge. Give each a short pupil-friendly title (for example "Warm up", "Show what you know", "Put it to work", "Challenge"), one fitting emoji, and a one-line instruction.`;
const CLASSIC_MARKS =
  "- Spread the questions so later sections are harder and worth more marks: 1 mark for recall, 2 for understanding, 3 to 4 for application, up to 6 for the challenge.";
const CLASSIC_INTRO =
  `- intro: one short hook that makes the topic interesting. Usually variant "fact" with label "Did you know?" and a surprising, true fact; or "remember" with the one fact pupils need. One or two sentences, with a fitting emoji.`;

test.describe("the catalogue", () => {
  test("ids are unique and Classic is the default", () => {
    const ids = WORKSHEET_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_TEMPLATE_ID);
    expect(templateById(DEFAULT_TEMPLATE_ID).questionTypes).toEqual([]);
  });

  test("every preset type is a real chip, so picking a type never ticks a chip that is not there", () => {
    for (const t of WORKSHEET_TEMPLATES) {
      for (const label of t.questionTypes) {
        expect(QUESTION_TYPES as readonly string[], `${t.id}: ${label}`).toContain(label);
      }
    }
  });

  test("every preset maps to its own kinds, not the fall back to every kind", () => {
    const all = kindsForTypes("worksheet", []);
    for (const t of WORKSHEET_TEMPLATES.filter((x) => x.questionTypes.length)) {
      const kinds = kindsForTypes("worksheet", t.questionTypes);
      expect(kinds.length, t.id).toBeGreaterThan(0);
      expect(kinds.length, t.id).toBeLessThan(all.length);
    }
  });

  test("every preset count is one the count control can show", () => {
    for (const t of WORKSHEET_TEMPLATES) {
      expect(t.questionCount, t.id).toBeGreaterThanOrEqual(1);
      expect(t.questionCount, t.id).toBeLessThanOrEqual(30);
    }
  });

  test("every type is in a group the filter offers, and every group has a type", () => {
    const groups = TEMPLATE_GROUPS.map((g) => g.id);
    for (const t of WORKSHEET_TEMPLATES) expect(groups, t.id).toContain(t.group);
    for (const g of groups) expect(WORKSHEET_TEMPLATES.some((t) => t.group === g), g).toBe(true);
  });

  test("every structure line is a prompt bullet, and none uses a dash the brand rules ban", () => {
    for (const t of WORKSHEET_TEMPLATES) {
      expect(t.structure.length, t.id).toBeGreaterThan(0);
      for (const line of [...t.structure, t.intro ?? "- x", t.name, t.blurb, t.minutes]) {
        expect(line, t.id).not.toMatch(/[–—]/);
      }
      for (const line of t.structure) expect(line.startsWith("- "), `${t.id}: ${line}`).toBe(true);
    }
  });

  test("an unknown, empty or missing id is Classic", () => {
    for (const id of ["nope", "", undefined, null, 4, { id: "exam-paper" }]) {
      expect(templateById(id).id).toBe(DEFAULT_TEMPLATE_ID);
      expect(isTemplateId(id)).toBe(false);
    }
    expect(isTemplateId("exam-paper")).toBe(true);
  });

  test("Jo can name every type, and fills it before the count it presets", () => {
    const tool = ASSISTANT_TOOLS.find((t) => t.slug === "worksheet-generator")!;
    const props = (tool.fields as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.template.enum).toEqual(WORKSHEET_TEMPLATES.map((t) => t.id));
    const keys = Object.keys(props);
    expect(keys.indexOf("template")).toBeLessThan(keys.indexOf("questionCount"));
  });
});

test.describe("the prompt", () => {
  test("Classic, or no type at all, keeps the plan every sheet had before", () => {
    for (const template of [undefined, "classic", "not-a-type"]) {
      const p = userPrompt({ ...base, template });
      expect(p).toContain(`${CLASSIC_INTRO}\n${CLASSIC_SECTIONS}\n${CLASSIC_MARKS}\n`);
      expect(p).not.toContain("Worksheet type:");
    }
  });

  test("another type replaces the section plan and names itself", () => {
    for (const t of WORKSHEET_TEMPLATES.filter((x) => x.id !== DEFAULT_TEMPLATE_ID)) {
      const p = userPrompt({ ...base, template: t.id });
      expect(p, t.id).toContain(`- Worksheet type: ${t.name}.`);
      expect(p, t.id).toContain(t.structure.join("\n"));
      expect(p, t.id).not.toContain(CLASSIC_SECTIONS);
      expect(p, t.id).not.toContain(CLASSIC_MARKS);
    }
  });

  test("the exam paper swaps the hook for instructions to candidates", () => {
    const p = userPrompt({ ...base, template: "exam-paper" });
    expect(p).toContain(templateById("exam-paper").intro!);
    expect(p).not.toContain(CLASSIC_INTRO);
  });

  test("the teacher's own question types still win over a type's presets", () => {
    const p = userPrompt({ ...base, template: "fluency", questionTypes: ["Multiple Choice"] });
    expect(p).toContain("Use ONLY these question formats: Multiple Choice.");
    const built = worksheetRequest({ ...base, template: "fluency", questionTypes: ["Multiple Choice"] });
    if ("error" in built) throw new Error(built.error);
    expect(JSON.stringify(built.response_format)).toContain('"mcq"');
    expect(JSON.stringify(built.response_format)).not.toContain('"calc"');
  });

  test("a band's version keeps its type", () => {
    const p = userPrompt({ ...base, template: "homework", band: "GDS" });
    expect(p).toContain("- Worksheet type: Homework sheet.");
    expect(p).toContain(templateById("homework").structure[0]);
  });
});

test.describe("starting design", () => {
  test("the exam paper starts without the objective line; Classic keeps it", () => {
    expect(sheetContext("worksheet", { yearGroup: "Year 9", template: "exam-paper" }).design.objective).toBe(false);
    expect(sheetContext("worksheet", { yearGroup: "Year 9", template: "classic" }).design.objective).toBe(true);
    expect(sheetContext("worksheet", { yearGroup: "Year 9" }).design.objective).toBe(true);
  });

  test("a comprehension ignores a stray worksheet type", () => {
    expect(sheetContext("comprehension", { yearGroup: "Year 9", template: "exam-paper" }).design.objective).toBe(true);
  });
});

test.describe("align to curriculum", () => {
  const statements = Array.from({ length: 15 }, (_, i) => ({
    id: `s${i}`,
    subject: "Maths",
    strand: "Multiplication and division",
    years: [4],
    text: `  Statement number ${i}  `,
    page: 1,
  }));

  test("sends nothing when the card is off, the year is not covered, or nothing is ticked", () => {
    const sel = { subject: "Maths", strand: "" };
    expect(curriculumAlignParam(false, "Year 4", sel, statements)).toBeUndefined();
    expect(curriculumAlignParam(true, "Year 8", sel, statements)).toBeUndefined();
    expect(curriculumAlignParam(true, "", sel, statements)).toBeUndefined();
    expect(curriculumAlignParam(true, "Year 4", sel, [])).toBeUndefined();
  });

  test("sends the ticked statements with where they come from", () => {
    const p = curriculumAlignParam(true, "Year 4", { subject: "", strand: "" }, statements.slice(0, 2))!;
    expect(p).toMatchObject({
      curriculumName: "National Curriculum in England",
      year: "Year 4",
      stage: "Key Stage 2",
      subject: "Maths",
      // One strand between them, so it is named even though none was picked.
      strand: "Multiplication and division",
    });
    expect(p.statements).toEqual([{ id: "s0", text: statements[0].text }, { id: "s1", text: statements[1].text }]);
  });

  test("the worksheet prompt quotes the statements, trimmed and capped, and only when there are some", () => {
    const align = curriculumAlignParam(true, "Year 4", { subject: "Maths", strand: "" }, statements)!;
    const p = userPrompt({ ...base, curriculumAlign: align });
    expect(p).toContain("CURRICULUM ALIGNMENT");
    expect(p).toContain("This worksheet must teach towards these statements");
    expect(p).toContain("  1. Statement number 0\n");
    expect(p).toContain(`  ${MAX_PROMPT_STATEMENTS}. Statement number ${MAX_PROMPT_STATEMENTS - 1}\n`);
    expect(p).not.toContain(`Statement number ${MAX_PROMPT_STATEMENTS}`);
    expect(p).toContain("set for Year 4");
    // Before HOW TO BUILD IT, so the plan below can lean on it.
    expect(p.indexOf("CURRICULUM ALIGNMENT")).toBeLessThan(p.indexOf("HOW TO BUILD IT"));

    for (const off of [undefined, null, { ...align, statements: [] }, { ...align, statements: [{ id: "x", text: "   " }] }]) {
      expect(userPrompt({ ...base, curriculumAlign: off })).not.toContain("CURRICULUM ALIGNMENT");
    }
  });

  test("the deck's block reads exactly as it did before it was shared", () => {
    const cur = {
      curriculumName: "National Curriculum in England",
      stage: "Key Stage 2",
      subject: "Maths",
      strand: "Fractions",
      statements: [{ text: " compare fractions " }, { text: "" }, { text: "add fractions" }],
    };
    expect(curriculumPromptBlock(cur, "Year 4", "deck", deckCurriculumRules("Year 4"))).toBe(
      `═══════════════════════════════════════════════════
CURRICULUM ALIGNMENT (the teacher chose these; follow them exactly)
═══════════════════════════════════════════════════
National Curriculum in England · Key Stage 2 · Year 4 · Maths · Fractions
This deck must teach towards these statements, quoted from the curriculum:
  1. compare fractions
  2. add fractions
- Pitch every slide at the level these statements set for Year 4. Do NOT introduce content, vocabulary or methods from later years.
- Every content slide must clearly serve at least one of these statements. Do not drift into other strands or subjects.
- If a learning objectives slide is included, base each objective on these statements, reworded for pupils.
- The activity slides must check understanding of these statements.`,
    );
  });
});
