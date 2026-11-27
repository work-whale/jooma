import type { Curriculum, YearOption } from "./types";

/*
 * Asia: India (CBSE), Pakistan, the Philippines, Malaysia, Singapore and Hong
 * Kong. Checked 2026-11-25 against the sources in provenance.ts. Profiles
 * only: every source here is closed or unclear for commercial reuse, so there
 * are no statements (docs/curricula-permissions.md).
 *
 * Stage 3 batch B (checked 2026-11-27, docs/curricula-stage3-build.md B.1 to
 * B.7): China, Japan, South Korea, Taiwan, Vietnam, Thailand, Indonesia, Sri
 * Lanka and Nepal, each behind `release: "s3-b"`. Profiles only for now; Japan
 * and Taiwan (open licences) and Vietnam (open by statute) could carry
 * statements later, if the owner says so. Bangladesh is held (B.5). Terms use
 * English words only: a Turkish word pulled a batch A live run into Turkish.
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
  {
    id: "china",
    region: "asia",
    release: "s3-b",
    country: "CN",
    place: "China",
    name: "China: national curriculum standards (Ministry of Education)",
    promptLabel: "Chinese National Curriculum Standards",
    versions: [
      {
        label: "Compulsory education curriculum plan and standards (2022 edition) for Grades 1 to 9, and senior high school curriculum standards (2017 edition, revised 2020)",
        inForceFrom: "2022-09-01",
      },
    ],
    years: [...numbered("Grade", 1, 9, 6), ...numbered("Senior High", 1, 3, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum standards of the Ministry of Education",
      stages: "compulsory education (primary school, Grades 1 to 6, and junior secondary school, Grades 7 to 9) and senior high school (Senior High 1 to 3)",
      exams: "the zhongkao (senior high school entrance exam, end of Grade 9) and the gaokao (national college entrance exam, end of Senior High 3)",
      headteacher: "principal",
    },
    context:
      "Schools teach in Mandarin Chinese, with English taught as a subject; provinces choose from approved textbooks written to the national standards. The 2022 standards put core competencies and cross-subject learning first. Use Chinese places, names and yuan amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "japan",
    region: "asia",
    release: "s3-b",
    country: "JP",
    place: "Japan",
    name: "Japan: Course of Study (MEXT)",
    promptLabel: "Japanese Course of Study (MEXT)",
    versions: [
      {
        label:
          "Course of Study, 2017-18 revision (elementary from 2020, junior high from 2021, senior high from 2022); the next revision is planned for elementary schools from 2030 and junior high schools from 2031",
        inForceFrom: "2022-04-01",
      },
    ],
    years: [...numbered("Elementary", 1, 6, 6), ...numbered("Junior High", 1, 3, 12), ...numbered("Senior High", 1, 3, 15)],
    defaultLanguage: "en-US",
    terms: {
      curriculum: "the Course of Study set by the Ministry of Education, Culture, Sports, Science and Technology (MEXT)",
      stages: "elementary school (Elementary 1 to 6), junior high school (Junior High 1 to 3) and senior high school (Senior High 1 to 3)",
      exams:
        "the National Assessment of Academic Ability (Elementary 6 and Junior High 3), high school entrance exams at the end of Junior High 3, and the Common Test for University Admissions",
      send: "special needs education: support in the regular class, resource rooms for some lessons, special support classes and special needs schools",
      headteacher: "principal",
    },
    context:
      "Schools teach in Japanese, with English taught as a subject. The school year starts in April and has three terms in most schools. Use Japanese places, names and yen amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "south-korea",
    region: "asia",
    release: "s3-b",
    country: "KR",
    place: "South Korea",
    name: "South Korea: 2022 Revised National Curriculum",
    promptLabel: "Korean National Curriculum (2022 revision)",
    versions: [
      {
        label: "2022 Revised National Curriculum in Elementary 1 to 6, Middle 1 and 2, High 1 and 2, with the 2015 curriculum still in Middle 3 and High 3 in 2026",
        inForceFrom: "2026-03-01",
      },
      { label: "2022 Revised National Curriculum in every grade", inForceFrom: "2027-03-01" },
    ],
    years: [...numbered("Elementary", 1, 6, 6), ...numbered("Middle", 1, 3, 12), ...numbered("High", 1, 3, 15)],
    defaultLanguage: "en-US",
    terms: {
      curriculum: "the 2022 Revised National Curriculum of the Ministry of Education",
      stages: "elementary school (Elementary 1 to 6), middle school (Middle 1 to 3) and high school (High 1 to 3), with the high school credit system in full from 2025",
      exams: "school achievement assessments, and the CSAT (College Scholastic Ability Test), which becomes an integrated exam with no humanities or science split from the 2028 admission year",
      headteacher: "principal",
    },
    context:
      "Schools teach in Korean, with English taught as a subject from Elementary 3. The school year starts in March and has two semesters. Use Korean places, names and won amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "taiwan",
    region: "asia",
    release: "s3-b",
    country: "TW",
    place: "Taiwan",
    name: "Taiwan: Curriculum Guidelines of 12-Year Basic Education",
    promptLabel: "Taiwan 12-Year Basic Education Curriculum (108 curriculum)",
    versions: [{ label: "Curriculum Guidelines of 12-Year Basic Education (the 108 curriculum), competency-based, since 2019", inForceFrom: "2019-08-01" }],
    years: numbered("Grade", 1, 12, 6),
    defaultLanguage: "en-US",
    terms: {
      curriculum: "the Curriculum Guidelines of 12-Year Basic Education issued by the Ministry of Education",
      stages: "elementary school (Grades 1 to 6), junior high school (Grades 7 to 9) and senior high or vocational high school (Grades 10 to 12)",
      exams:
        "the CAP (Comprehensive Assessment Program for Junior High School Students) at the end of Grade 9, and the GSAT (General Scholastic Ability Test) in January of Grade 12",
      headteacher: "principal",
    },
    context:
      "Schools teach in Mandarin Chinese, with English taught as a subject. The 108 curriculum centres on core competencies, with self-directed learning and elective courses in senior high. Use Taiwanese places, names and New Taiwan dollar amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "vietnam",
    region: "asia",
    release: "s3-b",
    country: "VN",
    place: "Vietnam",
    name: "Vietnam: General Education Programme 2018 (MOET)",
    promptLabel: "Vietnamese General Education Programme 2018",
    versions: [
      {
        label: "General Education Programme 2018 in every grade, with one national textbook series (Connecting Knowledge with Life) from 2026-27",
        inForceFrom: "2026-09-01",
      },
    ],
    years: numbered("Grade", 1, 12, 6),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the General Education Programme 2018 of the Ministry of Education and Training (MOET)",
      stages:
        "primary school (Grades 1 to 5), lower secondary school (Grades 6 to 9) and upper secondary school (Grades 10 to 12); Grades 1 to 9 are basic education and Grades 10 to 12 career-oriented education",
      exams: "the national high school graduation examination at the end of Grade 12",
      headteacher: "principal",
    },
    context:
      "Schools teach in Vietnamese, with English taught as a subject. The 2018 programme is competency-based. Use Vietnamese places, names and dong amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "thailand",
    region: "asia",
    release: "s3-b",
    country: "TH",
    place: "Thailand",
    name: "Thailand: Basic Education Core Curriculum (OBEC)",
    promptLabel: "Thai Basic Education Core Curriculum",
    versions: [
      {
        label:
          "Basic Education Core Curriculum B.E. 2551 (2008, revised 2017), with the competency-based curriculum B.E. 2568 used for Prathom 1 to 3 in schools that have taken it up",
        inForceFrom: "2026-05-01",
      },
    ],
    years: [...numbered("Prathom", 1, 6, 6), ...numbered("Mathayom", 1, 6, 12)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Basic Education Core Curriculum of the Office of the Basic Education Commission (OBEC)",
      stages: "primary school (Prathom 1 to 6), lower secondary (Mathayom 1 to 3) and upper secondary (Mathayom 4 to 6)",
      exams: "the O-NET national tests (Prathom 6, Mathayom 3 and Mathayom 6), and university admission through TCAS (TGAT, TPAT and A-Level tests)",
      headteacher: "school director",
    },
    context:
      "Schools teach in Thai, with English taught as a subject. The school year starts in May and has two semesters. Use Thai places, names and baht amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "indonesia",
    region: "asia",
    release: "s3-b",
    country: "ID",
    place: "Indonesia",
    name: "Indonesia: Kurikulum Merdeka",
    promptLabel: "Indonesian Curriculum (Kurikulum Merdeka)",
    versions: [
      {
        label: "Kurikulum Merdeka, the national curriculum since 2024, taught with the deep learning approach; Kurikulum 2013 still allowed in some remote areas until 2026-27",
        inForceFrom: "2024-07-01",
      },
    ],
    years: numbered("Grade", 1, 12, 6),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "Kurikulum Merdeka, with learning outcomes (Capaian Pembelajaran) set by the Ministry of Primary and Secondary Education",
      stages:
        "SD (Grades 1 to 6), SMP (Grades 7 to 9) and SMA or SMK (Grades 10 to 12), in learning phases A (Grades 1 and 2), B (3 and 4), C (5 and 6), D (7 to 9), E (10) and F (11 and 12)",
      exams: "the TKA (academic ability test) in Grades 6, 9 and 12, which is not a graduation requirement and from 2026 also serves as the National Assessment",
      headteacher: "principal",
    },
    context:
      "Schools teach in Indonesian, with English taught as a subject. Kurikulum Merdeka sets learning outcomes per phase rather than per year. Use Indonesian places, names and rupiah amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "sri-lanka",
    region: "asia",
    release: "s3-b",
    country: "LK",
    place: "Sri Lanka",
    name: "Sri Lanka: national curriculum (NIE)",
    promptLabel: "Sri Lankan National Curriculum",
    versions: [
      {
        label: "National Institute of Education curriculum, with the new activity-based curriculum in Grade 1 from 2026; the reforms reach other grades from 2027",
        inForceFrom: "2026-01-01",
      },
    ],
    years: numbered("Grade", 1, 13, 5),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum developed by the National Institute of Education (NIE)",
      stages: "primary (Grades 1 to 5), junior secondary (Grades 6 to 9), senior secondary (Grades 10 and 11) and collegiate (Grades 12 and 13)",
      exams: "the Grade 5 Scholarship Examination, the G.C.E. Ordinary Level at the end of Grade 11 and the G.C.E. Advanced Level at the end of Grade 13",
      headteacher: "principal",
    },
    context:
      "Schools teach in Sinhala, Tamil or English. The school year runs from January to December. Use Sri Lankan places, names and rupee amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "nepal",
    region: "asia",
    release: "s3-b",
    country: "NP",
    place: "Nepal",
    name: "Nepal: National Curriculum Framework (CDC)",
    promptLabel: "Nepali National Curriculum",
    versions: [{ label: "National Curriculum Framework 2019 of the Curriculum Development Centre", inForceFrom: "2019-04-14" }],
    years: numbered("Grade", 1, 12, 5),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the National Curriculum Framework of the Curriculum Development Centre (CDC)",
      stages: "basic education (Grades 1 to 8: primary 1 to 5, lower secondary 6 to 8) and secondary education (Grades 9 to 12, with streams in Grades 11 and 12)",
      exams:
        "the Basic Level Examination (Grade 8), the Secondary Education Examination (SEE, Grade 10) and the National Examinations Board Grade 12 examinations",
    },
    context:
      "Schools teach in Nepali or English. The school year starts in mid-April. Use Nepali places, names and rupee amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
];
