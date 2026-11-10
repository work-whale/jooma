// A quiz in each quiz platform's import format, as rows or text. Pure, so each
// layout is tested against its template in tests/unit/quiz-exports.spec.ts;
// the form only turns these into a download.
//
// Layouts:
// - Wayground (formerly Quizizz): its official sample file
//   (cf.quizizz.com/xlsx/samplefile.xlsx), checked 2026-11-09: a header row, a
//   row describing each column, then the questions. Up to five options, the
//   right one as its number.
// - Kahoot, Blooket and Gimkit: the layouts of their published templates (the
//   files themselves could not be fetched to check). Kahoot reads only its own
//   .xlsx template: the questions start on row 9, with the time limit from a
//   fixed list and at most 120 characters a question, 75 an answer. Blooket
//   and Gimkit read a CSV whose first row is a title and whose second is the
//   headers.
// A question a platform cannot hold (more options than it takes, more than
// one right answer where it allows one) is left out and counted, so the form
// can say so rather than export something wrong.

import type { Cell } from "./xlsx";
import { answerLabel, type QuizDoc, type QuizItem } from "./quiz";

export interface RowsExport {
  rows: Cell[][];
  /** Questions this platform cannot hold, left out. */
  skipped: number;
  /** Text cut to the platform's limits. */
  shortened: number;
}

export const KAHOOT_TIMES = [5, 10, 20, 30, 60, 90, 120, 240];
export const KAHOOT_QUESTION_MAX = 120;
export const KAHOOT_ANSWER_MAX = 75;

/** The allowed time nearest to the quiz's; Kahoot's default of 20 when none. */
export function kahootTime(seconds: number | null): number {
  if (seconds === null) return 20;
  return KAHOOT_TIMES.reduce((best, t) => (Math.abs(t - seconds) < Math.abs(best - seconds) ? t : best), KAHOOT_TIMES[0]);
}

function cut(s: string, max: number, counter: { n: number }): string {
  if (s.length <= max) return s;
  counter.n++;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

const answerNumbers = (q: QuizItem) => q.answers.map((i) => i + 1).join(",");

export function kahootRows(doc: QuizDoc): RowsExport {
  const shortened = { n: 0 };
  let skipped = 0;
  const rows: Cell[][] = [
    ["Quiz template"],
    ["Add questions, at least two answer alternatives, time limit and choose correct answers (at least one). Have fun creating your awesome quiz!"],
    ["Remember: questions can have a maximum of 120 characters and answers can have 75 characters max. Text will turn red in Excel or Google Docs if you exceed this limit. If several answers are correct, separate them with a comma."],
    ["See an example question below (don't forget to overwrite this with your first question!)"],
    ["And remember,  if you're not using Excel you need to export to .xlsx format before you upload to Kahoot!"],
    [],
    [],
    [null, "Question - max 120 characters", "Answer 1 - max 75 characters", "Answer 2 - max 75 characters", "Answer 3 - max 75 characters", "Answer 4 - max 75 characters", "Time limit (sec) - 5, 10, 20, 30, 60, 90, 120, or 240 secs", "Correct answer(s) - choose at least one"],
  ];
  const time = kahootTime(doc.timeLimit);
  let n = 0;
  for (const q of doc.questions) {
    if (q.options.length > 4) { skipped++; continue; }
    const opts = [0, 1, 2, 3].map((i) => (q.options[i] !== undefined ? cut(q.options[i], KAHOOT_ANSWER_MAX, shortened) : ""));
    rows.push([++n, cut(q.question, KAHOOT_QUESTION_MAX, shortened), ...opts, time, answerNumbers(q)]);
  }
  return { rows, skipped, shortened: shortened.n };
}

export function waygroundRows(doc: QuizDoc): RowsExport {
  const rows: Cell[][] = [
    ["Question", "Option 1", "Option 2", "Option 3", "Option 4", "Option 5", "Correct Answer", "Time", "Image Link"],
    [
      "Text of the question (required)",
      "Text for option 1 (required)",
      "Text for option 2 (required)",
      "Text for option 3 (optional)",
      "Text for option 4 (optional)",
      "Text for option 5 (optional)",
      "Integer (1-5 for the correct option)",
      "Time in seconds (optional, default value is 30)",
      "Link of the image (optional)",
    ],
  ];
  for (const q of doc.questions) {
    const opts = [0, 1, 2, 3, 4].map((i) => q.options[i] ?? "");
    // A single right answer as a number, as the template asks; several as a
    // list, which Wayground reads as a "select all" question.
    const correct: Cell = q.answers.length === 1 ? q.answers[0] + 1 : answerNumbers(q);
    rows.push([q.question, ...opts, correct, doc.timeLimit ?? 30, ""]);
  }
  return { rows, skipped: 0, shortened: 0 };
}

/** RFC 4180: every cell quoted, quotes doubled, CRLF between rows. */
export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function blooketRows(doc: QuizDoc): RowsExport {
  let skipped = 0;
  const rows: Cell[][] = [
    ["Blooket\nImport Template", "", "", "", "", "", "", ""],
    ["Question #", "Question Text", "Answer 1", "Answer 2", "Answer 3\n(Optional)", "Answer 4\n(Optional)", "Time Limit (sec)\n(Max: 300 seconds)", "Correct Answer(s)\n(Only include Answer #)"],
  ];
  let n = 0;
  for (const q of doc.questions) {
    if (q.options.length > 4) { skipped++; continue; }
    const opts = [0, 1, 2, 3].map((i) => q.options[i] ?? "");
    rows.push([++n, q.question, ...opts, Math.min(300, doc.timeLimit ?? 20), answerNumbers(q)]);
  }
  return { rows, skipped, shortened: 0 };
}

export function gimkitRows(doc: QuizDoc): RowsExport {
  let skipped = 0;
  const rows: Cell[][] = [
    ["Gimkit Spreadsheet Import Template", "", "", "", ""],
    ["Question", "Correct Answer", "Incorrect Answer 1", "Incorrect Answer 2 (Optional)", "Incorrect Answer 3 (Optional)"],
  ];
  for (const q of doc.questions) {
    // Gimkit has one right answer and up to three wrong ones.
    if (q.answers.length !== 1 || q.options.length > 4) { skipped++; continue; }
    const wrong = q.options.filter((_, i) => i !== q.answers[0]);
    rows.push([q.question, q.options[q.answers[0]], wrong[0] ?? "", wrong[1] ?? "", wrong[2] ?? ""]);
  }
  return { rows, skipped, shortened: 0 };
}

/** Our own plain layout, for anything else. */
export function genericRows(doc: QuizDoc): RowsExport {
  const rows: Cell[][] = [["Question", "Type", "Option A", "Option B", "Option C", "Option D", "Option E", "Correct answer(s)", "Explanation"]];
  const typeName = { single: "One answer", multiple: "More than one answer", truefalse: "True or false" } as const;
  for (const q of doc.questions) {
    rows.push([q.question, typeName[q.type], ...[0, 1, 2, 3, 4].map((i) => q.options[i] ?? ""), answerLabel(q), q.explanation]);
  }
  return { rows, skipped: 0, shortened: 0 };
}

/**
 * A Google Apps Script that builds the quiz as a Google Form. Every string is
 * written with JSON.stringify, so a quote, a backslash or a new line in a
 * question cannot break the script.
 */
export function googleFormsScript(doc: QuizDoc): string {
  const title = JSON.stringify(doc.title || "Quiz");
  const calls = doc.questions
    .map((q) => `  addQuestion(form, ${JSON.stringify(q.question)}, ${JSON.stringify(q.options)}, ${JSON.stringify(q.answers)}, ${JSON.stringify(q.explanation)});`)
    .join("\n");
  return `// Google Forms quiz, made in Jooma.
// 1. Go to script.google.com and create a new project.
// 2. Paste this whole script into the editor.
// 3. Choose createQuiz and press Run.
// 4. Allow access when asked. The form appears in your Google Drive.

function createQuiz() {
  var form = FormApp.create(${title});
  form.setIsQuiz(true);
  form.setTitle(${title});

${calls}

  Logger.log('Form created: ' + form.getEditUrl());
}

function addQuestion(form, questionText, options, answers, explanation) {
  // More than one right answer becomes a tick box question.
  var item = answers.length > 1 ? form.addCheckboxItem() : form.addMultipleChoiceItem();
  item.setTitle(questionText);
  item.setRequired(true);
  item.setChoices(options.map(function (opt, i) {
    return item.createChoice(opt, answers.indexOf(i) !== -1);
  }));
  item.setPoints(1);
  if (explanation) {
    item.setFeedbackForCorrect(FormApp.createFeedback().setText(explanation).build());
  }
}
`;
}

/**
 * For building the quiz in Microsoft Forms by hand: each question with its
 * options and its answer inline, since this is read beside Forms while typing,
 * never handed to pupils.
 */
export function msFormsMarkdown(doc: QuizDoc): string {
  const lines = [`# ${doc.title || "Quiz"}`, "", "Use this document to build your quiz in Microsoft Forms.", "", "---", ""];
  doc.questions.forEach((q, i) => {
    const kind = q.type === "multiple" ? "Choice, multiple answers on" : "Choice";
    lines.push(`## Question ${i + 1} (${kind})`, "", q.question, "");
    q.options.forEach((opt, j) => lines.push(`- ${String.fromCharCode(65 + j)}) ${opt}${q.answers.includes(j) ? " (correct)" : ""}`));
    lines.push("", `**Correct answer:** ${answerLabel(q)}`);
    if (q.explanation) lines.push("", `**Why:** ${q.explanation}`);
    lines.push("");
  });
  return lines.join("\n");
}
