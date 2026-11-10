import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import {
  answerLabel,
  makeQuiz,
  normalizeQuizItem,
  parseQuiz,
  quizSubtitle,
  quizToSheet,
  quizUsageStep,
  retypeQuizItem,
  serializeQuiz,
  timeLimitOf,
  typesFor,
  type QuizItem,
} from "@/app/lib/quiz/quiz";
import { blooketRows, genericRows, gimkitRows, googleFormsScript, kahootRows, kahootTime, msFormsMarkdown, toCsv, waygroundRows } from "@/app/lib/quiz/exports";
import { buildXlsx, columnName, sheetXml, xmlText } from "@/app/lib/quiz/xlsx";
import { quizRequest, quizResponseFormat, parseQuizAnswer } from "@/app/lib/quiz/prompt";
import { printableSheet } from "@/app/lib/printable";
import { answerText, sheetToMarkdown } from "@/app/lib/sheets/markdown";

/*
 * The Quiz: one right answer, several, or true or false; stored as a
 * "jooma-quiz" document, with the bare arrays saved before it still readable;
 * printed through the sheet renderer; exported to each platform's template.
 * Pure throughout: nothing here reaches a model.
 */

const single: QuizItem = { type: "single", question: 'Which is a "producer"?', options: ["Fox", "Grass", "Hawk", "Rabbit"], answers: [1], explanation: "Grass makes its own food." };
const multi: QuizItem = { type: "multiple", question: "Which two are gases? Choose two.", options: ["Oxygen", "Iron", "Carbon dioxide", "Salt"], answers: [0, 2], explanation: "" };
const tf: QuizItem = { type: "truefalse", question: "Plants need light, water and £5, to grow, \\ really.", options: ["True", "False"], answers: [1], explanation: "No money needed.\nJust light and water." };
const QUIZ = makeQuiz({ title: "Photosynthesis", subtitle: "Year 8 · Science", timeLimit: 25, questions: [single, multi, tf] });

test.describe("a question", () => {
  test("is kept when sound and trimmed", () => {
    expect(normalizeQuizItem({ ...single, question: "  Which is a producer?  " })).toMatchObject({ question: "Which is a producer?", answers: [1] });
  });

  test("is dropped with no stem, fewer than two options or no valid answer", () => {
    expect(normalizeQuizItem({ ...single, question: "" })).toBeNull();
    expect(normalizeQuizItem({ ...single, options: ["Only one"] })).toBeNull();
    expect(normalizeQuizItem({ ...single, answers: [7] })).toBeNull();
    expect(normalizeQuizItem({ ...single, answers: [] })).toBeNull();
    expect(normalizeQuizItem(null)).toBeNull();
  });

  test("duplicate and out of range answers are cleaned; a single question keeps one answer", () => {
    expect(normalizeQuizItem({ ...multi, answers: [2, 0, 2, 9] })?.answers).toEqual([0, 2]);
    expect(normalizeQuizItem({ ...single, answers: [3, 1] })?.answers).toEqual([3]);
  });

  test("a multiple answer question with one right answer becomes a single answer question", () => {
    expect(normalizeQuizItem({ ...multi, answers: [2] })).toMatchObject({ type: "single", answers: [2] });
  });

  test("true or false always has exactly those two options", () => {
    expect(normalizeQuizItem({ ...tf, options: ["Yes", "No", "Maybe", "Never"] })).toMatchObject({ options: ["True", "False"], answers: [1] });
    expect(normalizeQuizItem({ ...tf, answers: [3] })).toBeNull();
  });

  test("options past five are dropped", () => {
    expect(normalizeQuizItem({ ...single, options: ["a", "b", "c", "d", "e", "f", "g"] })?.options).toHaveLength(5);
  });

  test("switching type keeps what it can", () => {
    expect(retypeQuizItem(single, "truefalse")).toMatchObject({ options: ["True", "False"], answers: [0] });
    expect(retypeQuizItem(single, "multiple").answers.length).toBeGreaterThanOrEqual(2);
    expect(retypeQuizItem(multi, "single").answers).toEqual([0]);
  });
});

test.describe("reading a stored quiz", () => {
  test("the current shape round trips, and reading is stable", () => {
    const once = parseQuiz(serializeQuiz(QUIZ))!;
    expect(once.questions.slice(0, 2)).toEqual([single, multi]);
    // An explanation is kept to one line.
    expect(once.questions[2].explanation).toBe("No money needed. Just light and water.");
    expect(parseQuiz(serializeQuiz(once))).toEqual(once);
  });

  test("a legacy array converts, taking its title, subtitle and time from the run's input", () => {
    const legacy = JSON.stringify([
      { question: "2 + 2?", options: ["3", "4", "5", "6"], correctIndex: 1 },
      { question: "Broken", options: ["a", "b", "c", "d"], correctIndex: 7 },
      "not a question",
    ]);
    const q = parseQuiz(legacy, { topic: "Adding", subject: "Maths", yearGroup: "Year 2", timeLimit: 45 });
    expect(q).toMatchObject({ kind: "jooma-quiz", title: "Adding", subtitle: "Year 2 · Maths", timeLimit: 45 });
    expect(q?.questions).toEqual([{ type: "single", question: "2 + 2?", options: ["3", "4", "5", "6"], answers: [1], explanation: "" }]);
  });

  test("an empty array is a quiz with no questions; markdown and junk are not quizzes", () => {
    expect(parseQuiz("[]")?.questions).toEqual([]);
    expect(parseQuiz("## Not a quiz")).toBeNull();
    expect(parseQuiz('{"kind":"jooma-sheet"}')).toBeNull();
    expect(parseQuiz("")).toBeNull();
  });

  test("subtitles and time limits from a form", () => {
    expect(quizSubtitle({ yearGroup: "Mixed", subject: "Science" })).toBe("Mixed years · Science");
    expect(quizSubtitle({})).toBe("");
    expect(timeLimitOf(2)).toBe(5);
    expect(timeLimitOf(999)).toBe(300);
    expect(timeLimitOf(0)).toBeNull();
    expect(timeLimitOf("40")).toBe(40);
    expect(timeLimitOf(undefined)).toBeNull();
  });
});

test.describe("what counts as a generation", () => {
  test("only a whole new quiz; adding and refining are edits", () => {
    expect(quizUsageStep("generate")).toBeNull();
    expect(quizUsageStep(undefined)).toBeNull();
    expect(quizUsageStep("add")).toBe("Quiz add");
    expect(quizUsageStep("refine")).toBe("Quiz refine");
  });
});

test.describe("the printable version", () => {
  test("every question is a choice question, with the answer key and explanations at the end", () => {
    const sheet = quizToSheet(QUIZ);
    const blocks = sheet.sections[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(["mcq", "mcq", "mcq"]);
    // It already says how many, so no "Tick 2" is added.
    expect(blocks[1]).toMatchObject({ prompt: "Which two are gases? Choose two.", answers: [0, 2], marks: 2 });
    const unsaid = quizToSheet(makeQuiz({ ...QUIZ, questions: [{ ...multi, question: "Which are gases?" }] }));
    expect(unsaid.sections[0].blocks[0]).toMatchObject({ prompt: "Which are gases? (Tick 2.)" });
    expect(blocks[2]).toMatchObject({ options: ["True", "False"] });
    expect(answerText(blocks[0] as never)).toBe("b) Grass");
    expect(sheet.teacherNotes[0].points).toEqual(["1. Grass makes its own food.", "3. No money needed.\nJust light and water."]);
    const md = sheetToMarkdown(sheet, { answers: true });
    expect(md.indexOf("## Answers")).toBeGreaterThan(md.indexOf("Plants need light"));
  });

  test("the Library and shared view get a printable sheet for new and old quizzes, and nothing for other tools", () => {
    expect(printableSheet("quiz-generator", serializeQuiz(QUIZ))?.sections[0].blocks).toHaveLength(3);
    expect(printableSheet("quiz-generator", JSON.stringify([{ question: "Q?", options: ["a", "b", "c", "d"], correctIndex: 0 }]))?.title).toBe("Quiz");
    expect(printableSheet("quiz-generator", "[]")).toBeNull();
    expect(printableSheet("letter-writer", serializeQuiz(QUIZ))).toBeNull();
    expect(answerLabel(multi)).toBe("a) Oxygen, c) Carbon dioxide");
  });
});

test.describe("exports", () => {
  test("Kahoot: questions from row 9, its own time list, answers as numbers, limits enforced", () => {
    const long = makeQuiz({ ...QUIZ, questions: [{ ...single, question: "x".repeat(130), options: ["y".repeat(80), "b", "c", "d"] }, { ...single, options: ["a", "b", "c", "d", "e"] }] });
    const { rows, skipped, shortened } = kahootRows(long);
    expect(rows[7].slice(1, 3)).toEqual(["Question - max 120 characters", "Answer 1 - max 75 characters"]);
    expect(rows[8][0]).toBe(1);
    expect(String(rows[8][1]).length).toBe(120);
    expect(String(rows[8][2]).length).toBe(75);
    expect(skipped).toBe(1);
    expect(shortened).toBe(2);
    expect(kahootRows(QUIZ).rows.slice(8).map((r) => r[7])).toEqual(["2", "1,3", "2"]);
    expect(kahootTime(25)).toBe(20);
    expect(kahootTime(29)).toBe(30);
    expect(kahootTime(null)).toBe(20);
    expect(kahootTime(500)).toBe(240);
  });

  test("Wayground: the official sample's header and description rows, then the questions", () => {
    const { rows } = waygroundRows(QUIZ);
    expect(rows[0]).toEqual(["Question", "Option 1", "Option 2", "Option 3", "Option 4", "Option 5", "Correct Answer", "Time", "Image Link"]);
    expect(rows[1][0]).toBe("Text of the question (required)");
    expect(rows[2]).toEqual([single.question, "Fox", "Grass", "Hawk", "Rabbit", "", 2, 25, ""]);
    expect(rows[3][6]).toBe("1,3");
  });

  test("Blooket: title row, header row, numbered questions, time capped at 300", () => {
    const { rows } = blooketRows(makeQuiz({ ...QUIZ, timeLimit: 999 }));
    expect(rows[1][1]).toBe("Question Text");
    expect(rows[2].slice(0, 3)).toEqual([1, single.question, "Fox"]);
    expect(rows[2][6]).toBe(300);
    expect(rows[3][7]).toBe("1,3");
  });

  test("Gimkit: one right answer only, so multiple answer questions are left out and counted", () => {
    const { rows, skipped } = gimkitRows(QUIZ);
    expect(skipped).toBe(1);
    expect(rows.slice(2).map((r) => r[1])).toEqual(["Grass", "False"]);
    expect(rows[2].slice(2)).toEqual(["Fox", "Hawk", "Rabbit"]);
  });

  test("CSV quotes every cell, doubles quotes, keeps commas, new lines and the pound sign intact", () => {
    const csv = toCsv(genericRows(QUIZ).rows);
    expect(csv).toContain('"Which is a ""producer""?"');
    expect(csv).toContain('"Plants need light, water and £5, to grow, \\ really."');
    expect(csv).toContain('"No money needed.\nJust light and water."');
    // A header and three questions; the new line inside a cell is not a row.
    expect(csv.split("\r\n")).toHaveLength(4);
  });

  test("the Google Forms script survives quotes, backslashes and new lines, and makes tick box questions for several answers", () => {
    const script = googleFormsScript(QUIZ);
    expect(script).toContain(JSON.stringify(tf.question));
    expect(script).toContain(JSON.stringify(tf.explanation));
    expect(script).toContain("form.addCheckboxItem()");
    expect(script).toContain("[0,2]");
    // The question text cannot close the string early.
    expect(() => new Function(script.replace(/FormApp|Logger/g, "x"))).not.toThrow();
  });

  test("the Microsoft Forms guide marks every right answer", () => {
    const md = msFormsMarkdown(QUIZ);
    expect(md).toContain("- A) Oxygen (correct)");
    expect(md).toContain("- C) Carbon dioxide (correct)");
    expect(md).toContain("**Why:** Grass makes its own food.");
  });
});

test.describe("the .xlsx file", () => {
  test("column names and XML escaping", () => {
    expect([0, 25, 26, 27, 701].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ"]);
    expect(xmlText('a & b < "c" \u0001')).toBe("a &amp; b &lt; &quot;c&quot; ");
    expect(sheetXml([["x", 3]])).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">x</t></is></c><c r="B1"><v>3</v></c>');
  });

  test("is a valid workbook whose sheet holds the rows", async () => {
    const blob = await buildXlsx(kahootRows(QUIZ).rows, "Quiz", JSZip);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "_rels/.rels", "xl/_rels/workbook.xml.rels"]));
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain('r="B9"');
    expect(sheet).toContain("Which is a &quot;producer&quot;?");
  });
});

test.describe("the request", () => {
  const base = { curriculum: "2014 National Curriculum", yearGroup: "Year 8", subject: "Science", topic: "Photosynthesis" };
  const text = (r: ReturnType<typeof quizRequest>) => ("error" in r ? r.error : r.messages.map((m) => m.content).join("\n"));
  const kinds = (r: ReturnType<typeof quizRequest>) => ("error" in r ? [] : (((r.response_format.json_schema.schema as never as { properties: { questions: { items: { properties: { type: { enum: string[] } } } } } }).properties.questions.items.properties.type.enum)));

  test("the schema offers only the chosen question types", () => {
    expect(kinds(quizRequest({ ...base, action: "generate", answerType: "single" }))).toEqual(["single"]);
    expect(kinds(quizRequest({ ...base, action: "generate", answerType: "multiple" }))).toEqual(["multiple"]);
    expect(kinds(quizRequest({ ...base, action: "generate", answerType: "mixed" }))).toEqual(["single", "multiple", "truefalse"]);
    expect(kinds(quizRequest({ ...base, action: "generate", answerType: "nonsense" }))).toEqual(["single"]);
    expect(JSON.stringify(quizResponseFormat(["single"]))).not.toContain("correctIndex");
  });

  test("the count is clamped, and refusals come back before the model sees anything", () => {
    expect(text(quizRequest({ ...base, action: "generate", numQuestions: 500 }))).toContain("exactly 40 questions");
    expect(text(quizRequest({ ...base, action: "generate", topic: " " }))).toBe("Missing required fields");
    expect(text(quizRequest({ ...base, action: "add", existingQuestions: [] }))).toBe("There are no questions to add to yet");
    expect(text(quizRequest({ action: "refine", instruction: "", existingQuestions: [single] }))).toBe("Missing required fields");
    expect(text(quizRequest({ ...base, action: undefined }))).toBe("Unknown action");
  });

  test("refining keeps every type already in the quiz available", () => {
    expect(kinds(quizRequest({ ...base, action: "refine", answerType: "single", instruction: "Make it harder", existingQuestions: [single, tf] }))).toEqual(["single", "truefalse"]);
  });

  test("the model's answer is checked: bad questions dropped, code fences tolerated", () => {
    const parsed = parseQuizAnswer('```json\n{"title":"T","questions":[{"type":"single","question":"Q","options":["a","b"],"answers":[5],"explanation":""},{"type":"truefalse","question":"S","options":["True","False"],"answers":[0],"explanation":""}]}\n```');
    expect(parsed.title).toBe("T");
    expect(parsed.questions.map((q) => q.question)).toEqual(["S"]);
    expect(() => parseQuizAnswer('{"nope":1}')).toThrow();
  });

  test("no long dashes in what we send", () => {
    expect(text(quizRequest({ ...base, action: "generate", answerType: "mixed" }))).not.toMatch(/[–—]/);
  });

  test("types for a form value", () => {
    expect(typesFor("truefalse")).toEqual(["truefalse"]);
    expect(typesFor(undefined)).toEqual(["single"]);
  });
});
