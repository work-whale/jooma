import type { Curriculum, YearOption } from "./types";

/*
 * Canada: Ontario, British Columbia and Alberta, the three largest English-
 * language provincial systems. Yukon teaches BC's curriculum, and the
 * Northwest Territories finish moving to an adapted BC curriculum in 2027-28,
 * so their teachers pick British Columbia. Versions switch on 1 September.
 * Checked 2026-11-14 against Ontario, BC and Alberta ministry pages and the
 * ATA, with school board material where ministry pages would not load.
 */

const grades = (start: YearOption[]): YearOption[] => [...start, ...Array.from({ length: 12 }, (_, i) => ({ label: `Grade ${i + 1}`, age: i + 6 }))];

const CA_COMMON = {
  region: "canada" as const,
  country: "CA",
  defaultLanguage: "en-CA",
};

export const CANADA_CURRICULA: Curriculum[] = [
  {
    ...CA_COMMON,
    id: "ca-on",
    state: "Ontario",
    place: "Ontario",
    name: "The Ontario Curriculum",
    promptLabel: "The Ontario Curriculum",
    versions: [
      {
        label: "The Ontario Curriculum: Kindergarten Program (2016), Language 1 to 8 (2023), Mathematics 1 to 8 (2020), Science and Technology 1 to 8 (2022), Grade 9 mathematics (2021) and science (2022)",
        inForceFrom: "2023-09-01",
      },
      {
        label: "The Ontario Curriculum: Kindergarten Curriculum (2026), Language 1 to 8 (2023), Mathematics 1 to 8 (2020), Science and Technology 1 to 8 (2022), Grade 9 mathematics (2021) and science (2022)",
        inForceFrom: "2026-09-01",
      },
    ],
    years: grades([
      { label: "Junior Kindergarten", age: 4 },
      { label: "Senior Kindergarten", age: 5 },
    ]),
    terms: {
      curriculum: "the Ontario Curriculum (Ontario Ministry of Education)",
      stages: "Kindergarten (Junior and Senior), elementary Grades 1 to 8 (primary, junior and intermediate divisions) and secondary Grades 9 to 12",
      exams: "EQAO provincial assessments (Grades 3, 6 and 9, and the Grade 10 literacy test) and the Ontario Secondary School Diploma (OSSD)",
      send: "special education with an Individual Education Plan (IEP), identified through an IPRC",
      teacherStandards: "the Ontario College of Teachers' Standards of Practice",
      earlyYears: "the Kindergarten curriculum",
      attainment: "the four achievement levels, where level 3 is the provincial standard",
      headteacher: "principal",
    },
    context: "Use Canadian places, examples and dollar amounts where a local example helps, and include First Nations, Métis and Inuit perspectives where they fit.",
    verifiedOn: "2026-11-14",
  },
  {
    ...CA_COMMON,
    id: "ca-bc",
    state: "British Columbia",
    place: "British Columbia",
    name: "BC's Curriculum",
    promptLabel: "BC's Curriculum (British Columbia)",
    versions: [{ label: "BC's redesigned curriculum (Kindergarten to Grade 9 from 2016, Grades 10 to 12 from 2019)", inForceFrom: "2019-09-01" }],
    years: grades([{ label: "Kindergarten", age: 5 }]),
    terms: {
      curriculum: "BC's redesigned curriculum, built on content (Know), curricular competencies (Do) and big ideas (Understand), with the Core Competencies (Communication, Thinking, Personal and Social)",
      stages: "Kindergarten to Grade 9, then the Graduation Program in Grades 10 to 12",
      exams: "the provincial graduation assessments (Literacy 10, Numeracy 10 and Literacy 12) and the Dogwood Diploma",
      send: "inclusive education with an Individual Education Plan (IEP)",
      attainment: "the Provincial Proficiency Scale (Emerging, Developing, Proficient, Extending) in Kindergarten to Grade 9, and letter grades in Grades 10 to 12",
      headteacher: "principal",
    },
    context:
      "Yukon schools teach BC's curriculum with Yukon First Nations content, and the Northwest Territories are moving to an adapted version of it. Use Canadian places and dollar amounts where a local example helps, and include First Peoples perspectives where they fit.",
    verifiedOn: "2026-11-14",
  },
  {
    ...CA_COMMON,
    id: "ca-ab",
    state: "Alberta",
    place: "Alberta",
    name: "Alberta curriculum",
    promptLabel: "Alberta curriculum",
    versions: [
      { label: "Alberta's new Kindergarten to Grade 6 curriculum (social studies Grades 4 to 6 from September 2026) and programs of study for Grades 7 to 12", inForceFrom: "2026-09-01" },
      { label: "Alberta's new Kindergarten to Grade 6 curriculum, new Grades 7 to 9 mathematics, social studies, career education and financial literacy, and physical education and wellness, and programs of study for the rest", inForceFrom: "2027-09-01" },
      { label: "Alberta's new Kindergarten to Grade 9 curriculum, including Grades 7 to 9 science, and programs of study for Grades 10 to 12", inForceFrom: "2028-09-01" },
    ],
    years: grades([{ label: "Kindergarten", age: 5 }]),
    terms: {
      curriculum: "Alberta's curriculum (the new Kindergarten to Grade 6 curriculum and the programs of study for higher grades)",
      stages: "Kindergarten, elementary Grades 1 to 6, junior high Grades 7 to 9 and senior high Grades 10 to 12",
      exams: "Provincial Achievement Tests in Grades 6 and 9, and diploma exams in Grade 12 for the Alberta High School Diploma",
      send: "inclusive education with an Individualized Program Plan (IPP)",
      attainment: "working below, at, or above grade level",
      headteacher: "principal",
    },
    context: "Use Canadian places, examples and dollar amounts where a local example helps, and include First Nations, Métis and Inuit perspectives where they fit.",
    verifiedOn: "2026-11-14",
  },
];
