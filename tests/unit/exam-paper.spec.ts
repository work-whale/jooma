import { test, expect } from "@playwright/test";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { examCover, questionLabels, sheetToMarkdown, showsCover, totalMarks } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { disclaimerFor, durationText, examStyle, isTieredSubject, offersTier, styleFromExamType, tierOf, EXAM_STYLES } from "@/app/lib/sheets/exam-styles";
import { examRequest } from "@/app/lib/exam-prompt";
import { modelAnswerRequest, paperQuestions, requestedQuestions, MAX_MODEL_QUESTIONS } from "@/app/lib/model-answer-prompt";
import { arrangeModelAnswers } from "@/app/lib/sheets/model-answers";
import { examHandoffs } from "@/app/lib/lesson-handoffs";
import { serializeSheet } from "@/app/lib/sheets/normalize";
import type { SheetDoc } from "@/app/lib/sheets/types";

/*
 * Exam Papers (a sheet tool: one section per question, parts labelled 1(a),
 * a cover with totals worked out in code, the mark scheme in the parts) and
 * Model Answers (answers at full, mid and near miss level). Pure; nothing
 * reaches a model.
 */

const DASHES = /[–—]/;

/** A paper as the model would send it: one single part question, one in two parts. */
const DRAFT = {
  title: "Biology: Photosynthesis",
  objective: "",
  intro: { variant: "fact", label: "", text: "", emoji: "" },
  sections: [
    { title: "Question 1", emoji: "", instructions: "", blocks: [{ type: "short", prompt: "State the word equation for photosynthesis.", lines: 2, answer: "carbon dioxide + water (1); glucose + oxygen (1)", marks: 2 }] },
    {
      title: "Question 2",
      emoji: "",
      instructions: "A student measured oxygen bubbles from pondweed at different light intensities.",
      blocks: [
        { type: "calc", prompt: "Calculate the mean number of bubbles.", working: true, answer: "12 bubbles per minute (2)", marks: 2 },
        { type: "long", prompt: "Evaluate the student's method.", lines: 12, answer: "Controls, repeats, light source heat", criteria: ["Level 3 (5 to 6 marks): ...", "Level 2 (3 to 4 marks): ...", "Level 1 (1 to 2 marks): ..."], marks: 6 },
      ],
    },
  ],
  teacherNotes: [{ title: "Errors to watch", points: ["Writing light as a reactant"] }],
};

const INFO = { yearGroup: "Year 11", subject: "Biology", examStyle: "gcse-aqa", tier: "higher", minutes: 75 };
const paper = (info: Record<string, unknown> = {}, draft: unknown = DRAFT) => normalizeDraft(draft, sheetContext("exam", { ...INFO, ...info }));

test.describe("exam styles", () => {
  test("a tier only for tiered GCSE subjects", () => {
    expect(offersTier(examStyle("gcse-aqa"), "Mathematics")).toBe(true);
    expect(offersTier(examStyle("gcse-ocr"), "Combined Science")).toBe(true);
    expect(offersTier(examStyle("gcse-aqa"), "History")).toBe(false);
    expect(offersTier(examStyle("ks2-maths-reasoning"), "Mathematics")).toBe(false);
    expect(offersTier(examStyle("school-test"), "Maths")).toBe(false);
    expect(tierOf(examStyle("gcse-aqa"), "History", "higher")).toBe("");
    expect(tierOf(examStyle("gcse-aqa"), "Physics", "nonsense")).toBe("higher");
    expect(isTieredSubject("Spanish")).toBe(true);
  });

  test("KS2 papers are for Year 6 and carry their own subject", () => {
    for (const s of EXAM_STYLES.filter((x) => x.phase === "ks2")) {
      expect(s.years).toEqual(["Year 6"]);
      expect(s.subject).toBeTruthy();
    }
  });

  test("an old free text exam type maps to the nearest style", () => {
    expect(styleFromExamType("GCSE AQA")).toBe("gcse-aqa");
    expect(styleFromExamType("edexcel gcse maths")).toBe("gcse-edexcel");
    expect(styleFromExamType("OCR GCSE")).toBe("gcse-ocr");
    expect(styleFromExamType("WJEC Eduqas GCSE")).toBe("gcse-eduqas");
    expect(styleFromExamType("Year 6 SATs reading")).toBe("ks2-reading");
    expect(styleFromExamType("A-level")).toBe("school-test");
    expect(styleFromExamType("end of unit")).toBe("school-test");
    expect(styleFromExamType(undefined)).toBe("school-test");
  });

  test("the disclaimer always says the paper is not official and not endorsed, and no style text has long dashes", () => {
    for (const s of EXAM_STYLES) {
      const d = disclaimerFor(s);
      if (s.board) expect(d).toContain(`not endorsed by ${s.board}`);
      if (s.phase === "ks2") expect(d).toContain("not an official");
      expect([s.guide, s.label, d, ...s.instructions].join(" ")).not.toMatch(DASHES);
    }
    expect(durationText(75)).toBe("1 hour 15 minutes");
    expect(durationText(120)).toBe("2 hours");
    expect(durationText(45)).toBe("45 minutes");
  });
});

test.describe("an exam paper as a sheet", () => {
  test("keeps its style, tier and time, with no name line or objective on the pages", () => {
    const doc = paper();
    expect(doc.exam).toEqual({ styleId: "gcse-aqa", tier: "higher", minutes: 75, subject: "Biology", yearGroup: "Year 11" });
    expect(doc.subtitle).toBe("Year 11 · Biology · Higher tier");
    expect(doc.design).toMatchObject({ nameDate: false, objective: false, intro: false, answers: true });
    expect(paper({ includeAnswerKey: false }).design.answers).toBe(false);
    expect(paper({ examStyle: "ks2-reading", subject: "" }).design.lineNumbers).toBe(true);
    expect(paper({ examStyle: "gcse-aqa", subject: "History", tier: "higher" }).exam?.tier).toBe("");
  });

  test("questions are labelled by question and part; a one part question is just its number", () => {
    const doc = paper();
    expect([...questionLabels(doc).values()]).toEqual(["1", "2(a)", "2(b)"]);
    // A worksheet still counts straight down.
    expect([...questionLabels({ ...doc, tool: "worksheet" }).values()]).toEqual(["1", "2", "3"]);
  });

  test("the total is worked out from the parts, and the cover says so", () => {
    const doc = paper();
    expect(totalMarks(doc)).toBe(10);
    const cover = examCover(doc)!;
    expect(cover).toMatchObject({ level: "GCSE (9 to 1) Biology", tier: "Higher tier", time: "1 hour 15 minutes", total: 10 });
    expect(cover.disclaimer).toContain("not endorsed by AQA");
    expect(showsCover(doc)).toBe(true);
    expect(showsCover({ ...doc, design: { ...doc.design, cover: false } })).toBe(false);
    expect(examCover({ ...doc, exam: undefined })).toBeNull();
  });

  test("Copy gives the cover, labelled questions and a mark scheme with marks and levels", () => {
    const md = sheetToMarkdown(paper());
    expect(md).toContain("**Time allowed:** 1 hour 15 minutes. **Total marks:** 10.");
    expect(md).toContain("**2(a).** Calculate the mean number of bubbles.");
    expect(md).toContain("## Mark scheme");
    expect(md).toContain("2(b). Controls, repeats, light source heat [6 marks]");
    expect(md).toContain("   - Level 3 (5 to 6 marks): ...");
    expect(md).toContain("not endorsed by AQA");
  });

  test("the Word file builds, with and without a cover", async () => {
    expect((await buildSheetDocx(paper())).size).toBeGreaterThan(5000);
    const doc = paper();
    expect((await buildSheetDocx({ ...doc, design: { ...doc.design, cover: false } })).size).toBeGreaterThan(5000);
  });

  test("Write model answers is offered only once the paper is saved", () => {
    expect(examHandoffs(paper(), null)).toEqual([]);
    expect(examHandoffs(paper(), "abc")[0]).toMatchObject({ id: "modelAnswers", href: "/tools/model-answer-generator?from=abc" });
    expect(examHandoffs({ ...paper(), exam: undefined }, "abc")).toEqual([]);
  });
});

test.describe("the exam request", () => {
  const body = { curriculum: "2014 National Curriculum", yearGroup: "Year 11", subject: "Biology", topic: "Photosynthesis" };
  const text = (r: ReturnType<typeof examRequest>) => ("error" in r ? r.error : r.messages.map((m) => m.content).join("\n"));
  const variants = (r: ReturnType<typeof examRequest>) => {
    if ("error" in r) return [];
    const s = r.response_format.json_schema.schema as { properties: { sections: { items: { properties: { blocks: { items: { anyOf: { properties: { type: { enum: string[] } } }[] } } } } } } };
    return s.properties.sections.items.properties.blocks.items.anyOf.map((v) => v.properties.type.enum[0]);
  };

  test("the schema holds the model to the number of questions, plus a reading paper's text", () => {
    const count = (r: ReturnType<typeof examRequest>) => {
      if ("error" in r) return null;
      const s = (r.response_format.json_schema.schema as { properties: { sections: { minItems?: number; maxItems?: number } } }).properties.sections;
      return [s.minItems, s.maxItems];
    };
    expect(count(examRequest({ ...body, numQuestions: 4 }))).toEqual([4, 4]);
    expect(count(examRequest({ ...body, examStyle: "ks2-reading", subject: "", numQuestions: 6 }))).toEqual([7, 7]);
  });

  test("refused before the model sees it: missing fields, an unknown style", () => {
    expect(text(examRequest({ ...body, topic: " " }))).toBe("Missing required fields");
    expect(text(examRequest({ ...body, examStyle: "a-level-aqa" }))).toBe("Unknown exam style");
  });

  test("a KS2 paper needs no subject from the form, and only it offers a reading passage", () => {
    expect(text(examRequest({ ...body, subject: "", examStyle: "ks2-maths-arithmetic", yearGroup: "Year 6" }))).toContain("Mathematics");
    expect(variants(examRequest({ ...body, examStyle: "ks2-reading", subject: "" }))).toContain("passage");
    expect(variants(examRequest({ ...body, examStyle: "gcse-aqa" }))).not.toContain("passage");
    expect(variants(examRequest({ ...body, examStyle: "ks2-maths-arithmetic", subject: "" }))).toEqual(["text", "callout", "wordbank", "table", "calc"]);
  });

  test("the prompt carries the originality rule, the marks range, the tier only when tiered, and no long dashes", () => {
    const aqa = text(examRequest({ ...body, examStyle: "gcse-aqa", tier: "foundation", minMarks: 3, maxMarks: 9, numQuestions: 50 }));
    expect(aqa).toContain("Never reproduce, adapt or paraphrase a question from a real exam board paper");
    expect(aqa).toContain("Exactly 20 questions");
    expect(aqa).toContain("between 3 and 9 marks");
    expect(aqa).toContain("tier: foundation");
    expect(aqa).not.toMatch(DASHES);
    expect(text(examRequest({ ...body, subject: "History", examStyle: "gcse-aqa", tier: "higher" }))).toContain("tier: none.");
  });
});

test.describe("model answers", () => {
  const RAW = {
    title: "Biology: model answers",
    questions: [
      {
        question: "Explain why the rate rises with light intensity.",
        marks: 4,
        exemplars: [
          { level: "full", awarded: 9, form: "points", parts: ["Light provides energy", "More light, faster reaction"], annotations: [{ quote: "provides energy", note: "1 mark: energy" }, { quote: "not in the answer", note: "Mentions chlorophyll" }], commentary: "Clear." },
          { level: "low", awarded: 1, form: "prose", parts: [], annotations: [], commentary: "" },
        ],
        teachingNotes: ["Light is not a reactant"],
      },
    ],
  };

  test("arranged one section per question, marks from the question, notes as a list", () => {
    const doc = normalizeDraft(RAW, sheetContext("modelAnswer", { yearGroup: "Year 11", subject: "Biology" }));
    expect(doc.subtitle).toBe("Year 11 · Model answers");
    expect(doc.sections[0]).toMatchObject({ title: "Question 1", instructions: "Explain why the rate rises with light intensity. (4 marks)" });
    const [ex, notes] = doc.sections[0].blocks;
    // Awarded marks never exceed the marks; an empty answer is dropped.
    expect(ex).toMatchObject({ type: "exemplar", level: "full", awarded: 4, outOf: 4 });
    expect(doc.sections[0].blocks.filter((b) => b.type === "exemplar")).toHaveLength(1);
    // A note whose quote is not in the answer moves into the commentary.
    expect(ex).toMatchObject({ annotations: [{ quote: "provides energy", note: "1 mark: energy" }], commentary: "Clear. Mentions chlorophyll" });
    expect(notes).toMatchObject({ type: "list", items: ["Light is not a reactant"] });
    expect(sheetToMarkdown(doc)).toContain("#### Full marks (4/4 marks)");
    expect(arrangeModelAnswers({ questions: [{ question: "" }] }).sections).toEqual([]);
    // A "[6 marks]" the model copied into the question is not shown twice.
    const echoed = arrangeModelAnswers({ questions: [{ question: "Explain it. [6 marks]", marks: 6, exemplars: [] }] }) as { sections: { instructions: string }[] };
    expect(echoed.sections[0].instructions).toBe("Explain it. (6 marks)");
  });

  test("the request: up to eight questions, blank ones dropped, levels chosen, old single question forms still read", () => {
    const base = { curriculum: "2014 National Curriculum", yearGroup: "Year 11", subject: "Biology" };
    expect(requestedQuestions({ ...base, questions: [{ question: " ", marks: 2 }, { question: "Q", marks: 99 }] })).toEqual([{ question: "Q", marks: 40 }]);
    expect(requestedQuestions({ ...base, question: "Old", totalMarks: 6 })).toEqual([{ question: "Old", marks: 6 }]);
    const nine = Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}`, marks: 2 }));
    expect(modelAnswerRequest({ ...base, questions: nine })).toEqual({ error: `At most ${MAX_MODEL_QUESTIONS} questions at a time` });
    expect(modelAnswerRequest({ ...base, questions: [] })).toEqual({ error: "Add at least one question" });
    expect(modelAnswerRequest({ ...base, questions: [{ question: "Q", marks: 2 }], levels: ["nonsense"] })).toEqual({ error: "Choose at least one level" });
    const ok = modelAnswerRequest({ ...base, questions: [{ question: "Q", marks: 2 }], levels: ["full", "low"] });
    expect("error" in ok).toBe(false);
    if (!("error" in ok)) {
      expect(JSON.stringify(ok.response_format)).toContain('"enum":["full","low"]');
      expect(ok.messages.map((m) => m.content).join(" ")).not.toMatch(DASHES);
    }
  });

  test("questions from an exam paper: each part with its question's context, the longer ones ticked", () => {
    const qs = paperQuestions(serializeSheet(normalizeDraft(DRAFT, sheetContext("exam", INFO))));
    expect(qs.map((q) => [q.label, q.marks, q.picked])).toEqual([["1", 2, false], ["2(a)", 2, false], ["2(b)", 6, true]]);
    expect(qs[1].question).toBe("A student measured oxygen bubbles from pondweed at different light intensities. Calculate the mean number of bubbles.");
    // A paper of only short questions still offers some.
    const short = { ...DRAFT, sections: [DRAFT.sections[0]] };
    expect(paperQuestions(serializeSheet(normalizeDraft(short, sheetContext("exam", INFO))))[0].picked).toBe(true);
    expect(paperQuestions("## markdown")).toEqual([]);
  });
});

test.describe("arranging what the model sends", () => {
  const short = (p: string) => ({ type: "short", prompt: p, lines: 2, answer: "a (1)", marks: 1 });

  test("a whole paper in one section, context as text between parts, becomes one section per question", () => {
    // The shape a live run returned on 2026-11-10.
    const collapsed = { title: "T", sections: [{ title: "Question 1", emoji: "", instructions: "", blocks: [{ type: "text", text: "Context A" }, short("Part one"), { type: "text", text: "Context B" }, short("Part two"), short("Part three")] }] };
    const doc = paper({}, collapsed);
    expect(doc.sections.map((s) => [s.title, s.instructions, s.blocks.length])).toEqual([["Question 1", "Context A", 1], ["Question 2", "Context B", 2]]);
    expect([...questionLabels(doc).values()]).toEqual(["1", "2(a)", "2(b)"]);
  });

  test("a well formed paper keeps its questions; titles are renumbered in order", () => {
    const doc = paper({}, { ...DRAFT, sections: [{ ...DRAFT.sections[1], title: "Question 7" }, DRAFT.sections[0]] });
    expect(doc.sections.map((s) => s.title)).toEqual(["Question 1", "Question 2"]);
    expect(doc.sections[0].instructions).toBe("A student measured oxygen bubbles from pondweed at different light intensities.");
  });

  test("a reading text is kept as it is and not numbered; text after the last part is dropped", () => {
    const reading = {
      title: "T",
      sections: [
        { title: "Reading text", emoji: "", instructions: "", blocks: [{ type: "passage", title: "The fox", paragraphs: ["Once upon a time."] }] },
        { title: "Q", emoji: "", instructions: "", blocks: [short("Who?"), { type: "text", text: "Stray note" }] },
      ],
    };
    const doc = paper({ examStyle: "ks2-reading", subject: "" }, reading);
    expect(doc.sections.map((s) => s.title)).toEqual(["Reading text", "Question 1"]);
    expect(doc.sections[1].blocks).toHaveLength(1);
  });
});

/** A typed reference so an unused import does not hide a broken type. */
export type _Doc = SheetDoc;
