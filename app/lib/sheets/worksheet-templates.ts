// Worksheet types: the shape a worksheet takes, picked on the Worksheet form.
//
// Every worksheet used to come out the same way, three or four sections that
// climb from a warm up to a challenge, because that plan was written into the
// prompt. A type swaps that plan for another (an exam paper, a quick starter, a
// fluency drill) and suggests the question formats and count that suit it. The
// teacher can still change those; the type keeps shaping the page either way.
//
// Built only on the question kinds a sheet already draws (app/lib/sheets), so
// export, Ask Jo and differentiated versions work for every type unchanged.
//
// Kept free of React and of the "use client" field modules, so the API routes
// can import it. tests/unit/worksheet-templates.spec.ts checks every preset
// label against QUESTION_TYPES.

import type { SheetDesign } from "./types";

export type WorksheetTemplateGroup = "check" | "assess" | "practise" | "home" | "puzzle";

export const TEMPLATE_GROUPS: { id: WorksheetTemplateGroup; label: string }[] = [
  { id: "check", label: "Quick checks" },
  { id: "assess", label: "Assess" },
  { id: "practise", label: "Practise" },
  { id: "home", label: "Home and revision" },
  { id: "puzzle", label: "Puzzles and sorting" },
];

export interface WorksheetTemplate {
  id: string;
  name: string;
  /** One line on the card. */
  blurb: string;
  /** Rough classroom time, shown on the card. */
  minutes: string;
  group: WorksheetTemplateGroup;
  /** Key into the icon map in WorksheetTypeField. */
  icon: string;
  /** Question type labels (QuestionTypesField) ticked when the type is
   *  picked. Empty leaves the mix to the model. */
  questionTypes: string[];
  questionCount: number;
  /** Prompt lines, each starting "- ", that set out how the sheet is built.
   *  They replace the default plan of sections and marks. */
  structure: string[];
  /** Replaces the prompt's intro line when the type wants no hook, or a
   *  different one. */
  intro?: string;
  /** The design the sheet starts with, over the year's default. */
  design?: Partial<SheetDesign>;
}

export const DEFAULT_TEMPLATE_ID = "classic";

/** The plan every worksheet followed before types existed. Kept word for word,
 *  so a Classic sheet is built exactly as before. */
const CLASSIC_STRUCTURE = [
  `- sections: 3 or 4 that build from recall, to understanding, to applying, to a challenge. Give each a short pupil-friendly title (for example "Warm up", "Show what you know", "Put it to work", "Challenge"), one fitting emoji, and a one-line instruction.`,
  "- Spread the questions so later sections are harder and worth more marks: 1 mark for recall, 2 for understanding, 3 to 4 for application, up to 6 for the challenge.",
];

export const WORKSHEET_TEMPLATES: WorksheetTemplate[] = [
  {
    id: "classic",
    name: "Classic worksheet",
    blurb: "Sections that climb from a warm up to a challenge",
    minutes: "30 to 40 mins",
    group: "practise",
    icon: "layers",
    questionTypes: [],
    questionCount: 10,
    structure: CLASSIC_STRUCTURE,
  },
  {
    id: "starter",
    name: "Lesson starter",
    blurb: "Five quick recall questions to open a lesson",
    minutes: "5 to 10 mins",
    group: "check",
    icon: "zap",
    questionTypes: ["Multiple Choice", "True/False", "Short Answer"],
    questionCount: 5,
    structure: [
      `- sections: exactly 1, titled something like "Starter" or "Get thinking", with a one-line instruction pupils can follow without help.`,
      "- Every question is quick recall of what pupils should already know, answerable in under a minute. No extended answers and no challenge.",
      "- Every question is worth 1 mark.",
    ],
  },
  {
    id: "exit-ticket",
    name: "Exit ticket",
    blurb: "Three questions that show who met the objective",
    minutes: "5 mins",
    group: "check",
    icon: "door",
    questionTypes: ["Short Answer", "Multiple Choice"],
    questionCount: 3,
    structure: [
      `- sections: exactly 1, titled something like "Before you go", with a one-line instruction.`,
      "- Each question tests the learning objective directly, so the answers tell the teacher who has met it. Start with the key fact, then check understanding, and make the last question ask pupils to explain or apply it in a sentence or two.",
      "- Marks rise from 1 for the first question to 3 for the last.",
      "- No word bank, table or callout: keep it to the questions.",
    ],
  },
  {
    id: "knowledge-check",
    name: "Knowledge check",
    blurb: "Fast retrieval across the whole topic",
    minutes: "10 to 15 mins",
    group: "check",
    icon: "list-checks",
    questionTypes: ["Multiple Choice", "True/False", "Matching", "Fill in the Blanks"],
    questionCount: 12,
    structure: [
      `- sections: 2. The first covers the key facts and vocabulary, the second checks understanding of how they connect. Short titles such as "Key facts" and "Joining it up", one fitting emoji each, and a one-line instruction.`,
      "- Cover the breadth of the topic: every question checks a different point, with no two asking the same thing.",
      "- Keep every question quick to mark: 1 mark each, or 2 for a matching or multi-part question.",
    ],
  },
  {
    id: "exam-paper",
    name: "Exam-style paper",
    blurb: "A formal paper with marks and a full mark scheme",
    minutes: "45 to 60 mins",
    group: "assess",
    icon: "scroll",
    questionTypes: ["Multiple Choice", "Short Answer", "Essay / Open-Ended", "Numerical / Computational"],
    questionCount: 12,
    structure: [
      `- sections: 3, titled "Section A", "Section B" and "Section C". Section A is short recall, Section B is structured questions, Section C is extended or multi-step questions. Use a plain emoji such as 📝 for each. Each instruction states the section's total marks, for example "Answer all questions. 12 marks."`,
      "- Write every prompt the way an exam paper does: formal, using command words (state, describe, explain, calculate, compare, evaluate), and with the marks a question is worth guiding how much pupils write.",
      "- Marks: 1 to 2 in Section A, 2 to 4 in Section B, 4 to 8 in Section C.",
      "- Every answer is a mark scheme: the points that earn each mark, and acceptable alternatives. For extended answers, the criteria are the levels or points a marker looks for.",
      "- No word banks, tips or reminders: this is an assessment.",
    ],
    intro: "- intro: variant \"remember\", label \"Instructions\", with the instructions to candidates in one or two sentences (answer all questions, show working, the total marks). Emoji 📝.",
    // The objective line reads as a lesson, not a paper. The intro box stays:
    // it carries the instructions to candidates.
    design: { objective: false },
  },
  {
    id: "end-of-topic",
    name: "End-of-topic test",
    blurb: "Checks everything the unit taught, about 40 marks",
    minutes: "40 to 50 mins",
    group: "assess",
    icon: "flag",
    questionTypes: [],
    questionCount: 15,
    structure: [
      "- sections: 4, one for each main part of the topic, named after that part (not \"Warm up\" or \"Challenge\"). One fitting emoji each, and a one-line instruction that states the section's marks.",
      "- Cover the whole unit: across the sections, test every key idea at least once, mixing recall, understanding and application within each section.",
      "- About 40 marks in total. Use a different mix of question formats in each section.",
      "- No tips or reminders: this is a test.",
    ],
  },
  {
    id: "homework",
    name: "Homework sheet",
    blurb: "A worked example, then practice pupils can do alone",
    minutes: "20 to 30 mins",
    group: "home",
    icon: "backpack",
    questionTypes: ["Short Answer", "Fill in the Blanks", "Numerical / Computational"],
    questionCount: 8,
    structure: [
      `- sections: 3. The first, titled something like "How it works", holds only a text block: a short worked example or explanation pupils can refer back to at home, with no questions. The second, "Your turn", is the practice. The third, "Extension", has one or two harder questions for pupils who want to go further.`,
      "- Write every instruction so a pupil can follow it at home without a teacher, and a parent can help without knowing the lesson.",
      "- Marks: 1 to 2 for practice questions, 3 to 4 for the extension.",
    ],
  },
  {
    id: "cloze",
    name: "Gap fill",
    blurb: "Short texts with missing key words to fill in",
    minutes: "15 to 20 mins",
    group: "practise",
    icon: "text-cursor",
    questionTypes: ["Fill in the Blanks"],
    questionCount: 10,
    structure: [
      "- sections: 2 or 3, each on one part of the topic, with a short title, one fitting emoji and a one-line instruction.",
      "- Build each section around a word bank and fill in the blanks questions whose sentences read together as a short connected explanation of that part of the topic, so filling them in rebuilds the key ideas.",
      "- Each gap is a key word or term, never a filler word. 1 mark per gap.",
    ],
  },
  {
    id: "fluency",
    name: "Fluency drill",
    blurb: "Lots of short practice that ramps up in difficulty",
    minutes: "15 to 20 mins",
    group: "practise",
    icon: "timer",
    questionTypes: ["Numerical / Computational"],
    questionCount: 24,
    structure: [
      `- sections: 3, titled something like "Steady", "Faster" and "Trickier", one fitting emoji each, and a one-line instruction.`,
      "- Many short, quick questions on the same skill, each a little harder than the last. Minimal wording: give the calculation or task straight away.",
      "- No word problems except at most two at the end of the last section.",
      "- 1 mark per question.",
    ],
  },
  {
    id: "vocab-match",
    name: "Key vocabulary",
    blurb: "Learn and use the topic's key terms",
    minutes: "15 to 20 mins",
    group: "practise",
    icon: "link",
    questionTypes: ["Matching", "Labeling", "Fill in the Blanks"],
    questionCount: 10,
    structure: [
      `- sections: 3. The first matches each key term to its meaning. The second asks pupils to recognise or name the terms. The third asks them to use the terms correctly in sentences. Short titles such as "Know the words", "Name it" and "Use it", one fitting emoji each, and a one-line instruction.`,
      "- Start the first section with a word bank of the 6 to 10 key terms for the topic, and use the same terms throughout.",
      "- 1 mark per term matched, named or used.",
    ],
  },
  {
    id: "recap",
    name: "Recap sheet",
    blurb: "A short summary to read, then questions on it",
    minutes: "15 to 20 mins",
    group: "home",
    icon: "bookmark",
    questionTypes: ["Short Answer", "Multiple Choice", "True/False"],
    questionCount: 8,
    structure: [
      `- sections: 2. The first, titled something like "The key ideas", holds a text block summarising the topic in 4 to 6 short sentences, and a table when the topic has facts that compare well. The second, "Check you have got it", asks questions about that summary.`,
      "- Every question can be answered from the summary on the page.",
      "- Marks: 1 to 2 per question.",
    ],
  },
  {
    id: "explain-reason",
    name: "Explain and reason",
    blurb: "Fewer, deeper questions with writing support",
    minutes: "30 to 40 mins",
    group: "practise",
    icon: "quote",
    questionTypes: ["Essay / Open-Ended", "Short Answer"],
    questionCount: 5,
    structure: [
      `- sections: 2. The first, titled something like "Get ready to explain", has a "tip" callout of 3 or 4 sentence starters pupils can use (for example "This happens because", "This shows that"), then one or two short answers that rehearse the key idea. The second, "Explain it", has 3 or 4 extended answers that ask why, how or what if.`,
      "- Every extended answer needs reasoning, not recall. Give each one success criteria.",
      "- Marks: 2 for the short answers, 4 to 6 for each extended answer.",
    ],
  },
];

// The puzzle types: the page builds their grids (app/lib/sheets/puzzles), so
// each plan asks for the words and leaves the layout alone.
WORKSHEET_TEMPLATES.push(
  {
    id: "sorting",
    name: "Sorting activity",
    blurb: "Pupils sort items into groups, then explain their thinking",
    minutes: "15 to 20 mins",
    group: "puzzle",
    icon: "columns",
    questionTypes: ["Sorting / Categorising", "Short Answer"],
    questionCount: 4,
    structure: [
      `- sections: 2. The first, titled something like "Sort it", holds one or two sort questions on the topic's key ideas. The second, "Explain your sorting", has one or two short answers asking why an item belongs where it does, or which was hardest to place.`,
      "- Choose groups that make pupils think about the topic, not just spot a word.",
      "- Marks: one per item sorted, 2 for each explanation.",
    ],
  },
  {
    id: "word-search",
    name: "Word search",
    blurb: "Find the topic's key words, then use them",
    minutes: "15 to 20 mins",
    group: "puzzle",
    icon: "search",
    questionTypes: ["Word Search", "Matching", "Fill in the Blanks"],
    questionCount: 4,
    structure: [
      `- sections: 2. The first, titled something like "Find the words", holds exactly one word search of the topic's key words. The second, "Use the words", has 2 or 3 quick questions that use those same words, such as matching them to meanings or filling them into sentences.`,
      "- Use only words pupils should learn for this topic.",
      "- Marks: about one per two words found, then 1 to 2 per follow-up question.",
    ],
  },
  {
    id: "crossword",
    name: "Crossword",
    blurb: "Clues on the topic's key terms, then a short check",
    minutes: "20 to 25 mins",
    group: "puzzle",
    icon: "grid",
    questionTypes: ["Crossword", "Short Answer"],
    questionCount: 3,
    structure: [
      `- sections: 2. The first, titled something like "Crack the crossword", holds exactly one crossword of 8 to 10 key terms. The second, "Put them to use", has 1 or 2 short answers that use the terms.`,
      "- Write clues that test meaning, not spelling.",
      "- Marks: one per crossword answer, 2 per short answer.",
    ],
  },
);

const BY_ID = new Map(WORKSHEET_TEMPLATES.map((t) => [t.id, t]));

/** The type with this id, or Classic for an unknown or missing id. */
export function templateById(id: unknown): WorksheetTemplate {
  return (typeof id === "string" && BY_ID.get(id)) || BY_ID.get(DEFAULT_TEMPLATE_ID)!;
}

export function isTemplateId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
