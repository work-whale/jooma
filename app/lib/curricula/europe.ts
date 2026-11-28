import type { Curriculum, YearOption } from "./types";

/*
 * Europe: Malta. Checked 2026-11-25 against the sources in provenance.ts.
 * Profile only: the National Curriculum Framework is copyright of the Ministry
 * and no reuse terms were found, so there are no statements
 * (docs/curricula-permissions.md).
 *
 * Türkiye is Stage 3 batch A (checked 2026-11-27, docs/curricula-stage3-build.md):
 * under Europe as the workbook files it, shown only once batch A is switched
 * on. Profile only: its programmes are not open for commercial use.
 *
 * Stage 3 batch C (checked 2026-11-27, docs/curricula-stage3-build.md C.1 to
 * C.6): twenty-nine countries behind `release: "s3-c"`, one national entry
 * each (owner): Germany, Switzerland, Belgium and Spain are not split, and
 * their prompts tell the model to follow the Land, canton, community or region
 * if the teacher names one. Countries whose language Jooma writes default to
 * it; the rest, Belgium and Switzerland included, default to British English
 * and use English words only in their terms.
 */

/** "Year 1" .. "Year 11" (or "Vg1" with an empty separator), one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number, sep = " "): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix}${sep}${from + i}`, age: firstAge + i }));
}

export const EUROPE_CURRICULA: Curriculum[] = [
  {
    id: "malta",
    region: "europe",
    country: "MT",
    place: "Malta",
    name: "Malta: National Curriculum Framework (Ministry for Education)",
    promptLabel: "Maltese Curriculum (National Curriculum Framework)",
    versions: [{ label: "National Curriculum Framework (2012) and the Learning Outcomes Framework (from 2018)", inForceFrom: "2012-09-01" }],
    years: [{ label: "Kindergarten 1", age: 3 }, { label: "Kindergarten 2", age: 4 }, ...numbered("Year", 1, 11, 5)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the National Curriculum Framework (NCF 2012) and the Learning Outcomes Framework, set by the Ministry for Education",
      stages: "the Early Years cycle (Kindergarten to Year 2), Junior Years (Years 3 to 6) and Secondary Years (Years 7 to 11: middle school, then secondary school)",
      exams: "school assessment with national annual examinations in Years 4 to 6 (the End-of-Primary Examination in Year 6), the MATSEC Secondary Education Certificate examinations at the end of Year 11, then MATSEC Intermediate and Advanced level at sixth form",
      inspection: "external reviews of schools by the Directorate for Quality and Standards in Education (DQSE), against the National Quality Standards",
      send: "inclusive education with Learning Support Educators (LSEs), an Inclusion Coordinator (INCO) and an Individual Educational Programme (IEP)",
      earlyYears: "the Early Years cycle of the National Curriculum Framework (Kindergarten to Year 2)",
      headteacher: "head of school",
    },
    context:
      "The school year runs from late September to June. Maltese and English are both official languages and both are taught; many subjects are taught in English. State, Church and independent schools all follow the National Curriculum Framework. Use Maltese places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "turkey",
    region: "europe",
    release: "s3-a",
    country: "TR",
    place: "Türkiye",
    name: "Türkiye: Ministry of National Education curriculum (Türkiye Century Education Model)",
    promptLabel: "Turkish National Curriculum (Türkiye Century Education Model)",
    versions: [
      {
        label:
          "Türkiye Century Education Model (Maarif Modeli) in preschool, Grades 1, 2, 3, 5, 6, 7, the high school preparatory year and Grades 9, 10 and 11; Grades 4, 8 and 12 stay on the previous programmes in 2026-27",
        inForceFrom: "2026-09-01",
      },
      { label: "Türkiye Century Education Model (Maarif Modeli) in every grade", inForceFrom: "2027-09-01" },
    ],
    years: [{ label: "Preschool", age: 5 }, ...numbered("Grade", 1, 12, 6)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the teaching programmes of the Ministry of National Education (MEB), under the Türkiye Century Education Model",
      stages:
        "preschool, primary school (Grades 1 to 4), middle school (Grades 5 to 8) and high school (Grades 9 to 12, some with a preparatory year)",
      exams: "the LGS (high school entrance exam, end of Grade 8) and the YKS (university entrance exam); from 2028 their questions are skill-based and set in context",
      earlyYears: "the MEB preschool education programme",
      headteacher: "school principal",
    },
    context:
      "Schools teach in Turkish, with English taught as a subject. The Türkiye Century Education Model treats knowledge, skills, values and dispositions together and asks pupils to apply what they learn. Use Turkish places, names and lira amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "austria",
    region: "europe",
    release: "s3-c",
    country: "AT",
    place: "Austria",
    name: "Austria: national curricula (Lehrpläne)",
    promptLabel: "Austrian National Curriculum (Lehrplan)",
    versions: [
      { label: "New competence-based curricula in every grade of Volksschule, Mittelschule and the AHS lower level (introduced year by year from 2023-24)", inForceFrom: "2026-09-01" },
      { label: "New competence-based curricula in Volksschule, Mittelschule and the AHS lower level, with new curricula for the AHS upper level from 2027-28", inForceFrom: "2027-09-01" },
    ],
    years: numbered("Grade", 1, 13, 6),
    defaultLanguage: "de",
    terms: {
      curriculum: "the national curricula (Lehrpläne) of the Federal Ministry of Education",
      stages: "primary school (Volksschule, Grades 1 to 4), lower secondary (Mittelschule or AHS lower level, Grades 5 to 8) and upper secondary (Grades 9 to 12, or 13 at a BHS)",
      exams: "the iKMPLUS competence checks in Grades 3, 4, 7 and 8, and the standardised school-leaving exam (Matura or Reifeprüfung)",
    },
    context:
      "Schools teach in German. The school year starts in September and has two semesters. Use Austrian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "belgium",
    region: "europe",
    release: "s3-c",
    country: "BE",
    place: "Belgium",
    name: "Belgium: community curricula (Flemish, French and German-speaking)",
    promptLabel: "Belgian Curriculum (community goals)",
    versions: [
      {
        label:
          "Each community sets its own goals: in the Flemish Community new minimum goals for Dutch, mathematics, and science and technology in kindergarten and Primary 1 to 3 from September 2026; in the French Community the common core (tronc commun) reaches Secondary 1 in 2026-27",
        inForceFrom: "2026-09-01",
      },
      {
        label:
          "Each community sets its own goals: every new Flemish minimum goal for kindergarten and primary in force from September 2027; the French Community common core continuing into Secondary 2",
        inForceFrom: "2027-09-01",
      },
    ],
    years: [...numbered("Kindergarten", 1, 3, 3), ...numbered("Primary", 1, 6, 6), ...numbered("Secondary", 1, 6, 12)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the goals set by the teacher's community: minimum goals and attainment targets (Flemish Community), the common core and its reference frameworks (French Community) or the framework plans (German-speaking Community)",
      stages: "kindergarten (3 years), primary (Primary 1 to 6) and secondary (Secondary 1 to 6, in three two-year stages)",
      exams:
        "the Flemish tests (Primary 6 from 2026, Secondary 6 from 2027) in the Flemish Community; the CEB at the end of primary, the CE1D (last held in June 2027) and the CESS in the French Community",
    },
    context:
      "Education is run by the three communities: schools teach in Dutch (Flemish Community), French (French Community) or German (German-speaking Community). Use Belgian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "bulgaria",
    region: "europe",
    release: "s3-c",
    country: "BG",
    place: "Bulgaria",
    name: "Bulgaria: state educational standards and curricula",
    promptLabel: "Bulgarian National Curriculum",
    versions: [{ label: "State educational standards and curricula under the Preschool and School Education Act", inForceFrom: "2016-08-01" }],
    years: numbered("Grade", 1, 12, 7),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the state educational standards and curricula of the Ministry of Education and Science",
      stages: "primary (Grades 1 to 4), lower secondary (Grades 5 to 7) and upper secondary (Grades 8 to 12)",
      exams: "the national external assessments in Grades 4, 7 and 10, and the state matriculation exams at the end of Grade 12",
    },
    context:
      "Schools teach in Bulgarian, with English or another foreign language from the early grades. Bulgaria adopted the euro in January 2026. Use Bulgarian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "croatia",
    region: "europe",
    release: "s3-c",
    country: "HR",
    place: "Croatia",
    name: "Croatia: national curricula (School for Life reform)",
    promptLabel: "Croatian National Curriculum",
    versions: [{ label: "Subject curricula of the School for Life reform, in every grade since 2019-20", inForceFrom: "2019-09-01" }],
    years: [...numbered("Grade", 1, 8, 7), ...numbered("Secondary", 1, 4, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national subject curricula of the Ministry of Science, Education and Youth (the School for Life reform)",
      stages: "primary school (Grades 1 to 8) and secondary school (Secondary 1 to 4, in gymnasium, vocational or art schools)",
      exams: "the State Matura at the end of secondary school, with Croatian, mathematics and a foreign language compulsory",
    },
    context:
      "Schools teach in Croatian, with a foreign language from Grade 1. Use Croatian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "cyprus",
    region: "europe",
    release: "s3-c",
    country: "CY",
    place: "Cyprus",
    name: "Cyprus: national curriculum (Ministry of Education)",
    promptLabel: "Cypriot National Curriculum",
    versions: [{ label: "National curriculum of the Ministry of Education, Sport and Youth", inForceFrom: "2026-09-01" }],
    years: [...numbered("Primary", 1, 6, 6), ...numbered("Gymnasium", 1, 3, 12), ...numbered("Lyceum", 1, 3, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum of the Ministry of Education, Sport and Youth",
      stages: "primary school (Primary 1 to 6), gymnasium (lower secondary, Gymnasium 1 to 3) and lyceum (upper secondary, Lyceum 1 to 3)",
      exams: "the Pancyprian examinations at the end of the lyceum",
    },
    context:
      "Public schools teach in Greek, with English taught as a subject; many private schools teach in English. Use Cypriot places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "czech-republic",
    region: "europe",
    release: "s3-c",
    country: "CZ",
    place: "Czech Republic",
    name: "Czech Republic: Framework Educational Programmes (RVP)",
    promptLabel: "Czech Framework Educational Programme (RVP)",
    versions: [
      { label: "Framework Educational Programme for Basic Education (RVP ZV), with the revised version voluntary from 2025-26 in Grades 1 and 6", inForceFrom: "2025-09-01" },
      { label: "Revised Framework Educational Programme for Basic Education, compulsory from 2027-28 at least in Grade 1 and in every grade by 2031-32", inForceFrom: "2027-09-01" },
    ],
    years: [...numbered("Grade", 1, 9, 6), ...numbered("Secondary", 1, 4, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Framework Educational Programmes (RVP) of the Ministry of Education, Youth and Sports, from which each school writes its own school educational programme",
      stages: "basic school (Grades 1 to 9, first stage 1 to 5 and second stage 6 to 9) and upper secondary (Secondary 1 to 4)",
      exams: "the single entrance exam for upper secondary at the end of Grade 9, and the maturita at the end of upper secondary",
    },
    context:
      "Schools teach in Czech; the revised programme makes English the first foreign language from Grade 1. Use Czech places, names and koruna amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "denmark",
    region: "europe",
    release: "s3-c",
    country: "DK",
    place: "Denmark",
    name: "Denmark: Common Objectives (Faelles Maal)",
    promptLabel: "Danish Curriculum (Common Objectives)",
    versions: [
      {
        label:
          "Common Objectives, with the knowledge and skills objectives advisory since January 2025 and the competence goals still binding; new simplified curricula planned from 2027-28",
        inForceFrom: "2025-08-01",
      },
    ],
    years: [{ label: "Grade 0", age: 6 }, ...numbered("Grade", 1, 9, 7), ...numbered("Upper Secondary", 1, 3, 16)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the Common Objectives of the Ministry of Children and Education: binding competence goals, with advisory knowledge and skills objectives",
      stages: "the folkeskole (Grade 0, the reception class, then Grades 1 to 9) and upper secondary (Upper Secondary 1 to 3)",
      exams: "the folkeskole leaving examinations at the end of Grade 9, and the upper secondary leaving exams",
    },
    context:
      "Schools teach in Danish, with English from Grade 1. The school year runs from August to June. Use Danish places, names and krone amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "estonia",
    region: "europe",
    release: "s3-c",
    country: "EE",
    place: "Estonia",
    name: "Estonia: national curricula for basic and upper secondary schools",
    promptLabel: "Estonian National Curriculum",
    versions: [
      {
        label: "National curricula for basic schools and upper secondary schools (2011, amended), with teaching in Estonian in Grades 1 to 6 under the transition to Estonian-language education by 2030",
        inForceFrom: "2026-09-01",
      },
    ],
    years: numbered("Grade", 1, 12, 7),
    defaultLanguage: "et",
    terms: {
      curriculum: "the national curricula for basic schools and upper secondary schools",
      stages: "basic school (Grades 1 to 9, in three stages) and upper secondary school (gymnasium, Grades 10 to 12)",
      exams: "the basic school final examinations at the end of Grade 9, and the state examinations at the end of upper secondary (some electronic from 2027)",
    },
    context:
      "Schools teach in Estonian; former Russian-language schools are moving to Estonian by 2030. Use Estonian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "finland",
    region: "europe",
    release: "s3-c",
    country: "FI",
    place: "Finland",
    name: "Finland: national core curriculum (EDUFI)",
    promptLabel: "Finnish National Core Curriculum",
    versions: [
      {
        label: "National core curriculum for basic education 2014 (in use from 2016) and for general upper secondary 2019; new core curricula due by the end of October 2027",
        inForceFrom: "2021-08-01",
      },
    ],
    years: [{ label: "Pre-primary", age: 6 }, ...numbered("Grade", 1, 9, 7), ...numbered("Upper Secondary", 1, 3, 16)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national core curriculum of the Finnish National Agency for Education (EDUFI), from which each municipality writes its local curriculum",
      stages: "pre-primary education (age 6), basic education (Grades 1 to 9) and general upper secondary (Upper Secondary 1 to 3)",
      exams: "no national tests in basic education; the matriculation examination at the end of general upper secondary",
    },
    context:
      "Schools teach in Finnish or Swedish. Education is compulsory until 18. Use Finnish places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "france",
    region: "europe",
    release: "s3-c",
    country: "FR",
    place: "France",
    name: "France: programmes scolaires (Éducation nationale)",
    promptLabel: "French National Curriculum (programmes scolaires)",
    versions: [
      {
        label:
          "2025 programmes for French and mathematics in cycles 1 to 3; from 2026-27 the new full cycle 1 (maternelle) programme, new French, mathematics and modern language programmes in 5e, and new mathematics programmes in seconde and première",
        inForceFrom: "2026-09-01",
      },
      {
        label: "The 2025-2028 programmes, now also in 4e (French, mathematics and modern languages) and terminale (mathematics) from 2027-28",
        inForceFrom: "2027-09-01",
      },
      { label: "The 2025-2028 programmes in every year, with 3e from 2028-29", inForceFrom: "2028-09-01" },
    ],
    years: ["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2de", "1re", "Terminale"].map((label, i) => ({ label, age: 3 + i })),
    defaultLanguage: "fr",
    terms: {
      curriculum: "the national programmes (programmes scolaires) of the Ministry of National Education",
      stages:
        "cycle 1 (école maternelle: PS, MS, GS), cycle 2 (CP, CE1, CE2), cycle 3 (CM1, CM2, 6e), cycle 4 (5e, 4e, 3e) and the lycée (2de, 1re, terminale)",
      exams: "the national assessments (évaluations nationales), the diplôme national du brevet at the end of 3e, and the baccalauréat",
    },
    context:
      "Schools teach in French. The school year runs from early September to early July. Use French places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "germany",
    region: "europe",
    release: "s3-c",
    country: "DE",
    place: "Germany",
    name: "Germany: Land curricula and KMK educational standards",
    promptLabel: "German Curriculum (Land curricula and KMK standards)",
    versions: [{ label: "Each Land's own curricula (Lehrpläne or Bildungspläne), written to the KMK national educational standards", inForceFrom: "2026-08-01" }],
    years: numbered("Grade", 1, 13, 6),
    defaultLanguage: "de",
    terms: {
      curriculum: "the curriculum of the teacher's Land (Lehrplan or Bildungsplan), written to the national educational standards of the Standing Conference of Education Ministers (KMK)",
      stages:
        "primary school (Grundschule, Grades 1 to 4, or 1 to 6 in Berlin and Brandenburg), lower secondary (Sekundarstufe I, to Grade 9 or 10) and upper secondary (Sekundarstufe II, to Grade 12 or 13)",
      exams: "the VERA comparison tests in Grades 3 and 8, the lower secondary leaving certificates, and the Abitur",
    },
    context:
      "Schools teach in German. Education is run by the 16 Länder, so curricula, school types and holidays differ by Land; if the teacher names their Land, follow it. Use German places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "greece",
    region: "europe",
    release: "s3-c",
    country: "GR",
    place: "Greece",
    name: "Greece: national curricula (Ministry of Education)",
    promptLabel: "Greek National Curriculum",
    versions: [{ label: "New curricula of the Institute of Educational Policy, introduced from 2021", inForceFrom: "2021-09-01" }],
    years: [...numbered("Primary", 1, 6, 6), ...numbered("Gymnasio", 1, 3, 12), ...numbered("Lykeio", 1, 3, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curricula of the Ministry of Education and the Institute of Educational Policy",
      stages: "primary school (Primary 1 to 6), gymnasio (lower secondary, Gymnasio 1 to 3) and lykeio (upper secondary, Lykeio 1 to 3)",
      exams: "end-of-year school exams in gymnasio and lykeio, and the Panhellenic examinations for university entry (a national baccalaureate is under discussion, not law)",
    },
    context:
      "Schools teach in Greek, with English from the early grades. Use Greek places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "hungary",
    region: "europe",
    release: "s3-c",
    country: "HU",
    place: "Hungary",
    name: "Hungary: National Core Curriculum (NAT 2020)",
    promptLabel: "Hungarian National Core Curriculum (NAT)",
    versions: [{ label: "National Core Curriculum 2020 and its framework curricula, in every grade after rolling in from 2020-21", inForceFrom: "2023-09-01" }],
    years: numbered("Grade", 1, 12, 6),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the National Core Curriculum (NAT 2020) and the framework curricula built on it",
      stages: "primary school (Grades 1 to 8, in lower and upper stages) and secondary school (to Grade 12, in gymnasium, technical or vocational schools)",
      exams: "the national competence measurements, and the school-leaving examination (erettsegi) at the end of secondary school",
    },
    context:
      "Schools teach in Hungarian. Use Hungarian places, names and forint amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "iceland",
    region: "europe",
    release: "s3-c",
    country: "IS",
    place: "Iceland",
    name: "Iceland: National Curriculum Guide",
    promptLabel: "Icelandic National Curriculum Guide",
    versions: [{ label: "National Curriculum Guide for compulsory school (2011, with subject areas from 2013)", inForceFrom: "2013-08-01" }],
    years: [...numbered("Grade", 1, 10, 6), ...numbered("Upper Secondary", 1, 3, 16)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the National Curriculum Guide of the Ministry of Education and Children",
      stages: "compulsory school (Grades 1 to 10) and upper secondary school (Upper Secondary 1 to 3)",
      exams: "the upper secondary graduation examination (studentsprof)",
    },
    context:
      "Schools teach in Icelandic, with English and Danish taught as subjects. Use Icelandic places, names and krona amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "italy",
    region: "europe",
    release: "s3-c",
    country: "IT",
    place: "Italy",
    name: "Italy: Indicazioni nazionali (Ministry of Education and Merit)",
    promptLabel: "Italian National Curriculum (Indicazioni nazionali)",
    versions: [
      {
        label:
          "New Indicazioni nazionali (DM 221 of 9 December 2025) from 2026-27 in scuola dell'infanzia and the first class of primary and lower secondary, rolling up year by year; the 2012 Indicazioni in the other classes; upper secondary on the 2010 Indicazioni for licei and the guidelines for technical and vocational schools",
        inForceFrom: "2026-09-01",
      },
    ],
    years: [...numbered("Primary", 1, 5, 6), ...numbered("Lower Secondary", 1, 3, 11), ...numbered("Upper Secondary", 1, 5, 14)],
    defaultLanguage: "it",
    terms: {
      curriculum: "the Indicazioni nazionali of the Ministry of Education and Merit",
      stages: "the first cycle (scuola primaria, Primary 1 to 5, and scuola secondaria di primo grado, Lower Secondary 1 to 3) and the second cycle (scuola secondaria di secondo grado, Upper Secondary 1 to 5)",
      exams: "the INVALSI tests (Primary 2 and 5, Lower Secondary 3, Upper Secondary 2 and 5), the state exam at the end of the first cycle and the state exam (maturità) at the end of upper secondary",
    },
    context:
      "Schools teach in Italian. The school year runs from September to June. Use Italian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "latvia",
    region: "europe",
    release: "s3-c",
    country: "LV",
    place: "Latvia",
    name: "Latvia: competence-based curriculum (Skola2030)",
    promptLabel: "Latvian National Curriculum (Skola2030)",
    versions: [{ label: "Skola2030 competence-based curriculum and standards, phased in from 2020 to 2023", inForceFrom: "2023-09-01" }],
    years: numbered("Grade", 1, 12, 7),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the state standards and Skola2030 competence-based curriculum of the Ministry of Education and Science",
      stages: "basic education (Grades 1 to 9) and general secondary education (Grades 10 to 12)",
      exams: "the centralised examinations in Latvian and mathematics at the end of Grade 9 (natural sciences added from 2026-27, the foreign language as a monitoring test), and the centralised examinations at the end of Grade 12",
    },
    context:
      "Schools teach in Latvian. Use Latvian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "lithuania",
    region: "europe",
    release: "s3-c",
    country: "LT",
    place: "Lithuania",
    name: "Lithuania: updated general curricula",
    promptLabel: "Lithuanian General Curriculum",
    versions: [{ label: "Updated competence-based general curricula, in every grade since 2024-25", inForceFrom: "2024-09-01" }],
    years: numbered("Grade", 1, 12, 7),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the updated general curricula of the Ministry of Education, Science and Sport",
      stages: "primary (Grades 1 to 4), basic (Grades 5 to 10) and secondary (Grades 11 and 12; gymnasium classes I to IV are Grades 9 to 12)",
      exams: "the national achievement tests, the PUPP basic education achievement test in Grade 10, and the matura examinations at the end of Grade 12",
    },
    context:
      "Schools teach in Lithuanian. Use Lithuanian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "netherlands",
    region: "europe",
    release: "s3-c",
    country: "NL",
    place: "Netherlands",
    name: "Netherlands: core objectives (kerndoelen)",
    promptLabel: "Dutch Curriculum (kerndoelen)",
    versions: [
      { label: "Core objectives (kerndoelen) of 2006, with new core objectives for Dutch and mathematics from 1 August 2026", inForceFrom: "2026-08-01" },
      {
        label: "New core objectives for Dutch and mathematics, and for citizenship, digital literacy and the other areas from 1 August 2027; the full new curriculum in place by 2031",
        inForceFrom: "2027-08-01",
      },
    ],
    years: [...numbered("Groep", 1, 8, 4), ...numbered("Secondary", 1, 6, 12)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the core objectives (kerndoelen) and attainment targets set by the Ministry of Education, Culture and Science",
      stages: "primary school (Groep 1 to 8) and secondary school in three tracks: VMBO (4 years), HAVO (5 years) and VWO (6 years)",
      exams: "the doorstroomtoets at the end of Groep 8, and the central final examinations at the end of VMBO, HAVO or VWO",
    },
    context:
      "Schools teach in Dutch. Children start in Groep 1 at four. Use Dutch places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "norway",
    region: "europe",
    release: "s3-c",
    country: "NO",
    place: "Norway",
    name: "Norway: Knowledge Promotion 2020 (LK20)",
    promptLabel: "Norwegian Curriculum (LK20)",
    versions: [{ label: "Knowledge Promotion 2020 (LK20) curricula, in force since 2020", inForceFrom: "2020-08-01" }],
    years: [...numbered("Grade", 1, 10, 6), ...numbered("Vg", 1, 3, 16, "")],
    alignment: { frameworks: ["no-lk20"], adapted: false },
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the LK20 curricula of the Norwegian Directorate for Education and Training (Udir)",
      stages: "primary school (Grades 1 to 7), lower secondary (Grades 8 to 10) and upper secondary (Vg1 to Vg3)",
      exams: "the national tests in Grades 5, 8 and 9, the Grade 10 exam, and upper secondary exams",
    },
    context:
      "Schools teach in Norwegian (Bokmal or Nynorsk), with English from Grade 1; LK20 stresses deep learning and three interdisciplinary topics. Use Norwegian places, names and krone amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "poland",
    region: "europe",
    release: "s3-c",
    country: "PL",
    place: "Poland",
    name: "Poland: core curriculum (podstawa programowa)",
    promptLabel: "Polish Core Curriculum (podstawa programowa)",
    versions: [
      { label: "Reforma26 Kompas Jutra core curriculum in preschool and Grades 1 and 4 of primary school from September 2026; the previous core curriculum in the other grades", inForceFrom: "2026-09-01" },
      { label: "Reforma26 core curriculum rolling up year by year in primary school, and in post-primary schools from 2027-28", inForceFrom: "2027-09-01" },
    ],
    years: [...numbered("Grade", 1, 8, 7), ...numbered("Secondary", 1, 4, 15)],
    defaultLanguage: "pl",
    terms: {
      curriculum: "the core curriculum (podstawa programowa) of the Ministry of National Education",
      stages: "primary school (szkoła podstawowa, Grades 1 to 8) and post-primary school (liceum 4 years, technikum 5 years)",
      exams: "the egzamin ósmoklasisty at the end of Grade 8, and the matura at the end of post-primary school",
    },
    context:
      "Schools teach in Polish. The school year runs from September to June. Use Polish places, names and zloty amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "portugal",
    region: "europe",
    release: "s3-c",
    country: "PT",
    place: "Portugal",
    name: "Portugal: Essential Learnings (Aprendizagens Essenciais)",
    promptLabel: "Portuguese Curriculum (Aprendizagens Essenciais)",
    versions: [{ label: "Essential Learnings (2018) and the Students' Profile at the End of Compulsory Schooling (2017)", inForceFrom: "2018-09-01" }],
    years: numbered("Grade", 1, 12, 6),
    defaultLanguage: "pt",
    terms: {
      curriculum: "the Essential Learnings (Aprendizagens Essenciais) and the Students' Profile at the End of Compulsory Schooling",
      stages: "basic education in three cycles (1st cycle, Grades 1 to 4; 2nd cycle, Grades 5 and 6; 3rd cycle, Grades 7 to 9) and secondary education (Grades 10 to 12)",
      exams: "the ModA learning monitoring tests in Grades 4 and 6, the final tests (provas finais) in Grade 9, and the exames nacionais at the end of secondary education",
    },
    context:
      "Schools teach in Portuguese. Use Portuguese places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "romania",
    region: "europe",
    release: "s3-c",
    country: "RO",
    place: "Romania",
    name: "Romania: framework plans and school curricula",
    promptLabel: "Romanian National Curriculum",
    versions: [{ label: "Framework plans and school curricula, with new framework plans for high school starting in Grade 9 from 2026-27", inForceFrom: "2026-09-01" }],
    years: [{ label: "Preparatory class", age: 6 }, ...numbered("Grade", 1, 12, 7)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the framework plans and school curricula of the Ministry of Education and Research",
      stages: "primary school (the preparatory class and Grades 1 to 4), lower secondary or gymnasium (Grades 5 to 8) and high school (Grades 9 to 12)",
      exams: "the national assessments in Grades 2, 4 and 6, the Evaluarea Nationala at the end of Grade 8, and the baccalaureate at the end of high school",
    },
    context:
      "Schools teach in Romanian. Use Romanian places, names and leu amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "serbia",
    region: "europe",
    release: "s3-c",
    country: "RS",
    place: "Serbia",
    name: "Serbia: national curricula (Ministry of Education)",
    promptLabel: "Serbian National Curriculum",
    versions: [{ label: "National curricula of the Ministry of Education", inForceFrom: "2026-09-01" }],
    years: [...numbered("Grade", 1, 8, 7), ...numbered("Secondary", 1, 4, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curricula of the Ministry of Education",
      stages: "primary school (Grades 1 to 8, in two cycles of four years) and secondary school (Secondary 1 to 4, in gymnasium or vocational schools)",
      exams: "the final exam at the end of Grade 8 (Serbian or mother tongue, mathematics and one more subject), which with school grades decides entry to secondary school",
    },
    context:
      "Schools teach in Serbian, and in some areas in minority languages. Use Serbian places, names and dinar amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "slovakia",
    region: "europe",
    release: "s3-c",
    country: "SK",
    place: "Slovakia",
    name: "Slovakia: State Educational Programme",
    promptLabel: "Slovak State Educational Programme",
    versions: [
      { label: "New State Educational Programme for primary and lower secondary education (2023), compulsory in every basic school from 2026-27, starting in Grade 1", inForceFrom: "2026-09-01" },
    ],
    years: [...numbered("Grade", 1, 9, 6), ...numbered("Secondary", 1, 4, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the State Educational Programme of the Ministry of Education, with learning outcomes set for three cycles (Grades 1 to 3, 4 and 5, 6 to 9)",
      stages: "basic school (Grades 1 to 9) and upper secondary (Secondary 1 to 4, in gymnasium or vocational schools)",
      exams: "Testovanie 9 at the end of Grade 9, and the maturita at the end of upper secondary",
    },
    context:
      "Schools teach in Slovak, and in some areas in Hungarian. Use Slovak places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "slovenia",
    region: "europe",
    release: "s3-c",
    country: "SI",
    place: "Slovenia",
    name: "Slovenia: national curricula (renewed)",
    promptLabel: "Slovenian National Curriculum",
    versions: [{ label: "Renewed curricula from 2026-27 in Grades 1, 4 and 7 (and in some subjects Grade 6), the earlier curricula in the other grades", inForceFrom: "2026-09-01" }],
    years: [...numbered("Grade", 1, 9, 6), ...numbered("Secondary", 1, 4, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curricula (subject syllabuses) approved by the Ministry of Education",
      stages: "basic school (Grades 1 to 9, in three three-year cycles) and upper secondary (Secondary 1 to 4)",
      exams: "the NPZ national assessment of knowledge in Grades 6 and 9, and the general matura at the end of gymnasium",
    },
    context:
      "Schools teach in Slovenian. Use Slovenian places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "spain",
    region: "europe",
    release: "s3-c",
    country: "ES",
    place: "Spain",
    name: "Spain: LOMLOE curriculum",
    promptLabel: "Spanish Curriculum (LOMLOE)",
    versions: [{ label: "LOMLOE national minimum teaching (Royal Decrees of 2022), completed by each autonomous community, in every stage since 2023-24", inForceFrom: "2023-09-01" }],
    years: [...numbered("Primary", 1, 6, 6), ...numbered("ESO", 1, 4, 12), ...numbered("Bachillerato", 1, 2, 16)],
    defaultLanguage: "es",
    terms: {
      curriculum: "the LOMLOE curriculum: the national minimum teaching (enseñanzas mínimas) completed by the teacher's autonomous community",
      stages: "primary education (Primary 1 to 6), compulsory secondary education (ESO 1 to 4) and the bachillerato (Bachillerato 1 and 2)",
      exams: "diagnostic assessments in Primary 4 and ESO 2, and the university entrance exam (PAU) after the bachillerato",
    },
    context:
      "Schools teach in Spanish, and in some autonomous communities also in Catalan, Basque, Galician or another co-official language; if the teacher names their community, follow it. Use Spanish places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "sweden",
    region: "europe",
    release: "s3-c",
    country: "SE",
    place: "Sweden",
    name: "Sweden: Lgr22 and Gy11 (Skolverket)",
    promptLabel: "Swedish Curriculum (Lgr22 and Gy11)",
    versions: [{ label: "Lgr22 for the compulsory school and Gy11 for upper secondary; a ten-year compulsory school with new curricula is planned from autumn 2028", inForceFrom: "2022-07-01" }],
    years: [{ label: "Preschool class", age: 6 }, ...numbered("Grade", 1, 9, 7), ...numbered("Upper Secondary", 1, 3, 16)],
    defaultLanguage: "sv",
    terms: {
      curriculum: "the curricula and syllabuses of the Swedish National Agency for Education (Skolverket): Lgr22 and Gy11",
      stages: "the preschool class, the compulsory school (Grades 1 to 9) and upper secondary school (gymnasieskolan, Upper Secondary 1 to 3)",
      exams: "the national tests in Grades 3, 6 and 9 and in some upper secondary courses; grades A to F from Grade 6",
    },
    context:
      "Schools teach in Swedish. Use Swedish places, names and krona amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "switzerland",
    region: "europe",
    release: "s3-c",
    country: "CH",
    place: "Switzerland",
    name: "Switzerland: regional curricula (Lehrplan 21, PER, Piano di studio)",
    promptLabel: "Swiss Curriculum (Lehrplan 21, PER or Piano di studio)",
    versions: [{ label: "Lehrplan 21 in the German-speaking cantons, the Plan d'études romand in the French-speaking cantons and the Piano di studio in Ticino", inForceFrom: "2026-08-01" }],
    years: [...numbered("HarmoS", 1, 11, 4), ...numbered("Upper Secondary", 1, 4, 15)],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the regional curriculum of the teacher's canton: Lehrplan 21 (German-speaking cantons), the Plan d'etudes romand (French-speaking cantons) or the Piano di studio (Ticino)",
      stages: "compulsory school in HarmoS years: kindergarten (HarmoS 1 and 2), primary (HarmoS 3 to 8) and lower secondary (HarmoS 9 to 11), then upper secondary (baccalaureate school or vocational education)",
      exams: "cantonal tests during compulsory school, and the Swiss Matura at the end of baccalaureate school",
    },
    context:
      "Education is run by the 26 cantons; schools teach in German, French, Italian or Romansh depending on the region, and if the teacher names their canton, follow it. Use Swiss places, names and franc amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
  {
    id: "ukraine",
    region: "europe",
    release: "s3-c",
    country: "UA",
    place: "Ukraine",
    name: "Ukraine: New Ukrainian School",
    promptLabel: "Ukrainian Curriculum (New Ukrainian School)",
    versions: [
      {
        label: "New Ukrainian School standards in primary (from 2018) and basic secondary (from 2022); the new profile upper secondary is piloted in 150 lyceums from 2026, with nationwide rollout in Grade 10 from 2027",
        inForceFrom: "2026-09-01",
      },
    ],
    years: numbered("Grade", 1, 11, 6),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the state standards of the New Ukrainian School, set by the Ministry of Education and Science",
      stages: "primary school (Grades 1 to 4), basic secondary (gymnasium, Grades 5 to 9) and profile secondary (lyceum, Grades 10 and 11, becoming 10 to 12)",
      exams: "the state final attestation, and the NMT (National Multisubject Test) for university entry",
    },
    context:
      "Schools teach in Ukrainian; many schools mix classroom and distance learning because of the war. Use Ukrainian places, names and hryvnia amounts where a local example helps.",
    verifiedOn: "2026-11-27",
  },
];
