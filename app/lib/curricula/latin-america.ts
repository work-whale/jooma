import type { Curriculum, YearOption } from "./types";

/*
 * Latin America: Stage 3 batch D (checked 2026-11-28, docs/curricula-stage3-build.md
 * D.1 to D.7). Six countries behind `release: "s3-d"`, one national entry each
 * (owner): Argentina's provinces, Brazil's states and Mexico's states are named
 * in the context line, and the prompt follows the teacher's one when named.
 *
 * Languages (owner, 2026-11-28): the five Spanish-speaking countries default
 * to Jooma's Spanish, and their context asks for Latin American usage when the
 * output is Spanish (it never sets the output language itself). Brazil
 * defaults to Brazilian Portuguese.
 *
 * Profiles only: Argentina and Brazil look open (government site licences) and
 * wait for the owner; the other four are on docs/curricula-permissions.md.
 */

/** "Primaria 1" .. "Primaria 6", or "1º ano" with a suffix, one age per year. */
function numbered(prefix: string, from: number, to: number, firstAge: number, suffix = ""): YearOption[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix}${from + i}${suffix}`, age: firstAge + i }));
}

const LATAM_SPANISH = "If you write in Spanish, use Latin American Spanish as teachers here do (ustedes, not vosotros; computadora, not ordenador).";

export const LATIN_AMERICA_CURRICULA: Curriculum[] = [
  {
    id: "mexico",
    region: "latin-america",
    release: "s3-d",
    country: "MX",
    place: "Mexico",
    name: "Mexico: Plan de Estudio 2022 (Nueva Escuela Mexicana)",
    promptLabel: "Mexican Curriculum (Nueva Escuela Mexicana)",
    versions: [
      {
        label: "Plan de Estudio 2022 for basic education, in every grade since 2023-24 (SEP, 2025 edition), and the Marco Curricular Común (MCCEMS) of the Bachillerato Nacional from 2025-26",
        inForceFrom: "2025-09-01",
      },
    ],
    years: [...numbered("Preescolar ", 1, 3, 3), ...numbered("Primaria ", 1, 6, 6), ...numbered("Secundaria ", 1, 3, 12), ...numbered("Bachillerato ", 1, 3, 15)],
    defaultLanguage: "es",
    terms: {
      curriculum: "the Plan de Estudio 2022 of the Nueva Escuela Mexicana (SEP), with its campos formativos and the school's programa analítico; for the bachillerato, the MCCEMS",
      stages: "educación básica in phases: preescolar (Phase 2), primaria (Phases 3 to 5, two grades each) and secundaria (Phase 6), then the bachillerato (Bachillerato 1 to 3)",
      exams: "no national standardised test is currently set; universities set their own entrance exams, such as the EXANI-II",
    },
    context: `The SEP sets one national plan and each state's schools adapt it; if the teacher names their state, follow it. Schools teach in Spanish, and Indigenous schools also in an Indigenous language such as Nahuatl. Use Mexican places, names and peso amounts where a local example helps. ${LATAM_SPANISH}`,
    verifiedOn: "2026-11-28",
  },
  {
    id: "brazil",
    region: "latin-america",
    release: "s3-d",
    country: "BR",
    place: "Brazil",
    name: "Brazil: Base Nacional Comum Curricular (BNCC)",
    promptLabel: "Brazilian Curriculum (BNCC)",
    versions: [
      {
        label: "BNCC (2017 for early childhood and fundamental education, 2018 for secondary); the new secondary rules of Lei 14.945/2024 apply in the 1st and 2nd séries, the 3rd série from 2027",
        inForceFrom: "2026-02-01",
      },
      {
        label: "BNCC (2017 for early childhood and fundamental education, 2018 for secondary); the new secondary rules of Lei 14.945/2024 apply in all three séries",
        inForceFrom: "2027-02-01",
      },
    ],
    years: [...numbered("Pré-escola ", 1, 2, 4), ...numbered("", 1, 9, 6, "º ano"), ...numbered("", 1, 3, 15, "ª série")],
    defaultLanguage: "pt-BR",
    terms: {
      curriculum: "the Base Nacional Comum Curricular (BNCC), with its competências and habilidades, made concrete in the state or municipal curriculum",
      stages: "educação infantil (pré-escola), ensino fundamental (anos iniciais, 1º to 5º ano; anos finais, 6º to 9º ano) and ensino médio (1ª to 3ª série)",
      exams: "the SAEB in the 2º, 5º and 9º ano and the 3ª série, and the ENEM for university entry",
    },
    context:
      "Each state and municipal school network writes its own curriculum from the BNCC; if the teacher names their state, follow it. Schools teach in Portuguese. Use Brazilian places, names and real amounts where a local example helps.",
    verifiedOn: "2026-11-28",
  },
  {
    id: "argentina",
    region: "latin-america",
    release: "s3-d",
    country: "AR",
    place: "Argentina",
    name: "Argentina: Núcleos de Aprendizajes Prioritarios (NAP)",
    promptLabel: "Argentine Curriculum (NAP)",
    versions: [{ label: "Núcleos de Aprendizajes Prioritarios agreed in the Consejo Federal de Educación, made concrete in each province's diseño curricular", inForceFrom: "2026-03-01" }],
    years: [{ label: "Sala de 4", age: 4 }, { label: "Sala de 5", age: 5 }, ...numbered("Primaria ", 1, 6, 6), ...numbered("Secundaria ", 1, 6, 12)],
    defaultLanguage: "es",
    terms: {
      curriculum: "the Núcleos de Aprendizajes Prioritarios (NAP) agreed in the Consejo Federal de Educación, made concrete in the province's diseño curricular",
      stages: "nivel inicial (Sala de 4 and Sala de 5, compulsory from 4), nivel primario (Primaria 1 to 6) and nivel secundario (Secundaria 1 to 6)",
      exams: "the Aprender national assessments in Lengua and Matemática, in the 6th grade of primary and the last year of secondary",
    },
    context: `Education is run by the 24 jurisdictions. About half of them, Buenos Aires City among them, use 7 years of primary and 5 of secondary instead of 6 and 6; if the teacher names their province, follow its structure and curriculum. Schools teach in Spanish. Use Argentine places, names and peso amounts where a local example helps. ${LATAM_SPANISH}`,
    verifiedOn: "2026-11-28",
  },
  {
    id: "chile",
    region: "latin-america",
    release: "s3-d",
    country: "CL",
    place: "Chile",
    name: "Chile: Bases Curriculares (Mineduc)",
    promptLabel: "Chilean Curriculum (Bases Curriculares)",
    versions: [
      {
        label: "Bases Curriculares taught in full from 2026 (the 2020 to 2025 prioritisation has ended); updated Bases for 1º básico to 2º medio are under review by the CNED",
        inForceFrom: "2026-03-01",
      },
    ],
    years: [{ label: "NT1 (Pre-kínder)", age: 4 }, { label: "NT2 (Kínder)", age: 5 }, ...numbered("", 1, 8, 6, "º básico"), ...numbered("", 1, 4, 14, "º medio")],
    defaultLanguage: "es",
    terms: {
      curriculum: "the Bases Curriculares of the Ministerio de Educación (Mineduc), with their Objetivos de Aprendizaje",
      stages: "educación parvularia (NT1 and NT2), educación básica (1º to 8º básico) and educación media (1º to 4º medio)",
      exams: "the SIMCE tests of the Agencia de Calidad de la Educación (4º and 8º básico and 2º medio), and the PAES for university entry",
    },
    context: `Schools teach in Spanish. Use Chilean places, names and peso amounts where a local example helps. ${LATAM_SPANISH}`,
    verifiedOn: "2026-11-28",
  },
  {
    id: "colombia",
    region: "latin-america",
    release: "s3-d",
    country: "CO",
    place: "Colombia",
    name: "Colombia: Estándares Básicos de Competencias and DBA",
    promptLabel: "Colombian Curriculum (Estándares Básicos and DBA)",
    versions: [{ label: "Estándares Básicos de Competencias with the Derechos Básicos de Aprendizaje (DBA) for each grade", inForceFrom: "2016-01-01" }],
    years: [{ label: "Transición", age: 5 }, ...numbered("Grado ", 1, 11, 6)],
    defaultLanguage: "es",
    terms: {
      curriculum: "the Estándares Básicos de Competencias and the Derechos Básicos de Aprendizaje (DBA) of the Ministerio de Educación Nacional, within the school's Proyecto Educativo Institucional (PEI)",
      stages: "preescolar (Transición), básica primaria (Grados 1 to 5), básica secundaria (Grados 6 to 9) and media (Grados 10 and 11)",
      exams: "the ICFES Pruebas Saber in Grados 3, 5 and 9, and Saber 11 at the end of school, used for university entry",
    },
    context: `Schools teach in Spanish, and ethnic education schools also in an Indigenous or Creole language. Use Colombian places, names and peso amounts where a local example helps. ${LATAM_SPANISH}`,
    verifiedOn: "2026-11-28",
  },
  {
    id: "peru",
    region: "latin-america",
    release: "s3-d",
    country: "PE",
    place: "Peru",
    name: "Peru: Currículo Nacional de la Educación Básica (CNEB)",
    promptLabel: "Peruvian Curriculum (CNEB)",
    versions: [{ label: "CNEB (RM 281-2016-MINEDU), in force since 2017; a review began in 2026 with no new version dated", inForceFrom: "2017-01-01" }],
    years: [...numbered("Inicial ", 3, 5, 3, " años"), ...numbered("Primaria ", 1, 6, 6), ...numbered("Secundaria ", 1, 5, 12)],
    defaultLanguage: "es",
    terms: {
      curriculum: "the Currículo Nacional de la Educación Básica (CNEB) of the Ministerio de Educación (Minedu), with its competencias, capacidades and estándares de aprendizaje",
      stages: "educación inicial (3 to 5 años), primaria (Primaria 1 to 6) and secundaria (Secundaria 1 to 5), in cycles I to VII",
      exams: "the ENLA national assessments (Evaluación Nacional de Logros de Aprendizaje), sample-based, in some grades of primaria and secundaria",
    },
    context: `Schools teach in Spanish, and intercultural bilingual schools also in Quechua, Aymara or another native language. Use Peruvian places, names and sol amounts where a local example helps. ${LATAM_SPANISH}`,
    verifiedOn: "2026-11-28",
  },
];
