import type { Curriculum, YearOption } from "./types";

/*
 * The Middle East: the United Arab Emirates. Checked 2026-11-25 against the
 * sources in provenance.ts. Profile only: the Ministry of Education's reuse
 * terms are closed, so there are no statements (docs/curricula-permissions.md).
 * Only the Ministry's national curriculum is an entry. Private schools follow
 * the curriculum they teach (England, US, IB, CBSE), which already exist, so
 * there are no KHDA, ADEK or SPEA entries.
 *
 * Stage 3 batch A (checked 2026-11-27, docs/curricula-stage3-build.md A.1 to
 * A.7): Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Jordan, Egypt and Israel.
 * Each carries `release: "s3-a"`, so a teacher sees it only once batch A is
 * switched on as well as this region. Profiles only: no source is open for
 * commercial use. A term the official sources did not confirm is left out
 * rather than guessed, so some entries have no `send` or `inspection` line.
 */

/** "Grade 1" .. "Grade 12", one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));
}

export const MIDDLE_EAST_CURRICULA: Curriculum[] = [
  {
    id: "uae-moe",
    region: "middle-east",
    country: "AE",
    place: "United Arab Emirates",
    name: "United Arab Emirates: Ministry of Education curriculum",
    promptLabel: "UAE Ministry of Education Curriculum",
    versions: [
      {
        label:
          "Ministry of Education national curriculum, Kindergarten to Grade 12, with Artificial Intelligence compulsory from 2025-26 and merged with Design, Innovation and Computer Science into one Artificial Intelligence and Technology subject from 2026-27",
        inForceFrom: "2025-08-25",
      },
    ],
    years: [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum of the UAE Ministry of Education (MoE)",
      stages: "Kindergarten (KG1 and KG2), Cycle 1 (Grades 1 to 4), Cycle 2 (Grades 5 to 8) and Cycle 3 (Grades 9 to 12, in the General and Advanced streams)",
      exams: "continuous assessment and the Ministry's centrally set end-of-term examinations; the EmSAT is no longer required at Grade 12 (cancelled in November 2024)",
      inspection: "the Ministry of Education's school inspection and evaluation",
      send: "inclusive education for students of determination, with an Individual Education Plan (IEP)",
      teacherStandards: "the UAE Teacher Licensing System and its professional standards for teachers",
      earlyYears: "the Ministry's Kindergarten curriculum (KG1 and KG2)",
      headteacher: "principal",
    },
    context:
      "Public schools teach in Arabic, with English taught from Kindergarten; Arabic, Islamic Education and Moral, Social and Cultural Studies are compulsory. The school year runs from late August to early July. Use Emirati places, names and dirham amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "saudi-arabia",
    region: "middle-east",
    release: "s3-a",
    country: "SA",
    place: "Saudi Arabia",
    name: "Saudi Arabia: Ministry of Education curriculum",
    promptLabel: "Saudi Ministry of Education Curriculum",
    versions: [
      {
        label:
          "Ministry of Education national curriculum, two semesters a year from 2025-26, with 50 artificial intelligence units added and 22 subjects updated for 2026-27",
        inForceFrom: "2026-08-01",
      },
    ],
    years: [{ label: "KG1", age: 3 }, { label: "KG2", age: 4 }, { label: "KG3", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-US",
    terms: {
      curriculum: "the national curriculum of the Saudi Ministry of Education",
      stages:
        "Kindergarten (KG1 to KG3), Primary (Grades 1 to 6), Intermediate (Grades 7 to 9) and Secondary (Grades 10 to 12) on the Secondary Tracks System (General, Computer Science and Engineering, Health and Life Sciences, Business Administration, and Sharia)",
      exams:
        "the NAFS national assessments in Grades 3, 6 and 9, set by the Education and Training Evaluation Commission (ETEC), and the General Aptitude Test (Qudurat) and Achievement Test (Tahsili) for university entry",
      inspection: "school evaluation and school performance cards from the Education and Training Evaluation Commission (ETEC)",
      earlyYears: "the Ministry of Education's kindergarten curriculum",
      headteacher: "principal",
    },
    context:
      "State schools teach in Arabic, with English taught as a subject from American English textbooks; Arabic and Islamic Studies are core subjects. The school year starts in late August and has two semesters. Use Saudi places, names and riyal amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "qatar",
    region: "middle-east",
    release: "s3-a",
    country: "QA",
    place: "Qatar",
    name: "Qatar: National Curriculum Standards",
    promptLabel: "Qatar National Curriculum",
    versions: [
      {
        label:
          "Qatar National Curriculum Standards, with artificial intelligence, data science and financial literacy added and one unified Grade 10 science for 2026-27",
        inForceFrom: "2026-08-01",
      },
    ],
    years: [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Qatar National Curriculum Standards of the Ministry of Education and Higher Education",
      stages: "Kindergarten (KG1 and KG2), Primary (Grades 1 to 6), Preparatory (Grades 7 to 9) and Secondary (Grades 10 to 12)",
      exams: "the Ministry's Secondary School Certificate examinations at the end of Grade 12",
      earlyYears: "the Ministry's kindergarten curriculum",
      headteacher: "principal",
    },
    context:
      "Government schools teach in Arabic, with English taught as a subject; private schools also teach Arabic, Islamic Studies and Qatar History to the national standards. Use Qatari places, names and riyal amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "kuwait",
    region: "middle-east",
    release: "s3-a",
    country: "KW",
    place: "Kuwait",
    name: "Kuwait: Ministry of Education national curriculum",
    promptLabel: "Kuwait National Curriculum",
    versions: [
      {
        label: "Ministry of Education competency-based national curriculum, new for Grades 1 to 9 from 2025-26",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum of the Kuwait Ministry of Education",
      stages: "Kindergarten (KG1 and KG2), Primary (Grades 1 to 5), Intermediate (Grades 6 to 9) and Secondary (Grades 10 to 12)",
      exams: "the Ministry's first-term and end-of-year examinations, with the Grade 12 final examinations at the end of secondary school",
      earlyYears: "the Ministry's kindergarten curriculum",
      headteacher: "principal",
    },
    context:
      "State schools teach in Arabic, with English taught as a subject; the curriculum builds key, general and subject-specific competences. The school year runs from mid-September to June in two terms. Use Kuwaiti places, names and dinar amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "oman",
    region: "middle-east",
    release: "s3-a",
    country: "OM",
    place: "Oman",
    name: "Oman: Ministry of Education curriculum",
    promptLabel: "Omani Ministry of Education Curriculum",
    versions: [
      {
        label: "Ministry of Education curriculum, with Cambridge-based mathematics and science in Grades 1 to 12",
        inForceFrom: "2026-09-01",
      },
    ],
    years: [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the curriculum of the Oman Ministry of Education",
      stages: "Kindergarten (KG1 and KG2), Basic Education Cycle 1 (Grades 1 to 4), Cycle 2 (Grades 5 to 10) and Post-Basic Education (Grades 11 and 12)",
      exams: "the General Education Diploma at the end of Grade 12, with external Ministry examinations each semester",
      headteacher: "principal",
    },
    context:
      "Government schools teach in Arabic, with English taught as a subject; mathematics and science follow Cambridge-based programmes adapted by the Ministry. From Cycle 2, boys and girls are taught in separate schools. Use Omani places, names and rial amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "bahrain",
    region: "middle-east",
    release: "s3-a",
    country: "BH",
    place: "Bahrain",
    name: "Bahrain: Ministry of Education curriculum",
    promptLabel: "Bahraini Ministry of Education Curriculum",
    versions: [{ label: "Ministry of Education curriculum", inForceFrom: "2026-09-01" }],
    years: numbered("Grade", 1, 12, 6),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the curriculum of the Bahrain Ministry of Education",
      stages: "Primary (Grades 1 to 6), Intermediate (Grades 7 to 9) and Secondary (Grades 10 to 12)",
      exams:
        "the BQA National Examinations: Grade 9 in Arabic, English, mathematics and science (government schools), and Grade 12 in Arabic, English and mathematical skills (compulsory in government schools, optional in private ones)",
      inspection: "school reviews by the Education and Training Quality Authority (BQA)",
      headteacher: "principal",
    },
    context:
      "Government schools teach in Arabic, with English taught as a subject; kindergartens are private. Use Bahraini places, names and dinar amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "jordan",
    region: "middle-east",
    release: "s3-a",
    country: "JO",
    place: "Jordan",
    name: "Jordan: national curriculum (NCCD)",
    promptLabel: "Jordanian National Curriculum",
    versions: [
      {
        label:
          "National Center for Curriculum Development curricula, with the two-year Tawjihi over Grades 11 and 12 (first graduates 2026) and the digital skills curriculum for Grades 1 to 12 from 2025-26",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curricula of the National Center for Curriculum Development (NCCD)",
      stages: "Kindergarten (KG1 and KG2), Basic Education (Grades 1 to 10) and Secondary Education (Grades 11 and 12, in academic and vocational streams)",
      exams:
        "the Tawjihi (General Secondary Education Certificate Examination), taken over Grades 11 and 12: the Grade 11 results count for about 30% and Grade 12 for about 70%",
      earlyYears: "the Ministry of Education's kindergarten curriculum",
      headteacher: "principal",
    },
    context:
      "Public schools teach in Arabic, with English taught as a subject; textbooks are written by the National Center for Curriculum Development. Use Jordanian places, names and dinar amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "egypt",
    region: "middle-east",
    release: "s3-a",
    country: "EG",
    place: "Egypt",
    name: "Egypt: Ministry of Education curriculum (Education 2.0)",
    promptLabel: "Egyptian National Curriculum (Education 2.0)",
    versions: [
      {
        label:
          "Education 2.0, rolled up year by year from Kindergarten since 2018, with the optional Egyptian Baccalaureate alongside Thanaweya Amma from Secondary 1 in 2025-26",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [
      { label: "KG1", age: 4 },
      { label: "KG2", age: 5 },
      ...numbered("Primary", 1, 6, 6),
      ...numbered("Preparatory", 1, 3, 12),
      ...numbered("Secondary", 1, 3, 15),
    ],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum of the Ministry of Education and Technical Education (Education 2.0)",
      stages: "Kindergarten (KG1 and KG2), Primary (Primary 1 to 6), Preparatory (Preparatory 1 to 3) and Secondary (Secondary 1 to 3)",
      exams:
        "the Basic Education Completion Certificate at the end of Preparatory 3, then either the Egyptian Baccalaureate (optional since 2025-26 and chosen by almost every student starting Secondary 1 in 2026-27; first examinations in 2027) or Thanaweya Amma (the General Secondary Certificate)",
      earlyYears: "the Education 2.0 kindergarten curriculum",
      headteacher: "principal",
    },
    context:
      "Government schools teach in Arabic, with English taught as a subject; Egyptian-Japanese schools follow Education 2.0 too. Use Egyptian places, names and pound amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "israel",
    region: "middle-east",
    release: "s3-a",
    country: "IL",
    place: "Israel",
    name: "Israel: Ministry of Education curriculum",
    promptLabel: "Israeli Ministry of Education Curriculum",
    versions: [{ label: "Ministry of Education curricula and compulsory core curriculum", inForceFrom: "2026-09-01" }],
    years: [
      { label: "Kindergarten (age 3)", age: 3 },
      { label: "Kindergarten (age 4)", age: 4 },
      { label: "Kindergarten (age 5)", age: 5 },
      ...numbered("Grade", 1, 12, 6),
    ],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the curricula and compulsory core curriculum of the Israeli Ministry of Education",
      stages:
        "preprimary kindergarten (ages 3 to 6), primary school (Grades 1 to 6), lower secondary or middle school (Grades 7 to 9) and upper secondary or high school (Grades 10 to 12); some primary schools run Grades 1 to 8",
      exams: "the Bagrut (matriculation) examinations; the national Meitzav tests set by RAMA were suspended by the minister in 2026",
      earlyYears: "the Ministry of Education's kindergarten curriculum",
      headteacher: "principal",
    },
    context:
      "Schools teach in Hebrew or Arabic, in separate streams (state, state-religious, Arab and Haredi), with English taught as a subject. Use Israeli places, names and shekel amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
];
