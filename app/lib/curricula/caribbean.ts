import type { Curriculum, YearOption } from "./types";

/*
 * The Caribbean: Jamaica and Trinidad and Tobago. Checked 2026-11-25 against
 * the sources in provenance.ts. Profiles only: every source here is closed or
 * unclear for commercial reuse, so there are no statements
 * (docs/curricula-permissions.md). Both systems sit the Caribbean Examinations
 * Council (CXC) exams, so CSEC and CAPE appear in both.
 */

/** "Grade 1" .. "Form 5" style labels, one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));
}

export const CARIBBEAN_CURRICULA: Curriculum[] = [
  {
    id: "jamaica",
    region: "caribbean",
    country: "JM",
    place: "Jamaica",
    name: "Jamaica: National Standards Curriculum (Ministry of Education)",
    promptLabel: "Jamaican Curriculum (National Standards Curriculum)",
    versions: [{ label: "National Standards Curriculum (NSC) for Grades 1 to 9, with CXC syllabuses (CSEC and CAPE) from Grade 10", inForceFrom: "2016-09-01" }],
    years: numbered("Grade", 1, 13, 6),
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the National Standards Curriculum (NSC) of the Ministry of Education, Skills, Youth and Information, and the CXC syllabuses at upper secondary",
      stages: "primary (Grades 1 to 6), lower secondary (Grades 7 to 9), upper secondary (Grades 10 and 11) and sixth form (Grades 12 and 13)",
      exams: "the Primary Exit Profile (PEP) in Grades 4 to 6, the Caribbean Secondary Education Certificate (CSEC) at the end of Grade 11 and the Caribbean Advanced Proficiency Examination (CAPE) in Grades 12 and 13, set by the Caribbean Examinations Council (CXC)",
      inspection: "the National Education Inspectorate (NEI)",
      send: "special education support from the Ministry's Special Education Unit, with an Individual Education Plan",
      teacherStandards: "the Jamaica Teaching Council's professional standards",
      earlyYears: "the Early Childhood Curriculum for children from birth to five, overseen by the Early Childhood Commission",
      headteacher: "principal",
    },
    context:
      "The school year runs from September to July in three terms. English is the language of instruction, and many pupils speak Jamaican Patois at home. Use Jamaican places, names and Jamaican dollar amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
  {
    id: "trinidad-and-tobago",
    region: "caribbean",
    country: "TT",
    place: "Trinidad and Tobago",
    name: "Trinidad and Tobago: National Curriculum (Ministry of Education)",
    promptLabel: "Trinidad and Tobago Curriculum (Ministry of Education)",
    versions: [{ label: "Ministry of Education primary curriculum guides (2013) and the secondary curriculum, with CXC syllabuses (CSEC and CAPE) from Form 4", inForceFrom: "2013-09-01" }],
    years: [{ label: "Infants 1", age: 5 }, { label: "Infants 2", age: 6 }, ...numbered("Standard", 1, 5, 7), ...numbered("Form", 1, 5, 12), { label: "Form 6 Lower", age: 17 }, { label: "Form 6 Upper", age: 18 }],
    defaultLanguage: "en-GB",
    terms: {
      curriculum: "the national curriculum of the Ministry of Education of Trinidad and Tobago, and the CXC syllabuses at upper secondary",
      stages: "primary (Infants 1 and 2, then Standards 1 to 5), lower secondary (Forms 1 to 3), upper secondary (Forms 4 and 5) and sixth form (Form 6 Lower and Upper)",
      exams: "the Secondary Entrance Assessment (SEA) in Standard 5, the Caribbean Secondary Education Certificate (CSEC) at the end of Form 5 and the Caribbean Advanced Proficiency Examination (CAPE) in Form 6, set by the Caribbean Examinations Council (CXC)",
      inspection: "the Division of School Supervision and Management at the Ministry of Education",
      send: "special education support through the Ministry's Student Support Services Division",
      earlyYears: "the national Early Childhood Care and Education (ECCE) curriculum guide",
      headteacher: "principal",
    },
    context: "The school year runs from September to July in three terms. Use Trinidad and Tobago places, names and TT dollar amounts where a local example helps.",
    verifiedOn: "2026-11-25",
  },
];
