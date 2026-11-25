import type { Curriculum, YearOption } from "./types";

/*
 * Africa: South Africa, Kenya, Nigeria, Ghana and Uganda. Checked 2026-11-25
 * against the sources in provenance.ts. Profiles only: every source here is
 * closed or unclear for commercial reuse, so there are no statements
 * (docs/curricula-permissions.md).
 */

/** "Grade 1" .. "Grade 12" style labels, one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number, sep = " "): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix}${sep}${from + i}`, age: firstAge + i }));
}

export const AFRICA_CURRICULA: Curriculum[] = [
  {
    id: "south-africa",
    region: "africa",
    country: "ZA",
    place: "South Africa",
    name: "South Africa: CAPS (National Curriculum Statement Grades R to 12)",
    promptLabel: "South African Curriculum (CAPS)",
    versions: [{ label: "National Curriculum Statement Grades R to 12 (CAPS)", inForceFrom: "2012-01-01" }],
    years: [{ label: "Grade R", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Curriculum and Assessment Policy Statements (CAPS) of the National Curriculum Statement Grades R to 12, set by the Department of Basic Education",
      stages: "the Foundation Phase (Grades R to 3), Intermediate Phase (Grades 4 to 6), Senior Phase (Grades 7 to 9) and Further Education and Training (FET) Phase (Grades 10 to 12)",
      exams: "school-based assessment (SBA) and end-of-year examinations, and the National Senior Certificate (NSC, the matric examinations) at the end of Grade 12",
      inspection: "Whole School Evaluation by the Department of Basic Education and the provincial education departments",
      send: "inclusive education under Education White Paper 6 and the Screening, Identification, Assessment and Support (SIAS) policy, with a School-Based Support Team (SBST) and an Individual Support Plan",
      teacherStandards: "the South African Council for Educators (SACE) Professional Teaching Standards and the Quality Management System (QMS)",
      earlyYears: "Grade R under CAPS, and the National Curriculum Framework for Children from Birth to Four",
      attainment: "the CAPS seven-level achievement scale, from Level 1 (not achieved, 0 to 29%) to Level 7 (outstanding achievement, 80 to 100%)",
      headteacher: "principal",
    },
    context:
      "The school year runs from January to December in four terms. Schools teach through a Language of Learning and Teaching (most often English or Afrikaans) alongside a Home Language and a First Additional Language. Use South African places, names and rand amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "kenya",
    region: "africa",
    country: "KE",
    place: "Kenya",
    name: "Kenya: Competency-Based Education (KICD)",
    promptLabel: "Kenyan Competency-Based Curriculum (CBE)",
    versions: [{ label: "Competency-Based Education (CBE), with Senior School rolling up from Grade 10 in 2026 to Grade 12 in 2028", inForceFrom: "2017-01-01" }],
    years: [{ label: "PP1", age: 4 }, { label: "PP2", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Competency-Based Education (CBE) curriculum designs from the Kenya Institute of Curriculum Development (KICD)",
      stages: "Pre-Primary (PP1 and PP2), Lower Primary (Grades 1 to 3), Upper Primary (Grades 4 to 6), Junior School (Grades 7 to 9) and Senior School (Grades 10 to 12, in the STEM, Social Sciences, and Arts and Sports Science pathways)",
      exams: "school-based assessment and KNEC's Kenya Primary School Education Assessment (KPSEA) in Grade 6 and Kenya Junior School Education Assessment (KJSEA) in Grade 9; the KCSE continues only for the last 8-4-4 cohorts",
      inspection: "the Directorate of Quality Assurance and Standards at the Ministry of Education",
      send: "learners with special needs and disabilities, assessed at Educational Assessment and Resource Centres (EARCs) and supported with an Individualised Education Programme (IEP)",
      teacherStandards: "the Teachers Service Commission (TSC) Teacher Performance Appraisal and Development (TPAD) tool",
      earlyYears: "pre-primary education (PP1 and PP2) under the CBE",
      attainment: "the CBE rubric levels Exceeding, Meeting, Approaching and Below Expectations (EE, ME, AE, BE), split into eight sub-levels from EE1 down to BE2 in Junior School",
      headteacher: "headteacher (principal in a secondary or senior school)",
    },
    context:
      "The school year runs from January to November in three terms. Kiswahili is a compulsory subject and English is the language of instruction from upper primary. Use Kenyan places, names and shilling amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "nigeria",
    region: "africa",
    country: "NG",
    place: "Nigeria",
    name: "Nigeria: Basic and Senior Secondary Education Curriculum (NERDC)",
    promptLabel: "Nigerian Curriculum (NERDC)",
    versions: [
      {
        label: "Revised Basic and Senior Secondary Education Curriculum, from 2025-26 in Primary 1, Primary 4, JSS 1 and SS 1 and rolling up year by year",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [...numbered("Primary", 1, 6, 6), ...numbered("JSS", 1, 3, 12), ...numbered("SS", 1, 3, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum for Basic Education and Senior Secondary Education developed by the Nigerian Educational Research and Development Council (NERDC)",
      stages: "Basic Education (Primary 1 to 6 and Junior Secondary School, JSS 1 to 3), then Senior Secondary School (SS 1 to 3)",
      exams: "continuous assessment and termly examinations, the Basic Education Certificate Examination (BECE) at the end of JSS 3, and the WAEC West African Senior School Certificate Examination (WASSCE) and the NECO Senior School Certificate Examination at the end of SS 3",
      inspection: "quality assurance by the Federal Education Quality Assurance Service and the state quality assurance agencies",
      send: "special needs education under the National Policy on Special Needs Education, with inclusive education in mainstream schools",
      teacherStandards: "the Teachers Registration Council of Nigeria (TRCN) Professional Standards for Nigerian Teachers",
      earlyYears: "Early Childhood Care and Development Education (ECCDE) and the one year of pre-primary education",
      headteacher: "head teacher (principal in a secondary school)",
    },
    context: "The school year runs from September to July in three terms. Use Nigerian places, names and naira amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "ghana",
    region: "africa",
    country: "GH",
    place: "Ghana",
    name: "Ghana: Standards-Based Curriculum (NaCCA)",
    promptLabel: "Ghanaian Curriculum (NaCCA)",
    versions: [
      {
        label: "Standards-Based Curriculum (KG to B6), Common Core Programme (B7 to B9) and the Senior High School curriculum (from 2024-25)",
        inForceFrom: "2019-09-01",
      },
    ],
    years: [
      { label: "KG 1", age: 4 },
      { label: "KG 2", age: 5 },
      ...numbered("B", 1, 6, 6, ""),
      { label: "JHS 1 (B7)", age: 12 },
      { label: "JHS 2 (B8)", age: 13 },
      { label: "JHS 3 (B9)", age: 14 },
      ...numbered("SHS", 1, 3, 15),
    ],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national pre-tertiary curriculum from the National Council for Curriculum and Assessment (NaCCA): the Standards-Based Curriculum, the Common Core Programme and the Senior High School curriculum",
      stages: "Kindergarten (KG 1 and 2), Lower Primary (B1 to B3), Upper Primary (B4 to B6), Junior High School (B7 to B9, JHS 1 to 3) and Senior High School (SHS 1 to 3)",
      exams: "school-based assessment, the Basic Education Certificate Examination (BECE) at the end of JHS 3 and the WASSCE at the end of SHS 3",
      inspection: "the National Schools Inspectorate Authority (NaSIA)",
      send: "inclusive education under the Inclusive Education Policy, supported by the Special Education Division of the Ghana Education Service",
      teacherStandards: "the National Teachers' Standards for Ghana, set by the National Teaching Council",
      earlyYears: "the Kindergarten curriculum (KG 1 and 2) of the Standards-Based Curriculum",
      headteacher: "headteacher",
    },
    context: "Use Ghanaian places, names and cedi amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "uganda",
    region: "africa",
    country: "UG",
    place: "Uganda",
    name: "Uganda: National Curriculum (NCDC)",
    promptLabel: "Ugandan Curriculum (NCDC)",
    versions: [
      {
        label: "Primary curriculum (thematic in P1 to P3) and the competency-based Lower Secondary Curriculum (from 2020), with the aligned A-level curriculum",
        inForceFrom: "2020-02-01",
      },
    ],
    years: [...numbered("P", 1, 7, 6, ""), ...numbered("S", 1, 6, 13, "")],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum from the National Curriculum Development Centre (NCDC)",
      stages: "Primary (P1 to P7, with lower primary P1 to P3 taught by theme), Lower Secondary (S1 to S4, O level) and Upper Secondary (S5 and S6, A level)",
      exams: "the Uganda National Examinations Board (UNEB) Primary Leaving Examination (PLE) in P7, Uganda Certificate of Education (UCE) in S4, where school-based assessment counts for 20%, and Uganda Advanced Certificate of Education (UACE) in S6",
      inspection: "the Directorate of Education Standards (DES) at the Ministry of Education and Sports",
      send: "special needs and inclusive education, with learners supported in mainstream and special schools",
      earlyYears: "the Learning Framework for Early Childhood Development (nursery: baby, middle and top class)",
      headteacher: "headteacher",
    },
    context:
      "The school year runs from February to December in three terms. In lower primary many schools teach through a local language, with English taking over from P4. Use Ugandan places, names and shilling amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
];
