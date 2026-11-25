import type { Curriculum, YearOption } from "./types";

/*
 * Asia: India (CBSE), Pakistan, the Philippines, Malaysia, Singapore and Hong
 * Kong. Checked 2026-11-25 against the sources in provenance.ts. Profiles
 * only: every source here is closed or unclear for commercial reuse, so there
 * are no statements (docs/curricula-permissions.md).
 */

/** "Grade 1" .. "Grade 12" style labels, one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number, sep = " "): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix}${sep}${from + i}`, age: firstAge + i }));
}

export const ASIA_CURRICULA: Curriculum[] = [
  {
    id: "india-cbse",
    region: "asia",
    country: "IN",
    place: "India",
    name: "India: CBSE (NCERT)",
    promptLabel: "Indian Curriculum (CBSE)",
    versions: [
      { label: "CBSE Curriculum 2025-26 (under NCF-SE 2023)", inForceFrom: "2025-04-01" },
      { label: "CBSE Curriculum 2026-27 (under NCF-SE 2023), with new NCERT textbooks in Class 9 and a three-language rule from Class 6", inForceFrom: "2026-04-01" },
    ],
    years: [{ label: "Nursery", age: 3 }, { label: "LKG", age: 4 }, { label: "UKG", age: 5 }, ...numbered("Class", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the CBSE curriculum, based on the National Curriculum Framework for School Education (NCF-SE 2023) and NCERT textbooks",
      stages: "the Foundational Stage (pre-school to Class 2), Preparatory Stage (Classes 3 to 5), Middle Stage (Classes 6 to 8) and Secondary Stage (Classes 9 to 12)",
      exams: "internal assessment and the CBSE board examinations at the end of Class 10 and Class 12",
      inspection: "CBSE affiliation and inspection under the CBSE Affiliation Bye-Laws",
      send: "children with special needs (CWSN) under the Rights of Persons with Disabilities Act 2016, with a special educator and CBSE examination concessions",
      teacherStandards: "CBSE's requirement of 50 hours of continuous professional development (CPD) a year",
      earlyYears: "the National Curriculum Framework for the Foundational Stage (NCF-FS 2022)",
      attainment: "the CBSE nine-point grading scale, from A1 (highest) to E",
      headteacher: "principal",
    },
    context:
      "The CBSE school year runs from April to March. Schools teach in English or Hindi alongside a third language from Class 6. Many CBSE schools are outside India, for example in the Gulf. Use Indian places, names and rupee amounts where a local example helps, unless the request gives another setting.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "pakistan",
    region: "asia",
    country: "PK",
    place: "Pakistan",
    name: "Pakistan: National Curriculum of Pakistan",
    promptLabel: "National Curriculum of Pakistan",
    versions: [
      { label: "National Curriculum of Pakistan 2022-23 (provinces adopt and adapt it)", inForceFrom: "2023-04-01" },
      {
        label: "New National Curriculum of Pakistan 2026 for early childhood to Grade 5 (provinces set their own start, Punjab from April 2027), with the 2022-23 curriculum for Grades 6 to 12",
        inForceFrom: "2027-04-01",
      },
    ],
    years: [{ label: "ECE", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the National Curriculum of Pakistan from the National Curriculum Council, as adopted by the provinces",
      stages: "Early Childhood Education (ECE), Primary (Grades 1 to 5), Middle (Grades 6 to 8), Secondary (Grades 9 and 10, Matric) and Higher Secondary (Grades 11 and 12, Intermediate)",
      exams: "the Secondary School Certificate (SSC, Matric) after Grades 9 and 10 and the Higher Secondary School Certificate (HSSC, Intermediate) after Grades 11 and 12, set by the Boards of Intermediate and Secondary Education (BISE) and the Federal Board (FBISE)",
      inspection: "monitoring by the provincial school education departments and, in Islamabad, the Federal Directorate of Education",
      send: "special and inclusive education through the provincial special education departments",
      teacherStandards: "the National Professional Standards for Teachers in Pakistan",
      earlyYears: "Early Childhood Care and Education (ECCE) under the National Curriculum",
      headteacher: "headteacher (principal in a secondary or higher secondary school)",
    },
    context:
      "Urdu and English are both taught, and many schools teach mathematics and science in English. The school year usually starts in April, and in August in some provinces and private schools. Use Pakistani places, names and rupee amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "philippines",
    region: "asia",
    country: "PH",
    place: "Philippines",
    name: "Philippines: MATATAG Curriculum (DepEd)",
    promptLabel: "Philippine Curriculum (MATATAG, DepEd)",
    versions: [
      {
        label: "MATATAG Curriculum (Kindergarten to Grade 10) and the Strengthened Senior High School Curriculum (Grade 11 from 2026-27, Grade 12 from 2027-28)",
        inForceFrom: "2024-07-29",
      },
    ],
    years: [{ label: "Kindergarten", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-US",
    terms: {
      curriculum: "the MATATAG Curriculum and the Strengthened Senior High School Curriculum of the Department of Education (DepEd)",
      stages: "Key Stage 1 (Kindergarten to Grade 3), Key Stage 2 (Grades 4 to 6), Key Stage 3 (Grades 7 to 10, Junior High School) and Key Stage 4 (Grades 11 and 12, Senior High School, in the Academic and TechPro tracks)",
      exams: "classroom assessment (written work, performance tasks and quarterly assessments) and the National Achievement Test (NAT)",
      inspection: "DepEd's School-Based Management (SBM) assessment and supervision by the schools division and regional offices",
      send: "inclusive education for learners with disabilities under Republic Act 11650, with Inclusive Learning Resource Centers and an Individualized Education Plan",
      teacherStandards: "the Philippine Professional Standards for Teachers (PPST)",
      earlyYears: "the MATATAG Kindergarten curriculum",
      attainment: "DepEd's grading descriptors: Outstanding (90 to 100), Very Satisfactory (85 to 89), Satisfactory (80 to 84), Fairly Satisfactory (75 to 79) and Did Not Meet Expectations (below 75)",
      headteacher: "school head (principal)",
    },
    context:
      "The school year runs from June to April in four quarters. English and Filipino are both taught, and mathematics and science are usually taught in English. Use Philippine places, names and peso amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "malaysia",
    region: "asia",
    country: "MY",
    place: "Malaysia",
    name: "Malaysia: KSSR and KSSM (Ministry of Education)",
    promptLabel: "Malaysian Curriculum (KSSR and KSSM)",
    versions: [
      { label: "KSSR (2017 revision) for primary and KSSM for secondary", inForceFrom: "2017-01-01" },
      { label: "Kurikulum Persekolahan 2027 (KP2027) in Year 1 and Form 1, rolling up year by year, with KSSR and KSSM in the other years", inForceFrom: "2027-01-01" },
    ],
    years: [{ label: "Preschool", age: 5 }, ...numbered("Year", 1, 6, 6), ...numbered("Form", 1, 5, 12), { label: "Form 6 Lower", age: 17 }, { label: "Form 6 Upper", age: 18 }],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum of the Ministry of Education Malaysia (KPM): KSSR in primary and KSSM in secondary, moving to KP2027 from 2027",
      stages: "primary school (Level 1, Years 1 to 3, and Level 2, Years 4 to 6), lower secondary (Forms 1 to 3), upper secondary (Forms 4 and 5) and Form 6 (pre-university)",
      exams: "classroom assessment (Pentaksiran Bilik Darjah, PBD), the Sijil Pelajaran Malaysia (SPM) at the end of Form 5 and the Sijil Tinggi Persekolahan Malaysia (STPM) in Form 6; UPSR and PT3 have been abolished",
      inspection: "the Jemaah Nazir dan Jaminan Kualiti (JNJK), the Ministry's school inspectorate",
      send: "special education (Pendidikan Khas) through the Special Education Integration Programme (PPKI) and the Inclusive Education Programme, with an Individual Education Plan",
      teacherStandards: "Standard Guru Malaysia (the Malaysian Teacher Standards)",
      earlyYears: "the National Preschool Standard-Based Curriculum (KSPK)",
      attainment: "the classroom assessment mastery levels (tahap penguasaan) TP1 to TP6",
      headteacher: "guru besar (head teacher) in primary and pengetua (principal) in secondary",
    },
    context:
      "The school year runs from January to December (it returned to a January start in 2026). Malay is the main medium of instruction in national schools; national-type schools teach in Chinese or Tamil, and the Dual Language Programme lets some schools teach science and mathematics in English. Use Malaysian places, names and ringgit amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "singapore",
    region: "asia",
    country: "SG",
    place: "Singapore",
    name: "Singapore: MOE syllabuses",
    promptLabel: "Singapore Curriculum (MOE)",
    versions: [
      { label: "MOE syllabuses with Full Subject-Based Banding, and GCE O-Level and N-Level examinations", inForceFrom: "2024-01-01" },
      { label: "MOE syllabuses with Full Subject-Based Banding, and the Singapore-Cambridge Secondary Education Certificate (SEC) in place of O-Level and N-Level", inForceFrom: "2027-01-01" },
    ],
    // Secondary 5 and JC 1 are both 16: two routes after Secondary 4, so ages repeat here and never go down.
    years: [...numbered("Primary", 1, 6, 6), ...numbered("Secondary", 1, 4, 12), { label: "Secondary 5", age: 16 }, { label: "JC 1", age: 16 }, { label: "JC 2", age: 17 }],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national syllabuses of the Ministry of Education (MOE), Singapore",
      stages: "primary (Primary 1 to 6), secondary (Secondary 1 to 4 or 5, with subjects taken at G1, G2 or G3 under Full Subject-Based Banding) and pre-university (Junior College 1 and 2)",
      exams: "the Primary School Leaving Examination (PSLE) at the end of Primary 6; GCE O-Level and N-Level until 2026 and the Singapore-Cambridge Secondary Education Certificate (SEC) from 2027; GCE A-Level at the end of JC 2; all run by SEAB",
      inspection: "the School Excellence Model: school self-evaluation with external validation by MOE",
      send: "special educational needs support in mainstream schools from Special Educational Needs Officers (SEN Officers), with special education (SPED) schools for higher needs",
      teacherStandards: "the Singapore Teacher Growth Model",
      earlyYears: "the Nurturing Early Learners (NEL) Framework for preschool (Kindergarten 1 and 2)",
      attainment: "PSLE Achievement Levels, from AL1 (highest) to AL8",
      headteacher: "principal",
    },
    context:
      "The school year runs from January to November in four terms. English is the medium of instruction, with a Mother Tongue Language (Chinese, Malay or Tamil) taught as a subject. Use Singapore places, names and dollar amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "hong-kong",
    region: "asia",
    country: "HK",
    place: "Hong Kong",
    name: "Hong Kong: Curriculum guides (Education Bureau)",
    promptLabel: "Hong Kong Curriculum (EDB)",
    versions: [
      {
        label: "Curriculum Development Council guides, with Primary Science and Primary Humanities replacing General Studies from 2025-26 at P1 and P4 and in all primary years by 2027-28",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [...numbered("P", 1, 6, 6, ""), ...numbered("S", 1, 6, 12, "")],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Hong Kong school curriculum set out in the Curriculum Development Council's curriculum guides, issued by the Education Bureau (EDB)",
      // "Key Stage" is the real name here (Hong Kong uses four key stages), not England's framing.
      stages: "Key Stage 1 (P1 to P3), Key Stage 2 (P4 to P6), Key Stage 3 (S1 to S3, junior secondary) and Key Stage 4 (S4 to S6, senior secondary)",
      exams: "the Territory-wide System Assessment (TSA) and the Hong Kong Diploma of Secondary Education (HKDSE) at the end of S6, run by the HKEAA",
      inspection: "the EDB's School Development and Accountability framework: school self-evaluation and External School Review",
      // Hong Kong schools really do have a SENCO.
      send: "special educational needs support under the Whole School Approach to Integrated Education, coordinated by a Special Educational Needs Coordinator (SENCO)",
      teacherStandards: "T-standard+, the Professional Standards for Teachers of Hong Kong",
      earlyYears: "the Kindergarten Education Curriculum Guide (2017)",
      headteacher: "principal",
    },
    context:
      "The school year runs from September to July. Schools teach in Chinese (Cantonese) or English. Citizenship and Social Development replaced Liberal Studies at senior secondary in 2021. Use Hong Kong places, names and Hong Kong dollar amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
];
