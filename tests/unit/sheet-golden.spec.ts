import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { worksheetRequest, type WorksheetRequest } from "@/app/lib/worksheet-prompt";
import { comprehensionMessages, type GenerateRequest } from "@/app/lib/comprehension-prompt";
import { joSheetResponseFormat } from "@/app/lib/jo/sheet-schema";

/*
 * The Worksheet and Comprehension requests, frozen.
 *
 * The sheet system is being generalised into a per-tool registry so that more
 * tools (lesson plans, exam papers, model answers, letters) can produce sheets.
 * That refactor must not change a byte of what these two shipped tools send to
 * the model: same messages, same response_format, same Jo edit schema. This
 * test compares every one of them against a snapshot taken before the refactor.
 *
 * To regenerate on purpose (a deliberate prompt change, never to make a
 * refactor pass): UPDATE_GOLDEN=1 pnpm test:unit sheet-golden
 */

const GOLDEN = join(__dirname, "__golden__", "sheet-requests.json");

const worksheetCases: Record<string, WorksheetRequest> = {
  plain: { curriculum: "English National Curriculum", yearGroup: "Year 5", subject: "Maths", learningObjective: "Add fractions with the same denominator" },
  ticked: {
    curriculum: "English National Curriculum", yearGroup: "Year 3", subject: "Science", learningObjective: "Name the parts of a plant",
    questionTypes: ["Multiple Choice", "Labeling", "Word Search", "Crossword", "Sorting / Categorising"], questionCount: 8, outputDetail: "detailed",
  },
  band: {
    curriculum: "English National Curriculum", yearGroup: "Year 6", subject: "English", learningObjective: "Use relative clauses",
    differentiate: "yes", differentiationLevels: ["WTS", "EXS", "GDS"], band: "WTS", additionalInfo: "Mixed ability class",
  },
  pictures: { curriculum: "English National Curriculum", yearGroup: "Year 1", subject: "Science", learningObjective: "Name farm animals", pictures: { source: "web" }, template: "vocab-match" },
};

const comprehensionCases: Record<string, GenerateRequest> = {
  generate: {
    curriculum: "English National Curriculum", yearGroup: "Year 4", textSource: "generate", topic: "Volcanoes", passageWordCount: 300,
    contentDomains: ["2b Retrieve and record information", "2d Make inferences"], numQuestions: 6, complexity: "Standard", includeAnswerKey: true,
  },
  own: {
    curriculum: "English National Curriculum", yearGroup: "Year 6", textSource: "own", ownText: "The fox crept through the frost. It was hungry.",
    contentDomains: ["2a Give the meaning of words in context"], questionTypes: ["Vocabulary in context", "Multiple choice"], numQuestions: 4,
  },
  band: {
    curriculum: "English National Curriculum", yearGroup: "Year 2", textSource: "generate", topic: "Seasons", contentDomains: ["1b Retrieve"],
    numQuestions: 5, differentiate: "yes", differentiationLevels: ["WTS", "GDS"], band: "GDS", pictures: { source: "ai" },
  },
};

function snapshot() {
  const out: Record<string, unknown> = {};
  for (const [name, body] of Object.entries(worksheetCases)) out[`worksheet:${name}`] = worksheetRequest(body);
  for (const [name, body] of Object.entries(comprehensionCases)) out[`comprehension:${name}`] = comprehensionMessages(body);
  out["jo:worksheet"] = joSheetResponseFormat("worksheet");
  out["jo:comprehension"] = joSheetResponseFormat("comprehension");
  return JSON.parse(JSON.stringify(out));
}

test("worksheet and comprehension requests are unchanged", () => {
  const now = snapshot();
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(GOLDEN)) {
    mkdirSync(join(__dirname, "__golden__"), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + "\n");
  }
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  expect(Object.keys(now).sort()).toEqual(Object.keys(golden).sort());
  for (const key of Object.keys(golden)) expect(now[key], key).toEqual(golden[key]);
});

test("no case was refused, so every snapshot holds a real request", () => {
  for (const [key, value] of Object.entries(snapshot())) {
    expect((value as { error?: string }).error, key).toBeUndefined();
  }
});
