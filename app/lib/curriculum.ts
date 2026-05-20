// Curriculum data for the "Align to curriculum" picker in the slideshow
// generator. Used purely as AI prompt context for now — no standards lookup
// behind it. Subjects/strands are organised per curriculum so the dropdowns
// cascade: pick a country → curricula filter, pick a curriculum → subjects,
// pick a subject → strands.

export interface Country {
  id: string;
  name: string;
  /** flagcdn.com slug. UK subdivisions use the `gb-xxx` format (e.g.
   *  `gb-eng`, `gb-sct`). Standard countries use the 2-letter ISO code. */
  flagCode: string;
}

export interface Curriculum {
  id: string;
  name: string;
  countryId: string;
  subjects: Subject[];
}

export interface Subject {
  name: string;
  strands: string[];
}

export const COUNTRIES: Country[] = [
  { id: "england",          name: "England",          flagCode: "gb-eng" },
  { id: "scotland",         name: "Scotland",         flagCode: "gb-sct" },
  { id: "wales",            name: "Wales",            flagCode: "gb-wls" },
  { id: "northern-ireland", name: "Northern Ireland", flagCode: "gb-nir" },
  { id: "usa",              name: "USA",              flagCode: "us" },
  { id: "australia",        name: "Australia",        flagCode: "au" },
  { id: "canada",           name: "Canada",           flagCode: "ca" },
];

// Only England is fleshed out for now. Other countries appear in the picker
// but currently have no curricula attached — the curriculum dropdown is empty
// until we add their data. See README or future migration for expansion.
export const CURRICULA: Curriculum[] = [
  {
    id: "england-national",
    name: "National Curriculum in England",
    countryId: "england",
    subjects: [
      {
        name: "Biology",
        strands: [
          "Cell biology",
          "Coordination and control",
          "Ecosystems",
          "Evolution, inheritance and variation",
          "Health, disease and the development of medicines",
          "Photosynthesis",
          "Transport systems",
        ],
      },
      {
        name: "Chemistry",
        strands: [
          "Atomic structure and the Periodic Table",
          "Chemical analysis",
          "Chemical and allied industries",
          "Chemical changes",
          "Energy changes in chemistry",
          "Rate and extent of chemical change",
          "Structure, bonding and the properties of matter",
          "The structure of matter",
        ],
      },
      {
        name: "Citizenship",
        strands: ["Core"],
      },
      {
        name: "Computing",
        strands: ["Core"],
      },
      {
        name: "English",
        strands: ["Reading", "Writing", "Spoken English", "Grammar and vocabulary"],
      },
      {
        name: "Maths",
        strands: [
          "Algebra",
          "Geometry and measures",
          "Number",
          "Probability",
          "Ratio, proportion and rates of change",
          "Statistics",
        ],
      },
      {
        name: "PSHE",
        strands: [
          "Health Education (Secondary)",
          "Relationships and Sex Education (Secondary)",
        ],
      },
      {
        name: "Physical Education",
        strands: ["Core"],
      },
      {
        name: "Physics",
        strands: [
          "Atomic structure",
          "Earth and atmospheric science",
          "Electricity",
          "Energy",
          "Forces",
          "Forces and motion",
          "Magnetism and electromagnetism",
          "Space physics",
          "Wave motion",
        ],
      },
    ],
  },
];

export function getCurriculaForCountry(countryId: string): Curriculum[] {
  return CURRICULA.filter((c) => c.countryId === countryId);
}

export function getSubjectsForCurriculum(curriculumId: string): Subject[] {
  return CURRICULA.find((c) => c.id === curriculumId)?.subjects ?? [];
}

export function getStrandsForSubject(
  curriculumId: string,
  subjectName: string,
): string[] {
  const subjects = getSubjectsForCurriculum(curriculumId);
  return subjects.find((s) => s.name === subjectName)?.strands ?? [];
}
