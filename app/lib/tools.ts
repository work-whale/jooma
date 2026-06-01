export interface Tool {
  href: string;
  icon: string;
  label: string;
  description: string;
  tag: string;
}

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
    href: "/tools/worksheet-generator",
    icon: "worksheet",
    label: "Worksheet Generator",
    description: "Create bespoke worksheets tailored to your year group, subject and learning objective.",
    tag: "Assessment",
  },
  {
    href: "/tools/cover-lesson",
    icon: "cover-lesson",
    label: "Cover Lesson Generator",
    description: "Generate a fully self-contained cover lesson any non-specialist can deliver — complete with a cover teacher script, timed activities, and end-of-lesson checklist.",
    tag: "Planning",
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
    href: "/tools/homework-generator",
    icon: "homework",
    label: "Homework Generator",
    description: "Generate a structured, differentiated homework task for any year group, subject, and learning objective — with optional answers.",
    tag: "Assessment",
  },
  {
    href: "/tools/targeted-intervention",
    icon: "intervention",
    label: "Targeted Intervention Ideas",
    description: "Generate personalised, evidence-based intervention strategies to close the gap for individual students based on attitudinal, aptitudinal, and attainment data.",
    tag: "SEND",
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
  {
    href: "/tools/slideshow",
    icon: "presentation",
    label: "Slideshow Generator",
    description: "Create a presentation from scratch with text, shapes, and images. Export to PowerPoint.",
    tag: "Planning",
  },
];

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
