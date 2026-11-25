import type { Curriculum, YearOption } from "./types";

/*
 * The Middle East: the United Arab Emirates. Checked 2026-11-25 against the
 * sources in provenance.ts. Profile only: the Ministry of Education's reuse
 * terms are closed, so there are no statements (docs/curricula-permissions.md).
 * Only the Ministry's national curriculum is an entry. Private schools follow
 * the curriculum they teach (England, US, IB, CBSE), which already exist, so
 * there are no KHDA, ADEK or SPEA entries.
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
];
