export interface Tool {
  href: string;
  icon: string;
  label: string;
  description: string;
  tag: string;
}

// ── Jooma V2 naming ──────────────────────────────────────────────────────────
//
// V2 renames every tool to the shortest thing a teacher would actually say:
// "Slideshow Generator" becomes "Slides", "Worksheet Generator" becomes
// "Worksheets". The old names are NOT deleted — they stay on `Tool.label`
// (which the signed-in app still renders) and are repeated in `synonyms` so
// search keeps matching them. Someone arriving from Google on "worksheet
// generator" has to land on Worksheets, and that is expected to stay true for
// at least a year.
//
// This lives beside TOOLS rather than inside it so the 35 entries above keep
// exactly the shape the dashboard already reads.

/** The seven V2 tool categories. Colour tells you the kind of job. */
export const V2_CATEGORIES = [
  { id: "slides", name: "Slides", solid: "#5B2ED6" },
  { id: "planning", name: "Planning", solid: "#1D6FD0" },
  { id: "resources", name: "Classroom resources", solid: "#0F8A63" },
  { id: "assessment", name: "Assessment", solid: "#0E7490" },
  { id: "send", name: "Behaviour and SEND", solid: "#C2551F" },
  { id: "communication", name: "Communication", solid: "#C43D6B" },
  { id: "leadership", name: "Leadership", solid: "#4A4458" },
] as const;

export type V2CategoryId = (typeof V2_CATEGORIES)[number]["id"];

export interface V2Meta {
  /** Short display name, e.g. "Slides". */
  name: string;
  /** One line, sentence case, no trailing detail. */
  description: string;
  category: V2CategoryId;
  /** Phosphor icon name, rendered fill-weight inside a squircle tile. */
  icon: string;
}

/**
 * V2 metadata by `href`, so it cannot drift from the routes that actually
 * exist. Keyed rather than positional: adding or reordering TOOLS above will
 * not silently shift a name onto the wrong tool.
 */
export const V2_META: Record<string, V2Meta> = {
  // Slides
  "/tools/slideshow": {
    name: "Slides",
    description: "A full teaching deck you can edit, present and export.",
    category: "slides",
    icon: "presentation-chart",
  },
  "/tools/cpd-slideshow": {
    name: "Staff Slides",
    description: "A training deck for staff, with activities and next steps.",
    category: "slides",
    icon: "projector-screen",
  },

  // Planning
  "/tools/lesson-planner": {
    name: "Lesson Plan",
    description: "A full lesson from a topic and objective.",
    category: "planning",
    icon: "notebook",
  },
  "/tools/medium-term-planner": {
    name: "Term Plan",
    description: "Lesson by lesson across a whole topic.",
    category: "planning",
    icon: "calendar-blank",
  },
  "/tools/topic-overview": {
    name: "Topic Map",
    description: "The shape of a topic, with lesson summaries.",
    category: "planning",
    icon: "map-trifold",
  },
  "/tools/eyfs-planner": {
    name: "Early Years Plan",
    description: "All seven areas, indoors and out.",
    category: "planning",
    icon: "blueprint",
  },
  "/tools/cover-lesson": {
    name: "Cover Lesson",
    description: "Self contained, any non specialist can teach it.",
    category: "planning",
    icon: "user-switch",
  },
  "/tools/homework-generator": {
    name: "Homework",
    description: "A follow up task tied to the objective.",
    category: "planning",
    icon: "house-line",
  },

  // Classroom resources
  "/tools/worksheet-generator": {
    name: "Worksheets",
    description: "Differentiated three ways, with the answers.",
    category: "resources",
    icon: "file-text",
  },
  "/tools/comprehension-generator": {
    name: "Comprehension",
    description: "An original text at any reading age.",
    category: "resources",
    icon: "book-open-text",
  },
  "/tools/model-text-generator": {
    name: "Model Texts",
    description: "Exemplar writing with the features you name.",
    category: "resources",
    icon: "pen-nib",
  },
  "/tools/phonics-support": {
    name: "Phonics",
    description: "Word banks, decodable texts and pseudo words.",
    category: "resources",
    icon: "text-aa",
  },
  "/tools/sensory-activities": {
    name: "Sensory Ideas",
    description: "Five multisensory activities for any topic.",
    category: "resources",
    icon: "hand-palm",
  },

  // Assessment
  "/tools/quiz-generator": {
    name: "Quizzes",
    description: "Retrieval practice, ready to export.",
    category: "assessment",
    icon: "check-square-offset",
  },
  "/tools/exam-question-generator": {
    name: "Exam Papers",
    description: "A full paper for any board and tier.",
    category: "assessment",
    icon: "exam",
  },
  "/tools/model-answer-generator": {
    name: "Model Answers",
    description: "Worked answers at every mark band.",
    category: "assessment",
    icon: "certificate",
  },
  "/tools/report-writer": {
    name: "Reports",
    description: "Pupil reports from a few quick notes.",
    category: "assessment",
    icon: "scroll",
  },
  "/tools/smart-targets": {
    name: "Targets",
    description: "Raw targets turned into a proper table.",
    category: "assessment",
    icon: "target",
  },
  "/tools/ect-report-writer": {
    name: "ECT Reports",
    description: "Evidence against the Teacher Standards.",
    category: "assessment",
    icon: "student",
  },

  // Behaviour and SEND
  "/tools/behaviour-support-plan": {
    name: "Behaviour Plan",
    description: "Triggers, strategies and de escalation steps.",
    category: "send",
    icon: "shield-check",
  },
  "/tools/one-page-profile": {
    name: "Pupil Profile",
    description: "A one page profile in the pupil's own voice.",
    category: "send",
    icon: "identification-card",
  },
  "/tools/targeted-intervention": {
    name: "Interventions",
    description: "Evidence based strategies to close a gap.",
    category: "send",
    icon: "chart-line-up",
  },
  "/tools/pupil-premium-planner": {
    name: "Pupil Premium Plan",
    description: "Tier 1, 2 and 3 strategies with rationale.",
    category: "send",
    icon: "coins",
  },
  "/tools/risk-assessment": {
    name: "Risk Assessment",
    description: "Hazards, likelihood and controls for any trip.",
    category: "send",
    icon: "warning",
  },

  // Communication
  "/tools/letter-writer": {
    name: "Letters",
    description: "Parents, staff or governors, in your tone.",
    category: "communication",
    icon: "envelope-simple",
  },
  "/tools/newsletter-writer": {
    name: "Newsletter",
    description: "A full newsletter, section by section.",
    category: "communication",
    icon: "newspaper",
  },
  "/tools/assembly-planner": {
    name: "Assembly",
    description: "A timed script with reflection points.",
    category: "communication",
    icon: "megaphone",
  },
  "/tools/meeting-planner": {
    name: "Meeting Agenda",
    description: "A timed agenda and facilitation guide.",
    category: "communication",
    icon: "users-three",
  },

  // Leadership
  "/tools/inspection-prep": {
    name: "Inspection Prep",
    description: "The questions you will be asked, and answers.",
    category: "leadership",
    icon: "magnifying-glass",
  },
  "/tools/school-improvement-plan": {
    name: "Improvement Plan",
    description: "Objectives, actions, owners and timelines.",
    category: "leadership",
    icon: "chart-bar",
  },
  "/tools/learning-walk-report": {
    name: "Learning Walk",
    description: "A professional write up from your notes.",
    category: "leadership",
    icon: "footprints",
  },
  "/tools/lesson-observation-report": {
    name: "Observation",
    description: "A formal report with agreed next steps.",
    category: "leadership",
    icon: "eye",
  },
  "/tools/performance-management": {
    name: "Appraisal Targets",
    description: "Structured targets for any staff role.",
    category: "leadership",
    icon: "medal",
  },
  "/tools/policy-generator": {
    name: "Policies",
    description: "A whole policy or a single section.",
    category: "leadership",
    icon: "gavel",
  },
  "/tools/eyfs-action-plan": {
    name: "Early Years Actions",
    description: "A four phase plan for any improvement aim.",
    category: "leadership",
    icon: "clipboard-text",
  },
};

/** A tool joined to its V2 name, description, category and icon. */
export interface V2Tool extends Tool, V2Meta {
  /** Old names, kept matchable so existing search terms still resolve. */
  synonyms: string[];
}

/**
 * The 35 tools grouped into the seven V2 categories, in the order the
 * categories are declared. A tool with no V2 entry is dropped rather than
 * rendered half-named, which makes a missing mapping visible immediately
 * instead of shipping a blank tile.
 */
export function v2ToolsByCategory(): {
  id: V2CategoryId;
  name: string;
  solid: string;
  tools: V2Tool[];
}[] {
  return V2_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    solid: category.solid,
    tools: V2_TOOLS.filter((t) => t.category === category.id),
  }));
}

// V2_TOOLS and the lookups derived from it are declared BELOW the TOOLS array
// they read, because `const` is not hoisted: evaluating them here would throw
// on import.

export const TOOLS: Tool[] = [
  {
    href: "/tools/comprehension-generator",
    icon: "comprehension",
    label: "Comprehension Generator",
    description: "Create bespoke reading comprehension activities tailored to your students.",
    tag: "Literacy",
  },
  {
    href: "/tools/lesson-planner",
    icon: "planner",
    label: "Lesson Planner",
    description: "Draft structured lesson plans from a topic and learning objective in seconds.",
    tag: "Planning",
  },
  {
    href: "/tools/slideshow",
    icon: "presentation",
    label: "Slideshow Generator",
    description: "Create a presentation from scratch with text, shapes, and images. Export to PowerPoint.",
    tag: "Planning",
  },
  {
    href: "/tools/worksheet-generator",
    icon: "worksheet",
    label: "Worksheet Generator",
    description: "Create bespoke worksheets tailored to your year group, subject and learning objective.",
    tag: "Assessment",
  },
  {
    href: "/tools/topic-overview",
    icon: "topic",
    label: "Topic Overview",
    description: "Generate a structured topic overview with lesson summaries aligned to your curriculum.",
    tag: "Planning",
  },
  {
    href: "/tools/medium-term-planner",
    icon: "medium-term",
    label: "Medium Term Topic Planner",
    description: "Build a full lesson-by-lesson medium term plan with objectives and key knowledge for any topic.",
    tag: "Planning",
  },
  {
    href: "/tools/eyfs-planner",
    icon: "eyfs",
    label: "EYFS Planner",
    description: "Generate a full Early Years plan covering all 7 EYFS learning areas with indoor, outdoor, and adult-led activities.",
    tag: "Early Years",
  },
  {
    href: "/tools/model-text-generator",
    icon: "model-text",
    label: "Model Text Generator",
    description: "Generate model texts with specific writing features, tailored to your year group and topic.",
    tag: "Literacy",
  },
  {
    href: "/tools/sensory-activities",
    icon: "sensory",
    label: "Sensory Activities",
    description: "Generate 5 multisensory activity ideas for any topic, with resources, adaptations and cross-curricular links.",
    tag: "SEND",
  },
  {
    href: "/tools/phonics-support",
    icon: "phonics",
    label: "Phonics Support",
    description: "Generate word banks, decodable texts, pseudo-words, and teaching activities for any target phoneme.",
    tag: "Literacy",
  },
  {
    href: "/tools/exam-question-generator",
    icon: "exam",
    label: "Exam Question Generator",
    description: "Generate a complete examination paper for any subject, topic, and exam type — with questions scaled by marks and an optional mark scheme.",
    tag: "Assessment",
  },
  {
    href: "/tools/model-answer-generator",
    icon: "model-answer",
    label: "Model Answer Generator",
    description: "Generate model answers for exam-style questions worth varying marks, with teacher notes and assessment criteria.",
    tag: "Assessment",
  },
  {
    href: "/tools/quiz-generator",
    icon: "quiz",
    label: "Quiz Generator",
    description: "Generate a fully editable multiple choice quiz on any topic, then export to Kahoot, Blooket, Gimkit, and more.",
    tag: "Assessment",
  },
  {
    href: "/tools/report-writer",
    icon: "report",
    label: "Report Writer",
    description: "Generate personalised pupil reports from strengths, areas for development, and targets across multiple subjects.",
    tag: "Assessment",
  },
  {
    href: "/tools/homework-generator",
    icon: "homework",
    label: "Homework Generator",
    description: "Generate a structured, differentiated homework task for any year group, subject, and learning objective — with optional answers.",
    tag: "Assessment",
  },
  {
    href: "/tools/smart-targets",
    icon: "smart-targets",
    label: "SMART Targets",
    description: "Turn raw targets into a fully structured SMART table — specific, measurable, achievable, relevant, and time-bound.",
    tag: "SEND",
  },
  {
    href: "/tools/cpd-slideshow",
    icon: "cpd-slideshow",
    label: "CPD Slideshow Generator",
    description: "Generate a professional development presentation for teachers, with slide-by-slide content, bullet points, and image suggestions.",
    tag: "Planning",
  },
  {
    href: "/tools/policy-generator",
    icon: "policy",
    label: "Policy Generator",
    description: "Draft a full school policy or a policy section structure for any area of school life, ready to customise for your setting.",
    tag: "Planning",
  },
  {
    href: "/tools/one-page-profile",
    icon: "one-page-profile",
    label: "One Page Support Profile",
    description: "Turn notes from a pupil discussion into a first-person, student-centred one page profile for use with student passports or internal guidance documents.",
    tag: "SEND",
  },
  {
    href: "/tools/risk-assessment",
    icon: "risk-assessment",
    label: "Risk Assessment",
    description: "Draft a risk assessment for any school trip or activity, with hazards, likelihood, severity, control measures, and further actions.",
    tag: "Planning",
  },
  {
    href: "/tools/behaviour-support-plan",
    icon: "behaviour-support-plan",
    label: "Individual Student Behaviour Plan",
    description: "Generate a comprehensive behaviour plan with strategies, targets, de-escalation guidance, and monitoring tools for a student with challenging behaviour.",
    tag: "SEND",
  },
  {
    href: "/tools/ect-report-writer",
    icon: "ect-report",
    label: "ECT Report Writer",
    description: "Draft evidence-based ECT assessment reports with Teacher Standards references, development plans, and recommended resources.",
    tag: "Leadership",
  },
  {
    href: "/tools/eyfs-action-plan",
    icon: "eyfs-action-plan",
    label: "EYFS Action Plan",
    description: "Generate a structured 4-phase action plan for any EYFS improvement objective, with responsibilities, monitoring, and resource requirements.",
    tag: "Early Years",
  },
  {
    href: "/tools/inspection-prep",
    icon: "inspection-prep",
    label: "Inspection Prep Questions",
    description: "Generate self-evaluation questions and preparation actions for any inspection or accreditation body, with optional evidence examples and success criteria.",
    tag: "Leadership",
  },
  {
    href: "/tools/learning-walk-report",
    icon: "learning-walk",
    label: "Learning Walk Report",
    description: "Draft a professional learning walk report from your observations, with optional recommendations and a next steps timeline.",
    tag: "Leadership",
  },
  {
    href: "/tools/lesson-observation-report",
    icon: "lesson-observation",
    label: "Lesson Observation Report",
    description: "Write up a formal lesson observation report from your notes, with optional action plan and follow-up support suggestions.",
    tag: "Leadership",
  },
  {
    href: "/tools/meeting-planner",
    icon: "meeting-planner",
    label: "Meeting Planner",
    description: "Plan a structured, productive meeting with a facilitation guide, timed agenda, discussion structure, and optional action items.",
    tag: "Leadership",
  },
  {
    href: "/tools/targeted-intervention",
    icon: "intervention",
    label: "Targeted Intervention Ideas",
    description: "Generate personalised, evidence-based intervention strategies to close the gap for individual students based on attitudinal, aptitudinal, and attainment data.",
    tag: "SEND",
  },
  {
    href: "/tools/cover-lesson",
    icon: "cover-lesson",
    label: "Cover Lesson Generator",
    description: "Generate a fully self-contained cover lesson any non-specialist can deliver — complete with a cover teacher script, timed activities, and end-of-lesson checklist.",
    tag: "Planning",
  },
  {
    href: "/tools/performance-management",
    icon: "performance-management",
    label: "Performance Management Targets",
    description: "Draft SMART performance management targets for any staff role, with objectives, success criteria, evidence, actions, timescales, and review points.",
    tag: "Leadership",
  },
  {
    href: "/tools/letter-writer",
    icon: "letter-writer",
    label: "Letter Writer",
    description: "Draft letters to parents, staff, governors, or any recipient — simply provide the key information and tone and the AI will write it for you.",
    tag: "Leadership",
  },
  {
    href: "/tools/pupil-premium-planner",
    icon: "pupil-premium",
    label: "Pupil Premium Planner",
    description: "Generate evidence-based Tier 1, 2, and 3 strategies for any Pupil Premium challenge, aligned with DfE guidance and EEF research.",
    tag: "Leadership",
  },
  {
    href: "/tools/assembly-planner",
    icon: "assembly",
    label: "Assembly Planner",
    description: "Plan a complete assembly around any theme — with a timed script, speaker notes, story, interactive element, and delivery guidance.",
    tag: "Planning",
  },
  {
    href: "/tools/newsletter-writer",
    icon: "newsletter",
    label: "Newsletter Writer",
    description: "Write a school newsletter with the tone of your choice, covering as many sections as you need — for parents, staff, or the whole community.",
    tag: "Leadership",
  },
  {
    href: "/tools/school-improvement-plan",
    icon: "sip",
    label: "School Improvement Plans",
    description: "Draft a detailed, inspection-ready SIP with objectives, action steps, timelines, budget, monitoring schedule, and risk assessment — in table or narrative format.",
    tag: "Leadership",
  },
];

/**
 * The joined tools as one flat list, in TOOLS order.
 *
 * Computed once at module scope rather than per call: several screens resolve a
 * tool by slug on every row they render, and rebuilding the join inside a loop
 * is how the same 35-entry array ends up allocated hundreds of times on one
 * page.
 *
 * A tool with no V2 entry is dropped rather than rendered half-named, which
 * makes a missing mapping visible immediately instead of shipping a blank tile.
 */
export const V2_TOOLS: V2Tool[] = TOOLS.flatMap((tool) => {
  const meta = V2_META[tool.href];
  if (!meta) return [];
  return [{ ...tool, ...meta, synonyms: [tool.label] }];
});

/** Slug ("worksheet-generator") to its joined V2 tool. */
const V2_BY_SLUG: Record<string, V2Tool> = Object.fromEntries(
  V2_TOOLS.map((tool) => [tool.href.replace("/tools/", ""), tool]),
);

/** The category's solid colour, for the tile a tool's glyph sits on. */
const CATEGORY_SOLID: Record<string, string> = Object.fromEntries(
  V2_CATEGORIES.map((c) => [c.id, c.solid]),
);

/** A neutral tile for a run whose tool no longer exists. --j-muted. */
const FALLBACK_SOLID = "#6D6683";

/**
 * Resolve a tool_runs.tool_slug to its V2 metadata.
 *
 * Returns undefined for a slug with no matching tool — a run saved by a tool
 * that has since been renamed or removed. Callers render those with a neutral
 * fallback rather than dropping the row, because it is still the teacher's
 * resource and they must be able to open and delete it.
 */
export function v2ToolForSlug(slug: string): V2Tool | undefined {
  return V2_BY_SLUG[slug];
}

/** The tile colour for a tool, or a neutral slate for an unrecognised one. */
export function toolSolid(tool: V2Tool | undefined): string {
  return tool ? (CATEGORY_SOLID[tool.category] ?? FALLBACK_SOLID) : FALLBACK_SOLID;
}

export const PINNED_HREFS: string[] = [];

// Estimated minutes saved per generation versus doing the task by hand — used
// for the dashboard "hours saved" stat. Keyed by tool slug (the `/api/<slug>`
// and `/tools/<slug>` segment, which is what `tool_runs.tool_slug` stores).
//
// Anchored to published UK/teacher-time figures where they exist, conservative
// extrapolation elsewhere (these remain ESTIMATES, not measured time):
//   - Lesson plan ~30-40 min/lesson (a 90-min lesson takes 30-40 min to plan;
//     DfE 2013 workload diary: primary ~10.6 hrs/wk on planning/prep).
//   - Pupil report ~20 min/child/comment (full narrative reports up to 1 hr+).
//   - Resource/worksheet creation: part of ~5 hrs/wk teachers spend making
//     materials.
// Sources: DfE Teachers' Workload Diary Survey 2013; NCTQ/EdSurge planning-time
// data (2024); EducationWorld resource-creation survey.
export const TOOL_MINUTES_SAVED: Record<string, number> = {
  "lesson-planner": 40,
  "medium-term-planner": 90,
  "school-improvement-plan": 90,
  "eyfs-planner": 60,
  "cpd-slideshow": 60,
  "policy-generator": 60,
  "exam-question-generator": 45,
  "behaviour-support-plan": 45,
  "ect-report-writer": 45,
  "eyfs-action-plan": 45,
  "pupil-premium-planner": 45,
  "comprehension-generator": 40,
  "cover-lesson": 40,
  "risk-assessment": 40,
  "inspection-prep": 40,
  "worksheet-generator": 30,
  "topic-overview": 30,
  "model-answer-generator": 30,
  "targeted-intervention": 30,
  "quiz-generator": 30,
  "report-writer": 30,
  "one-page-profile": 30,
  "learning-walk-report": 30,
  "lesson-observation-report": 30,
  "performance-management": 30,
  "assembly-planner": 30,
  "newsletter-writer": 30,
  "slideshow": 30,
  "model-text-generator": 25,
  "sensory-activities": 25,
  "phonics-support": 25,
  "homework-generator": 25,
  "meeting-planner": 25,
  "smart-targets": 20,
  "letter-writer": 20,
};

export const DEFAULT_MINUTES_SAVED = 30;

export function minutesSavedFor(slug: string): number {
  return TOOL_MINUTES_SAVED[slug] ?? DEFAULT_MINUTES_SAVED;
}
