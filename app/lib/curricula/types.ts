/*
 * The shape of a school system in the curriculum registry.
 *
 * Shared by client and server: no server-only imports.
 */

/** A group of curricula switched on together (app_settings.curriculum_regions).
 *  "uk" is the five curricula Jooma has always had and is never switched off. */
export type RegionId = "uk" | "british-isles" | "ireland" | "international" | "australia-nz" | "usa" | "canada";

export interface Region {
  id: RegionId;
  /** What the admin console and the picker call it. */
  label: string;
}

/** One year or grade, as this system names it. */
export interface YearOption {
  /** What the teacher sees and what is sent as `yearGroup`: "Grade 3", "Year 4", "P5". */
  label: string;
  /** The age most pupils are at the START of this year. Lines years up across
   *  systems: England's Year 4, the US Grade 3 and Ireland's 3rd Class are all 8. */
  age: number;
}

export interface CurriculumVersion {
  /** "2014 National Curriculum", "Australian Curriculum v9.0". */
  label: string;
  /** ISO date this version became (or becomes) the one taught. */
  inForceFrom: string;
}

/**
 * The local name for each UK framework a prompt may mention. Every field is
 * optional: a system that uses the same thing (Jersey sits GCSEs) leaves it out
 * and the model keeps the UK term.
 */
export interface LocalTerms {
  /** In place of "the National Curriculum". */
  curriculum?: string;
  /** In place of Key Stages. */
  stages?: string;
  /** In place of GCSE, A level and SATs. */
  exams?: string;
  /** In place of Ofsted. */
  inspection?: string;
  /** In place of SEND, the SEND Code of Practice, EHCP and SENCO. */
  send?: string;
  /** In place of the Teachers' Standards. */
  teacherStandards?: string;
  /** In place of the EYFS. */
  earlyYears?: string;
  /** In place of the WTS, EXS and GDS attainment bands. */
  attainment?: string;
  /** In place of "headteacher". */
  headteacher?: string;
}

/** A set of statement data in app/lib/standards/data. */
export type FrameworkId = "ccss-math" | "ccss-ela" | "ngss" | "ac9";

export type SheetTab = "Countries" | "USA by state" | "Canada" | "Australia" | "Other split systems" | "International";

export interface Curriculum {
  /** Stable id, stored on the profile and sent as `curriculumId`. Never renamed. */
  id: string;
  region: RegionId;
  /** ISO 3166-1 alpha-2 (GB, US, AU), or INT for an international programme. */
  country: string;
  /** State, province or board, where the country is split. */
  state?: string;
  /** Where the teacher works, as a prompt names it: "Jersey", "Texas", "New
   *  South Wales". Left out for an international programme. */
  place?: string;
  /** The official name, as the picker shows it. */
  name: string;
  /** What forms send as `curriculum` and prompts print as "Curriculum: ...".
   *  For the UK curricula this is the exact string the dropdown has always
   *  sent, which is what keeps their prompts unchanged. */
  promptLabel: string;
  /** Oldest first. The one in force today is what prompts name. */
  versions: CurriculumVersion[];
  years: YearOption[];
  /** Spelling and output language a teacher picking this gets by default. */
  defaultLanguage: string;
  terms?: LocalTerms;
  /** A line of context the model should know, in plain words. */
  context?: string;
  /** ISO date someone opened the official source (provenance.ts) and
   *  confirmed the version and names.
   *  An entry outside the UK is never offered to teachers without it. */
  verifiedOn?: string;
  /** The published standards the "Align to curriculum" card can offer for
   *  this curriculum (app/lib/standards). `adapted` when the system teaches
   *  its own version of them, so the card says the wording may differ. */
  alignment?: { frameworks: FrameworkId[]; adapted: boolean };
  /** Other strings that have meant this curriculum in saved runs. */
  aliases?: string[];
}
