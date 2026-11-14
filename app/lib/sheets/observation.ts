// Observation reports as sheets: a lesson observation, and a learning walk
// across several classes.
//
// Both are developmental, never graded (Ofsted stopped grading individual
// lessons and schools have followed). The model writes the evidence:
// strengths, areas for development and recommendations, from the observer's
// notes (app/lib/lesson-observation-prompt.ts,
// app/lib/learning-walk-prompt.ts). Code builds the details, the observed
// teacher's response box and the sign-off, which are for people to fill in.
//
// A lesson observation may name the teacher and the observer: the names stay
// in the browser and on the saved document (doc.staff), and the text holds
// "[TEACHER]" and "[OBSERVER]". A learning walk names nobody: staff named by
// title in the notes are scrubbed before sending (scrubStaffTitles).
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionTable, actionRows, detailsTable, type ActionColumn } from "./action-plan";
import { responseBox, signOffTable } from "./signoff";
import { riskDate } from "./risk";
import { TEACHER_PLACEHOLDER, OBSERVER_PLACEHOLDER } from "@/app/lib/staff-privacy";

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

const section = (role: string, title: string, blocks: Raw[], instructions = ""): Raw => ({ role, title, emoji: "", instructions, blocks });

const STRENGTH_COLUMNS: ActionColumn[] = [
  { key: "title", label: "Strength" },
  { key: "evidence", label: "What was seen" },
];
const AREA_COLUMNS: ActionColumn[] = [
  { key: "title", label: "Area for development" },
  { key: "evidence", label: "What was seen" },
  { key: "impact", label: "Impact on pupils" },
];

/** "Cold call: Use no hands up." for each recommendation with a title or a how. */
function recommendationItems(raw: unknown): string[] {
  return arr(raw)
    .map((r) => {
      const o = obj(r);
      const title = str(o.title);
      const how = str(o.how);
      return title && how ? `${title}: ${how}` : title || how;
    })
    .filter(Boolean);
}

const list = (title: string, items: string[]): Raw => ({ type: "list", title, style: "bullet", items });

/** The strengths, areas and recommendations sections the two reports share. */
function evidenceSections(r: Raw): Raw[] {
  const strengths = actionTable(r.strengths, STRENGTH_COLUMNS);
  const areas = actionTable(r.areas, AREA_COLUMNS);
  const recs = recommendationItems(r.recommendations);
  return [
    ...(strengths ? [section("strengths", "Strengths", [strengths])] : []),
    ...(areas ? [section("areas", "Areas for development", [areas])] : []),
    ...(recs.length ? [section("recommendations", "Recommendations", [list("", recs)])] : []),
  ];
}

// ── Lesson observation ─────────────────────────────────────────────────────

export const LESSON_OBS_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "followUp", label: "Follow-up support" },
  { id: "response", label: "Teacher's response" },
  { id: "signoff", label: "Sign-off" },
];

export interface LessonObservationInfo {
  date?: string;
  yearGroup?: string;
  subject?: string;
  learningObjective?: string;
  focus?: string;
  /** Whether the form had each name (the names are in doc.staff). */
  teacherNamed?: boolean;
  observerNamed?: boolean;
}

const ACTION_COLUMNS: ActionColumn[] = [
  { key: "target", label: "Target" },
  { key: "actions", label: "Actions" },
  { key: "support", label: "Support" },
  { key: "byWhen", label: "By when" },
  { key: "review", label: "Review", blank: true },
];

/** The model's report (complete or mid-stream) as a generic sheet draft. */
export function arrangeLessonObservation(raw: unknown, info: LessonObservationInfo = {}): Raw {
  const r = obj(undash(raw));
  const teacher = info.teacherNamed ? TEACHER_PLACEHOLDER : "";
  const observer = info.observerNamed ? OBSERVER_PLACEHOLDER : "";
  const context = str(r.context);
  const evidence = evidenceSections(r);
  const plan = actionTable(r.actionPlan, ACTION_COLUMNS);
  const followUp = strs(r.followUp);

  const details: [string, string][] = [
    ["Date", riskDate(info.date ?? "")],
    ["Class", info.yearGroup?.trim() ?? ""],
    ["Subject", info.subject?.trim() ?? ""],
    ["Learning objective", info.learningObjective?.trim() ?? ""],
    ...(info.focus?.trim() ? [["Focus", info.focus.trim()] as [string, string]] : []),
    ["Teacher observed", teacher],
    ["Observer", observer],
  ];

  const sections: Raw[] = [
    section("details", "", [detailsTable(details)]),
    ...(context ? [section("context", "Lesson context", [{ type: "text", text: context }])] : []),
    ...evidence,
    ...(plan ? [section("actionPlan", "Action plan", [plan], "Agreed with the teacher. Fill in the review at the follow-up.")] : []),
    ...(followUp.length ? [section("followUp", "Follow-up support", [list("", followUp)])] : []),
    ...(evidence.length
      ? [
          section("response", "", [responseBox("Teacher's response")]),
          section("signoff", "Sign-off", [signOffTable([["Observer", observer], ["Teacher", teacher]])!], "Developmental feedback: this observation is not graded."),
        ]
      : []),
  ];

  const subject = info.subject?.trim();
  return {
    title: teacher ? `Lesson observation: ${teacher}` : subject ? `Lesson observation: ${subject}` : "Lesson observation",
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}

// ── Learning walk ──────────────────────────────────────────────────────────

export const LEARNING_WALK_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "response", label: "Response" },
  { id: "signoff", label: "Sign-off" },
];

export type WalkPicture = "positive" | "mixed" | "concerning";
const PICTURES: Record<WalkPicture, string> = { positive: "Positive", mixed: "Mixed", concerning: "Concerning" };

export interface LearningWalkInfo {
  date?: string;
  classesVisited?: string;
  focus?: string;
}

/** Next steps grouped by when they happen, in this order. */
export const WALK_WHEN: { id: string; label: string }[] = [
  { id: "immediate", label: "Within two weeks" },
  { id: "halfTerm", label: "By the end of this half term" },
  { id: "term", label: "By the end of the term" },
];

const NEXT_COLUMNS: ActionColumn[] = [
  { key: "action", label: "Action" },
  { key: "leadRole", label: "Led by" },
  { key: "done", label: "Done", blank: true },
];

/** One table of next steps, grouped Immediate, Half term, Term; a step with an
 *  unknown `when` goes in the last group. Null when there are none. */
export function nextStepsTable(raw: unknown): Raw | null {
  const items = arr(raw).map(obj);
  const rows: string[][] = [];
  for (const [gi, g] of WALK_WHEN.entries()) {
    const inGroup = items.filter((i) => {
      const w = str(i.when);
      const known = WALK_WHEN.some((x) => x.id === w);
      return w === g.id || (!known && gi === WALK_WHEN.length - 1);
    });
    for (const row of actionRows(inGroup, NEXT_COLUMNS)) rows.push([g.label, ...row]);
  }
  return rows.length ? { type: "table", headers: ["When", ...NEXT_COLUMNS.map((c) => c.label)], rows } : null;
}

/** The model's report (complete or mid-stream) as a generic sheet draft. */
export function arrangeLearningWalk(raw: unknown, info: LearningWalkInfo = {}): Raw {
  const r = obj(undash(raw));
  const summary = str(r.summary);
  const picture = PICTURES[str(r.overall) as WalkPicture] ?? "";
  const evidence = evidenceSections(r);
  const next = nextStepsTable(r.nextSteps);

  const sections: Raw[] = [
    section("details", "", [detailsTable([["Date", riskDate(info.date ?? "")], ["Classes visited", info.classesVisited?.trim() ?? ""], ["Focus", info.focus?.trim() ?? ""], ["Carried out by", ""]])]),
    ...(summary || picture
      ? [section("summary", "Summary", [...(picture ? [detailsTable([["Overall picture", picture]])] : []), ...(summary ? [{ type: "text", text: summary }] : [])])]
      : []),
    ...evidence,
    ...(next ? [section("nextSteps", "Next steps", [next])] : []),
    ...(evidence.length
      ? [
          section("response", "", [responseBox("Response from the team")]),
          section("signoff", "Sign-off", [signOffTable([["Carried out by"], ["Subject or phase lead"]])!], "Developmental: no lesson or teacher is graded."),
        ]
      : []),
  ];

  const focus = info.focus?.trim();
  return {
    title: focus ? `Learning walk: ${focus}` : "Learning walk",
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}
