import { test, expect } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { admin, createTeacher, deleteTeacher, setPlan, signIn } from "../support/users";

/*
 * Measures what each tool really costs on STAGING, for the "usually needs
 * about N" figures in app/lib/tool-estimates.ts. Skipped unless
 * MEASURE_COSTS=1 (it spends real model money: a few pounds in all).
 *
 * Each tool gets its own throwaway Pro teacher and RUNS real generations from
 * the same request body its form sends (the bodies in
 * tests/unit/curriculum-golden.spec.ts, England). Each run's cost is the
 * change in that teacher's token_usage plus asset_cost for the tool, turned
 * into resources the way charging does (USD at 0.79, 0.15p a resource).
 *
 * Staging's tool_settings (model, effort, verbosity) matched production when
 * this was written; re-diff them before trusting a new measurement.
 *
 * Results append to docs/tool-costs/tool-costs.jsonl, one line per tool.
 *
 *   MEASURE_COSTS=1 npx playwright test tests/tools/measure-tool-costs --workers=6
 *   MEASURE_COSTS=1 ONLY=quiz-generator,letter-writer npx playwright test ...
 *
 * Slides is not here: a deck is a client-side pipeline of several routes, and
 * production already has 162 decks behind its figure.
 */

const RUNS = Number(process.env.RUNS ?? 5);
// Outside test-results: Playwright empties that folder at the start of every run.
const OUT = join(process.cwd(), "docs", "tool-costs", "tool-costs.jsonl");
const ENGLAND = "2014 National Curriculum";
const c = ENGLAND;

/** A class of 30 for Reports, sent the way the page sends it: chunks of five. */
const CLASS = Array.from({ length: 30 }, (_, i) => ({
  ref: `P${i + 1}`,
  pronouns: (["she", "he", "they"] as const)[i % 3],
  attainment: { Maths: ["Working towards", "Expected", "Greater depth"][i % 3], English: "Expected" },
  effort: ["Good", "Excellent", "Inconsistent"][i % 3],
  note: ["Loves times tables", "Quiet in group work", "Big improvement in reading", ""][i % 4],
  nextStep: "",
}));
const reportChunks = Array.from({ length: 6 }, (_, k) => ({
  yearGroup: "Year 4",
  subjects: ["Maths", "English"],
  tone: "warm",
  nextSteps: true,
  pupils: CLASS.slice(k * 5, k * 5 + 5),
  chunkIndex: k,
}));

/** One run = one or more requests to the tool's route (Reports sends six). */
const TOOLS: Record<string, unknown[]> = {
  "lesson-planner": [{ curriculum: c, yearGroup: "Year 4", subject: "Maths", topic: "Fractions", learningObjective: "Find equivalent fractions" }],
  "worksheet-generator": [{ curriculum: c, yearGroup: "Year 5", subject: "Science", learningObjective: "Describe the life cycle of a plant" }],
  "comprehension-generator": [{ curriculum: c, yearGroup: "Year 4", textSource: "generate", topic: "Volcanoes", passageWordCount: 300, contentDomains: ["2b Retrieve and record information"], numQuestions: 5 }],
  "cover-lesson": [{ curriculum: c, yearGroup: "Year 8", subject: "History", topic: "The Norman Conquest", resources: "Textbooks, mini whiteboards", lessonLength: 60 }],
  "homework-generator": [{ curriculum: c, yearGroup: "Year 6", subject: "Maths", learningObjective: "Multiply fractions", homeworkType: "Practice questions", length: "20 minutes" }],
  "exam-question-generator": [{ curriculum: c, yearGroup: "Year 10", subject: "Biology", topic: "Cell structure" }],
  "model-answer-generator": [{ curriculum: c, yearGroup: "Year 11", subject: "English Literature", questions: [{ question: "How does Priestley present responsibility?", marks: 30 }] }],
  "model-text-generator": [{ curriculum: c, yearGroup: "Year 4", write: "A persuasive leaflet about recycling", lengthWords: 300 }],
  "quiz-generator": [{ action: "generate", curriculum: c, yearGroup: "Year 7", subject: "Geography", topic: "Rivers", numQuestions: 5 }],
  "topic-overview": [{ curriculum: c, yearGroup: "Year 3", subject: "Science", topic: "Rocks and soils", numLessons: 6 }],
  "medium-term-planner": [{ curriculum: c, yearGroup: "Year 9", subject: "Geography", topic: "Tectonics", numLessons: 8 }],
  "targeted-intervention": [{ curriculum: c, yearGroup: "Year 5", subject: "Reading", attitudinalData: "Low confidence when reading aloud" }],
  "smart-targets": [{ curriculum: c, yearGroup: "Year 3", targets: "Read tricky words", named: false }],
  "sensory-activities": [{ curriculum: c, yearGroup: "Year 2", subject: "Science", topic: "Materials" }],
  "risk-assessment": [{ curriculum: c, yearGroup: "Year 4", activity: "Museum trip", offsite: true, transport: "Coach" }],
  "phonics-support": [{ curriculum: c, age: 5, grapheme: "ai" }],
  "eyfs-planner": [{ curriculum: c, topic: "Minibeasts", numberOfWeeks: 2 }],
  "eyfs-action-plan": [{ curriculum: c, objective: "Improve talk", timescale: "One term" }],
  "ect-report-writer": [{ curriculum: c, strengths: "Clear explanations", areasForDevelopment: "Pace of lessons" }],
  "lesson-observation-report": [{ curriculum: c, strengths: "Strong questioning", areasForDevelopment: "Use of TA" }],
  "learning-walk-report": [{ curriculum: c, strengths: "Calm classrooms", areasForDevelopment: "Retrieval practice" }],
  "performance-management": [{ curriculum: c, schoolType: "Primary", staffMember: "Year 4 class teacher", payScale: "M4", responsibilities: "Maths lead" }],
  "policy-generator": [{ curriculum: c, policy: "Behaviour Policy", additionalRequirements: "", outputType: "full" }],
  "assembly-planner": [{ theme: "Kindness", stageOfSchool: "KS2", lengthMinutes: 20, reflection: "reflection" }],
  "behaviour-support-plan": [{ yearGroup: "Year 5", behaviourDescription: "Leaves seat often", behaviouralTriggers: "Transitions" }],
  "inspection-prep": [{ inspectionBody: "ofsted" }],
  "letter-writer": [{ type: "trip", recipient: "Parents and carers", tone: "Warm", date: "2026-11-10", facts: [{ label: "Trip", value: "Natural History Museum" }] }],
  "meeting-planner": [{ purpose: "Pupil progress review", participants: "Headteacher, Year 6 teachers", topics: "Reading", duration: 60 }],
  "newsletter-writer": [{ tone: "Warm and friendly", sections: ["Sports day results"] }],
  "pupil-premium-planner": [{ challenges: "1. Reading\n2. Oracy", educationPhase: "Secondary" }],
  "one-page-profile": [{ yearGroup: "Year 3", likes: "Lego", supportNeeds: "Visual timetable" }],
  "school-improvement-plan": [{ schoolType: "Primary", areasToImprove: "1. Reading fluency", planTimeframe: 1 }],
  "report-writer": reportChunks,
};

const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
const slugs = Object.keys(TOOLS).filter((s) => only.length === 0 || only.includes(s));

async function spentUsd(userId: string, slug: string): Promise<{ usd: number; rows: number }> {
  const [t, a] = await Promise.all([
    admin.from("token_usage").select("cost_usd").eq("user_id", userId).eq("tool_slug", slug),
    admin.from("asset_cost").select("cost_usd").eq("user_id", userId).eq("tool_slug", slug),
  ]);
  const rows = [...(t.data ?? []), ...(a.data ?? [])];
  return { usd: rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0), rows: rows.length };
}

/** Usage is logged as the stream ends; wait for the rows to stop changing. */
async function settled(userId: string, slug: string, minRows: number) {
  let last = await spentUsd(userId, slug);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = await spentUsd(userId, slug);
    if (now.rows >= minRows && now.rows === last.rows && now.usd === last.usd) return now;
    last = now;
  }
  return last;
}

const resources = (usd: number) => Math.round(((usd * 79) / 0.15) * 10) / 10;

test.describe.configure({ mode: "parallel" });
test.setTimeout(45 * 60_000);

for (const slug of slugs) {
  test(`cost of ${slug}`, async ({ page }) => {
    test.skip(process.env.MEASURE_COSTS !== "1", "Spends real model money: set MEASURE_COSTS=1.");
    const teacher = await createTeacher("Costs");
    try {
      await setPlan(teacher, "pro", "comped");
      await signIn(page, teacher);
      const perRun: number[] = [];
      const failures: string[] = [];
      let before = await spentUsd(teacher.id, slug);
      for (let run = 0; run < RUNS; run++) {
        for (const body of TOOLS[slug]) {
          const res = await page.request.post(`/api/${slug}`, { data: body, timeout: 600_000 });
          const text = await res.text();
          if (!res.ok()) failures.push(`run ${run + 1}: ${res.status()} ${text.slice(0, 200)}`);
        }
        const after = await settled(teacher.id, slug, before.rows + 1);
        perRun.push(resources(after.usd - before.usd));
        before = after;
      }
      const sorted = [...perRun].sort((x, y) => x - y);
      const result = {
        slug,
        runs: perRun,
        median: sorted[Math.floor(sorted.length / 2)],
        mean: Math.round((perRun.reduce((s, x) => s + x, 0) / perRun.length) * 10) / 10,
        failures,
        at: new Date().toISOString(),
      };
      mkdirSync(join(process.cwd(), "docs", "tool-costs"), { recursive: true });
      appendFileSync(OUT, JSON.stringify(result) + "\n");
      console.log(JSON.stringify(result));
      expect(failures, slug).toEqual([]);
    } finally {
      await deleteTeacher(teacher);
    }
  });
}
