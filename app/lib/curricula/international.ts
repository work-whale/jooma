import type { Curriculum, LocalTerms, YearOption } from "./types";

/*
 * International programmes: the IB, Cambridge International and Pearson
 * Edexcel. Taught in international schools in any country, so they are
 * offered to every teacher once the region is switched on.
 *
 * Their guides and syllabuses are copyright: Jooma aligns to them by name and
 * never copies their text, which every override says.
 *
 * Checked 2026-11-14 against ibo.org, cambridgeinternational.org and
 * qualifications.pearson.com (and school guides where those pages would not
 * load; see notes).
 */

const ages = (labels: string[], firstAge: number): YearOption[] => labels.map((label, i) => ({ label, age: firstAge + i }));

const NO_COPY = "Write original material aligned to the programme. Never copy or quote the programme's own guides, syllabuses or past papers.";

const SCHOOL_SUPPORT = "the school's own learning support and inclusion provision, with individual support plans";

const IB_TERMS = (programme: string, exams: string, stages: string): LocalTerms => ({
  curriculum: `the IB ${programme} framework, and the programme the school has built on it`,
  stages,
  exams,
  inspection: "IB authorisation and programme evaluation",
  send: SCHOOL_SUPPORT,
  headteacher: "head of school",
});

const CAMBRIDGE_TERMS = (curriculum: string, exams: string, stages: string): LocalTerms => ({
  curriculum,
  stages,
  exams,
  send: SCHOOL_SUPPORT,
  attainment: "working below, at, or above the learning objectives for the stage",
});

export const INTERNATIONAL_CURRICULA: Curriculum[] = [
  {
    id: "ib-pyp",
    region: "international",
    country: "INT",
    name: "IB Primary Years Programme (PYP)",
    promptLabel: "IB Primary Years Programme (PYP)",
    versions: [{ label: "IB Primary Years Programme", inForceFrom: "1997-01-01" }],
    years: ages(["Ages 3 to 4", "Ages 4 to 5", "Ages 5 to 6", "Ages 6 to 7", "Ages 7 to 8", "Ages 8 to 9", "Ages 9 to 10", "Ages 10 to 11", "Ages 11 to 12"], 3),
    defaultLanguage: "en-GB",
    terms: {
      ...IB_TERMS("Primary Years Programme", "PYP assessment for learning, including the PYP exhibition in the final year", "the PYP years, organised around the school's programme of inquiry and its units of inquiry"),
      earlyYears: "the PYP early years",
      attainment: "working below, at, or above the level expected for the age",
    },
    context: `The PYP is a transdisciplinary, inquiry-based framework: learning is organised in units of inquiry under the six transdisciplinary themes, with the IB learner profile and approaches to learning running through it. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "ib-myp",
    region: "international",
    country: "INT",
    name: "IB Middle Years Programme (MYP)",
    promptLabel: "IB Middle Years Programme (MYP)",
    versions: [{ label: "IB Middle Years Programme", inForceFrom: "1994-01-01" }],
    years: ages(["MYP 1", "MYP 2", "MYP 3", "MYP 4", "MYP 5"], 11),
    defaultLanguage: "en-GB",
    terms: {
      ...IB_TERMS("Middle Years Programme", "criterion-based MYP assessment (four criteria per subject group, each reported on the 1 to 7 scale) and the optional MYP eAssessment in MYP 5", "MYP years 1 to 5"),
      attainment: "the MYP achievement levels against each subject group's criteria",
    },
    context: `The MYP is taught through key and related concepts, global contexts and statements of inquiry, across eight subject groups, with approaches to learning and the IB learner profile running through it. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "ib-dp",
    region: "international",
    country: "INT",
    name: "IB Diploma Programme (DP)",
    promptLabel: "IB Diploma Programme (DP)",
    versions: [{ label: "IB Diploma Programme", inForceFrom: "1968-01-01" }],
    years: ages(["DP 1", "DP 2"], 16),
    defaultLanguage: "en-GB",
    terms: {
      ...IB_TERMS(
        "Diploma Programme",
        "IB Diploma Programme examinations and internal assessment, each subject graded 7 (highest) to 1 at Standard or Higher Level, plus the core: Theory of Knowledge, the Extended Essay and Creativity, Activity, Service (CAS)",
        "DP 1 and DP 2",
      ),
      attainment: "the IB 1 to 7 subject grades",
    },
    context: `Students take one subject from each of six subject groups at Standard or Higher Level, plus the core. Where it fits, link learning to Theory of Knowledge. Subjects are revised on a seven-year cycle, so name the current subject guide only in general terms. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "ib-cp",
    region: "international",
    country: "INT",
    name: "IB Career-related Programme (CP)",
    promptLabel: "IB Career-related Programme (CP)",
    versions: [{ label: "IB Career-related Programme", inForceFrom: "2012-01-01" }],
    years: ages(["CP 1", "CP 2"], 16),
    defaultLanguage: "en-GB",
    terms: {
      ...IB_TERMS("Career-related Programme", "assessment in at least two Diploma Programme courses plus the CP core and the career-related study", "CP 1 and CP 2"),
      attainment: "the IB 1 to 7 grades in the DP courses",
    },
    context: `The CP combines at least two Diploma Programme courses with a career-related study and the CP core. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "cambridge-primary",
    region: "international",
    country: "INT",
    name: "Cambridge Primary",
    promptLabel: "Cambridge Primary",
    versions: [{ label: "Cambridge Primary curriculum frameworks (first teaching 2021)", inForceFrom: "2021-01-01" }],
    years: ages(["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5", "Stage 6"], 5),
    defaultLanguage: "en-GB",
    terms: CAMBRIDGE_TERMS(
      "the Cambridge Primary curriculum frameworks",
      "Cambridge Primary Progression Tests (Stages 3 to 6) and Cambridge Primary Checkpoint at the end of Stage 6",
      "Cambridge Primary Stages 1 to 6",
    ),
    context: `Each subject has a curriculum framework of learning objectives for each stage. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "cambridge-lower-secondary",
    region: "international",
    country: "INT",
    name: "Cambridge Lower Secondary",
    promptLabel: "Cambridge Lower Secondary",
    versions: [{ label: "Cambridge Lower Secondary curriculum frameworks (first teaching 2021)", inForceFrom: "2021-01-01" }],
    years: ages(["Stage 7", "Stage 8", "Stage 9"], 11),
    defaultLanguage: "en-GB",
    terms: CAMBRIDGE_TERMS(
      "the Cambridge Lower Secondary curriculum frameworks",
      "Cambridge Lower Secondary Progression Tests and Cambridge Lower Secondary Checkpoint at the end of Stage 9",
      "Cambridge Lower Secondary Stages 7 to 9",
    ),
    context: `Each subject has a curriculum framework of learning objectives for each stage, leading on to Cambridge IGCSE. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "cambridge-igcse",
    region: "international",
    country: "INT",
    name: "Cambridge IGCSE and O Level",
    promptLabel: "Cambridge IGCSE and O Level",
    versions: [{ label: "Cambridge IGCSE and O Level syllabuses", inForceFrom: "1988-01-01" }],
    years: ages(["IGCSE year 1", "IGCSE year 2"], 14),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Cambridge IGCSE or O Level syllabus for the subject",
      stages: "the two-year IGCSE or O Level course",
      exams: "Cambridge IGCSE and O Level examinations, with Core and Extended tiers where the syllabus has them",
      send: SCHOOL_SUPPORT,
    },
    context: `Each subject has its own syllabus with its own exam years; write in the style of Cambridge examination questions without reproducing real ones. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "cambridge-a-level",
    region: "international",
    country: "INT",
    name: "Cambridge International AS and A Level",
    promptLabel: "Cambridge International AS and A Level",
    versions: [{ label: "Cambridge International AS and A Level syllabuses", inForceFrom: "1951-01-01" }],
    years: [
      { label: "AS Level", age: 16 },
      { label: "A Level", age: 17 },
    ],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Cambridge International AS and A Level syllabus for the subject",
      stages: "AS Level and A Level",
      exams: "Cambridge International AS and A Level examinations",
      send: SCHOOL_SUPPORT,
    },
    context: `Each subject has its own syllabus with its own exam years. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "pearson-iprimary-ilowersecondary",
    region: "international",
    country: "INT",
    name: "Pearson Edexcel iPrimary and iLowerSecondary",
    promptLabel: "Pearson Edexcel iPrimary and iLowerSecondary",
    versions: [{ label: "Pearson Edexcel iPrimary and iLowerSecondary curricula", inForceFrom: "2016-01-01" }],
    years: ages(["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9"], 5),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Pearson Edexcel iPrimary (ages 5 to 11) and iLowerSecondary (ages 11 to 14) curricula",
      stages: "iPrimary (Years 1 to 6) and iLowerSecondary (Years 7 to 9)",
      exams: "the Pearson Edexcel iPrimary and iLowerSecondary tests",
      send: SCHOOL_SUPPORT,
    },
    context: `iLowerSecondary is designed to lead on to Pearson Edexcel International GCSE (9 to 1). ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
  {
    id: "pearson-international-gcse-al",
    region: "international",
    country: "INT",
    name: "Pearson Edexcel International GCSE and International A Level",
    promptLabel: "Pearson Edexcel International GCSE and International A Level",
    versions: [{ label: "Pearson Edexcel International GCSE (9 to 1) and International Advanced Level specifications", inForceFrom: "2016-09-01" }],
    years: ages(["Year 10", "Year 11", "Year 12", "Year 13"], 14),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Pearson Edexcel International GCSE or International A Level specification for the subject",
      stages: "International GCSE (Years 10 and 11) and International A Level (Years 12 and 13)",
      exams: "Pearson Edexcel International GCSE (graded 9 to 1) and International Advanced Level (IAL) examinations",
      send: SCHOOL_SUPPORT,
    },
    context: `Each subject has its own specification; write in the style of Pearson Edexcel examination questions without reproducing real ones. ${NO_COPY}`,
    verifiedOn: "2026-11-14",
  },
];
