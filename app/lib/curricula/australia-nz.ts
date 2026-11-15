import type { Curriculum, CurriculumVersion, LocalTerms, YearOption } from "./types";

/*
 * Australia (the national curriculum and every state and territory) and New
 * Zealand. Australian school years run January to December, so versions
 * switch on 1 January. Checked 2026-11-14 against ACARA, NESA, VCAA, QCAA,
 * SCSA, the SA, Tasmanian, ACT and NT education departments, and Tāhūrangi.
 */

/** Foundation to Year 12, with the state's own name for the first year. */
const auYears = (firstYear: string): YearOption[] => [
  { label: firstYear, age: 5 },
  ...Array.from({ length: 12 }, (_, i) => ({ label: `Year ${i + 1}`, age: i + 6 })),
];

const AU_TERMS = (curriculum: string, firstYear: string, senior: string): LocalTerms => ({
  curriculum,
  stages: `${firstYear} to Year 6 (primary) and Years 7 to 10 (secondary), then Years 11 and 12 for the ${senior}`,
  exams: `NAPLAN in Years 3, 5, 7 and 9, and the ${senior} in Years 11 and 12`,
  send: "students with disability supported through reasonable adjustments under the Disability Standards for Education 2005, with individual education plans",
  teacherStandards: "the Australian Professional Standards for Teachers",
  earlyYears: "the Early Years Learning Framework (Belonging, Being and Becoming)",
  attainment: "working below, at, or above the achievement standard for the year level",
  headteacher: "principal",
});

const AU_CONTEXT = "Use Australian places, examples and dollar amounts where a local example helps, and include Aboriginal and Torres Strait Islander perspectives where they fit.";

function state(
  id: string,
  place: string,
  name: string,
  promptLabel: string,
  firstYear: string,
  senior: string,
  versions: CurriculumVersion[],
): Curriculum {
  return {
    id,
    region: "australia-nz",
    country: "AU",
    state: place,
    place,
    name,
    promptLabel,
    versions,
    years: auYears(firstYear),
    defaultLanguage: "en-AU",
    terms: AU_TERMS(name, firstYear, senior),
    context: AU_CONTEXT,
    verifiedOn: "2026-11-14",
    // NSW, Victoria, WA and SA publish their own versions built on v9.0.
    alignment: { frameworks: ["ac9"], adapted: ["au-nsw", "au-vic", "au-wa", "au-sa"].includes(id) },
  };
}

export const AUSTRALIA_NZ_CURRICULA: Curriculum[] = [
  {
    ...state(
      "au",
      "Australia",
      "Australian Curriculum",
      "Australian Curriculum (v9.0)",
      "Foundation",
      "state or territory senior secondary certificate",
      [{ label: "Australian Curriculum v9.0", inForceFrom: "2022-04-01" }],
    ),
    state: undefined,
  },
  state(
    "au-nsw",
    "New South Wales",
    "NSW Curriculum (NESA syllabuses)",
    "NSW Curriculum (NESA syllabuses)",
    "Kindergarten",
    "Higher School Certificate (HSC)",
    [
      { label: "NESA K to 10 syllabuses, with the new English and mathematics K to 10 and Science 7 to 10 syllabuses", inForceFrom: "2026-01-01" },
      { label: "NESA K to 10 syllabuses, with the new History, Geography and PDHPE 7 to 10 syllabuses also in place", inForceFrom: "2027-01-01" },
    ],
  ),
  state(
    "au-vic",
    "Victoria",
    "Victorian Curriculum F to 10 Version 2.0",
    "Victorian Curriculum F-10 (Version 2.0)",
    "Foundation",
    "Victorian Certificate of Education (VCE)",
    [
      { label: "Victorian Curriculum F to 10 Version 2.0 (being introduced alongside Version 1.0)", inForceFrom: "2025-01-01" },
      { label: "Victorian Curriculum F to 10 Version 2.0", inForceFrom: "2027-01-01" },
    ],
  ),
  state(
    "au-qld",
    "Queensland",
    "Australian Curriculum v9.0 (Queensland)",
    "Australian Curriculum v9.0 (Queensland)",
    "Prep",
    "Queensland Certificate of Education (QCE)",
    [{ label: "Australian Curriculum v9.0, staged in with all learning areas taught by the end of 2027", inForceFrom: "2024-01-01" }],
  ),
  state(
    "au-wa",
    "Western Australia",
    "Western Australian Curriculum",
    "Western Australian Curriculum (P-10)",
    "Pre-primary",
    "Western Australian Certificate of Education (WACE)",
    [
      { label: "Western Australian Curriculum (adapted from Australian Curriculum v9.0), with HASS, mathematics, science and technologies required", inForceFrom: "2026-01-01" },
      { label: "Western Australian Curriculum (adapted from Australian Curriculum v9.0), with languages and the arts also in place", inForceFrom: "2027-01-01" },
    ],
  ),
  state(
    "au-sa",
    "South Australia",
    "South Australian Curriculum",
    "South Australian Curriculum (R-10)",
    "Reception",
    "South Australian Certificate of Education (SACE)",
    [{ label: "South Australian Curriculum for public education (adapted from Australian Curriculum v9.0, phased in to 2027)", inForceFrom: "2025-01-01" }],
  ),
  state(
    "au-tas",
    "Tasmania",
    "Australian Curriculum v9.0 (Tasmania)",
    "Australian Curriculum v9.0 (Tasmania)",
    "Prep",
    "Tasmanian Certificate of Education (TCE)",
    [{ label: "Australian Curriculum v9.0", inForceFrom: "2023-01-01" }],
  ),
  state(
    "au-act",
    "the Australian Capital Territory",
    "Australian Curriculum v9.0 (ACT)",
    "Australian Curriculum v9.0 (ACT)",
    "Kindergarten",
    "ACT Senior Secondary Certificate",
    [{ label: "Australian Curriculum v9.0", inForceFrom: "2024-01-01" }],
  ),
  state(
    "au-nt",
    "the Northern Territory",
    "Australian Curriculum v9.0 (NT)",
    "Australian Curriculum v9.0 (NT)",
    "Transition",
    "Northern Territory Certificate of Education and Training (NTCET)",
    [{ label: "Australian Curriculum v9.0, rolled out in stages", inForceFrom: "2025-01-01" }],
  ),
  {
    id: "new-zealand",
    region: "australia-nz",
    country: "NZ",
    place: "New Zealand",
    name: "New Zealand Curriculum",
    promptLabel: "New Zealand Curriculum",
    versions: [
      { label: "The New Zealand Curriculum (2007)", inForceFrom: "2007-11-01" },
      { label: "Updated New Zealand Curriculum, Years 0 to 10: English and mathematics in use; science, social sciences and the other learning areas from 2027", inForceFrom: "2026-01-01" },
      { label: "Updated New Zealand Curriculum, Years 0 to 10, in all learning areas", inForceFrom: "2027-01-01" },
    ],
    years: [{ label: "Year 0", age: 5 }, ...Array.from({ length: 13 }, (_, i) => ({ label: `Year ${i + 1}`, age: i + 5 }))],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the New Zealand Curriculum (Te Marautanga o Aotearoa in Māori-medium settings)",
      stages: "primary (Years 0 to 8, including intermediate Years 7 and 8) and secondary (Years 9 to 13)",
      exams: "NCEA (the National Certificate of Educational Achievement) in Years 11 to 13",
      inspection: "the Education Review Office (ERO)",
      send: "learning support, with individual education plans (IEPs) and, for the highest needs, the Ongoing Resourcing Scheme (ORS)",
      teacherStandards: "the Teaching Council's Standards for the Teaching Profession",
      earlyYears: "Te Whāriki, the early childhood curriculum",
      attainment: "working below, at, or above the curriculum expectation for the year",
      headteacher: "principal",
    },
    context: "Use New Zealand places and dollar amounts where a local example helps, and te reo Māori words and Māori perspectives where they fit naturally.",
    verifiedOn: "2026-11-14",
  },
];
