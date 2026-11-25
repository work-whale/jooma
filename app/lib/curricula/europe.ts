import type { Curriculum, YearOption } from "./types";

/*
 * Europe: Malta. Checked 2026-11-25 against the sources in provenance.ts.
 * Profile only: the National Curriculum Framework is copyright of the Ministry
 * and no reuse terms were found, so there are no statements
 * (docs/curricula-permissions.md).
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
];
