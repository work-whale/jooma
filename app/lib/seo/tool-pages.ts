import type { FaqItem } from "@/app/lib/landing/faq";
import { inWords } from "@/app/lib/landing/faq";
import { FREE_TRIES_PER_DAY } from "@/app/lib/trial-limits";

/**
 * The public page for each tool, as data. Read by app/teacher-tools, the
 * sitemap, the homepage tools grid and the structured data.
 *
 * Every claim here was checked against what the tool actually does (its form,
 * its route and its prompt), not against older marketing copy, which had
 * drifted: Google Slides and Google Docs export are "coming soon" in the app,
 * so no page offers them. Change a tool, change its page.
 *
 * "AI" is allowed in `title`, `h1`, `intro` and `description` only: that is how
 * teachers search ("AI report writer"), and the rest of the page talks about
 * what the tool makes. tests/unit/tool-pages.spec.ts enforces it.
 *
 * Keyed by the tool's href, the same key V2_META uses, so a page cannot attach
 * to the wrong tool. Pages are added in batches; a tool without one here is
 * listed on the index but not linked.
 */
export interface ToolPage {
  /** The tool's route in the app, and its key in tools.ts. */
  href: string;
  /** The public path segment, from the name teachers search for. */
  slug: string;
  /** The <title>, before " | Jooma". */
  title: string;
  h1: string;
  /** The meta description. Under 160 characters. */
  description: string;
  /** The direct answer under the H1: 40 to 60 words. */
  intro: string;
  steps: [string, string, string];
  features: string[];
  uk: { heading: string; body: string };
  faqs: FaqItem[];
  /** Hrefs of related tools; only those with a page are shown. */
  related: string[];
  /** The tool's id on /create, where a visitor can try it with no account. */
  guest?: "slides" | "comp" | "ws";
}

const tryFree = (what: string): FaqItem => ({
  q: "Can I try it without signing up?",
  a: `Yes. Make ${what} on the Jooma homepage with no account and no card, ${inWords(FREE_TRIES_PER_DAY)} times a day.`,
});

// Only what holds for every tool. Refine in a sentence exists on some tools,
// not all, so the pages that have it say so in their own features.
const editAnswer =
  "Yes. Every resource opens in an editor, so you can change any wording before you use it. Editing what you have made never costs credits.";

export const TOOL_PAGES: ToolPage[] = [
  {
    href: "/tools/report-writer",
    slug: "report-writer",
    title: "AI Report Writer for UK Teachers",
    h1: "AI report writer for school reports",
    description:
      "Turn your notes on strengths, areas to develop and targets into a personalised school report, subject by subject, in your tone. Built for UK teachers.",
    intro:
      "Jooma's AI report writer turns your notes into a finished school report. Add a pupil's first name, then their strengths, areas for development and targets for each subject. It writes a personal paragraph for every subject in the tone and length you choose, ready for you to check and edit.",
    steps: [
      "Add the pupil's first name and gender, so the pronouns are right, then choose the length and the tone, such as formal, warm or encouraging.",
      "For each subject, up to ten, note what they do well, what to work on and their next steps.",
      "Get a report with a paragraph per subject and an optional target for each. Refine it, then download it as PDF or Word.",
    ],
    features: [
      "A paragraph for every subject, written from your notes rather than stock phrases",
      "A target for each subject, or none if you prefer",
      "Any length from 50 to 1,000 words",
      "Your choice of tone, from formal to warm",
      "Changes in a sentence, such as make it more formal",
      "Download as PDF or Word, print it, or copy it into your school's system",
    ],
    uk: {
      heading: "Written the way UK reports are read",
      body: "Reports follow the shape parents expect from a UK school: what the pupil does well, what to work on, and a clear next step. Jooma only asks for a first name, and you should not enter any other personal details about the pupil.",
    },
    faqs: [
      {
        q: "Can it write reports for a whole class at once?",
        a: "Not yet. It writes one pupil's report at a time, covering up to ten subjects in one go.",
      },
      {
        q: "Will every report sound the same?",
        a: "No. Each paragraph is written from the strengths and areas for development you give it, and generic praise is left out. The more specific your notes, the more personal the report.",
      },
      {
        q: "Is it safe to use with pupil information?",
        a: "Enter a first name only. Do not enter surnames, dates of birth or other personal details. Your reports are stored in the UK.",
      },
      { q: "Can I edit the report?", a: editAnswer },
    ],
    related: ["/tools/lesson-planner", "/tools/policy-generator", "/tools/quiz-generator"],
  },
  {
    href: "/tools/lesson-planner",
    slug: "lesson-planner",
    title: "AI Lesson Planner for UK Teachers",
    h1: "AI lesson planner for UK teachers",
    description:
      "Plan a full lesson from a topic and objective: success criteria, vocabulary, starter, activities, plenary and assessment. Built for UK teachers.",
    intro:
      "Jooma's AI lesson planner builds a full lesson plan from your topic and learning objective. You get success criteria, key vocabulary, prior knowledge questions, a starter, the main input, activities and a plenary, matched to your year group and curriculum, ready to edit and print.",
    steps: [
      "Choose your curriculum, year group and subject, then give the topic and the learning objective.",
      "Pick how detailed you want it, and switch on adaptations if you need support for SEND, EAL or other groups.",
      "Get a structured plan you can edit, then download it as PDF or Word, or print it.",
    ],
    features: [
      "Success criteria, and the knowledge and skills behind the objective",
      "A key vocabulary table with four to six terms",
      "Five diagnostic questions to check prior knowledge",
      "A starter, a step by step main input with checkpoints and common misconceptions, two activities and a plenary",
      "Optional adaptations for SEND, EAL and SEMH",
      "Summative assessment and a resources list",
      "Condensed, standard or detailed, depending on how much you need",
    ],
    uk: {
      heading: "Planned for UK classrooms",
      body: "Choose the 2014 National Curriculum, EYFS, Curriculum for Excellence, the Curriculum for Wales or the Northern Ireland curriculum, for any year from Nursery to Year 11. Plans are written with Ofsted's inspection framework and the Teachers' Standards in mind.",
    },
    faqs: [
      {
        q: "Does it work for any subject?",
        a: "Yes. You type the subject and the topic, so it covers anything from phonics to GCSE chemistry, for any year group from Nursery to Year 11.",
      },
      {
        q: "Can I adapt the plan for pupils with SEND?",
        a: "Yes. Switch on differentiation and the plan adds an adaptation section covering SEND, EAL and SEMH, with reference to the SEND Code of Practice.",
      },
      {
        q: "Can it make the slides and the worksheet too?",
        a: "Yes, with Slides and Worksheets, which are separate tools in Jooma. Jo, the assistant built into Jooma, can open them with your topic already filled in.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/slideshow", "/tools/worksheet-generator", "/tools/eyfs-planner"],
  },
  {
    href: "/tools/worksheet-generator",
    slug: "worksheet-generator",
    guest: "ws",
    title: "AI Worksheet Generator for UK Teachers",
    h1: "AI worksheet generator for any topic and year group",
    description:
      "Make a print ready worksheet for any topic and year group, with questions that build in difficulty, an answers page and versions for each ability band.",
    intro:
      "Jooma's AI worksheet generator makes a print ready worksheet from your learning objective. Questions climb from recall to challenge, with marks, a word bank where it helps and a full answers page. Need it pitched differently for different groups? It makes a separate version for each band.",
    steps: [
      "Pick your curriculum, year group and subject, and write the learning objective.",
      "Choose the question types and how many questions, from 5 to 30, and switch on differentiation if you want a version for each band.",
      "Get a designed worksheet with an answers page. Change the theme, then download it as PDF or Word, or print it.",
    ],
    features: [
      "Sections that build from recall to understanding, application and challenge",
      "Fourteen question types, from multiple choice and matching to labelling and extended writing",
      "Marks on every question and a full answers page, with model answers for longer questions",
      "Separate versions for Working Below, Working Towards, Expected and Greater Depth, with no band name on the pupil's sheet",
      "Teacher notes on common misconceptions",
      "Nine page themes, including Easy Read and High Contrast",
    ],
    uk: {
      heading: "Pitched the way UK classrooms are",
      body: "Differentiation uses the bands UK teachers already work with: Working Towards, Expected and Greater Depth, plus Working Below. Each version is written for the same objective, so the whole class is learning the same thing at the right level.",
    },
    faqs: [
      tryFree("a worksheet"),
      {
        q: "Does it include answers?",
        a: "Yes. Every worksheet comes with an answers page, including model answers and success criteria for the extended questions.",
      },
      {
        q: "Can I make different versions for different abilities?",
        a: "Yes. Choose the bands you need and Jooma makes one worksheet per band, each in its own tab. The band name never appears on the pupil's copy.",
      },
      { q: "Can I edit the worksheet?", a: editAnswer },
    ],
    related: ["/tools/comprehension-generator", "/tools/quiz-generator", "/tools/lesson-planner"],
  },
  {
    href: "/tools/slideshow",
    slug: "slideshow-generator",
    guest: "slides",
    title: "AI Slideshow Generator for Teachers",
    h1: "AI slideshow generator for teaching slides",
    description:
      "Turn one line into a teaching slideshow with activities, pictures and answer slides. Edit every slide, present from Jooma or download PowerPoint.",
    intro:
      "Jooma's AI slideshow generator turns one line into a full teaching deck. Give it a topic and year group and it builds the content slides, adds activities with answer slides and finds the pictures. Edit any slide, then present from Jooma or download it as PowerPoint or PDF.",
    steps: [
      "Type your topic and year group, and choose how many content slides you want.",
      "Add the extras you need: learning objectives, key vocabulary, listening clips, a YouTube video, or a resource you already have.",
      "Pick a theme, edit any slide, then present from Jooma or download PowerPoint or PDF.",
    ],
    features: [
      "Content slides plus activities, such as multiple choice, ordering and vocabulary matching, each with an answer slide",
      "Pictures from the web, or illustrations made in one of six styles",
      "Optional listening clips with activities, and a YouTube video you choose",
      "Reading level set for your class, from two levels below to one above",
      "Forty eight themes, from clean and plain to fully illustrated",
      "Present from Jooma, or download PowerPoint or PDF",
    ],
    uk: {
      heading: "Matched to the curriculum you teach",
      body: "For primary year groups, slides can be aligned to the National Curriculum in England for Years 1 to 6, the Early Learning Goals in Reception and Development Matters in Nursery, so the content matches what your class is expected to learn.",
    },
    faqs: [
      tryFree("a slideshow"),
      {
        q: "Can I download it as PowerPoint?",
        a: "Yes. Download the deck as a PowerPoint file or a PDF, or present it straight from Jooma.",
      },
      {
        q: "Does it work with Google Slides?",
        a: "Not directly yet. Download the PowerPoint file and open it in Google Slides, which imports PowerPoint decks.",
      },
      {
        q: "How many slides does it make?",
        a: "You choose the number of content slides, from 5 to 14. Activity and answer slides are added on top, along with any listening or video slides you ask for.",
      },
    ],
    related: ["/tools/lesson-planner", "/tools/quiz-generator", "/tools/worksheet-generator"],
  },
  {
    href: "/tools/quiz-generator",
    slug: "quiz-generator",
    title: "AI Quiz Generator for Teachers",
    h1: "AI quiz generator for retrieval practice",
    description:
      "Make a multiple choice quiz on any topic, then export it to Kahoot, Blooket, Gimkit, Wayground, Google Forms or Microsoft Forms. Built for UK teachers.",
    intro:
      "Jooma's AI quiz generator writes a multiple choice quiz on any topic for your year group. Every question has four options and one correct answer. Edit the questions, then export the quiz to Kahoot, Blooket, Gimkit or Wayground, or print it with an answer key.",
    steps: [
      "Choose your curriculum, year group, subject and topic.",
      "Set how many questions you want, up to 20, and the time allowed for each.",
      "Edit or add questions, then export to your quiz platform or download a printable copy with the answers.",
    ],
    features: [
      "Multiple choice questions with four options and one correct answer",
      "Up to 20 questions, all editable, and you can add your own",
      "Ready to import into Kahoot, Blooket, Gimkit and Wayground",
      "Export to Google Forms or Microsoft Forms",
      "A printable PDF or Word copy, with the answer key on its own page",
    ],
    uk: {
      heading: "Retrieval practice at the right level",
      body: "Quizzes follow the curriculum and year group you choose, so the questions sit at the right level for your class, whether that is a quick Year 4 recap or a Year 10 science starter.",
    },
    faqs: [
      {
        q: "Which quiz platforms does it work with?",
        a: "Kahoot, Blooket, Gimkit and Wayground through a ready made import file, plus Google Forms and Microsoft Forms. You can also print it.",
      },
      {
        q: "What kind of questions does it write?",
        a: "Multiple choice, with four options and one correct answer. That is the format every quiz platform imports cleanly.",
      },
      {
        q: "Can I change the questions?",
        a: "Yes. Edit any question or answer, add your own, or ask Jooma to refine the whole quiz in a sentence.",
      },
    ],
    related: ["/tools/worksheet-generator", "/tools/comprehension-generator", "/tools/slideshow"],
  },
  {
    href: "/tools/comprehension-generator",
    slug: "comprehension-generator",
    guest: "comp",
    title: "AI Reading Comprehension Generator for Teachers",
    h1: "AI reading comprehension generator",
    description:
      "Make a reading comprehension with an original passage, questions tagged to the reading content domains, marks and an answer key, for any year group.",
    intro:
      "Jooma's AI comprehension generator writes an original passage on your topic, or uses your own text, then sets questions tagged to the reading content domains. Every question carries marks, there is an answer key, and you can make simpler or harder versions for different groups in your class.",
    steps: [
      "Choose your year group, then either give a topic and passage length or paste your own text.",
      "Pick the complexity, the reading domains to cover and the question types.",
      "Get a print ready sheet with a key words bank, questions by domain and an answers page.",
    ],
    features: [
      "An original passage from 100 to 800 words, or your own text, placed exactly as written",
      "Questions grouped by content domain, such as retrieval, inference and word meaning, each tagged with its code",
      "Multiple choice, short answer, extended writing, true or false, gap fill and vocabulary in context",
      "Marks on every question and an answer key",
      "A key words bank of four to six words",
      "A version for each ability band, with a shorter passage for pupils working below or towards the standard",
    ],
    uk: {
      heading: "Tagged to the KS1 and KS2 reading domains",
      body: "Questions are tagged to the reading content domains from the national curriculum test frameworks: 1a to 1e at Key Stage 1 and 2a to 2h at Key Stage 2. You can see at a glance which skills a sheet practises, which helps with SATs reading practice.",
    },
    faqs: [
      tryFree("a comprehension"),
      {
        q: "Can I use my own text?",
        a: "Yes. Choose Use my own text and paste it in. It goes on the sheet exactly as written, and Jooma writes the questions.",
      },
      {
        q: "Which reading skills does it cover?",
        a: "You choose the content domains, such as word meaning, retrieval, summarising, inference and prediction, and it writes questions for each one.",
      },
      {
        q: "Can I make easier and harder versions?",
        a: "Yes. Choose the bands and it makes a version for each, with a shorter passage for pupils working below or towards the expected standard.",
      },
    ],
    related: ["/tools/worksheet-generator", "/tools/quiz-generator", "/tools/lesson-planner"],
  },
  {
    href: "/tools/eyfs-planner",
    slug: "eyfs-planner",
    title: "AI EYFS Planner for Early Years Teachers",
    h1: "AI EYFS planner for all seven areas of learning",
    description:
      "Plan an early years topic across all seven areas of learning, with indoor, outdoor and adult led activities, key vocabulary and Early Learning Goals.",
    intro:
      "Jooma's AI EYFS planner turns a topic into a full early years plan across all seven areas of learning. Each area gets continuous provision ideas for indoors and outdoors, plus adult led activities, with resources, key vocabulary and the Early Learning Goal each activity supports.",
    steps: [
      "Give your topic and how many weeks the plan should cover, from one to twelve.",
      "Tick the extras you want: a book list, home learning ideas or a weekly overview.",
      "Get a plan across all seven areas that you can edit, download as PDF or Word, or print.",
    ],
    features: [
      "All seven areas: Communication and Language, Physical Development, PSED, Literacy, Mathematics, Understanding the World, and Expressive Arts and Design",
      "Two indoor and two outdoor continuous provision activities in every area",
      "Two adult led activities in every area",
      "Resources and four to six key words for each activity",
      "The Early Learning Goal each activity works towards",
      "An optional book list, home learning ideas and a weekly overview",
    ],
    uk: {
      heading: "Built on the EYFS framework",
      body: "Plans follow the seven areas of learning in the EYFS statutory framework and quote the Early Learning Goal each activity supports, so your planning shows clearly how your provision links to the framework.",
    },
    faqs: [
      {
        q: "Does it cover all seven areas of learning?",
        a: "Yes. Every plan covers all seven, with indoor and outdoor continuous provision and adult led activities in each.",
      },
      {
        q: "Can it plan more than one week?",
        a: "Yes. Choose anything from one to twelve weeks, and add a weekly overview if you want one.",
      },
      {
        q: "Can I adapt activities for children who need more support?",
        a: "Yes. Switch on differentiation and each activity gets a note on how to adapt it.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/lesson-planner", "/tools/slideshow", "/tools/comprehension-generator"],
  },
  {
    href: "/tools/policy-generator",
    slug: "policy-generator",
    title: "AI School Policy Generator for UK Schools",
    h1: "AI policy generator for UK schools",
    description:
      "Draft a school policy, or the section structure for one, for any area of school life, with numbered sections that reference UK law and guidance.",
    intro:
      "Jooma's AI policy generator drafts a school policy for any area of school life, from safeguarding and SEND to data protection and staffing. You get numbered sections that reference UK legislation and DfE guidance, with placeholders for your school's details, ready for you to adapt and approve.",
    steps: [
      "Type the policy you need, or pick from presets across safeguarding, curriculum, SEND, behaviour, health and safety, staffing, data and governance.",
      "Add anything specific to your setting, and choose a full draft or just the section structure.",
      "Get a draft with placeholders for your school's details, ready to edit, refine and download as PDF or Word.",
    ],
    features: [
      "A full policy draft, or a section structure to write into yourself",
      "Numbered sections and sub sections",
      "References to UK legislation and to DfE, Ofsted, ICO and HSE guidance where they apply",
      "An information block for your school name, owner, dates, approval and linked policies",
      "One click presets for common policies across eight areas of school life",
      "Changes to any section in a sentence",
    ],
    uk: {
      heading: "A starting point, not a finished policy",
      body: "Every policy is a draft for your school to check, adapt and approve. It points to the UK legislation and guidance that usually applies, but your leaders and governors are responsible for the final version.",
    },
    faqs: [
      {
        q: "Is the policy legally checked?",
        a: "No. It is a well structured draft that references the relevant UK law and guidance, but your school needs to check and adapt it before it is approved.",
      },
      {
        q: "Which policies can it write?",
        a: "Any area of school life. There are presets for common policies across safeguarding, curriculum, SEND, behaviour, health and safety, staffing, data protection and governance, or you can type your own.",
      },
      {
        q: "Can I just get the structure?",
        a: "Yes. Choose the section structure and you get the headings, with a short note on what each section should cover.",
      },
      { q: "Can I edit the policy?", a: editAnswer },
    ],
    related: ["/tools/report-writer", "/tools/lesson-planner", "/tools/eyfs-planner"],
  },

  // ── Batch 3: assessment, SEND and behaviour, letters ─────────────────────
  {
    href: "/tools/model-answer-generator",
    slug: "model-answer-generator",
    title: "AI Model Answer Generator for Teachers",
    h1: "AI model answer generator for exam questions",
    description:
      "Paste an exam question and get a model answer pitched at the marks, with annotated teacher notes on criteria, technique and common errors.",
    intro:
      "Jooma's AI model answer generator writes a model answer to any exam question you give it, pitched at the marks available. Paste in your mark scheme for a closer match. Alongside the answer you get annotated teacher notes on what earns the marks, common errors and how to use it in class.",
    steps: [
      "Choose your curriculum, year group and subject, and paste the exam question.",
      "Set the total marks, from 1 to 50, and add your mark scheme or any guidelines if you have them.",
      "Get the model answer with teacher notes. Ask for a stronger or simpler version, then download it as PDF or Word.",
    ],
    features: [
      "A model answer in continuous prose, with its length matched to the marks",
      "Teacher notes on the assessment criteria, content coverage and skills shown",
      "What separates a full mark answer from a near miss",
      "Common errors to warn pupils about",
      "Three ideas for using it in class, including peer and self assessment",
      "Versions that score more or fewer marks, on request",
    ],
    uk: {
      heading: "Written for UK exam questions",
      body: "Use it for GCSE, A level or any internal assessment. It follows the mark scheme or specification wording you paste in, so the answer matches what your exam board and your department are looking for.",
    },
    faqs: [
      {
        q: "Does it know my exam board's mark scheme?",
        a: "Paste the mark scheme or specification text into the content requirements and it writes to that. Without one, it follows general UK exam conventions.",
      },
      {
        q: "Can it mark my pupils' answers?",
        a: "No. It writes model answers for you to teach from. It does not mark pupil work.",
      },
      {
        q: "Can I get a weaker answer to compare?",
        a: "Yes. Ask for a version that scores fewer marks, which is useful for showing pupils what separates a good answer from a great one.",
      },
      { q: "Can I edit the answer?", a: editAnswer },
    ],
    related: ["/tools/exam-question-generator", "/tools/worksheet-generator", "/tools/quiz-generator"],
  },
  {
    href: "/tools/smart-targets",
    slug: "smart-targets",
    title: "AI SMART Targets Generator for Teachers",
    h1: "AI SMART targets generator",
    description:
      "Turn rough pupil targets into SMART targets in a clear table, specific, measurable, achievable, relevant and time bound, written so pupils understand them.",
    intro:
      "Jooma's AI SMART targets generator turns rough targets into proper SMART ones. Type the targets you have in mind and it sets each one out in a table that makes it specific, measurable, achievable, relevant and time bound, written in the first person so pupils can read and own them.",
    steps: [
      "Choose the curriculum and the year group.",
      "Type the targets you have in mind, as roughly as you like.",
      "Get a SMART table you can edit, refine and download as PDF or Word.",
    ],
    features: [
      "One row per target, broken down into Specific, Measurable, Achievable, Relevant and Time bound",
      "Written for pupils in the first person: I will, and I can show this by",
      "An approximate date or duration for each target",
      "Short, clear cells of two or three sentences at most",
      "Simpler or harder wording, or longer or shorter deadlines, on request",
    ],
    uk: {
      heading: "Fits SEN support plans",
      body: "Targets are written with the SEND Code of Practice in mind, so they work in an SEN support plan or alongside EHCP outcomes. Jooma only uses the targets you type, never pupil records.",
    },
    faqs: [
      {
        q: "Do I need to enter pupil details?",
        a: "No. It only needs the targets and the year group. Do not enter names or other personal details.",
      },
      {
        q: "Can I use these for SEN support or EHCP targets?",
        a: "Yes, as a starting point. Targets follow the SEND Code of Practice, but agree them with the pupil, their parents and your SENCO.",
      },
      {
        q: "Can I make the language simpler?",
        a: "Yes. Ask for simpler or harder wording, or longer or shorter deadlines, and it rewrites the table.",
      },
      { q: "Can I edit the targets?", a: editAnswer },
    ],
    related: ["/tools/one-page-profile", "/tools/behaviour-support-plan", "/tools/targeted-intervention"],
  },
  {
    href: "/tools/ect-report-writer",
    slug: "ect-report-writer",
    title: "AI ECT Report Writer for Mentors and Induction Tutors",
    h1: "AI ECT report writer for induction assessments",
    description:
      "Write an ECT assessment report from your notes, with evidence linked to the Teachers' Standards, development actions and an optional development plan.",
    intro:
      "Jooma's AI ECT report writer turns your notes on an early career teacher into a professional assessment report. Strengths and areas for development are linked to the Teachers' Standards by number, with action steps, a summary of their progress and an optional professional development plan.",
    steps: [
      "Enter the early career teacher's name and, if you like, their subject.",
      "Note their strengths and areas for development, and tick if you want a professional development plan.",
      "Get a report to check, edit and download as PDF or Word for your induction records.",
    ],
    features: [
      "Strengths linked to the Teachers' Standards by number and title",
      "Three areas for development, each with practical action steps",
      "A professional summary, including whether they are on track",
      "An optional development plan with short, medium and long term actions",
      "Recommended reading and resources, including books and school based support",
      "Written in the third person, in a professional tone",
    ],
    uk: {
      heading: "Built around the Teachers' Standards",
      body: "Reports reference the Teachers' Standards and the Early Career Framework, set out the way induction tutors and appropriate bodies expect. Check every piece of evidence against your own records before it goes into an official report.",
    },
    faqs: [
      {
        q: "Is this the appropriate body's official form?",
        a: "No. It gives you well structured content to copy into your appropriate body's own form or your school's template.",
      },
      {
        q: "Will it add evidence I did not give it?",
        a: "It expands your notes into full paragraphs, so read it carefully and remove anything your own observations do not support.",
      },
      {
        q: "What personal data does it need?",
        a: "Only the teacher's name, which appears in the report title. Do not add other personal details. Reports are stored in the UK.",
      },
      { q: "Can I edit the report?", a: editAnswer },
    ],
    related: ["/tools/lesson-observation-report", "/tools/performance-management", "/tools/report-writer"],
  },
  {
    href: "/tools/behaviour-support-plan",
    slug: "behaviour-support-plan",
    title: "AI Behaviour Support Plan Generator for Schools",
    h1: "AI behaviour support plan generator",
    description:
      "Build an individual behaviour support plan from your notes: triggers, strategies, de-escalation steps, rewards and review criteria, set out in clear tables.",
    intro:
      "Jooma's AI behaviour support plan generator turns your notes on a pupil into a full individual plan. Describe the behaviour and its triggers, and it sets out targets, prevention strategies, de-escalation steps, rewards and review criteria in clear tables that every adult working with the pupil can follow.",
    steps: [
      "Enter the pupil's first name and year group, then describe the behaviour and what tends to trigger it.",
      "Add what helps: their strengths and interests, any additional needs, what has been tried before and the key staff.",
      "Get a plan in tables, ready to share with staff, agree with parents and download as PDF or Word.",
    ],
    features: [
      "Targets for each challenging behaviour, and a strategy for each trigger",
      "Prevention strategies, early warning signs and the phrases to use",
      "De-escalation steps, support after an incident and calming techniques",
      "Rewards, movement breaks and responses agreed in advance",
      "A blank incident log and success criteria for the review",
      "A signature table for parents and staff",
    ],
    uk: {
      heading: "In line with UK SEND and behaviour guidance",
      body: "Plans draw on the SEND Code of Practice and the DfE's behaviour in schools guidance, with a positive behaviour support approach that puts prevention before reaction.",
    },
    faqs: [
      {
        q: "What information should I enter?",
        a: "The pupil's first name only, plus what you know about the behaviour and what helps. Do not enter surnames or anything else that identifies the pupil. Plans are stored in the UK.",
      },
      {
        q: "Can I share it with parents?",
        a: "Yes. Download it as PDF or Word. It includes a signature table for parents and staff once the plan is agreed.",
      },
      {
        q: "What if I do not know the review dates yet?",
        a: "Leave them out and the plan marks them as to be completed, so nothing is invented.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/one-page-profile", "/tools/smart-targets", "/tools/targeted-intervention"],
  },
  {
    href: "/tools/one-page-profile",
    slug: "one-page-profile",
    title: "AI One Page Profile Generator for SEND",
    h1: "AI one page profile generator",
    description:
      "Write a person centred one page profile in the pupil's own voice: what people admire about them, what helps and what they hope for, from your notes.",
    intro:
      "Jooma's AI one page profile generator turns your notes into a person centred profile written in the pupil's own voice. It covers what people like and admire about them, what makes them happy, what they need support with and how they like to be helped, with optional evidence based strategies.",
    steps: [
      "Enter the pupil's first name and year group, what people admire about them and what they need support with.",
      "Add what makes them happy, how they like to be supported and their hopes, plus any interventions or outside agencies.",
      "Get a profile in the first person, ready to check with the pupil and their family and download as PDF or Word.",
    ],
    features: [
      "Written in the first person, in the pupil's voice",
      "What people like and admire about me, and what makes me happy",
      "What I need support with, and how I would like to be supported",
      "My hopes and wishes for the future",
      "Optional essential and recommended strategies, plus curriculum accommodations",
      "Links to interventions and outside agencies such as CAMHS or an educational psychologist",
    ],
    uk: {
      heading: "Person centred, as the SEND Code of Practice asks",
      body: "One page profiles are a person centred planning tool the SEND Code of Practice encourages. Jooma drafts the profile from your notes. It works best when you then check it with the pupil and their family, so it truly sounds like them.",
    },
    faqs: [
      {
        q: "Is the profile written by the pupil?",
        a: "No. Jooma writes it in the pupil's voice from your notes. Share it with the pupil and their family and change anything that does not sound like them.",
      },
      {
        q: "What information should I enter?",
        a: "A first name and your notes on the pupil. Do not enter surnames or other identifying details. Profiles are stored in the UK.",
      },
      {
        q: "Can it suggest strategies?",
        a: "Yes. Leave the evidence based strategies option on and it adds essential and recommended strategies alongside the pupil's own input.",
      },
      { q: "Can I edit the profile?", a: editAnswer },
    ],
    related: ["/tools/behaviour-support-plan", "/tools/smart-targets", "/tools/targeted-intervention"],
  },
  {
    href: "/tools/targeted-intervention",
    slug: "targeted-intervention",
    title: "AI Intervention Ideas Generator for Teachers",
    h1: "AI targeted intervention ideas for any subject",
    description:
      "Turn attitudinal, aptitude and attainment data into eight to ten intervention strategies for a pupil or group, each with practical steps to put it in place.",
    intro:
      "Jooma's AI intervention generator turns what you know about a pupil or group into eight to ten targeted strategies. Add attitudinal data, plus aptitude and attainment data if you have it, and each strategy comes with a short summary and three practical activities to put it into practice.",
    steps: [
      "Choose the curriculum, year group and subject.",
      "Add attitudinal data, plus aptitude, attainment or other data such as attendance or EAL, if you have it.",
      "Get eight to ten strategies with activities, then turn any of them into a worksheet in Jooma.",
    ],
    features: [
      "Eight to ten numbered intervention strategies",
      "A short summary of each strategy",
      "Three practical activities to put each one in place",
      "A link from each strategy to the worksheet generator",
      "Optional adaptation notes for different ability bands",
    ],
    uk: {
      heading: "Uses the data UK schools already collect",
      body: "Built for the data you already have, such as attitude surveys, cognitive ability scores and attainment, and informed by the approaches the EEF promotes. Use scores and groups rather than names.",
    },
    faqs: [
      {
        q: "What data do I need?",
        a: "Attitudinal data is the only thing required, such as survey scores. Aptitude, attainment and other data like attendance make the strategies sharper.",
      },
      {
        q: "Should I enter pupil names?",
        a: "No. Use scores, groups and descriptions instead. Your strategies are stored in the UK.",
      },
      {
        q: "Does it cite research?",
        a: "No. Strategies are written as practical classroom steps rather than research references.",
      },
      { q: "Can I edit the strategies?", a: editAnswer },
    ],
    related: ["/tools/pupil-premium-planner", "/tools/smart-targets", "/tools/worksheet-generator"],
  },
  {
    href: "/tools/pupil-premium-planner",
    slug: "pupil-premium-planner",
    title: "AI Pupil Premium Strategy Planner for Schools",
    h1: "AI pupil premium planner",
    description:
      "Turn your school's challenges into a tiered pupil premium plan: high quality teaching, targeted academic support and wider strategies, with monitoring.",
    intro:
      "Jooma's AI pupil premium planner turns the challenges your disadvantaged pupils face into a tiered strategy. For each challenge it suggests high quality teaching, targeted academic support and wider strategies, each with an approach, implementation steps, the intended impact and how you will monitor it.",
    steps: [
      "Describe the challenges your disadvantaged pupils face, up to three at a time for the best results.",
      "Choose your phase, from early years to secondary, a special school or alternative provision.",
      "Get a tiered plan to edit and download as PDF or Word, ready to build your strategy statement from.",
    ],
    features: [
      "Three tiers for every challenge: high quality teaching, targeted academic support and wider strategies",
      "An approach, implementation steps, intended impact and monitoring for each tier",
      "Pitched to your phase, including special schools and alternative provision",
      "Changes to any section in a sentence",
    ],
    uk: {
      heading: "Follows the DfE tiered approach",
      body: "Plans use the tiered approach the DfE asks schools to follow for pupil premium, drawing on EEF evidence. They give you the strategy content; your published statement still needs your funding figures and outcomes.",
    },
    faqs: [
      {
        q: "Does it fill in the DfE strategy statement template?",
        a: "Not directly. It writes the tiered strategy content to use in your statement. Budget figures, outcomes and the review of last year come from you.",
      },
      {
        q: "How many challenges can I enter?",
        a: "As many as you like, but up to three at a time gives the most detailed plan.",
      },
      {
        q: "Does it need pupil data?",
        a: "No. Describe the challenges in general terms, without naming pupils.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/targeted-intervention", "/tools/school-improvement-plan", "/tools/policy-generator"],
  },
  {
    href: "/tools/risk-assessment",
    slug: "risk-assessment-generator",
    title: "AI Risk Assessment Generator for Schools",
    h1: "AI risk assessment generator for trips and activities",
    description:
      "Draft a risk assessment for a school trip or activity: hazards, who could be harmed, likelihood and severity scores, controls and further actions.",
    intro:
      "Jooma's AI risk assessment generator drafts a risk assessment for any school trip or activity, from a museum visit to a science practical. It lists at least ten hazards, who could be harmed, likelihood and severity scores with a risk level, the controls already in place and further actions to take.",
    steps: [
      "Choose the curriculum and year group, and describe the activity or trip.",
      "Add the location, the transport and the resources, if they apply.",
      "Get a risk assessment table to check, adapt and download as PDF or Word.",
    ],
    features: [
      "At least ten hazards, including one for pupils with SEND or medical needs",
      "Who or what might be harmed, and how",
      "Likelihood from 1 to 4 and severity from 1 to 5, multiplied into a risk level",
      "Existing control measures and further actions required",
      "Works for trips and for activities in school, such as science practicals and DT workshops",
    ],
    uk: {
      heading: "Built on UK health and safety law",
      body: "Assessments reference the Health and Safety at Work Act, the Management of Health and Safety at Work Regulations and DfE and HSE guidance. They are a draft for your trip leader and educational visits coordinator to check and approve through your usual process.",
    },
    faqs: [
      {
        q: "Is it ready to sign off?",
        a: "It is a thorough draft. Your trip leader and educational visits coordinator should check it, add anything specific to your setting and approve it through your usual process.",
      },
      {
        q: "Does it use my local authority's form?",
        a: "No. It produces a standard risk table you can copy into EVOLVE or your local authority's own form.",
      },
      {
        q: "Can it cover activities in school?",
        a: "Yes. Describe any activity, such as a chemistry practical or a DT workshop, and it assesses that.",
      },
      { q: "Can I edit the assessment?", a: editAnswer },
    ],
    related: ["/tools/letter-writer", "/tools/policy-generator", "/tools/newsletter-writer"],
  },
  {
    href: "/tools/letter-writer",
    slug: "letter-writer",
    title: "AI Letter Writer for Schools",
    h1: "AI letter writer for parent and staff letters",
    description:
      "Write a clear school letter to parents, staff or governors from a few key points, in a formal, semi formal or informal tone, ready to sign.",
    intro:
      "Jooma's AI letter writer turns a few key points into a clear, well structured school letter. Say who it is for and what it needs to say, choose the tone and the date, and it writes the letter, leaving placeholders for anything you have not told it so nothing is made up.",
    steps: [
      "Say who the letter is for, such as parents and carers, staff or governors.",
      "List the key information it needs to include, then choose the date and the tone.",
      "Get a finished letter with your name and school left as placeholders, ready to edit and download as PDF or Word.",
    ],
    features: [
      "Two to four clear paragraphs, from greeting to sign off",
      "Formal, semi formal or informal, with a sign off to match",
      "The date in British format",
      "Placeholders for missing details instead of invented facts",
      "Your name, role and school left for you to add",
    ],
    uk: {
      heading: "Written the way UK schools write home",
      body: "Letters use the conventions parents expect from a UK school, from the date format to the sign off, and stick to the facts you give. Add your own letterhead when you print or send it.",
    },
    faqs: [
      {
        q: "Can it write letters to parents?",
        a: "Yes, and to staff, governors or anyone else. You say who it is for and it writes for that audience.",
      },
      {
        q: "Will it make up details?",
        a: "No. Anything you have not told it, such as a date or a cost, is left as a placeholder for you to fill in.",
      },
      {
        q: "Does it add our school letterhead?",
        a: "Not yet. Download it as Word and paste it into your letterhead template.",
      },
      { q: "Can I edit the letter?", a: editAnswer },
    ],
    related: ["/tools/newsletter-writer", "/tools/risk-assessment", "/tools/policy-generator"],
  },

  // ── Batch 2: staff slides, planning, classroom resources, exams ──────────
  {
    href: "/tools/cpd-slideshow",
    slug: "cpd-slideshow-generator",
    title: "AI CPD Slideshow Generator for School Leaders",
    h1: "AI CPD slideshow generator for staff training",
    description:
      "Build a staff training deck on any topic, with a hook, key ideas, quotes, statistics, activities and next steps. Download it as PowerPoint or PDF.",
    intro:
      "Jooma's AI CPD slideshow generator builds a staff training deck on any topic, from adaptive teaching to attendance. Choose a practical or research focus and the number of slides, and it opens with a hook, sets out the key ideas, adds discussion activities and ends with next steps for staff.",
    steps: [
      "Type the training topic, and any focus areas you want it to cover.",
      "Choose the number of slides, from 2 to 20, and a practical or a research and theory focus.",
      "Edit the deck, then download it as PowerPoint or PDF to present.",
    ],
    features: [
      "A title slide that sets out what staff will be able to do by the end",
      "A mix of content, quote, statistic, two column and activity slides",
      "Activity slides with timings for discussion and reflection",
      "Callouts for key points, reflection and things to try",
      "A closing next steps slide",
      "A suggested image search for each slide",
    ],
    uk: {
      heading: "Pitched for UK staff training",
      body: "Decks reference the Teachers' Standards, Ofsted's inspection framework and DfE guidance where they are relevant. Quotes and statistics are drafted for you, so check them against their sources before you present.",
    },
    faqs: [
      {
        q: "Does it include speaker notes?",
        a: "Not yet. Each slide is kept short for the screen, so add your own notes in PowerPoint after you download it.",
      },
      {
        q: "Does it add pictures?",
        a: "It suggests an image search for each slide. You add the images you want after downloading.",
      },
      {
        q: "Should I check the quotes and statistics?",
        a: "Yes. They are drafted to support your topic, so confirm each one against its source before you present.",
      },
      {
        q: "Does it work with Google Slides?",
        a: "Not directly yet. Download the PowerPoint file and open it in Google Slides, which imports PowerPoint decks.",
      },
    ],
    related: ["/tools/slideshow", "/tools/meeting-planner", "/tools/lesson-observation-report"],
  },
  {
    href: "/tools/medium-term-planner",
    slug: "medium-term-planner",
    title: "AI Medium Term Planner for UK Teachers",
    h1: "AI medium term planner for a whole topic",
    description:
      "Plan a topic lesson by lesson: a title, objective, summary and key knowledge for every lesson, in one clear table. Paste in your exam spec if you have one.",
    intro:
      "Jooma's AI medium term planner maps out a whole topic, lesson by lesson. Choose the number of lessons and it sets out each one in a clear table with a title, a learning objective, a short summary and the key knowledge pupils should come away with, sequenced so each lesson builds on the last.",
    steps: [
      "Choose your curriculum, year group and subject, and give the topic.",
      "Set the number of lessons, from 1 to 30, and paste in your exam specification or curriculum guidance if you have it.",
      "Get a sequenced plan in one table, ready to edit and download as PDF or Word.",
    ],
    features: [
      "One row per lesson, for anything from 1 to 30 lessons",
      "A learning objective for every lesson",
      "A three or four sentence summary of each lesson",
      "Three to five key knowledge statements per lesson",
      "Content drawn from your exam specification when you paste it in",
    ],
    uk: {
      heading: "Sequenced so knowledge builds",
      body: "Lessons are ordered so knowledge builds across the topic, the kind of curriculum sequencing Ofsted's inspection framework looks at. Works with the 2014 National Curriculum, EYFS, Curriculum for Excellence, the Curriculum for Wales and the Northern Ireland curriculum.",
    },
    faqs: [
      {
        q: "Does it know my exam board's specification?",
        a: "Paste the relevant part of your specification in and it plans to it. It does not hold exam board specifications itself.",
      },
      {
        q: "Can I plan each lesson in full?",
        a: "Yes. Take any lesson into the lesson planner for a full plan, or into Slides for the teaching deck.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/topic-overview", "/tools/lesson-planner", "/tools/slideshow"],
  },
  {
    href: "/tools/topic-overview",
    slug: "topic-overview",
    title: "AI Topic Overview Generator for Teachers",
    h1: "AI topic overview for lesson by lesson planning",
    description:
      "Map a topic across your lessons in one table: objective, starter, input, activity, plenary, resources, questions and key vocabulary for every lesson.",
    intro:
      "Jooma's AI topic overview maps a topic across your lessons in one detailed table. Every lesson gets an objective, a starter, the input, an activity and a plenary, plus resources, questions that build from retrieval to higher order thinking, and key vocabulary, followed by assessment opportunities across the unit.",
    steps: [
      "Choose your curriculum, year group, subject and topic.",
      "Set the number of lessons, from 1 to 20, and add any context about your class or scheme.",
      "Get the overview in one table, ready to edit and download as PDF or Word.",
    ],
    features: [
      "A row for every lesson, from 1 to 20",
      "An objective, starter, input, activity and plenary for each lesson",
      "Two to four resources and two or three questions per lesson",
      "Three to five key vocabulary words per lesson",
      "Three assessment opportunities across the topic, formative and summative",
    ],
    uk: {
      heading: "The whole unit on one page",
      body: "A topic overview gives subject leaders and colleagues the shape of a unit at a glance, matched to the curriculum and year group you choose, for any year from Nursery to Year 11.",
    },
    faqs: [
      {
        q: "How is this different from the medium term planner?",
        a: "The topic overview gives more detail per lesson, with starters, activities, plenaries and resources. The medium term planner focuses on objectives and key knowledge across up to 30 lessons.",
      },
      {
        q: "Can I turn a lesson into a full plan?",
        a: "Yes. Take any lesson into the lesson planner, or into Slides for the deck.",
      },
      { q: "Can I edit the overview?", a: editAnswer },
    ],
    related: ["/tools/medium-term-planner", "/tools/lesson-planner", "/tools/slideshow"],
  },
  {
    href: "/tools/cover-lesson",
    slug: "cover-lesson-generator",
    title: "AI Cover Lesson Generator for Schools",
    h1: "AI cover lesson generator any teacher can deliver",
    description:
      "Plan a cover lesson anyone can teach: a timed starter, main task and plenary with word for word scripts, cover notes and an end of lesson checklist.",
    intro:
      "Jooma's AI cover lesson generator plans a lesson any cover or supply teacher can deliver, whatever their subject. Choose the length and the resources in the room, and it writes timed activities with word for word scripts, notes for the cover teacher, a pupil task and an end of lesson checklist.",
    steps: [
      "Choose the curriculum, year group and subject, and the topic the class is studying.",
      "Pick the lesson length and the resources available, from none at all to computers or tablets.",
      "Get a cover plan ready to leave, then download it as PDF or Word, or print it.",
    ],
    features: [
      "Notes for the cover teacher, and the lesson at a glance in a timed table",
      "A starter of up to ten minutes, with a script and an early finisher task",
      "A main activity with a script, numbered steps, four to eight pupil tasks and an extension",
      "A plenary with a script",
      "An end of lesson checklist",
      "Timings that add up to your lesson length, from 30 to 75 minutes",
    ],
    uk: {
      heading: "Made for cover and supply",
      body: "Every step is scripted, so a non specialist cover supervisor or supply teacher can run the lesson without subject knowledge, and the class keeps working on the topic they are already studying.",
    },
    faqs: [
      {
        q: "Can a non specialist teach it?",
        a: "Yes. Each part has a word for word script and clear steps, so no subject knowledge is needed.",
      },
      {
        q: "What if there are no resources in the room?",
        a: "Choose no resources needed and it plans a lesson built on discussion and spoken tasks.",
      },
      {
        q: "Does it include an answer key?",
        a: "Not as a separate answer key yet. The plan focuses on what the cover teacher says and does.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/lesson-planner", "/tools/worksheet-generator", "/tools/homework-generator"],
  },
  {
    href: "/tools/homework-generator",
    slug: "homework-generator",
    title: "AI Homework Generator for UK Teachers",
    h1: "AI homework generator tied to your lesson",
    description:
      "Set homework that follows the lesson: eight task types, ten to thirty minutes of work, optional answers and a separate version for each ability band.",
    intro:
      "Jooma's AI homework generator writes a homework task that follows on from your lesson. Pick the type, from questions to research or a creative task, and how long it should take. Paste in your lesson resources for a closer match, and make a separate version for each ability band if you need one.",
    steps: [
      "Choose the curriculum, year group and subject, and write the learning objective.",
      "Pick the homework type and the effort level: quick, standard or extended. Paste in your lesson plan or slides if you like.",
      "Get a homework sheet with instructions, vocabulary and a self assessment checklist, plus answers if you want them.",
    ],
    features: [
      "Eight homework types, from questions and written tasks to research, practical and creative tasks",
      "Quick, standard or extended, from about 10 to 30 minutes",
      "Key vocabulary, clear instructions and a self assessment checklist for pupils",
      "An optional answer sheet or mark scheme",
      "Fourteen question types to choose from",
      "A separate version for each ability band, each in its own tab",
    ],
    uk: {
      heading: "Built on what you taught",
      body: "Paste in the lesson plan, worksheet or slides you used and the homework follows on from them, for any year group from Nursery to Year 11.",
    },
    faqs: [
      {
        q: "Can it follow on from my lesson?",
        a: "Yes. Paste in your lesson plan, worksheet or slide text, or upload a text file, and the homework builds on it.",
      },
      {
        q: "Does it include answers?",
        a: "If you want it to. Choose to include answers for an answer sheet or mark scheme, or leave it off for a pupil only copy.",
      },
      {
        q: "Can I set different versions for different groups?",
        a: "Yes. Switch on differentiation and it writes a separate homework for each band you choose.",
      },
      { q: "Can I edit the homework?", a: editAnswer },
    ],
    related: ["/tools/worksheet-generator", "/tools/lesson-planner", "/tools/quiz-generator"],
  },
  {
    href: "/tools/model-text-generator",
    slug: "model-text-generator",
    title: "AI Model Text Generator for English Teachers",
    h1: "AI model text generator for writing lessons",
    description:
      "Write an exemplar text with the features you want to teach, plus a breakdown of five to seven key features with examples. Versions for each ability band.",
    intro:
      "Jooma's AI model text generator writes an exemplar text for your writing lessons, from a persuasive letter to a story opening. Name the features and keywords to include and set the length, and it explains five to seven key features with a quoted example of each, ready to model and annotate with your class.",
    steps: [
      "Choose the curriculum and year group, and say what it should write.",
      "List the features and keywords to include, and set an approximate length.",
      "Get the model text with its key features explained, and a version for each band if you switch on differentiation.",
    ],
    features: [
      "An exemplar text of roughly the length you choose, from 50 to 5,000 words",
      "The writing features you name, used in context",
      "Five to seven key features, each with a quoted example and why it works",
      "Your keywords worked into the text",
      "A separate text and analysis for each ability band",
    ],
    uk: {
      heading: "Matched to the English curriculum",
      body: "Texts show the writing features the National Curriculum for English expects at each key stage, so you can model exactly what your year group needs to use in their own writing.",
    },
    faqs: [
      {
        q: "What can it write?",
        a: "Any text type you teach, such as a diary entry, a newspaper report, a persuasive letter or a story opening.",
      },
      {
        q: "Can I choose which features it uses?",
        a: "Yes. List the features, such as fronted adverbials or rhetorical questions, and it builds the text around them.",
      },
      {
        q: "Can I make simpler and harder versions?",
        a: "Yes. Switch on differentiation and it writes a separate text and analysis for each band you choose.",
      },
      { q: "Can I edit the text?", a: editAnswer },
    ],
    related: ["/tools/comprehension-generator", "/tools/worksheet-generator", "/tools/lesson-planner"],
  },
  {
    href: "/tools/phonics-support",
    slug: "phonics-support",
    title: "AI Phonics Resource Generator for Teachers",
    h1: "AI phonics resources for any grapheme",
    description:
      "Enter a grapheme and get word banks, a decodable story, pseudo words, teaching activities, misconceptions and assessment ideas for systematic phonics.",
    intro:
      "Jooma's AI phonics generator builds a set of resources around any grapheme, such as sh, ai or igh. You get word banks sorted by structure, high frequency and tricky words, a short decodable story, pseudo words, five teaching activities, common misconceptions and assessment ideas, pitched to your pupils' age.",
    steps: [
      "Choose your curriculum and your pupils' age.",
      "Enter the grapheme for the sound you are teaching, such as sh, ch or oo.",
      "Get a full set of phonics resources to edit, print or download as PDF or Word.",
    ],
    features: [
      "Word banks grouped by structure, from CVC to multisyllabic words",
      "Decodable and tricky high frequency words",
      "A suggested teaching order",
      "A decodable story of six to eight sentences",
      "Eight to ten pseudo words",
      "Five teaching activities, plus common misconceptions and assessment ideas",
    ],
    uk: {
      heading: "Built for systematic synthetic phonics",
      body: "Resources follow a systematic synthetic phonics approach and note the phase a grapheme is usually taught in. Check the words and the order against your school's own validated phonics programme.",
    },
    faqs: [
      {
        q: "Does it match our phonics scheme?",
        a: "It follows general systematic synthetic phonics principles rather than one named programme, so check word lists and phases against your school's scheme.",
      },
      {
        q: "Can I use the pseudo words for screening check practice?",
        a: "They make good practice, but check each one against your scheme, as the official check has its own rules.",
      },
      {
        q: "Is it only for Reception and Key Stage 1?",
        a: "No. Set any age from 3 to 18, so it also works for older pupils who need phonics catch up.",
      },
      { q: "Can I edit the resources?", a: editAnswer },
    ],
    related: ["/tools/comprehension-generator", "/tools/worksheet-generator", "/tools/eyfs-planner"],
  },
  {
    href: "/tools/sensory-activities",
    slug: "sensory-activities",
    title: "AI Sensory Activity Ideas for SEND Teachers",
    h1: "AI sensory activities for any topic",
    description:
      "Get five multisensory activities for any topic, each with the senses it targets, resources, sensory adaptations and SEND and inclusion notes.",
    intro:
      "Jooma's AI sensory activities tool plans five multisensory activities for any topic and year group. Each one sets out the senses it targets, what to do and what you need, with adaptations for sensory seeking and sensory sensitive pupils, inclusion notes and links to other subjects.",
    steps: [
      "Choose the curriculum and year group.",
      "Give the subject and the topic you are teaching.",
      "Get five activities to edit, print or download as PDF or Word.",
    ],
    features: [
      "Five activities with a mix of senses and individual, paired and group work",
      "A learning objective and core concepts for each",
      "The senses each activity targets, and why",
      "The resources needed and a clear description",
      "Adaptations for sensory sensitive and sensory seeking pupils",
      "Inclusion notes for autism, dyslexia, DCD, physical disability and EAL",
    ],
    uk: {
      heading: "Inclusive by design",
      body: "Activities are written with the SEND Code of Practice in mind, so they work in mainstream classes and specialist settings alike, with adaptations built into every one.",
    },
    faqs: [
      {
        q: "Who is it for?",
        a: "Any class, but especially pupils with SEND, early years settings and specialist provision, where learning through the senses helps.",
      },
      {
        q: "Can I choose how many activities?",
        a: "It always plans five, with a mix of senses and groupings. Ask for changes in a sentence to adjust any of them.",
      },
      { q: "Can I edit the activities?", a: editAnswer },
    ],
    related: ["/tools/one-page-profile", "/tools/eyfs-planner", "/tools/targeted-intervention"],
  },
  {
    href: "/tools/exam-question-generator",
    slug: "exam-question-generator",
    title: "AI Exam Question Generator for Teachers",
    h1: "AI exam question generator with mark schemes",
    description:
      "Create an exam style paper on any topic: up to 20 questions rising in marks and difficulty, with an optional indicative mark scheme.",
    intro:
      "Jooma's AI exam question generator writes an exam style paper on any topic. Choose how many questions and the range of marks, and the questions rise from recall to evaluation. Add a mark scheme with answers, mark points and marking notes, ready to check and adapt for your class.",
    steps: [
      "Choose the curriculum, year group, subject and topic, and say what style of exam it should follow, such as GCSE.",
      "Set the number of questions, up to 20, and the minimum and maximum marks per question.",
      "Get the paper, with a mark scheme if you want one, ready to edit and download as PDF or Word.",
    ],
    features: [
      "Up to 20 questions, rising in marks and difficulty from recall to evaluation",
      "Marks per question within the range you set",
      "Instructions and a total marks figure",
      "An optional mark scheme with answers, mark points and marking notes",
      "The knowledge and skills you name, covered by the questions",
    ],
    uk: {
      heading: "In the style of UK exams",
      body: "Name the exam style, such as GCSE, A level or Functional Skills, and it writes in that style. It is not tied to one exam board, so check the paper and the mark scheme against your board's specification.",
    },
    faqs: [
      {
        q: "Does it use my exam board's papers?",
        a: "No. It writes original questions in the style you name. Check them against your board's specification and past papers.",
      },
      {
        q: "Is the mark scheme official?",
        a: "No. It is an indicative mark scheme to help you mark consistently. Adjust it to your board's criteria.",
      },
      {
        q: "Does it leave space for answers?",
        a: "Not yet. Download it as Word and add answer lines where you want them.",
      },
      { q: "Can I edit the paper?", a: editAnswer },
    ],
    related: ["/tools/model-answer-generator", "/tools/quiz-generator", "/tools/worksheet-generator"],
  },

  // ── Batch 4: communication and leadership ────────────────────────────────
  {
    href: "/tools/newsletter-writer",
    slug: "newsletter-writer",
    title: "AI School Newsletter Writer",
    h1: "AI newsletter writer for schools",
    description:
      "Turn your notes into a finished school newsletter, section by section, in a professional, warm or inspiring tone. Download it as PDF or Word.",
    intro:
      "Jooma's AI newsletter writer turns your notes into a finished school newsletter. Add a section for each item, from sports results to dates for the diary, choose a professional, warm or inspiring tone, and it writes each section with its own heading in clear paragraphs, ready to check and send home.",
    steps: [
      "Add your newsletter title and school name, and choose the tone.",
      "Add a section for each item, with the notes you want it to cover.",
      "Get the finished newsletter to edit and download as PDF or Word.",
    ],
    features: [
      "A heading for every section you add",
      "Two or three clear paragraphs per section",
      "A professional, warm or inspiring tone",
      "As many sections as you need",
      "UK English throughout",
    ],
    uk: {
      heading: "Written for UK families",
      body: "Newsletters are written in UK English for parents and carers, and stick to the notes you give them. Add your own photos and layout when you send it home.",
    },
    faqs: [
      {
        q: "Does it add photos or a template?",
        a: "Not yet. It writes the text. Download it as Word and drop it into your school's newsletter template.",
      },
      {
        q: "Can I write it in a friendly tone?",
        a: "Yes. Choose professional, warm or inspiring, and every section follows that tone.",
      },
      {
        q: "Can I start from last week's newsletter?",
        a: "Every newsletter saves to your library, so you can open last week's and work from there.",
      },
      { q: "Can I edit the newsletter?", a: editAnswer },
    ],
    related: ["/tools/letter-writer", "/tools/assembly-planner", "/tools/meeting-planner"],
  },
  {
    href: "/tools/assembly-planner",
    slug: "assembly-planner",
    title: "AI Assembly Planner for Schools",
    h1: "AI assembly planner with a timed script",
    description:
      "Plan an assembly on any theme: a timed script with speaker notes, a story, an interactive moment, questions and a reflection, pitched for your phase.",
    intro:
      "Jooma's AI assembly planner writes a timed assembly script on any theme, from kindness to Black History Month. Choose the stage and the length, and it plans an introduction, the main message, a story, an interactive moment, audience questions and a reflection, with speaker and delivery notes for each part.",
    steps: [
      "Give the theme and choose the stage, from early years to secondary or a special school.",
      "Set the length, from 5 to 120 minutes, and add any notes.",
      "Get a timed script with speaker notes, ready to edit and download as PDF or Word.",
    ],
    features: [
      "A timing breakdown that adds up to your assembly length",
      "Speaker notes and delivery tips for each part",
      "A story or example to bring the theme to life",
      "An interactive element pitched for your stage",
      "Four or five open questions for the audience",
      "A reflection or call to action, and a list of resources",
    ],
    uk: {
      heading: "Pitched for your phase",
      body: "Scripts are pitched for the stage you choose, from Key Stage 1 to secondary, special schools and alternative provision, and reflect British values.",
    },
    faqs: [
      {
        q: "Does it make slides?",
        a: "No, it writes the script. Use Slides in Jooma if you want a deck to go with it.",
      },
      {
        q: "Can I plan a short assembly?",
        a: "Yes. Set any length from 5 to 120 minutes and the timings add up to it.",
      },
      { q: "Can I edit the script?", a: editAnswer },
    ],
    related: ["/tools/newsletter-writer", "/tools/letter-writer", "/tools/slideshow"],
  },
  {
    href: "/tools/meeting-planner",
    slug: "meeting-agenda-generator",
    title: "AI Meeting Agenda Generator for Schools",
    h1: "AI meeting planner for school meetings",
    description:
      "Plan a school meeting: a timed agenda, a facilitation guide, discussion segments and an optional icebreaker and action items, for any length and team.",
    intro:
      "Jooma's AI meeting planner turns a meeting purpose into a timed agenda and a facilitation guide. Say who is coming and what you need to cover, from a phase team meeting to a safeguarding update, and it plans timed discussion segments, preparation tasks, an optional icebreaker and an action list.",
    steps: [
      "Describe the purpose, or pick one of the presets for common school meetings.",
      "Say who is attending, how long you have and the topics to cover, and tick if you want an icebreaker or action items.",
      "Get a timed agenda and facilitation guide, ready to edit and download as PDF or Word.",
    ],
    features: [
      "A meeting overview and four preparation tasks",
      "Timed discussion segments, each with a purpose, key points and a desired outcome",
      "An optional icebreaker and action items table",
      "A closing and a follow up plan",
      "A clean agenda to share with attendees",
      "Presets for common school meetings",
    ],
    uk: {
      heading: "Made for school meetings",
      body: "Presets cover the meetings schools actually run, from department and phase teams to pastoral and safeguarding updates. Use team or role names rather than individuals' names.",
    },
    faqs: [
      {
        q: "Does it send calendar invites?",
        a: "No. It plans the meeting. Copy the agenda into your calendar or an email.",
      },
      {
        q: "Can it plan a short meeting?",
        a: "Yes. Set any length from 5 minutes to a full day and the timings fit it.",
      },
      { q: "Can I edit the agenda?", a: editAnswer },
    ],
    related: ["/tools/newsletter-writer", "/tools/cpd-slideshow", "/tools/school-improvement-plan"],
  },
  {
    href: "/tools/inspection-prep",
    slug: "ofsted-inspection-prep",
    title: "AI Ofsted Inspection Prep Questions for Schools",
    h1: "AI inspection prep questions for school leaders",
    description:
      "Prepare for inspection with self evaluation questions and preparation actions for each area, plus optional evidence examples and success criteria.",
    intro:
      "Jooma's AI inspection prep tool helps leaders prepare for Ofsted or another inspection body. For each inspection area it sets out five self evaluation questions and five preparation actions, with optional evidence examples, success criteria and recent policy changes to discuss with your team.",
    steps: [
      "Enter the inspection body, such as Ofsted or ISI, and any focus area.",
      "Tick the extras you want: evidence examples, success criteria or recent policy changes.",
      "Get questions and actions for each area, ready to edit and download as PDF or Word.",
    ],
    features: [
      "Five self evaluation questions for each inspection area",
      "Five preparation actions for each area",
      "Optional examples of the evidence to gather",
      "Optional success criteria",
      "Optional recent policy developments to discuss",
    ],
    uk: {
      heading: "A starting point for self evaluation",
      body: "For Ofsted it covers areas such as the quality of education, behaviour and attitudes, personal development, leadership and safeguarding. Inspection frameworks change, so check the questions against Ofsted's current handbook and toolkit.",
    },
    faqs: [
      {
        q: "Is it up to date with Ofsted's latest framework?",
        a: "It draws on Ofsted's inspection framework, but frameworks change. Check everything against the current handbook before you rely on it.",
      },
      {
        q: "Does it work for other inspection bodies?",
        a: "Yes. Enter ISI or another body and it uses general inspection areas instead.",
      },
      {
        q: "Can I share it with staff?",
        a: "Yes. Download it as PDF or Word to use in leadership or staff meetings.",
      },
      { q: "Can I edit the questions?", a: editAnswer },
    ],
    related: ["/tools/school-improvement-plan", "/tools/learning-walk-report", "/tools/policy-generator"],
  },
  {
    href: "/tools/school-improvement-plan",
    slug: "school-improvement-plan",
    title: "AI School Improvement Plan Generator",
    h1: "AI school improvement plan generator",
    description:
      "Draft a school improvement plan from your priorities: objectives, actions, owners, timelines, success criteria, budget and risks, as a table or narrative.",
    intro:
      "Jooma's AI school improvement plan generator turns your priorities into a structured plan. Add the areas to improve and your school context, and it sets out objectives with actions, owners, timelines, success criteria, monitoring, a budget and risks, as a detailed table or a narrative plan, over one to five years.",
    steps: [
      "Choose your school type and describe the areas to improve.",
      "Add your school context, a timeframe of one to five years, and whether you want a table or a narrative.",
      "Get a draft plan to adapt with your leadership team and download as PDF or Word.",
    ],
    features: [
      "Three objectives, each with action steps, owners and timelines",
      "A term by term implementation timeline",
      "Success criteria, a monitoring schedule and a risk register",
      "An indicative budget with costed items",
      "A table or a narrative, the narrative set out as intent, implementation and impact",
    ],
    uk: {
      heading: "Built for UK school leaders",
      body: "Plans reflect Ofsted's inspection framework, DfE school improvement guidance and EEF evidence. The more context you give, such as your last inspection and your data, the closer it fits. Check any references and figures before you share it.",
    },
    faqs: [
      {
        q: "Does it use our school data?",
        a: "Only what you type into the school context. Without it, the plan makes general assumptions, so add your own figures for a plan that fits.",
      },
      {
        q: "Are the research references real?",
        a: "They point to the kind of DfE, Ofsted and EEF guidance that applies, but check each one before you publish the plan.",
      },
      {
        q: "Should I choose the table or the narrative?",
        a: "Choose the narrative for a written plan, or the table for the full detail with timelines, budget and risks.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/inspection-prep", "/tools/pupil-premium-planner", "/tools/learning-walk-report"],
  },
  {
    href: "/tools/learning-walk-report",
    slug: "learning-walk-report",
    title: "AI Learning Walk Report Writer",
    h1: "AI learning walk report writer",
    description:
      "Turn your learning walk notes into a professional report: summary, strengths, areas for development, recommendations and next steps with a timeline.",
    intro:
      "Jooma's AI learning walk report writer turns your notes into a professional write up. Add what you saw, the strengths and the areas for development, and it writes an executive summary, sets out strengths and development points, and adds recommendations and next steps with a timeline if you want them.",
    steps: [
      "Add the date, the classes you visited and the focus of the walk, or pick a preset focus.",
      "Note the strengths and areas for development you saw.",
      "Get a report with recommendations and next steps, ready to edit and download as PDF or Word.",
    ],
    features: [
      "An executive summary with an overall view",
      "Three or four strengths and three or four areas for development",
      "Four or five professional recommendations",
      "Immediate, short term and medium term next steps, with a follow up date",
      "Presets for common learning walk focuses",
    ],
    uk: {
      heading: "Ready for your monitoring records",
      body: "Reports follow the structure leaders use for monitoring and evaluation, so they slot into your quality assurance records. Write about what you saw rather than naming individual teachers.",
    },
    faqs: [
      {
        q: "Should I name teachers?",
        a: "No need. Use classes and year groups, and keep any individual feedback for a lesson observation.",
      },
      {
        q: "Can I leave out the recommendations?",
        a: "Yes. Untick recommendations or next steps for a shorter report.",
      },
      { q: "Can I edit the report?", a: editAnswer },
    ],
    related: ["/tools/lesson-observation-report", "/tools/inspection-prep", "/tools/school-improvement-plan"],
  },
  {
    href: "/tools/lesson-observation-report",
    slug: "lesson-observation-report",
    title: "AI Lesson Observation Report Writer",
    h1: "AI lesson observation report writer",
    description:
      "Write a supportive lesson observation report from your notes: strengths, areas for development, recommendations and an optional action plan. No grades.",
    intro:
      "Jooma's AI lesson observation report writer turns your notes into a clear, supportive write up. Add the strengths and areas for development you saw and it sets out the lesson context, strengths, development points and recommendations, with an optional action plan and follow up support. There are no grades.",
    steps: [
      "Choose the curriculum and year group, and add the subject, objective and focus if you like.",
      "Note the strengths and areas for development you saw.",
      "Get a report with recommendations, and an action plan if you want one, ready to edit and download as PDF or Word.",
    ],
    features: [
      "The lesson context, three to five strengths and two to four areas for development",
      "Four or five practical recommendations",
      "An optional action plan with targets, success criteria, strategies and a timeline",
      "Optional suggestions for follow up support",
      "Presets for common observation focuses",
    ],
    uk: {
      heading: "Developmental, not graded",
      body: "Reports reference the Teachers' Standards and Ofsted's inspection framework where they help, and focus on development rather than grades, in line with the move away from graded lesson observations.",
    },
    faqs: [
      {
        q: "Does it grade the lesson?",
        a: "No. It writes a developmental report with strengths, areas for development and next steps.",
      },
      {
        q: "Does it need the teacher's name?",
        a: "No. Add it to the downloaded report yourself if your process needs it.",
      },
      {
        q: "Are the support suggestions real organisations?",
        a: "Treat them as ideas to check. Confirm any organisation or course before you recommend it.",
      },
      { q: "Can I edit the report?", a: editAnswer },
    ],
    related: ["/tools/learning-walk-report", "/tools/ect-report-writer", "/tools/performance-management"],
  },
  {
    href: "/tools/performance-management",
    slug: "performance-management-targets",
    title: "AI Performance Management Targets for Teachers",
    h1: "AI appraisal and performance management targets",
    description:
      "Draft SMART appraisal targets for any staff role, with success criteria, evidence, actions, timescales, support and review points in one table.",
    intro:
      "Jooma's AI performance management tool drafts SMART appraisal targets for any role, from a class teacher to a SENCO or senior leader. Add the role, the pay scale and the responsibilities, and it sets out four to six targets with success criteria, evidence, actions, timescales, support and review points.",
    steps: [
      "Choose the curriculum and enter the role, such as class teacher or head of department, and the pay scale if you like.",
      "Add their responsibilities and the areas the targets should cover.",
      "Get a table of targets to discuss, agree and download as PDF or Word.",
    ],
    features: [
      "Four to six SMART targets",
      "Success criteria and the evidence that will show progress",
      "Actions, timescales and the support or resources needed",
      "A column for progress and review",
      "Expectations pitched to the role and pay scale, from early career to leadership",
    ],
    uk: {
      heading: "Linked to the Teachers' Standards",
      body: "Targets draw on the Teachers' Standards, or leadership standards for senior roles, so they fit the appraisal process UK schools use. Agree them with the member of staff before they are finalised.",
    },
    faqs: [
      {
        q: "Should I enter the staff member's name?",
        a: "No. Describe the role instead, such as Year 4 teacher or SENCO, and add the name in your own records.",
      },
      {
        q: "Does it work for support staff and leaders?",
        a: "Yes. Describe any role and its responsibilities and the targets are pitched to it.",
      },
      { q: "Can I edit the targets?", a: editAnswer },
    ],
    related: ["/tools/ect-report-writer", "/tools/lesson-observation-report", "/tools/school-improvement-plan"],
  },
  {
    href: "/tools/eyfs-action-plan",
    slug: "eyfs-action-plan",
    title: "AI EYFS Action Plan Generator",
    h1: "AI EYFS action plan for early years improvement",
    description:
      "Turn an early years improvement aim into a four phase action plan: success criteria, actions, responsibilities, monitoring, resources and staffing.",
    intro:
      "Jooma's AI EYFS action plan generator turns an early years improvement aim into a phased plan. Give the objective, such as improving outdoor provision or early language, and it sets out success criteria and four phases of actions with responsibilities, timelines, expected outcomes, monitoring and the resources and staffing you need.",
    steps: [
      "Write the early years objective you want to achieve.",
      "Switch on differentiation if you want adaptations for different groups of children.",
      "Get a four phase action plan to edit with your team and download as PDF or Word.",
    ],
    features: [
      "Three or four success criteria for the objective",
      "Four phases, from the first month to beyond week 13",
      "Actions, responsibilities, timelines, expected outcomes and monitoring in each phase",
      "Resources, staffing, CPD and budget considerations",
    ],
    uk: {
      heading: "Grounded in the EYFS",
      body: "Plans draw on the Early Learning Goals and the characteristics of effective teaching and learning. Check them against the current EYFS statutory framework, as it is updated from time to time.",
    },
    faqs: [
      {
        q: "What kind of objective works best?",
        a: "One clear aim, such as improving communication and language or developing the outdoor area. Run the tool again for each further aim.",
      },
      {
        q: "Who is it for?",
        a: "Early years leads, nursery managers and senior leaders responsible for early years.",
      },
      { q: "Can I edit the plan?", a: editAnswer },
    ],
    related: ["/tools/eyfs-planner", "/tools/school-improvement-plan", "/tools/policy-generator"],
  },
];

const BY_SLUG = new Map(TOOL_PAGES.map((p) => [p.slug, p]));
const BY_HREF = new Map(TOOL_PAGES.map((p) => [p.href, p]));

export function toolPageBySlug(slug: string): ToolPage | undefined {
  return BY_SLUG.get(slug);
}

/** The public page for a tool's app route, if it has one yet. */
export function toolPageForHref(href: string): ToolPage | undefined {
  return BY_HREF.get(href);
}

export function toolPagePath(page: ToolPage): string {
  return `/teacher-tools/${page.slug}`;
}
