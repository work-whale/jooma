import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { assemblyRequest } from "@/app/lib/assembly-prompt";
import { behaviourRequest } from "@/app/lib/behaviour-prompt";
import { comprehensionMessages } from "@/app/lib/comprehension-prompt";
import { coverRequest } from "@/app/lib/cover-prompt";
import { ectReportRequest } from "@/app/lib/ect-report-prompt";
import { examRequest } from "@/app/lib/exam-prompt";
import { eyfsActionPlanRequest } from "@/app/lib/eyfs-action-plan-prompt";
import { eyfsRequest } from "@/app/lib/eyfs-prompt";
import { homeworkRequest } from "@/app/lib/homework-prompt";
import { inspectionPrepRequest } from "@/app/lib/inspection-prep-prompt";
import { interventionRequest } from "@/app/lib/intervention-prompt";
import { learningWalkRequest } from "@/app/lib/learning-walk-prompt";
import { lessonObservationRequest } from "@/app/lib/lesson-observation-prompt";
import { lessonRequest } from "@/app/lib/lesson-prompt";
import { letterRequest } from "@/app/lib/letter-prompt";
import { meetingRequest } from "@/app/lib/meeting-planner-prompt";
import { modelAnswerRequest } from "@/app/lib/model-answer-prompt";
import { modelTextRequest } from "@/app/lib/model-text-prompt";
import { newsletterRequest } from "@/app/lib/newsletter-prompt";
import { performanceManagementRequest } from "@/app/lib/performance-management-prompt";
import { phonicsRequest } from "@/app/lib/phonics-prompt";
import { policyRequest } from "@/app/lib/policy-prompt";
import { pupilPremiumRequest } from "@/app/lib/pupil-premium-prompt";
import { pupilProfileRequest } from "@/app/lib/pupil-profile-prompt";
import { riskAssessmentRequest } from "@/app/lib/risk-assessment-prompt";
import { sensoryRequest } from "@/app/lib/sensory-prompt";
import { sipRequest } from "@/app/lib/sip-prompt";
import { targetsRequest } from "@/app/lib/targets-prompt";
import { unitRequest } from "@/app/lib/unit-prompt";
import { worksheetRequest } from "@/app/lib/worksheet-prompt";
import { quizRequest } from "@/app/lib/quiz/prompt";
import { reportsRequest } from "@/app/lib/reports/prompt";
import { LANGUAGES, languageInstruction } from "@/app/lib/languages";

/*
 * Every prompt a UK teacher's request builds, frozen before other countries'
 * curricula were added.
 *
 * The curricula work adds an override for non-UK school systems. For the five
 * UK curricula it must change nothing: same messages, same response_format,
 * byte for byte, for every tool. Each curriculum-taking builder is run once per
 * UK curriculum label, exactly as the forms send it today.
 *
 * The language instructions are frozen too: the curricula work rewrites the
 * line that tells a translated prompt to keep the UK school context, and a UK
 * teacher writing in French must still get exactly the instruction they get now.
 *
 * To regenerate on purpose (a deliberate prompt change, never to make a
 * refactor pass): UPDATE_GOLDEN=1 pnpm test:unit curriculum-golden
 */

const GOLDEN = join(__dirname, "__golden__", "curriculum-requests.json");

/** The values the Curriculum dropdown sends today (app/lib/formOptions.ts). */
const UK = {
  england: "2014 National Curriculum",
  eyfs: "Early Years Foundation Stage (EYFS)",
  scotland: "Scottish Curriculum for Excellence",
  wales: "Welsh Curriculum",
  ni: "Northern Ireland Curriculum",
} as const;

type Builder = (curriculum: string) => unknown;

/** Builders that take a curriculum: run once per UK label. */
const PER_CURRICULUM: Record<string, Builder> = {
  lesson: (curriculum) => lessonRequest({ curriculum, yearGroup: "Year 4", subject: "Maths", topic: "Fractions", learningObjective: "Find equivalent fractions" }),
  worksheet: (curriculum) => worksheetRequest({ curriculum, yearGroup: "Year 5", subject: "Science", learningObjective: "Describe the life cycle of a plant" }),
  comprehension: (curriculum) => comprehensionMessages({ curriculum, yearGroup: "Year 4", textSource: "generate", topic: "Volcanoes", passageWordCount: 300, contentDomains: ["2b Retrieve and record information"], numQuestions: 5 } as never),
  cover: (curriculum) => coverRequest({ curriculum, yearGroup: "Year 8", subject: "History", topic: "The Norman Conquest", resources: "Textbooks, mini whiteboards", lessonLength: 60 } as never),
  homework: (curriculum) => homeworkRequest({ curriculum, yearGroup: "Year 6", subject: "Maths", learningObjective: "Multiply fractions", homeworkType: "Practice questions", length: "20 minutes" } as never),
  exam: (curriculum) => examRequest({ curriculum, yearGroup: "Year 10", subject: "Biology", topic: "Cell structure" } as never),
  modelAnswer: (curriculum) => modelAnswerRequest({ curriculum, yearGroup: "Year 11", subject: "English Literature", questions: [{ question: "How does Priestley present responsibility?", marks: 30 }] } as never),
  modelText: (curriculum) => modelTextRequest({ curriculum, yearGroup: "Year 4", write: "A persuasive leaflet about recycling", lengthWords: 300 } as never),
  quiz: (curriculum) => quizRequest({ action: "generate", curriculum, yearGroup: "Year 7", subject: "Geography", topic: "Rivers", numQuestions: 5 } as never),
  unitTopicMap: (curriculum) => unitRequest("topicMap", { curriculum, yearGroup: "Year 3", subject: "Science", topic: "Rocks and soils", numLessons: 6 } as never),
  unitTermPlan: (curriculum) => unitRequest("termPlan", { curriculum, yearGroup: "Year 9", subject: "Geography", topic: "Tectonics", numLessons: 8 } as never),
  intervention: (curriculum) => interventionRequest({ curriculum, yearGroup: "Year 5", subject: "Reading", attitudinalData: "Low confidence when reading aloud" } as never),
  targets: (curriculum) => targetsRequest({ curriculum, yearGroup: "Year 3", targets: "Read tricky words", named: false } as never),
  sensory: (curriculum) => sensoryRequest({ curriculum, yearGroup: "Year 2", subject: "Science", topic: "Materials" } as never),
  riskAssessment: (curriculum) => riskAssessmentRequest({ curriculum, yearGroup: "Year 4", activity: "Museum trip", offsite: true, transport: "Coach" } as never),
  phonics: (curriculum) => phonicsRequest({ curriculum, age: 5, grapheme: "ai" } as never),
  eyfs: (curriculum) => eyfsRequest({ curriculum, topic: "Minibeasts", numberOfWeeks: 2 } as never),
  eyfsActionPlan: (curriculum) => eyfsActionPlanRequest({ curriculum, objective: "Improve talk", timescale: "One term" } as never),
  ectReport: (curriculum) => ectReportRequest({ curriculum, strengths: "Clear explanations", areasForDevelopment: "Pace of lessons" } as never),
  lessonObservation: (curriculum) => lessonObservationRequest({ curriculum, strengths: "Strong questioning", areasForDevelopment: "Use of TA" } as never),
  learningWalk: (curriculum) => learningWalkRequest({ curriculum, strengths: "Calm classrooms", areasForDevelopment: "Retrieval practice" } as never),
  performanceManagement: (curriculum) => performanceManagementRequest({ curriculum, schoolType: "Primary", staffMember: "Year 4 class teacher", payScale: "M4", responsibilities: "Maths lead" } as never),
  policy: (curriculum) => policyRequest({ curriculum, policy: "Behaviour Policy", additionalRequirements: "", outputType: "full" } as never),
};

/** Builders with no curriculum field: run once. */
const ONCE: Record<string, () => unknown> = {
  assembly: () => assemblyRequest({ theme: "Kindness", stageOfSchool: "KS2", lengthMinutes: 20, reflection: "reflection" } as never),
  behaviour: () => behaviourRequest({ yearGroup: "Year 5", behaviourDescription: "Leaves seat often", behaviouralTriggers: "Transitions" } as never),
  inspectionPrep: () => inspectionPrepRequest({ inspectionBody: "ofsted" } as never),
  letter: () => letterRequest({ type: "trip", recipient: "Parents and carers", tone: "Warm", date: "2026-11-10", facts: [{ label: "Trip", value: "Natural History Museum" }] }),
  meeting: () => meetingRequest({ purpose: "Pupil progress review", participants: "Headteacher, Year 6 teachers", topics: "Reading", duration: 60 } as never),
  newsletter: () => newsletterRequest({ tone: "Warm and friendly", sections: ["Sports day results"] } as never),
  pupilPremium: () => pupilPremiumRequest({ challenges: "1. Reading\n2. Oracy", educationPhase: "Secondary" } as never),
  pupilProfile: () => pupilProfileRequest({ yearGroup: "Year 3", likes: "Lego", supportNeeds: "Visual timetable" } as never),
  reports: () => reportsRequest({ yearGroup: "Year 4", subjects: ["Maths"], pupils: [{ ref: "P1", pronouns: "they" }] } as never),
  sip: () => sipRequest({ schoolType: "Primary", areasToImprove: "1. Reading fluency", planTimeframe: 1 } as never),
};

function snapshot() {
  const out: Record<string, unknown> = {};
  for (const [name, build] of Object.entries(PER_CURRICULUM)) {
    for (const [nation, label] of Object.entries(UK)) out[`${name}:${nation}`] = build(label);
  }
  for (const [name, build] of Object.entries(ONCE)) out[name] = build();
  for (const lang of LANGUAGES) out[`language:${lang.code}`] = languageInstruction(lang.code);
  return JSON.parse(JSON.stringify(out));
}

test("every UK prompt is unchanged", () => {
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
    if (key.startsWith("language:")) continue;
    expect((value as { error?: string }).error, key).toBeUndefined();
  }
});
