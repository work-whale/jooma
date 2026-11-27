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
 */

/** "Year 1" .. "Year 11", one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));
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
];
