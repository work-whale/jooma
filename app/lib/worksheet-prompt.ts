// The worksheet prompt: a designed sheet (app/lib/sheets) rather than markdown.
//
// The schema fixes the structure; this tells the model how to fill it so the
// page has some life: a hook, sections that climb from recall to challenge, a
// word bank or a stimulus where a question needs one, and an answer for every
// question, which becomes the answer page.

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandName, bandPitch, differentiationPrompt, isBand, type Differentiate } from "@/app/lib/differentiation";
import { kindsForTypes, sheetResponseFormat } from "@/app/lib/sheets/schema";
import { parsePictures, picturesPromptLine } from "@/app/lib/sheets/picture-options";
import { DEFAULT_TEMPLATE_ID, templateById } from "@/app/lib/sheets/worksheet-templates";
import { curriculumPromptBlock, worksheetCurriculumRules, type CurriculumAlign } from "@/app/lib/national-curriculum/prompt";

export interface WorksheetRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  learningObjective: string;
  questionTypes?: string[];
  questionCount?: number;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  /** Set when this request is one band's version of a differentiated set
   *  (app/lib/bands.ts). The whole sheet is then pitched at that band. */
  band?: string;
  outputDetail?: "condensed" | "standard" | "detailed";
  additionalInfo?: string | null;
  /** "Add pictures": where they come from. Null or missing for none. */
  pictures?: unknown;
  /** The worksheet type (app/lib/sheets/worksheet-templates.ts). Missing or
   *  unknown is Classic, the shape every sheet had before types. */
  template?: string;
  /** "Align to curriculum": the statements the teacher ticked, verbatim. */
  curriculumAlign?: CurriculumAlign | null;
}

const SYSTEM =
  "You are an expert UK teacher and curriculum designer who makes beautifully structured, classroom-ready worksheets for every key stage. " +
  "Your worksheets are precisely pitched for the year group, subject-accurate, built around one clear learning objective, and progress from recall to higher-order thinking. " +
  "You return the worksheet as JSON that matches the given schema exactly. Write in UK English. " +
  "Never use LaTeX for maths: write calculations with plain symbols such as × ÷ ² √ and fractions such as 3/4.";

/** How each teacher-facing type should be read, where its name is not enough. */
const TYPE_NOTES: Record<string, string> = {
  "Multiple-Select": "Multiple-Select means a multiple choice question with more than one correct option; say how many to tick in the prompt.",
  "Closed Questions": "Closed Questions are short answers with a yes or no, or one-word, answer (lines 1).",
  "Wh- Questions": "Wh- Questions are short answers whose prompts begin with Who, What, Where, When, Why or How.",
  "Hotspot / Picture Selection": "Picture Selection is a picture question: each option is one emoji with a short label.",
  "Labeling": "Labelling gives clues for the parts to name, with the names in a word bank.",
  "Numerical / Computational": "Numerical questions are calculation questions with space for working.",
  "Sorting / Categorising": "Sorting means a sort question: items pupils sort into labelled groups.",
  "Word Search": "Word Search means a wordsearch question: a list of key words that the page hides in a letter grid.",
  "Crossword": "Crossword means a crossword question: clues and answers that the page lays out as a crossword grid.",
};

/** How to fill each puzzle, offered only when the schema offers the puzzle.
 *  The page builds the grids, so the model writes words and clues alone. */
const PUZZLE_LINES: Partial<Record<string, string>> = {
  sort: "- sort: 2 to 4 categories, each with a short name and a clear rule that does not overlap another's, and 2 to 6 items each (at most 16 in all). Every item belongs to exactly one category; list it only there. The page shuffles the items for pupils. marks: one per item.",
  wordsearch: "- wordsearch: 6 to 12 key words from the topic, each a single word or a short phrase with letters only (no numbers or symbols), at most 15 letters. The page builds the grid, sized for the year group; never write a grid. marks: about one per two words.",
  crossword: "- crossword: 6 to 10 entries. Each answer is a key term from the topic (letters only, at most 15 letters, no repeats); each clue is a short, pupil-friendly definition that never contains its own answer. Prefer answers that share letters, so they can cross. The page builds the grid; never write one. marks: one per entry.",
};

export function worksheetRequest(body: WorksheetRequest):
  | { error: string }
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof sheetResponseFormat> } {
  const {
    curriculum,
    yearGroup,
    subject,
    learningObjective,
    questionTypes = [],
    questionCount = 10,
    differentiate = "no",
    differentiationLevels = [],
    outputDetail = "detailed",
    additionalInfo,
  } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !learningObjective?.trim()) {
    return { error: "Missing required fields" };
  }

  const pictures = parsePictures(body.pictures);
  const count = Math.min(40, Math.max(1, Math.round(questionCount)));
  const kinds = kindsForTypes("worksheet", questionTypes);

  // The worksheet type sets out the sections and marks. Classic is the plan
  // every sheet followed before types, and adds nothing else to the prompt.
  const template = templateById(body.template);
  const classic = template.id === DEFAULT_TEMPLATE_ID;
  const typeLine = classic
    ? ""
    : `\n- Worksheet type: ${template.name}. Follow its plan under HOW TO BUILD IT; where it names a question format that the formats above leave out, use the closest one they allow.`;
  const introLine =
    template.intro ??
    `- intro: one short hook that makes the topic interesting. Usually variant "fact" with label "Did you know?" and a surprising, true fact; or "remember" with the one fact pupils need. One or two sentences, with a fitting emoji.`;

  // "Align to curriculum": the ticked statements, quoted, and how to follow
  // them. Empty when the card was off or nothing was ticked.
  const curriculumBlock = curriculumPromptBlock(body.curriculumAlign, yearGroup, "worksheet", worksheetCurriculumRules(yearGroup));
  const typesLine = questionTypes.length
    ? `Use ONLY these question formats: ${questionTypes.join(", ")}. ${questionTypes.map((t) => TYPE_NOTES[t]).filter(Boolean).join(" ")}`
    : `Use a varied mix of question formats that suits ${subject} for ${yearGroup}: for example multiple choice, matching, fill in the blanks, short answers and one extended answer. Vary the format within each section.`;

  const detailLine =
    outputDetail === "condensed"
      ? "Keep it concise: short prompts, compact answers."
      : outputDetail === "standard"
      ? "Balance brevity and clarity."
      : "Make it thorough, with full model answers.";

  // One band's version: the whole sheet is pitched at it, and its notes say
  // how, in place of the blended advice.
  const band = isBand(body.band) ? body.band : null;
  const pitchLine = band ? `\n- ${bandPitch(band)}` : "";

  // Opt-in: empty when the teacher chose not to differentiate.
  const adaptation = band ? "" : differentiationPrompt(differentiate, differentiationLevels);
  const notesLine = band
    ? `teacherNotes: two notes. One titled "Common misconceptions" with 3 to 5 points, each naming a misconception and how to address it. One titled "How this version is pitched: ${bandName(band)}" with 2 to 4 points on what was adapted for these pupils and how to support them while they work.`
    : adaptation
    ? `teacherNotes: two notes. One titled "Common misconceptions" with 3 to 5 points, each naming a misconception and how to address it. One titled "Differentiation": ${adaptation}`
    : `teacherNotes: one note titled "Common misconceptions" with 3 to 5 points, each naming a misconception and how to address it.`;

  const prompt = `Create a worksheet.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Learning objective: ${learningObjective}
- Questions: about ${count} in total.
- ${detailLine}
- ${typesLine}${typeLine}${pitchLine}${additionalInfo ?`\n- Teacher's additional instructions (follow them): ${additionalInfo}` : ""}${curriculumBlock ? `\n\n${curriculumBlock}` : ""}

HOW TO BUILD IT
- title: specific and engaging, about the topic. Never just "Worksheet".
- objective: the learning objective restated for pupils, starting "I am learning to".
${introLine}
${template.structure.join("\n")}
- Give the page some life with blocks: a wordbank when pupils need vocabulary, a short text block or a table when a question needs a stimulus (a scenario, some data), and at most one "tip" or "remember" callout in a section where a reminder helps.
- Every question must be answerable on paper, with no picture other than an emoji.
- Fill every answer field correctly: they become the answer page. For an extended answer, put a model answer or mark scheme in answer and 2 to 4 success criteria in criteria.
- lines: the writing lines a pupil needs (short answers 1 to 3, extended answers 5 to 10).
- mcq: 3 or 4 options with plausible distractors; answers holds the index of the correct option, or several indices for a multiple-select question.
- matching: left and right lists of equal length, right in a shuffled order; pairs[i] is the index in right that matches left[i].
- order: items in a shuffled order; order lists the item indices in the correct order.
- fillblanks: write ___ for each gap; answers in gap order; a wordBank of the answers plus one or two distractors when it suits the year group.
- picture: 3 or 4 options, each one emoji with a short label, only when an emoji clearly shows the thing.
- label: each item is a clue for a part to name, with its answer; put the answers in the wordBank.
- table: only for data a question needs.${kinds.map((k) => PUZZLE_LINES[k]).filter(Boolean).map((l) => `\n${l}`).join("")}
- ${notesLine}
- Do not use emoji anywhere except the emoji fields. Number nothing yourself: questions are numbered on the page.
${picturesPromptLine(pictures, learningObjective)}

MATHS NOTATION: write every calculation in plain text with × ÷ + − = < > ≤ ≥ ² ³ √, and fractions as 3/4. Never use LaTeX or TeX: no backslashes, no \\( \\) or \\[ \\] delimiters, no dollar-sign maths, no \\frac, \\times or ^. Only include a division sign or a fraction where the question genuinely involves one.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: prompt },
    ],
    response_format: sheetResponseFormat({ tool: "worksheet", kinds, passage: false, images: !!pictures }),
  };
}
