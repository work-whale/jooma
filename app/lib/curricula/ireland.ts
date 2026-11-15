import type { Curriculum } from "./types";

/*
 * Ireland: the NCCA's curriculum, from junior infants to 6th Year. Checked
 * 2026-11-14 against NCCA, gov.ie, OIDE and Inspectorate publications.
 */

export const IRELAND_CURRICULA: Curriculum[] = [
  {
    id: "ireland",
    region: "ireland",
    country: "IE",
    place: "Ireland",
    name: "Irish curriculum (NCCA)",
    promptLabel: "Irish Curriculum (NCCA)",
    versions: [
      { label: "Primary School Curriculum (1999), Junior Cycle and Leaving Certificate", inForceFrom: "1999-09-01" },
      {
        label: "Primary Curriculum Framework (2023) with the redeveloped primary specifications (introduced gradually from September 2025), Junior Cycle, and the redeveloped Senior Cycle and Leaving Certificate",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [
      { label: "Junior Infants", age: 4 },
      { label: "Senior Infants", age: 5 },
      { label: "1st Class", age: 6 },
      { label: "2nd Class", age: 7 },
      { label: "3rd Class", age: 8 },
      { label: "4th Class", age: 9 },
      { label: "5th Class", age: 10 },
      { label: "6th Class", age: 11 },
      { label: "1st Year", age: 12 },
      { label: "2nd Year", age: 13 },
      { label: "3rd Year", age: 14 },
      { label: "Transition Year", age: 15 },
      { label: "5th Year", age: 16 },
      { label: "6th Year", age: 17 },
    ],
    defaultLanguage: "en-IE",
    terms: {
      curriculum: "the Irish curriculum set by the NCCA (the Primary Curriculum Framework at primary; Junior Cycle and Senior Cycle at post-primary)",
      stages: "primary Stages 1 to 4 (junior and senior infants, 1st and 2nd class, 3rd and 4th class, 5th and 6th class), then Junior Cycle (1st to 3rd Year) and Senior Cycle (Transition Year, 5th and 6th Year)",
      exams: "Junior Cycle Classroom-Based Assessments and final examinations, and the Leaving Certificate at Higher and Ordinary level",
      inspection: "the Department of Education Inspectorate",
      send: "special educational needs support through the Continuum of Support, recorded in a Student Support File and Student Support Plan, with special education teachers and special needs assistants (SNAs)",
      earlyYears: "Aistear, the early childhood curriculum framework",
      attainment: "working below, at, or above the level expected for the class",
      headteacher: "principal",
    },
    context:
      "Irish is taught in every English-medium school, and Gaelscoileanna teach through Irish. Use Irish places, names and euro amounts where a local example helps.",
    verifiedOn: "2026-11-14",
  },
];
