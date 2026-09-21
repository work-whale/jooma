// The tools the assistant can route a teacher into, and the shape of what it
// fills in for them.
//
// BEHAVIOUR: prefill and open, not generate. The assistant picks the tool and
// extracts the fields; the teacher reviews them and presses Generate. So a
// misread request costs nothing, the teacher stays in control of what is spent,
// and there is no second generation path to maintain alongside the 35 routes.
// This is also exactly what the landing page (HeroShowcase.tsx) already depicts.
//
// ── The one rule that matters here ──────────────────────────────────────────
// These schemas describe each form's STATE, not its API request body. The two
// genuinely differ — LessonPlannerForm holds { mixed: boolean, yearGroup } and
// POSTs `yearGroup: mixed ? "Mixed" : yearGroup`, and title-cases `subject` on
// the way out. Prefill drives the form, and the form state is also what
// saveToolRun() persists as `input`, which is what /folders reads its Subject
// and Year facets from. Target the request body instead and resources file
// correctly but show "—" and vanish from those filters.
//
// Every tool in the grid is registered. Each schema is hand-checked against its
// own form, because the shapes really do vary: worksheet has no `topic` at all,
// quiz needs a discriminating `action`, model-text carries its subject matter in
// `write`.
//
// `slideshow` is the exception to "a schema describes a form": it is a deck LIST
// page whose generation happens in a modal wizard, so its schema describes that
// wizard's opening step and the prefill opens it pre-filled. See its entry.
//
// ── Five rules learned the hard way, all load-bearing ───────────────────────
//
//  1. `required` must list ONLY fields a sentence can plausibly supply.
//     validatePrefill returns null when a required field is missing, so listing
//     a "paste your observation notes" field throws away the whole prefill and
//     the teacher gets a chat reply instead of their tool.
//
//  2. Numeric-LOOKING fields that the form stores as strings must be typed
//     "string" here (numberOfWeeks, duration, lengthWords, wordCount). Typing
//     them "integer" hands the setter a number its `as string` cast lies about.
//
//  3. Enum values must match the <select> options EXACTLY, or validatePrefill
//     drops them and the control renders blank. Where an option list is shared
//     with the control, IMPORT it rather than copying — differentiation does
//     this via DIFFERENTIATION_VALUES, and cannot drift as a result.
//
//  4. `mixed` is never exposed. It is a mixed-age-class toggle no sentence
//     implies, and setting it disables the year-group select.
//
//  5. Fields that only make sense together must be described that way, since
//     nothing enforces it: `differentiate: "yes"` without differentiationLevels
//     opens the control with no band chosen, which blocks Generate.
//
//  6. Every form-backed tool declares `gating`, audited against its own
//     canGenerate expression. `required` decides whether a prefill is worth
//     opening; `gating` decides whether the form can actually be submitted, and
//     a missing gating field makes Jo ASK rather than navigate. The two lists
//     drifting is how "Plan a Year 3 science lesson" ended up opening a lesson
//     planner with a dead Generate button and no question asked. `slideshow` is
//     the only tool without one: it is a wizard, and its own single required
//     field is the whole gate.
import { CURRICULA, YEAR_GROUPS } from "@/app/lib/formOptions";
import { DIFFERENTIATION_VALUES } from "@/app/lib/differentiation";

const CURRICULUM_VALUES = CURRICULA.map((c) => c.value);

/** Output length, shared by every tool with an OutputDetailField. */
const OUTPUT_DETAILS = ["condensed", "standard", "detailed"] as const;

// Enum option lists, copied verbatim from the field components. Rule 3 above:
// a value that is not character-for-character one of these is discarded by
// validatePrefill and the <select> shows empty.
/** fields/AssemblyStageField.tsx */
const ASSEMBLY_STAGES = [
  "Early Years", "KS1", "KS2", "Primary", "KS3", "KS4", "Secondary",
  "All-through School", "Special School", "Alternative Provision",
] as const;
/** fields/EducationPhaseField.tsx — pupil-premium. NOT the same list as SIP. */
const EDUCATION_PHASES = [
  "Early Years", "Primary", "Secondary", "All-through School",
  "Special School", "Alternative Provision",
] as const;
/** fields/SIPSchoolTypeField.tsx — school-improvement-plan only. */
const SIP_SCHOOL_TYPES = [
  "Primary", "Secondary", "All-through School", "Special School",
  "Alternative Provision", "Nursery", "Sixth Form / FE College",
] as const;
/** fields/LessonLengthField.tsx — required by cover-lesson. */
const LESSON_LENGTHS = [
  "30 minutes", "45 minutes", "50 minutes", "60 minutes", "75 minutes",
] as const;
/** fields/CoverResourcesField.tsx — required by cover-lesson. */
const COVER_RESOURCES = [
  "No resources needed (verbal / discussion only)",
  "Basic stationery only (pen and paper)",
  "Printed worksheets provided",
  "Computers or tablets available",
  "Whiteboard / projector only",
] as const;
/** fields/NewsletterToneField.tsx */
const NEWSLETTER_TONES = [
  "Professional and formal", "Warm and friendly", "Inspiring and motivational",
] as const;
/** fields/GenderField.tsx */
const GENDERS = ["Male", "Female", "Non-Binary"] as const;

/**
 * The slideshow wizard's year list — components/slideshow/GenerateModal.tsx.
 *
 * Exported and imported BY the modal, rather than copied from it, so the two
 * cannot drift. Rule 3 above with a twist: the usual fix is to import the
 * option list from the control, but that control is a heavy client component
 * and this module is imported by the server route, so the ownership is
 * inverted and the modal imports this instead.
 *
 * Not YEAR_GROUPS: this list offers "Adult learners" and omits the mixed-age
 * handling, so a value from the other list would be discarded here.
 */
export const SLIDESHOW_YEARS = [
  "Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13",
  "Adult learners",
] as const;

export interface AssistantTool {
  /** Tool slug — also the route segment and the tool_runs / folder key. */
  slug: string;
  /** Shown on the ToolLinkCard. */
  label: string;
  /** Icon key, matching the entry in tools.ts. Rendering now goes through the
   *  V2 metadata (v2ToolForSlug) and its Phosphor name, so this is only the
   *  join key. */
  icon: string;
  /** Tells the model when to choose this tool over the others. */
  description: string;
  /** JSON Schema for the form-state fields the assistant may fill. */
  fields: Record<string, unknown>;
  /**
   * The fields this tool's Generate button is actually gated on.
   *
   * NOT the same list as the schema's `required`, and the difference is the
   * whole point:
   *
   *   required  what a prefill needs before opening the tool is worth doing.
   *             Missing one and validatePrefill discards everything, so Jo
   *             answers in chat and the teacher gets no tool at all.
   *   gating    what the FORM needs before it will generate. Missing one and
   *             the tool opens with a dead Generate button.
   *
   * Keeping `required` narrow is deliberate (see rule 1 in the header). The
   * cost of that was invisible until it was measured: "Plan a Year 3 science
   * lesson on the water cycle" satisfied lesson-planner's required [subject,
   * topic], so Jo prefilled, validation passed, and it navigated straight to a
   * form whose Generate was disabled for want of a learning objective. Nothing
   * asked, because from the model's side nothing was missing.
   *
   * This list closes that gap: anything named here and still absent after
   * extraction turns the prefill into a clarifying question instead of a
   * navigation. Mirror the form's own canGenerate expression, and only fields
   * the model can reasonably supply — a "paste your observation notes" field
   * belongs to the teacher and must not be asked for.
   *
   * Omit it entirely when `required` already covers the gate.
   */
  gating?: string[];
}

// Fields common to the curriculum-based tools. `mixed` is deliberately absent:
// it is a UI toggle for mixed-year classes, and the model has no reliable way
// to infer it from a sentence. It defaults to false in every form.
const curriculumFields = {
  curriculum: {
    type: "string",
    enum: CURRICULUM_VALUES,
    description:
      "The curriculum. Default to '2014 National Curriculum' unless the teacher " +
      "names a Scottish, Welsh, Northern Irish or Early Years context.",
  },
  yearGroup: {
    type: "string",
    enum: YEAR_GROUPS,
    description: "The year group, e.g. 'Year 4'. Omit if the teacher did not say.",
  },
  subject: {
    type: "string",
    description: "Curriculum subject, e.g. 'Science', 'Maths', 'English'.",
  },
} as const;

// Differentiation is opt-in and multi-select. Both halves must be prefilled
// together to be useful: `differentiate: "yes"` on its own opens the control
// with no band chosen, which blocks Generate.
const differentiateField = {
  type: "string",
  enum: ["yes", "no"],
  description:
    "Whether to include differentiation. Set 'yes' only when the teacher signals " +
    "adapting for attainment, and always alongside differentiationLevels. Omit otherwise.",
} as const;

const differentiationLevelsField = {
  type: "array",
  items: { type: "string", enum: DIFFERENTIATION_VALUES },
  description:
    "Attainment bands to adapt for: WBS (working below), WTS (working towards), " +
    "EXS (expected), GDS (greater depth). Only meaningful when differentiate is " +
    "'yes'. Pick every band the teacher implies — 'lower attainers and greater " +
    "depth' is ['WTS','GDS'].",
} as const;

const detailField = {
  type: "string",
  enum: OUTPUT_DETAILS,
  description: "How comprehensive the output should be. Omit unless asked.",
} as const;

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    slug: "lesson-planner",
    label: "Lesson Planner",
    icon: "planner",
    description:
      "A full lesson plan: objectives, activities, resources, assessment. Use for " +
      "any request for a lesson, a lesson plan, or 'how do I teach X'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: {
          type: "string",
          description: "What the lesson is about, e.g. 'The Water Cycle'.",
        },
        learningObjective: {
          type: "string",
          description:
            "What pupils should be able to do by the end. Write one if the teacher " +
            "did not state it, phrased as a teacher would ('Identify the stages of " +
            "the water cycle').",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
        outputDetail: detailField,
      },
      required: ["subject", "topic"],
    },
    // LessonPlannerForm.tsx:46. learningObjective has to be WRITTEN rather than
    // extracted, and the model was quietly declining to, so the form opened
    // complete-looking and unsubmittable.
    gating: ["curriculum", "yearGroup", "subject", "topic", "learningObjective"],
  },
  {
    slug: "worksheet-generator",
    label: "Worksheet Generator",
    icon: "worksheet",
    description:
      "A printable worksheet of practice questions. Use for 'worksheet', " +
      "'practice questions', or 'activity sheet'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        // NOTE: no `topic` — this form genuinely does not have one. The subject
        // matter belongs in learningObjective.
        learningObjective: {
          type: "string",
          description:
            "What the worksheet practises, e.g. 'Multiply two-digit numbers by " +
            "one-digit numbers'. This carries the topic — there is no separate " +
            "topic field on this tool.",
        },
        questionCount: {
          type: "integer",
          minimum: 1,
          maximum: 40,
          description: "How many questions. Defaults to 10.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
        outputDetail: detailField,
      },
      required: ["subject", "learningObjective"],
    },
    // WorksheetGeneratorForm.tsx:56. questionTypes is deliberately absent: the
    // form defaults it to every type, so it is never the missing piece.
    gating: ["curriculum", "yearGroup", "subject", "learningObjective"],
  },
  {
    slug: "quiz-generator",
    label: "Quiz Generator",
    icon: "quiz",
    description:
      "A multiple-choice quiz, exportable to Kahoot, Blooket, Gimkit and others. " +
      "Use for 'quiz', 'multiple choice', or 'test them on X'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: {
          type: "string",
          description: "What the quiz covers, e.g. 'Multiplication'.",
        },
        numQuestions: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "How many questions. Defaults to 10.",
        },
      },
      required: ["subject", "topic"],
    },
    // QuizGeneratorForm.tsx:56
    gating: ["curriculum", "yearGroup", "subject", "topic"],
  },
  {
    slug: "comprehension-generator",
    label: "Comprehension Generator",
    icon: "comprehension",
    description:
      "A reading passage with comprehension questions. Use for 'comprehension', " +
      "'reading passage', or 'text with questions'.",
    fields: {
      type: "object",
      properties: {
        // No `subject`: this form has no subject field — a comprehension is
        // pitched by year group and topic alone. Spreading curriculumFields
        // here would advertise a field with nowhere to land.
        curriculum: curriculumFields.curriculum,
        yearGroup: curriculumFields.yearGroup,
        topic: {
          type: "string",
          description: "What the passage is about, e.g. 'Volcanoes'.",
        },
        numQuestions: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "How many questions. Omit to use the form's default.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["topic"],
    },
    // ComprehensionForm.tsx:192. textSource and contentDomains have form
    // defaults, and ownText only applies when the teacher pastes their own.
    gating: ["curriculum", "yearGroup", "topic"],
  },
  {
    slug: "letter-writer",
    label: "Letter Writer",
    icon: "letter-writer",
    description:
      "A letter or email to parents, carers, governors or staff. Use for 'letter', " +
      "'email home', 'newsletter to parents', or 'write to the governors'.",
    fields: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "Who it is addressed to, e.g. 'parents', 'governors'.",
        },
        content: {
          type: "string",
          description:
            "The key information the letter must convey — the teacher's brief, " +
            "restated as a clear instruction of what to include.",
        },
        tone: {
          type: "string",
          enum: ["Formal", "Semi-formal", "Informal"],
          description: "Register. Defaults to Semi-formal.",
        },
      },
      required: ["recipient", "content"],
    },
    // LetterWriterForm.tsx:51
    gating: ["recipient", "content"],
  },
  {
    slug: "homework-generator",
    label: "Homework Generator",
    icon: "homework",
    description:
      "A homework task with optional answers. Use for 'homework', 'home learning', " +
      "or 'something to send home'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        learningObjective: {
          type: "string",
          description:
            "What the homework practises. This carries the topic — there is no " +
            "separate topic field on this tool.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["subject", "learningObjective"],
    },
    // HomeworkGeneratorForm.tsx:93. homeworkType and length default in the form.
    gating: ["curriculum", "yearGroup", "subject", "learningObjective"],
  },

  // ── Planning ──────────────────────────────────────────────────────────────
  {
    slug: "topic-overview",
    label: "Topic Overview",
    icon: "topic",
    description:
      "A structured overview of a topic with lesson summaries. Use for 'topic " +
      "overview', 'overview of X', or 'what should I cover in X'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: { type: "string", description: "The topic, e.g. 'The Romans'." },
        numLessons: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "How many lessons the topic spans. Defaults to 6.",
        },
      },
      required: ["subject", "topic"],
    },
    // TopicOverviewForm.tsx:56
    gating: ["curriculum", "yearGroup", "subject", "topic"],
  },
  {
    slug: "medium-term-planner",
    label: "Medium Term Topic Planner",
    icon: "medium-term",
    description:
      "A lesson-by-lesson medium term plan with objectives and key knowledge. " +
      "Use for 'medium term plan', 'scheme of work', or 'plan a unit'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: { type: "string", description: "The unit topic." },
        numberOfLessons: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Lessons in the unit. Defaults to 6.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
        // examSpec/examSpecText are deliberately NOT exposed. examSpec is a
        // mode toggle: ExamSpecField only renders the examSpecText textarea
        // when examSpec === "yes", so prefilling the text alone would submit
        // content the teacher can neither see nor edit. Same class of trap as
        // ComprehensionForm's textSource, and no sentence implies it anyway.
      },
      required: ["subject", "topic"],
    },
    // MediumTermPlannerForm.tsx:45
    gating: ["curriculum", "yearGroup", "subject", "topic"],
  },
  {
    slug: "cover-lesson",
    label: "Cover Lesson Generator",
    icon: "cover-lesson",
    description:
      "A self-contained lesson a non-specialist can deliver, with a script and " +
      "timed activities. Use for 'cover lesson' or 'cover work'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: { type: "string", description: "What the cover lesson is about." },
        // Both of these are required by canGenerate and start empty, so they
        // MUST be filled or the form opens with Generate disabled. Sensible
        // defaults are given in the descriptions rather than left to chance.
        lessonLength: {
          type: "string",
          enum: LESSON_LENGTHS,
          description:
            "Lesson length. Required — use '60 minutes' if the teacher did not say.",
        },
        resources: {
          type: "string",
          enum: COVER_RESOURCES,
          description:
            "What the cover teacher will have. Required — use 'Basic stationery " +
            "only (pen and paper)' if the teacher did not say.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["subject", "topic", "lessonLength", "resources"],
    },
    // CoverLessonForm.tsx:100
    gating: ["curriculum", "yearGroup", "subject", "topic", "lessonLength", "resources"],
  },
  {
    slug: "assembly-planner",
    label: "Assembly Planner",
    icon: "assembly",
    description:
      "A complete assembly with a timed script, story and interactive element. " +
      "Use for 'assembly' or 'collective worship'.",
    fields: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "The assembly theme, e.g. 'Kindness', 'Remembrance Day'.",
        },
        stageOfSchool: {
          type: "string",
          enum: ASSEMBLY_STAGES,
          description: "Who it is for. Defaults to Primary.",
        },
        lengthMinutes: {
          type: "integer",
          minimum: 5,
          maximum: 120,
          description: "Assembly length in minutes. Defaults to 20.",
        },
      },
      required: ["theme"],
    },
    // AssemblyPlannerForm.tsx:77
    gating: ["theme"],
  },
  {
    slug: "sensory-activities",
    label: "Sensory Activities",
    icon: "sensory",
    description:
      "Five multisensory activity ideas with resources and adaptations. Use for " +
      "'sensory activities', 'multisensory', or SEND-focused activity requests.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: { type: "string", description: "The topic the activities cover." },
      },
      required: ["subject", "topic"],
    },
    // SensoryActivitiesForm.tsx
    gating: ["curriculum", "yearGroup", "subject", "topic"],
  },
  {
    slug: "eyfs-planner",
    label: "EYFS Planner",
    icon: "eyfs",
    description:
      "An Early Years plan covering all 7 EYFS areas. Use for 'EYFS plan', " +
      "'Early Years planning', or Nursery/Reception topic planning.",
    fields: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The EYFS topic, e.g. 'Minibeasts'." },
        // STRING, not integer — the form stores this as text (see rule 2).
        numberOfWeeks: {
          type: "string",
          description:
            "How many weeks, written as digits, e.g. '2' or '6'. Must be 1-12. " +
            "Defaults to '2'.",
        },
        includeBookList: { type: "boolean", description: "Include a book list." },
        includeHomeLearning: { type: "boolean", description: "Include home learning ideas." },
        includeWeeklyOverview: { type: "boolean", description: "Include a weekly overview." },
        // curriculum omitted: this form hardcodes it to EYFS.
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["topic"],
    },
    // EYFSPlannerForm.tsx:45. `curriculum` is NOT listed even though
    // canGenerate checks it: this form hardcodes it to EYFS, so it can never be
    // the missing piece, and asking would be a question the teacher cannot
    // usefully answer. numberOfWeeks defaults in the form.
    gating: ["topic"],
  },
  {
    slug: "eyfs-action-plan",
    label: "EYFS Action Plan",
    icon: "eyfs-action-plan",
    description:
      "A 4-phase action plan for an Early Years improvement objective. Use for " +
      "'EYFS action plan' or 'Early Years improvement plan'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        objective: {
          type: "string",
          description:
            "The improvement objective, e.g. 'Improve outdoor provision for " +
            "communication and language'.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["curriculum", "objective"],
    },
    // EYFSActionPlanForm.tsx:54
    gating: ["curriculum", "objective"],
  },
  {
    slug: "policy-generator",
    label: "Policy Generator",
    icon: "policy",
    description:
      "A school policy document or policy section structure. Use for 'policy', " +
      "'write a policy on X', or 'policy template'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        policy: {
          type: "string",
          description: "Which policy, e.g. 'Behaviour', 'Online Safety'.",
        },
        outputType: {
          type: "string",
          enum: ["full", "structure"],
          description:
            "'full' drafts the whole policy, 'structure' drafts the section " +
            "headings only. Defaults to full.",
        },
      },
      required: ["curriculum", "policy"],
    },
    // PolicyGeneratorForm.tsx
    gating: ["curriculum", "policy"],
  },
  {
    slug: "risk-assessment",
    label: "Risk Assessment",
    icon: "risk-assessment",
    description:
      "A risk assessment for a trip or activity, with hazards and control " +
      "measures. Use for 'risk assessment' or 'trip paperwork'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        yearGroup: curriculumFields.yearGroup,
        activity: {
          type: "string",
          description: "The trip or activity, e.g. 'Beach field trip'.",
        },
        location: { type: "string", description: "Where it takes place." },
        transport: { type: "string", description: "How pupils travel, e.g. 'Coach'." },
        resources: { type: "string", description: "Equipment or resources involved." },
      },
      required: ["curriculum", "yearGroup", "activity"],
    },
    // RiskAssessmentForm.tsx
    gating: ["curriculum", "yearGroup", "activity"],
  },

  // ── Literacy ──────────────────────────────────────────────────────────────
  {
    slug: "model-text-generator",
    label: "Model Text Generator",
    icon: "model-text",
    description:
      "A model/WAGOLL text demonstrating specific writing features. Use for " +
      "'model text', 'WAGOLL', or 'example piece of writing'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        yearGroup: curriculumFields.yearGroup,
        // This form has NO subject and NO topic. `write` carries both.
        write: {
          type: "string",
          description:
            "What to write — this tool has no separate subject or topic field, so " +
            "put the whole brief here, e.g. 'A persuasive letter about school " +
            "uniform' or 'A setting description of a haunted house'.",
        },
        features: {
          type: "string",
          description:
            "Writing features to demonstrate, e.g. 'fronted adverbials, similes'.",
        },
        keywords: {
          type: "string",
          description: "Vocabulary to include, comma-separated.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
        // STRING, not integer (rule 2).
        lengthWords: {
          type: "string",
          description:
            "Approximate length in words, written as digits, e.g. '300'. Must be " +
            "50-5000. Defaults to '500'.",
        },
      },
      required: ["curriculum", "yearGroup", "write"],
    },
    // ModelTextGeneratorForm.tsx:55
    gating: ["curriculum", "yearGroup", "write"],
  },
  {
    slug: "phonics-support",
    label: "Phonics Support",
    icon: "phonics",
    description:
      "Word banks, decodable texts and activities for a target phoneme. Use for " +
      "'phonics', a grapheme like 'ai' or 'igh', or 'decodable words'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        grapheme: {
          type: "string",
          description: "The target grapheme or phoneme, e.g. 'ai', 'sh', 'igh'.",
        },
        age: {
          type: "integer",
          minimum: 3,
          maximum: 11,
          description: "Pupil age in years. Defaults to 5.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["curriculum", "grapheme"],
    },
    // PhonicsSupportForm.tsx
    gating: ["curriculum", "grapheme"],
  },

  // ── Assessment ────────────────────────────────────────────────────────────
  {
    slug: "exam-question-generator",
    label: "Exam Question Generator",
    icon: "exam",
    description:
      "An exam paper with questions scaled by marks and an optional mark scheme. " +
      "Use for 'exam questions', 'test paper', or 'past-paper style questions'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        topic: { type: "string", description: "What the questions cover." },
        examType: {
          type: "string",
          description: "Exam board or type, e.g. 'GCSE AQA', 'SATs', 'end of unit'.",
        },
        numQuestions: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "How many questions. Defaults to 5.",
        },
        includeMarkScheme: { type: "boolean", description: "Include a mark scheme." },
        // minMarks/maxMarks deliberately omitted: the form couples them
        // (raising min raises max) in its onChange and clamps again at submit,
        // but prefill setters bypass both and could land an inverted pair.
      },
      required: ["subject", "topic"],
    },
    // ExamQuestionGeneratorForm.tsx:59
    gating: ["curriculum", "yearGroup", "subject", "topic"],
  },
  {
    slug: "model-answer-generator",
    label: "Model Answer Generator",
    icon: "model-answer",
    description:
      "A model answer for an exam-style question, with teacher notes. Use for " +
      "'model answer', 'exemplar answer', or 'how should pupils answer X'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        question: {
          type: "string",
          description: "The exam question to answer, quoted as the teacher gave it.",
        },
        totalMarks: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Marks available. Defaults to 10.",
        },
        guidelines: { type: "string", description: "Marking guidance, if given." },
      },
      required: ["subject", "question"],
    },
    // ModelAnswerForm.tsx:53
    gating: ["curriculum", "yearGroup", "subject", "question"],
  },
  {
    slug: "smart-targets",
    label: "SMART Targets",
    icon: "smart-targets",
    description:
      "Turns rough targets into a structured SMART table. Use for 'SMART " +
      "targets' or 'turn these targets into SMART targets'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        yearGroup: curriculumFields.yearGroup,
        targets: {
          type: "string",
          description:
            "The raw targets to convert, one per line if there are several.",
        },
      },
      required: ["curriculum", "yearGroup", "targets"],
    },
    // SmartTargetsForm.tsx
    gating: ["curriculum", "yearGroup", "targets"],
  },

  // ── Slideshows ────────────────────────────────────────────────────────────
  //
  // THE ONE ENTRY HERE THAT IS NOT A FORM.
  //
  // `slideshow` was deliberately left out of this registry for a long time,
  // because /tools/slideshow is a deck LIST and its generation happens in a
  // three-step modal. In its place sat `lesson-slideshow`: an older, unlisted
  // tool that was hidden in tool_settings, absent from the tools grid, and
  // still live by URL. Jo sent every slides request to it, so teachers got a
  // deprecated tool behind a grey fallback tile while the real Slides tool sat
  // unreachable. One teacher asked for "a slideshow from the slideshow tool"
  // and was still sent to the wrong one, which is what finally settled it.
  //
  // So the fields below describe GenerateModal's step one, not a form's state.
  // The prefill opens the wizard with those values already in it.
  {
    slug: "slideshow",
    label: "Slideshow",
    icon: "presentation",
    description:
      "A classroom presentation for delivering a lesson. Use for 'slides', " +
      "'slideshow', 'presentation', 'deck' or 'PowerPoint' for teaching pupils.",
    fields: {
      type: "object",
      properties: {
        // Deliberately NOT curriculumFields. The slideshow wizard has no
        // curriculum or subject control on its opening step, and a field the
        // target cannot render is dropped by cleanFields anyway.
        topic: {
          type: "string",
          description: "What the lesson covers, e.g. 'The water cycle'.",
        },
        // `year`, not `yearGroup`: this drives the modal's own control, whose
        // list differs from YEAR_GROUPS (it offers "Adult learners"). Sharing
        // the name would invite the shared-enum guidance to fill it with a
        // value this list does not contain, and it would then be discarded.
        year: {
          type: "string",
          enum: SLIDESHOW_YEARS,
          description:
            "The year group. Omit if the teacher did not say — the wizard " +
            "treats that as 'Any year'.",
        },
        slideCount: {
          type: "integer",
          minimum: 3,
          maximum: 20,
          description: "How many content slides. Defaults to 8.",
        },
        additionalInstructions: {
          type: "string",
          description:
            "Anything specific the teacher asked for: what to cover, what to " +
            "leave out, an activity to include.",
        },
      },
      // Topic alone. Everything else has a working default in the wizard, and
      // requiring more would throw away prefills the teacher would have been
      // glad of — validatePrefill discards the lot when a required field is
      // missing.
      required: ["topic"],
    },
  },
  {
    slug: "cpd-slideshow",
    label: "CPD Slideshow",
    icon: "cpd-slideshow",
    description:
      "A staff professional-development presentation. Use for 'CPD', 'staff " +
      "training', or 'INSET' slides — NOT for teaching pupils.",
    fields: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The CPD topic." },
        slideCount: {
          type: "integer",
          minimum: 2,
          maximum: 20,
          description: "How many slides. Defaults to 4.",
        },
        presentationFocus: {
          type: "string",
          enum: ["Practical application", "Research and theory"],
          description: "Emphasis of the session. Defaults to practical.",
        },
        contentFormat: {
          type: "string",
          enum: ["Text", "Text and bullet point summary"],
          description: "Slide content style.",
        },
        includeImageSuggestions: {
          type: "boolean",
          description: "Suggest an image for each slide.",
        },
      },
      required: ["topic"],
    },
    // CpdSlideshowForm.tsx:995
    gating: ["topic"],
  },

  // ── Leadership ────────────────────────────────────────────────────────────
  {
    slug: "meeting-planner",
    label: "Meeting Planner",
    icon: "meeting-planner",
    description:
      "A timed agenda and facilitation guide for a meeting. Use for 'meeting', " +
      "'agenda', or 'plan a staff meeting'.",
    fields: {
      type: "object",
      properties: {
        purpose: {
          type: "string",
          description: "What the meeting is for.",
        },
        participants: {
          type: "string",
          description: "Who attends, e.g. 'Year 3 and 4 teachers'.",
        },
        topics: {
          type: "string",
          description: "Items to cover, one per line if there are several.",
        },
        // STRING, not integer (rule 2).
        duration: {
          type: "string",
          description:
            "Length in minutes, written as digits, e.g. '45'. Must be 5-480. " +
            "Defaults to '60'.",
        },
        includeIcebreaker: { type: "boolean", description: "Open with an icebreaker." },
        includeActionItems: { type: "boolean", description: "Close with action items." },
      },
      required: ["purpose", "participants"],
    },
    // MeetingPlannerForm.tsx:166. duration defaults in the form.
    gating: ["purpose", "participants"],
  },
  {
    slug: "inspection-prep",
    label: "Inspection Prep Questions",
    icon: "inspection-prep",
    description:
      "Self-evaluation questions and preparation actions for an inspection. Use " +
      "for 'Ofsted prep', 'inspection questions', or 'deep dive questions'.",
    fields: {
      type: "object",
      properties: {
        inspectionBody: {
          type: "string",
          description: "Who is inspecting, e.g. 'Ofsted', 'ISI'. Defaults to Ofsted.",
        },
        inspectionFocus: {
          type: "string",
          description: "The focus area, e.g. 'Reading', 'Behaviour and attitudes'.",
        },
        includeEvidence: { type: "boolean", description: "Include evidence examples." },
        includeSuccessCriteria: { type: "boolean", description: "Include success criteria." },
        includePolicyChanges: { type: "boolean", description: "Suggest policy changes." },
      },
      required: ["inspectionBody"],
    },
    // InspectionPrepForm.tsx:52
    gating: ["inspectionBody"],
  },
  {
    slug: "school-improvement-plan",
    label: "School Improvement Plan",
    icon: "sip",
    description:
      "A SIP with objectives, actions, timelines and monitoring. Use for 'school " +
      "improvement plan', 'SIP', or 'SDP'.",
    fields: {
      type: "object",
      properties: {
        areasToImprove: {
          type: "string",
          description: "The improvement priorities, one per line if several.",
        },
        schoolType: {
          type: "string",
          enum: SIP_SCHOOL_TYPES,
          description: "Type of school. Defaults to Primary.",
        },
        planTimeframe: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Plan length in years. Defaults to 1.",
        },
        outputFormat: {
          type: "string",
          enum: ["table", "narrative"],
          description: "Layout of the plan. Defaults to table.",
        },
      },
      required: ["areasToImprove"],
    },
    // SchoolImprovementPlanForm.tsx
    gating: ["areasToImprove"],
  },
  {
    slug: "pupil-premium-planner",
    label: "Pupil Premium Planner",
    icon: "pupil-premium",
    description:
      "Tiered, evidence-based strategies for a Pupil Premium challenge. Use for " +
      "'pupil premium', 'PP strategy', or 'disadvantaged pupils'.",
    fields: {
      type: "object",
      properties: {
        challenges: {
          type: "string",
          description:
            "The barriers to address, e.g. 'Low reading fluency in KS2'.",
        },
        educationPhase: {
          type: "string",
          enum: EDUCATION_PHASES,
          description: "Phase of education. Defaults to Primary.",
        },
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["challenges"],
    },
    // PupilPremiumPlannerForm.tsx
    gating: ["challenges"],
  },
  {
    slug: "performance-management",
    label: "Performance Management Targets",
    icon: "performance-management",
    description:
      "SMART appraisal targets for a staff role. Use for 'performance " +
      "management', 'appraisal targets', or 'staff targets'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        staffMember: {
          type: "string",
          description: "The role, e.g. 'Year 4 teacher', 'Maths lead', 'TA'.",
        },
        responsibilities: {
          type: "string",
          description: "What the role covers.",
        },
        schoolType: {
          type: "string",
          description: "Type of school — free text, e.g. 'Primary', 'Academy'.",
        },
        payScale: { type: "string", description: "Pay scale, e.g. 'M3', 'UPS1'." },
      },
      required: ["curriculum", "staffMember", "responsibilities"],
    },
    // PerformanceManagementForm.tsx
    gating: ["curriculum", "staffMember", "responsibilities"],
  },
  {
    slug: "newsletter-writer",
    label: "Newsletter Writer",
    icon: "newsletter",
    description:
      "A school newsletter for parents or staff. Use for 'newsletter' or " +
      "'round-up for parents'.",
    fields: {
      type: "object",
      properties: {
        newsletterTitle: { type: "string", description: "Title of the newsletter." },
        schoolName: { type: "string", description: "The school's name, if given." },
        tone: {
          type: "string",
          enum: NEWSLETTER_TONES,
          description:
            "Register. Required — use 'Warm and friendly' if the teacher did not say.",
        },
        // SYNTHETIC FIELD. The form's real state is `sections: string[]`, which
        // validatePrefill cannot carry (scalars only) — and canGenerate needs a
        // non-empty section, so without this a prefill would open the form with
        // Generate greyed out. The form's setter wraps this into the array.
        firstSection: {
          type: "string",
          description:
            "The first section to cover, e.g. 'Sports Day'. The teacher can add " +
            "more sections themselves.",
        },
      },
      required: ["tone", "firstSection"],
    },
    // NewsletterWriterForm.tsx:84. sections are the school's own content.
    gating: ["tone", "firstSection"],
  },

  // ── SEND and pupil-specific ───────────────────────────────────────────────
  // These next tools all REQUIRE free-text observation notes that no sentence
  // can supply (behaviour descriptions, walk notes, assessment data). Those
  // fields are therefore absent from `required` — listing them would make
  // validatePrefill discard the whole prefill. The assistant fills the context
  // it can (year group, subject, name) and the teacher adds their own notes.
  {
    slug: "behaviour-support-plan",
    label: "Individual Student Behaviour Plan",
    icon: "behaviour-support-plan",
    description:
      "A behaviour plan with strategies, targets and de-escalation guidance. Use " +
      "for 'behaviour plan', 'IBP', or 'support plan for a pupil'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        yearGroup: curriculumFields.yearGroup,
        studentName: { type: "string", description: "The pupil's first name." },
        studentClass: { type: "string", description: "Their class, e.g. '4B'." },
        studentGender: {
          type: "string",
          enum: GENDERS,
          description: "Only if the teacher stated or clearly implied it.",
        },
        supportNeeds: {
          type: "string",
          description: "Known SEND or support needs, if the teacher mentioned any.",
        },
      },
      required: ["curriculum", "yearGroup", "studentName"],
    },
    // BehaviourSupportPlanForm.tsx:74. studentName is listed only because it is
    // already `required`, so it is guaranteed present and can never be the gap
    // Jo asks about. The behaviour notes are the teacher's own and stay out.
    gating: ["curriculum", "yearGroup", "studentName"],
  },
  {
    slug: "one-page-profile",
    label: "One Page Support Profile",
    icon: "one-page-profile",
    description:
      "A first-person, pupil-centred one page profile. Use for 'one page " +
      "profile', 'pupil passport', or 'student profile'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        yearGroup: curriculumFields.yearGroup,
        name: { type: "string", description: "The pupil's first name." },
      },
      required: ["curriculum", "yearGroup", "name"],
    },
    // OnePageProfileForm.tsx. `name` is already `required`, so it is guaranteed
    // present rather than something Jo would ask for. The pupil's likes and
    // support needs are the teacher's to supply and stay out.
    gating: ["curriculum", "yearGroup", "name"],
  },
  {
    slug: "targeted-intervention",
    label: "Targeted Intervention Ideas",
    icon: "intervention",
    description:
      "Evidence-based intervention strategies for an individual pupil. Use for " +
      "'intervention', 'closing the gap', or 'strategies for a struggling pupil'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        differentiate: differentiateField,
        differentiationLevels: differentiationLevelsField,
      },
      required: ["curriculum", "yearGroup", "subject"],
    },
    // TargetedInterventionForm.tsx. attitudinalData is the teacher's own assessment data, never invented.
    gating: ["curriculum", "yearGroup", "subject"],
  },
  {
    slug: "report-writer",
    label: "Report Writer",
    icon: "report",
    description:
      "A personalised end-of-year pupil report. Use for 'pupil report', 'school " +
      "report', or 'write a report for X'.",
    fields: {
      type: "object",
      properties: {
        name: { type: "string", description: "The pupil's first name." },
        gender: {
          type: "string",
          enum: GENDERS,
          description:
            "Required — the report uses pronouns throughout. Use 'Non-Binary' " +
            "if the teacher did not indicate one.",
        },
        tone: {
          type: "string",
          description: "Report tone, e.g. 'formal', 'warm'. Defaults to formal.",
        },
        // STRING, not integer (rule 2).
        wordCount: {
          type: "string",
          description:
            "Approximate length in words, as digits, e.g. '150'. Must be 50-1000.",
        },
        includeTargets: { type: "boolean", description: "Include next-step targets." },
        // SYNTHETIC FIELD, same reasoning as newsletter's firstSection. Real
        // state is `subjects: SubjectFocus[]`, and canGenerate needs one with a
        // non-empty subject name.
        firstSubject: {
          type: "string",
          description:
            "The first subject to report on, e.g. 'Maths'. The teacher adds the " +
            "strengths and targets themselves, and can add more subjects.",
        },
      },
      required: ["name", "gender", "firstSubject"],
    },
    // ReportWriterForm.tsx. All three are already `required`, so they are
    // guaranteed present; `gender` is the only one with fixed options anyway.
    // wordCount defaults in the form.
    gating: ["name", "gender", "firstSubject"],
  },

  // ── Observation and review write-ups ──────────────────────────────────────
  {
    slug: "learning-walk-report",
    label: "Learning Walk Report",
    icon: "learning-walk",
    description:
      "Writes up a learning walk from your observations. Use for 'learning walk' " +
      "or 'drop-in report'.",
    fields: {
      type: "object",
      properties: {
        curriculum: curriculumFields.curriculum,
        focus: {
          type: "string",
          description: "The focus of the walk, e.g. 'Reading fluency in KS2'.",
        },
        classesVisited: {
          type: "string",
          description: "Which classes were visited, e.g. 'Years 3-6'.",
        },
        includeRecommendations: { type: "boolean", description: "Include recommendations." },
        includeNextSteps: { type: "boolean", description: "Include a next-steps timeline." },
      },
      required: ["curriculum"],
    },
    // LearningWalkReportForm.tsx:164. strengths and areasForDevelopment are the observer's notes.
    gating: ["curriculum"],
  },
  {
    slug: "lesson-observation-report",
    label: "Lesson Observation Report",
    icon: "lesson-observation",
    description:
      "Writes up a formal lesson observation from your notes. Use for 'lesson " +
      "observation' or 'observation write-up'.",
    fields: {
      type: "object",
      properties: {
        ...curriculumFields,
        learningObjective: {
          type: "string",
          description: "The observed lesson's objective, if the teacher gave it.",
        },
        observationFocus: {
          type: "string",
          description: "What the observation focused on.",
        },
        includeActionPlan: { type: "boolean", description: "Include an action plan." },
        includeFollowUpSupport: { type: "boolean", description: "Suggest follow-up support." },
      },
      required: ["curriculum", "yearGroup"],
    },
    // LessonObservationReportForm.tsx:167. strengths/areasForDevelopment are the observer's own notes.
    gating: ["curriculum", "yearGroup"],
  },
  {
    slug: "ect-report-writer",
    label: "ECT Report Writer",
    icon: "ect-report",
    description:
      "An ECT assessment report against the Teachers' Standards. Use for 'ECT " +
      "report', 'NQT report', or 'early career teacher assessment'.",
    fields: {
      type: "object",
      properties: {
        ectName: { type: "string", description: "The ECT's name." },
        subject: { type: "string", description: "Their subject or phase." },
        includePDP: {
          type: "boolean",
          description: "Include a professional development plan.",
        },
        // curriculum omitted: this form defaults it to the National Curriculum.
      },
      required: ["ectName"],
    },
    // ECTReportWriterForm.tsx:55. `curriculum` is deliberately absent: this
    // tool's schema has no such field, so listing it would make Jo ask forever
    // about something it could never fill. strengths and areasForDevelopment
    // are the mentor's own words and stay out.
    gating: ["ectName"],
  },
];

/** Look up a tool by slug. Returns undefined for anything not wired up. */
export function assistantToolFor(slug: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.slug === slug);
}

/**
 * Gating fields this prefill has not filled in.
 *
 * The check that turns "opened a form the teacher cannot submit" into "asked
 * one short question first". See the `gating` docs on AssistantTool for why it
 * is a separate list from the schema's `required`.
 *
 * Returns [] when the tool declares no gating list, so a tool that has not been
 * audited against its form behaves exactly as it did before.
 */
export function missingGatingFields(
  slug: string,
  fields: Record<string, unknown>,
): string[] {
  const tool = assistantToolFor(slug);
  if (!tool?.gating) return [];
  return tool.gating.filter((f) => {
    const v = fields[f];
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    return false;
  });
}

/**
 * How to ask for a gating field, when the model did not supply one itself.
 *
 * The model is asked for the question first, because it can phrase one in
 * context ("Which year group is this Year 3 science lesson for?" beats a
 * generic prompt). This is the fallback for when it declines, and for the two
 * fields where the options are a fixed list anyway.
 *
 * `null` options means "no sensible fixed answers" — the caller then has to get
 * them from the model or skip asking about that field.
 */
export function gatingQuestion(field: string): {
  question: string;
  options: { label: string; value: string }[] | null;
} | null {
  switch (field) {
    case "yearGroup":
      return {
        question: "Which year group is this for?",
        // Trimmed to three, which is the cap validateClarify enforces anyway.
        // Primary middle years cover the most common requests; anything else
        // the teacher types instead.
        options: [
          { label: "Year 3", value: "Year 3" },
          { label: "Year 4", value: "Year 4" },
          { label: "Year 5", value: "Year 5" },
        ],
      };
    case "curriculum":
      return {
        question: "Which curriculum should this follow?",
        options: CURRICULUM_VALUES.slice(0, 3).map((c) => ({ label: c, value: c })),
      };
    default:
      return null;
  }
}

/**
 * The tool-selection function definition sent to OpenAI.
 *
 * One function with a `slug` discriminator rather than six separate functions:
 * the model picks the tool and its fields in a single decision, and adding a
 * seventh tool is a registry entry rather than another schema wired into the
 * request. `fields` is deliberately loose here — per-tool validation happens in
 * toolPrefill.ts, against the schema above, after the model has answered.
 */
/**
 * The exact values of the enum fields shared across nearly every tool.
 *
 * These have to reach the model VERBATIM. `fields` below is an open object, so
 * the per-tool property schemas never travel in `parameters` — the model was
 * previously asked to "use the exact enum values" it had never been shown, and
 * guessed the format. A guess like "year 6" or "Y6" is then discarded by
 * validatePrefill, the setter never fires, and the form keeps its previously
 * saved value — which reads as the year group being ignored.
 *
 * Only the shared, closed-set fields are listed. That is a small fixed cost on
 * the one cheap tool-select call, not a per-tool schema dump across 34 tools.
 */
function sharedEnumGuide(): string {
  return [
    "Fields shared by most tools. Use these values character-for-character:",
    `- yearGroup: ${YEAR_GROUPS.join(" | ")}`,
    `- curriculum: ${CURRICULUM_VALUES.join(" | ")}`,
    `- detail: ${OUTPUT_DETAILS.join(" | ")}`,
    `- differentiate: yes | no`,
    `- differentiationLevels: ${DIFFERENTIATION_VALUES.join(" | ")}`,
    "",
    "Always set yearGroup when the teacher names a year, in the exact form above:",
    '"a year 6 addition quiz" means yearGroup "Year 6". Omit it only when no year',
    "is stated or implied.",
    "",
    // This instruction lives HERE, not in the curriculum field's `description`,
    // because per-tool property schemas never travel to the model: `fields` is
    // declared as an open object in prefillFunctionDef (see the note there).
    // The description said "Default to '2014 National Curriculum'" for months
    // and the model never read a word of it, so every prefill came back with no
    // curriculum — which BLOCKS Generate on the curriculum-based tools, since
    // their canGenerate requires it. Anything a model must know belongs in this
    // string or in the tool summaries; nowhere else reaches it.
    "Always set curriculum. Default to \"2014 National Curriculum\" unless the",
    "teacher names a Scottish, Welsh, Northern Irish or Early Years context, in",
    "which case use the matching value above.",
  ].join("\n");
}

export function prefillFunctionDef() {
  // slug + description + required fields, in one place. The required list is
  // here rather than only in the per-tool schema because the model has to know
  // what it must find in the sentence BEFORE it picks a tool — a call missing a
  // required field is discarded wholesale by validatePrefill.
  const summary = ASSISTANT_TOOLS.map((t) => {
    const required = (t.fields as { required?: string[] }).required ?? [];
    const req = required.length ? ` [needs: ${required.join(", ")}]` : "";
    return `- ${t.slug}${req}: ${t.description}`;
  }).join("\n");

  return {
    type: "function" as const,
    function: {
      name: "prefill_tool",
      description:
        "Open one of Jooma's tools with its form already filled in from the " +
        "teacher's request. Call this ONLY when the teacher is asking for a " +
        "resource one of these tools produces. For advice, explanation, or " +
        "discussion, answer normally instead of calling this.\n\n" +
        `Available tools:\n${summary}\n\n${sharedEnumGuide()}`,
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            enum: ASSISTANT_TOOLS.map((t) => t.slug),
            description: "Which tool to open.",
          },
          fields: {
            type: "object",
            description:
              "Form fields to prefill, matching the chosen tool's schema. Fill " +
              "everything the teacher stated or clearly implied; leave the rest " +
              "out rather than guessing.",
            // The shared fields are DECLARED, not just described.
            //
            // This object used to be open with no properties at all, and the
            // guidance for yearGroup and curriculum lived in prose: first in the
            // per-tool schema descriptions (which never travel), then in this
            // function's description, then in the tool-select system prompt.
            // None of it worked. A teacher asking for "a year 6 lesson plan" got
            // a prefill of { subject, topic } with no year group, every time,
            // and the server log confirmed the model had simply never sent one.
            //
            // The reason is that arguments are completed against the PARAMETERS
            // SCHEMA. With no yearGroup slot anywhere in it, the model had to
            // invent the key from a sentence buried in a 7,000 character
            // description. Declaring the three shared fields here puts them
            // where the model actually looks, with their legal values inline.
            //
            // additionalProperties stays true: these three are common to most
            // tools, but each tool has its own fields (topic, learningObjective,
            // recipient, ...) which must still pass through. Declaring a field
            // here cannot smuggle it into a tool that lacks it — cleanFields
            // still allow-lists every key against the chosen tool's own schema,
            // so a yearGroup sent to a tool without one is dropped exactly as
            // before.
            properties: {
              yearGroup: {
                type: "string",
                enum: YEAR_GROUPS,
                description:
                  "The year group, whenever the teacher names or implies one. " +
                  "\"a year 6 lesson plan\" is \"Year 6\". Omit only when no year " +
                  "is stated or implied.",
              },
              curriculum: {
                type: "string",
                enum: CURRICULUM_VALUES,
                description:
                  "The curriculum. Default to \"2014 National Curriculum\" unless " +
                  "the teacher names a Scottish, Welsh, Northern Irish or Early " +
                  "Years context.",
              },
              // The most-required field in the whole registry: 11 tools list it
              // in `required`, so omitting it discards the ENTIRE prefill and
              // the teacher gets a chat reply instead of their tool. That is
              // exactly what happened to a Welsh phonics worksheet whose year
              // group, curriculum and objective were all extracted perfectly.
              //
              // It is almost always inferable even when unstated: "a phonics
              // worksheet" is English, "CVC words" is English, "column addition"
              // is Maths. Infer it rather than leaving it out.
              subject: {
                type: "string",
                description:
                  "Curriculum subject, e.g. \"Science\", \"Maths\", \"English\". " +
                  "ALWAYS set this when the tool has the field. Infer it from " +
                  "the topic when the teacher did not name it: phonics, reading, " +
                  "writing, spelling and comprehension are \"English\"; " +
                  "arithmetic, fractions and times tables are \"Maths\". " +
                  "Omitting it throws the whole prefill away.",
              },
              // Declared for a different reason than the three above.
              //
              // Those are EXTRACTED: the teacher says "year 6" and the value is
              // sitting in the sentence. This one has to be WRITTEN. A teacher
              // asking for "a Year 6 lesson on the Earth's atmosphere" has given
              // a topic, not an objective, and the model was quietly declining
              // to compose one — so the field arrived blank and Generate stayed
              // disabled, since LessonPlannerForm.tsx:47 requires it.
              //
              // It cannot be defaulted in code the way curriculum is. An
              // objective states what a teacher's pupils should achieve, and
              // inventing one would be putting words in their mouth. So the
              // instruction has to reach the model, which means living here
              // rather than in the per-tool description, which never travels.
              //
              // Louder failure on two tools: worksheet-generator and
              // homework-generator list learningObjective in `required`, so a
              // missing one makes validatePrefill return null and Jo answers in
              // chat instead of opening the tool at all.
              learningObjective: {
                type: "string",
                description:
                  "What pupils should be able to do by the end. ALWAYS provide " +
                  "this when the tool has the field: write one yourself when the " +
                  "teacher did not state it, phrased as a teacher would " +
                  "(\"Identify the stages of the water cycle\"). On " +
                  "worksheet-generator and homework-generator this carries the " +
                  "subject matter, because those tools have no topic field.",
              },
              // Declared here for the same reason as the others: per-tool
              // property schemas never travel, so letter-writer's own careful
              // wording ("the teacher's brief, restated as a clear instruction
              // of what to include") was never read. The model saw a field
              // called `content` on a letter tool and wrote the letter into it.
              //
              // That output then becomes the BRIEF for the letter generator,
              // so it was being asked to write a letter from a finished letter.
              // The form labels this box "Summary of key information", and the
              // prefill has to match what a teacher would type there.
              content: {
                type: "string",
                description:
                  "On letter-writer and similar tools: the NOTES a letter or " +
                  "message should be built from, never the finished text. " +
                  "Write terse bullet-style facts, not prose, and never open " +
                  "with a salutation or close with a sign-off. Good: \"Year 4 " +
                  "museum trip, 14 March. Needs: cost, packed lunch, consent " +
                  "form by 1 March.\" Bad: \"Dear Parents, I am writing to " +
                  "inform you...\" The tool writes the letter; this is its brief.",
              },
            },
            additionalProperties: true,
          },
        },
        required: ["slug", "fields"],
      },
    },
  };
}

/**
 * The clarifying question.
 *
 * Jo asks one when a field a tool NEEDS is genuinely ambiguous, offering two or
 * three concrete options rather than guessing. The handover calls this out as
 * one of the two behaviours that make Jo feel like an assistant rather than a
 * slot machine: guessing wrong burns a generation and teaches teachers not to
 * trust it.
 *
 * Deliberately bounded:
 *
 *   - ONE question, never a chain. The failure this guards against is Jo
 *     interrogating a teacher who was already perfectly clear.
 *   - The tool and the fields parsed so far travel WITH the question, so
 *     answering an option resolves straight to a prefill without a second
 *     round trip to the model.
 *   - The escape hatch is added by the client, not the model, so it is always
 *     present and always worded the same.
 */
export function clarifyFunctionDef() {
  return {
    type: "function" as const,
    function: {
      name: "ask_clarifying_question",
      description:
        "Ask the teacher ONE short question when a field the chosen tool needs " +
        "is genuinely ambiguous and guessing it wrong would waste a generation. " +
        "Do NOT call this when the request is already clear enough to act on, " +
        "and do NOT call it for a field the tool does not need. Prefer " +
        "prefill_tool whenever you can reasonably infer the answer.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            enum: ASSISTANT_TOOLS.map((t) => t.slug),
            description: "The tool this question is about.",
          },
          question: {
            type: "string",
            description:
              "The question, in one short sentence. No preamble, no apology.",
          },
          field: {
            type: "string",
            description: "Which form field the answer fills in.",
          },
          options: {
            type: "array",
            description:
              "Two or three concrete answers the teacher can pick. Each must be " +
              "a real value for the field, not a description of one.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "What the teacher sees." },
                value: { type: "string", description: "The value to put in the field." },
              },
              required: ["label", "value"],
            },
          },
          fields: {
            type: "object",
            description:
              "Everything already understood from the request, so answering the " +
              "question completes the form rather than restarting it.",
            additionalProperties: true,
          },
        },
        required: ["slug", "question", "field", "options", "fields"],
      },
    },
  };
}

/**
 * The traps a tool-selecting model needs told, once.
 *
 * Deliberately NOT a per-tool field dump. With 34 tools, listing every field and
 * its description would add thousands of tokens to EVERY turn — including the
 * majority that are ordinary questions and never call a tool.
 *
 * Note that the per-tool property schemas do NOT travel in the function
 * definition: `prefillFunctionDef` declares `fields` as an open object, and only
 * the tool summaries and the shared enum values (`sharedEnumGuide`) reach the
 * model. Anything a model must know character-for-character belongs in one of
 * those two places — not here, and not left implicit.
 *
 * What remains here is the handful of cross-cutting rules the schemas cannot
 * express on their own — the ones that would otherwise produce a form the
 * teacher cannot submit.
 */
export function toolSchemaDigest(): string {
  return [
    "Rules that apply across all tools:",
    "- Fill every field the teacher stated or clearly implied. Leave the rest out —",
    "  a missing field is far better than an invented one.",
    "- Use the exact enum values given in the tool's schema; anything else is discarded.",
    "- Some tools have no separate topic field and carry the subject matter in another",
    "  field instead (worksheet-generator and homework-generator use learningObjective,",
    "  model-text-generator uses write). Read the field descriptions.",
    "- Numeric-looking fields typed as strings (numberOfWeeks, duration, lengthWords,",
    "  wordCount) must be sent as digit strings, e.g. \"6\", never as numbers.",
    "- Never invent a pupil's name, observation notes, assessment data or a teacher's",
    "  judgement. Those belong to the teacher; fill the surrounding context instead.",
  ].join("\n");
}
