/*
 * Where each curriculum entry came from: its row in the research workbook
 * (docs/Curricula), the official source checked, and what the check found.
 *
 * Kept apart from the registry on purpose: only scripts/curricula-status.mjs
 * and the tests read it, so none of it reaches the browser bundle. Every
 * registry id has an entry here (tests/unit/curricula.spec.ts).
 */

import type { SheetTab } from "./types";

export interface Provenance {
  /** The row this entry covers: the tab, and the text in its first column. */
  sheetRow: { tab: SheetTab; name: string };
  /** The official source the entry was checked against. */
  source: string;
  /** What the check found: differences from the sheet, dates known only to
   *  the year, anything still to confirm. */
  notes?: string;
}

export const PROVENANCE: Record<string, Provenance> = {
  "england": {
    sheetRow: { tab: "Countries", name: "England" },
    source: "https://www.gov.uk/government/collections/national-curriculum",
  },
  "england-eyfs": {
    sheetRow: { tab: "Countries", name: "England" },
    source: "https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2",
  },
  "scotland": {
    sheetRow: { tab: "Countries", name: "Scotland" },
    source: "https://education.gov.scot/curriculum-for-excellence/",
    notes: "Align to curriculum (2026-11-20): the Experiences and Outcomes (Es and Os) from the 12 area PDFs at https://education.gov.scot/curriculum-for-excellence/curriculum-for-excellence-documents/experiences-and-outcomes/ (Crown copyright, reuse under the Open Government Licence v3.0 per https://education.gov.scot/terms-of-use). Excluded: every Gaelic-medium translation, Literacy and Gaidhlig, the across-learning documents, Benchmarks. Year to level by age: Nursery to Year 1 Early, Year 2 to 4 First, Year 5 to 7 Second, Year 8 to 10 Third and fourth (S1 = Year 8); Year 11 (S4) is the senior phase and has none.",
  },
  "wales": {
    sheetRow: { tab: "Countries", name: "Wales" },
    source: "https://hwb.gov.wales/curriculum-for-wales",
  },
  "northern-ireland": {
    sheetRow: { tab: "Countries", name: "Northern Ireland" },
    source: "https://ccea.org.uk/",
    notes: "Align to curriculum (2026-11-20): the statutory requirements (minimum content) of The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007, Schedule 2, from https://www.legislation.gov.uk/nisr/2007/46/schedule/2 (latest available revised version; all content on legislation.gov.uk is available under the Open Government Licence v3.0). Not CCEA's own documents, which are CCEA copyright and are not used. Foundation Stage (Years 1 and 2), Key Stage 1 (Years 3 and 4) and Key Stage 2 (Years 5 to 7), list items of Parts 2 to 4; Key Stage 3 (Years 8 to 10) from each subject's Knowledge, Understanding and Skills bullets in Part 5 (Learning for Life and Work: each key concept's list), and Key Stage 4 (Years 11 and 12) from Part 6, which sets minimum content for Learning for Life and Work and Physical Education only. NI has its own year list (2026-11-24): Nursery (age 3), then Year 1 (P1, age 4) to Year 14 (age 17); no Reception; Year N starts at age N + 3.",
  },
  "jersey": {
    sheetRow: { tab: "Countries", name: "Jersey" },
    source: "https://www.gov.je/Education/Schools/ChildLearning/Pages/KeyStage1And2.aspx",
    notes: "gov.je confirms the curriculum is based on England's National Curriculum and the 2014 changes apply. Not yet known whether Jersey will follow England's 2028 revision.",
  },
  "guernsey": {
    sheetRow: { tab: "Countries", name: "Guernsey" },
    source: "https://www.gov.gg/KS4",
    notes: "Big Picture launched 2017 (Bailiwick Express); only the year is confirmed, September assumed. gov.gg KS4 page and school sites confirm EYFS, KS1 to KS4 and GCSEs.",
  },
  "isle-of-man": {
    sheetRow: { tab: "Countries", name: "Isle of Man" },
    source: "https://e4l.sch.im/pages/index/view/id/1/What%20is%20E4L%3F",
    notes: "gov.im blocked automated reads; confirmed via the Department's E4L site and school policies. Order dates from 2011, month assumed. A new English (literacy) curriculum was being piloted.",
  },
  "gibraltar": {
    sheetRow: { tab: "Countries", name: "Gibraltar" },
    source: "https://www.gibraltar.gov.gi/press-releases/curriculum-changes-equity-and-increased-offerings-2372021-6784",
    notes: "HM Government of Gibraltar press releases confirm GCSE and A level route and its own KS4 programme. No Ofsted or SATs is from a secondary guide (Expat Focus). Secondary education review set up April 2024; outcome not found.",
  },
  "ireland": {
    sheetRow: { tab: "Countries", name: "Ireland" },
    source: "https://www.curriculumonline.ie/",
    notes: "NCCA: Primary Curriculum Framework published March 2023, primary maths September 2023, the five redeveloped specifications launched autumn 2025 (sources differ: 22 Sept or 22 Oct) with a rollout of at least 6 years. Senior Cycle tranche 1 live September 2025, tranche 2 from September 2026 (not confirmed). Inspectorate guidance on the Continuum of Support and Student Support File (Circular 0064/2024).",
  },
  "ib-pyp": {
    sheetRow: { tab: "International", name: "IB Primary Years Programme (PYP)" },
    source: "https://www.ibo.org/programmes/primary-years-programme/",
    notes: "Ages 3 to 12 and framework model per the research sheet and IB pages. PYP schools usually keep their own grade or year names; years are offered by age. Version date is when the PYP was introduced, not checked to the month.",
  },
  "ib-myp": {
    sheetRow: { tab: "International", name: "IB Middle Years Programme (MYP)" },
    source: "https://www.ibo.org/programmes/middle-years-programme/",
    notes: "Five years, ages 11 to 16, four criteria per subject, 1 to 7 grades and optional eAssessment at the end of Year 5 confirmed from school and tutor guides; the official MYP assessment page did not load. Version date not checked to the month.",
  },
  "ib-dp": {
    sheetRow: { tab: "International", name: "IB Diploma Programme (DP)" },
    source: "https://ibo.org/programmes/diploma-programme/assessment-and-exams/understanding-ib-assessment/",
    notes: "ibo.org assessment page: grades 7 to 1, core TOK and EE worth up to 3 points, CAS required, 24 points to pass, 45 maximum. Research sheet: new History first taught Aug 2026; new Maths AA and AI and Language B first taught Aug 2027.",
  },
  "ib-cp": {
    sheetRow: { tab: "International", name: "IB Career-related Programme (CP)" },
    source: "https://www.ibo.org/programmes/career-related-programme/",
    notes: "Structure from the research sheet and IB programme page; not checked in detail. Version date not checked to the month.",
  },
  "cambridge-primary": {
    sheetRow: { tab: "International", name: "Cambridge Primary" },
    source: "https://help.cambridgeinternational.org/hc/en-gb/articles/360000055178-Which-age-group-of-learners-is-the-Cambridge-Primary-Checkpoint-for-and-when-is-the-transition-to-Cambridge-Lower-Secondary",
    notes: "Cambridge help centre: Stages 1 to 6, ages about 5 to 11, Progression Tests for Stages 3 to 6, Checkpoint at end of Stage 6 (new tests assess the final stage only). Frameworks revised for first teaching 2021; month not checked.",
  },
  "cambridge-lower-secondary": {
    sheetRow: { tab: "International", name: "Cambridge Lower Secondary" },
    source: "https://help.cambridgeinternational.org/hc/en-gb/articles/360000055018-Which-age-group-of-learners-is-the-Cambridge-Lower-Secondary-Checkpoint-for",
    notes: "Stages 7 to 9, ages about 11 to 14, Checkpoint at end of Stage 9 (Cambridge help centre and school guides). Research sheet: maths strands now match upper secondary maths.",
  },
  "cambridge-igcse": {
    sheetRow: { tab: "International", name: "Cambridge IGCSE and O Level" },
    source: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/",
    notes: "Ages 14 to 16 and rolling syllabus updates per the research sheet; revised modern foreign language syllabuses first examined 2027. Grading scale differs by syllabus, so prompts do not name one. Version date is IGCSE's introduction, not checked.",
  },
  "cambridge-a-level": {
    sheetRow: { tab: "International", name: "Cambridge International AS and A Level" },
    source: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/",
    notes: "Ages 16 to 19 per the research sheet and Cambridge pathway pages. Version date is nominal (A Level's long history), not a curriculum change date.",
  },
  "pearson-iprimary-ilowersecondary": {
    sheetRow: { tab: "International", name: "Pearson Edexcel iPrimary and iLowerSecondary" },
    source: "https://qualifications.pearson.com/en/qualifications/edexcel-international-lower-secondary-curriculum.html",
    notes: "Pearson guides: iPrimary ages 5 to 11, iLowerSecondary ages 11 to 14, part of iProgress. Subjects per the research sheet: English, maths, science, computing. Version date not checked.",
  },
  "pearson-international-gcse-al": {
    sheetRow: { tab: "International", name: "Pearson Edexcel International GCSE and International A Level" },
    source: "https://qualifications.pearson.com/content/dam/pdf/International-Primary-Curriculum/Brochure/ipils-booklet-parent-guide.pdf",
    notes: "Pearson parent guide: International GCSE (9 to 1) ages 14 to 16, IAL ages 16 to 19. Subject counts differ between Pearson editions. Version date (move to 9 to 1) not checked to the month.",
  },
  "au": {
    sheetRow: { tab: "Australia", name: "National" },
    source: "https://www.australiancurriculum.edu.au/f-10-curriculum/f-10-curriculum-overview/implementation-of-the-australian-curriculum",
    notes: "ACARA: each state and territory sets its own v9.0 timeline. v9.0 endorsed by education ministers 1 April 2022 (NT Government page). For a teacher who does not pick their state.",
  },
  "au-nsw": {
    sheetRow: { tab: "Australia", name: "New South Wales" },
    source: "https://www.nsw.gov.au/education-and-training/nesa/about/strategies-and-reforms/curriculum-reform/timeline",
    notes: "NESA timeline (marked indicative): new Science 7 to 10 (2023) taught from 2026; History, Geography and PDHPE 7 to 10 (2024) from 2027; PDHPE K to 10 (2018) withdrawn after Dec 2028. Health and Movement Science 11 to 12 replaces PDHPE 11 to 12.",
  },
  "au-vic": {
    sheetRow: { tab: "Australia", name: "Victoria" },
    source: "https://www.vcaa.vic.edu.au/curriculum/foundation-10/victorian-curriculum-f-10-version-20",
    notes: "VCAA: Version 1.0 website decommissioned 31 Dec 2026; Levels A to D (Towards Foundation) discontinued 1 Jan 2027. Department timeline (government schools): English and maths from 2025, most other areas from 2026; EAL Version 2.0 from 2027. The two sources do not line up exactly.",
  },
  "au-qld": {
    sheetRow: { tab: "Australia", name: "Queensland" },
    source: "https://education.qld.gov.au/curriculum/stages-of-schooling/australian-curriculum-implementation",
    notes: "QCAA memo and Queensland Government: all v9.0 learning areas by end of 2027. Start given as 2024 on one page and 2025 on another.",
  },
  "au-wa": {
    sheetRow: { tab: "Australia", name: "Western Australia" },
    source: "https://scsa.wa.edu.au/kto6-circulars/edition-1-february-2026/1.-teaching-and-learning/pre-primary-to-year-10-humanities-and-social-sciences,-mathematics,-science-and-technologies-curriculum-implementation-2026",
    notes: "SCSA circular Feb 2026: revised P to 10 HASS, maths, science and technologies must be implemented by all schools in 2026; languages and the arts in 2027. In WA, Kindergarten is the year before Pre-primary.",
  },
  "au-sa": {
    sheetRow: { tab: "Australia", name: "South Australia" },
    source: "https://www.education.sa.gov.au/department/media-centre/our-news/teachers-to-get-first-look-at-new-curriculum",
    notes: "SA Department and Premier releases: Reception to Year 10, 8 learning areas, phased in, complete in 2027. Start date and per-area schedule not found; 2025 assumed from the first-subjects release.",
  },
  "au-tas": {
    sheetRow: { tab: "Australia", name: "Tasmania" },
    source: "https://www.australiancurriculum.edu.au/f-10-curriculum/f-10-curriculum-overview/implementation-of-the-australian-curriculum",
    notes: "All sources agree Tasmania teaches v9.0; one gives government schools from 2023, others no date.",
  },
  "au-act": {
    sheetRow: { tab: "Australia", name: "Australian Capital Territory" },
    source: "https://www.australiancurriculum.edu.au/f-10-curriculum/f-10-curriculum-overview/implementation-of-the-australian-curriculum",
    notes: "Pearson summary: all ACT schools from Term 1 2024; ClickView: cross-sector rollout through 2024.",
  },
  "au-nt": {
    sheetRow: { tab: "Australia", name: "Northern Territory" },
    source: "https://nt.gov.au/learning/primary-and-secondary-students/nt-school-curriculum/introduction",
    notes: "NT Government page: v9.0 endorsed 1 April 2022. ClickView: staged rollout, English, maths and HPE by 2025. NTCET is based on the SACE.",
  },
  "new-zealand": {
    sheetRow: { tab: "Countries", name: "New Zealand" },
    source: "https://tahurangi.education.govt.nz/updated-curriculum-rollout",
    notes: "Tāhūrangi: updated Years 0 to 10 English and maths released 19 Oct 2025 and required from 2026; Years 0 to 8 science and social sciences and all Years 9 to 10 learning areas from 2027 (confirmed May 2026); full Years 0 to 10 curriculum due by 9 Sept 2026 (publication not confirmed). NCEA reform not checked.",
  },
  "us-al": {
    sheetRow: { tab: "USA by state", name: "Alabama" },
    source: "https://alabamaachieves.org/acad-stand",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-ak": {
    sheetRow: { tab: "USA by state", name: "Alaska" },
    source: "https://education.alaska.gov/standards",
    notes: "Sheet: Checked 13 Nov 2026. New Social Studies standards 2024.",
  },
  "us-az": {
    sheetRow: { tab: "USA by state", name: "Arizona" },
    source: "https://azed.gov/standards-practices/k-12standards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-ar": {
    sheetRow: { tab: "USA by state", name: "Arkansas" },
    source: "https://dese.ade.arkansas.gov",
    notes: "Sheet: Checked 13 Nov 2026. 2023 rewrite replaced the earlier Common Core-based standards.",
  },
  "us-ca": {
    sheetRow: { tab: "USA by state", name: "California" },
    source: "https://cde.ca.gov/be/st/ss",
    notes: "Sheet: Checked 13 Nov 2026. Standards unchanged. The 2023 Mathematics Framework guides teaching but is not the standards.",
  },
  "us-co": {
    sheetRow: { tab: "USA by state", name: "Colorado" },
    source: "https://ed.cde.state.co.us/standardsandinstruction",
    notes: "Sheet: Checked 13 Nov 2026. New science standards from 2027-28. Revised high-school maths adopted May 2026.",
  },
  "us-ct": {
    sheetRow: { tab: "USA by state", name: "Connecticut" },
    source: "https://portal.ct.gov/sde/ct-core-standards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-de": {
    sheetRow: { tab: "USA by state", name: "Delaware" },
    source: "https://education.delaware.gov",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-dc": {
    sheetRow: { tab: "USA by state", name: "District of Columbia" },
    source: "https://osse.dc.gov/service/dc-standards-learning",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-fl": {
    sheetRow: { tab: "USA by state", name: "Florida" },
    source: "https://fldoe.org",
    notes: "Sheet: Checked 13 Nov 2026. New B.E.S.T. Science standards drafted Sept/Oct 2026; State Board vote expected Dec 2026. Watch closely.",
  },
  "us-ga": {
    sheetRow: { tab: "USA by state", name: "Georgia" },
    source: "https://georgiastandards.org",
    notes: "Sheet: Checked 13 Nov 2026. Science and social studies still on GSE.",
  },
  "us-hi": {
    sheetRow: { tab: "USA by state", name: "Hawaii" },
    source: "https://hawaiipublicschools.org/academics/subject-matter-standards",
    notes: "Sheet: Checked 13 Nov 2026. Updated ELA version from 2025-26.",
  },
  "us-id": {
    sheetRow: { tab: "USA by state", name: "Idaho" },
    source: "https://sde.idaho.gov/about-us/departments/content-and-curriculum/idaho-content-standards",
    notes: "Sheet: Checked 13 Nov 2026. Maths review under way (six-year cycle).",
  },
  "us-il": {
    sheetRow: { tab: "USA by state", name: "Illinois" },
    source: "https://isbe.net/Pages/Standards-Courses.aspx",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-in": {
    sheetRow: { tab: "USA by state", name: "Indiana" },
    source: "https://in.gov/doe/students/indiana-academic-standards",
    notes: "Sheet: Checked 13 Nov 2026. New maths standards in classrooms from 2027-28.",
  },
  "us-ia": {
    sheetRow: { tab: "USA by state", name: "Iowa" },
    source: "https://educate.iowa.gov/pk-12/standards",
    notes: "Sheet: Checked 13 Nov 2026. New social studies standards Jan 2026.",
  },
  "us-ks": {
    sheetRow: { tab: "USA by state", name: "Kansas" },
    source: "https://ksde.gov",
    notes: "KSDE maths standards 2017 confirmed via a standards aggregator only; ELA 2023 per sheet.",
  },
  "us-ky": {
    sheetRow: { tab: "USA by state", name: "Kentucky" },
    source: "https://kystandards.org",
    notes: "Sheet: Checked 13 Nov 2026. Revised Reading and Writing from 2026-27. New maths tentatively 2027-28.",
  },
  "us-la": {
    sheetRow: { tab: "USA by state", name: "Louisiana" },
    source: "https://doe.louisiana.gov",
    notes: "Sheet: Checked 13 Nov 2026. Revised ELA in classrooms from 2027-28. Social studies uses the new \"Freedom Framework\".",
  },
  "us-me": {
    sheetRow: { tab: "USA by state", name: "Maine" },
    source: "https://maine.gov/doe/learning/content/standardsreview",
    notes: "Sheet: Checked 13 Nov 2026. Regular review paused while a state taskforce works; science and social studies revisions in progress.",
  },
  "us-md": {
    sheetRow: { tab: "USA by state", name: "Maryland" },
    source: "https://marylandpublicschools.org/about/pages/dcipl/index_fw.aspx",
    notes: "Sheet: Checked 13 Nov 2026. New maths from 2026-27.",
  },
  "us-ma": {
    sheetRow: { tab: "USA by state", name: "Massachusetts" },
    source: "https://doe.mass.edu/frameworks/current.html",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-mi": {
    sheetRow: { tab: "USA by state", name: "Michigan" },
    source: "https://michigan.gov/mde",
    notes: "Michigan K-12 ELA and Mathematics Standards are Common Core (adopted 2010) per michigan.gov and Michigan Public; science NGSS-based.",
  },
  "us-mn": {
    sheetRow: { tab: "USA by state", name: "Minnesota" },
    source: "https://education.mn.gov",
    notes: "Sheet: Checked 13 Nov 2026. New maths from 2027-28. New social studies from 2026-27.",
  },
  "us-ms": {
    sheetRow: { tab: "USA by state", name: "Mississippi" },
    source: "https://mdek12.org",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-mo": {
    sheetRow: { tab: "USA by state", name: "Missouri" },
    source: "https://dese.mo.gov",
    notes: "Sheet: Checked 13 Nov 2026. No change announced.",
  },
  "us-mt": {
    sheetRow: { tab: "USA by state", name: "Montana" },
    source: "https://opi.mt.gov/Educators/Teaching-Learning/K-12-Content-Standards",
    notes: "OPI: new mathematics standards in force July 2026; new ELA and literacy standards adopted 2025, in force July 2027.",
  },
  "us-ne": {
    sheetRow: { tab: "USA by state", name: "Nebraska" },
    source: "https://education.ne.gov/contentareastandards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-nv": {
    sheetRow: { tab: "USA by state", name: "Nevada" },
    source: "https://doe.nv.gov",
    notes: "NDE: NVACS ELA and maths are Common Core (2010); NVACS Science based on NGSS (2014).",
  },
  "us-nh": {
    sheetRow: { tab: "USA by state", name: "New Hampshire" },
    source: "https://education.nh.gov",
    notes: "NH College and Career Ready Standards (Common Core, 2010) and NGSS (2016), from aggregators; no 2026 NH DOE page found.",
  },
  "us-nj": {
    sheetRow: { tab: "USA by state", name: "New Jersey" },
    source: "https://nj.gov/education/standards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-nm": {
    sheetRow: { tab: "USA by state", name: "New Mexico" },
    source: "https://www.srca.nm.gov/parts/title06/06.029.0010.html",
    notes: "NMAC 6.29.10: STEM Ready! Science from 1 July 2018 (NGSS plus New Mexico standards); ELA and maths Common Core.",
  },
  "us-ny": {
    sheetRow: { tab: "USA by state", name: "New York" },
    source: "https://nysed.gov/next-generation-learning-standards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-nc": {
    sheetRow: { tab: "USA by state", name: "North Carolina" },
    source: "https://dpi.nc.gov/districts-schools/classroom-resources/academic-standards",
    notes: "Sheet: Checked 13 Nov 2026. New ELA from 2027-28. New maths from 2028-29.",
  },
  "us-nd": {
    sheetRow: { tab: "USA by state", name: "North Dakota" },
    source: "https://nd.gov/dpi/districtsschools/k-12-education-content-standards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-oh": {
    sheetRow: { tab: "USA by state", name: "Ohio" },
    source: "https://education.ohio.gov/Topics/Learning-in-Ohio",
    notes: "Sheet: Checked 13 Nov 2026. New K-8 ELA published Jul 2026: confirm the classroom start year.",
  },
  "us-ok": {
    sheetRow: { tab: "USA by state", name: "Oklahoma" },
    source: "https://oklahoma.gov/education/services/standards-learning/oklahoma-academic-standards.html",
    notes: "Sheet: Checked 13 Nov 2026. Social studies standards re-approved Mar 2026 after a court ruling.",
  },
  "us-or": {
    sheetRow: { tab: "USA by state", name: "Oregon" },
    source: "https://www.oregon.gov/ode/educator-resources/standards/ELA/Pages/ELAStandards.aspx",
    notes: "ODE: revised ELA and literacy standards adopted June 2026, taught from 2028-29; maths standards 2021; science NGSS.",
  },
  "us-pa": {
    sheetRow: { tab: "USA by state", name: "Pennsylvania" },
    source: "https://pdesas.org",
    notes: "Sheet: Checked 13 Nov 2026. ELA and maths review opening; new standards 2030 at the earliest.",
  },
  "us-ri": {
    sheetRow: { tab: "USA by state", name: "Rhode Island" },
    source: "https://ride.ri.gov",
    notes: "RIDE: Rhode Island Core Standards (2021 revision of Common Core) for ELA and maths, continued endorsement considered May 2026; science NGSS.",
  },
  "us-sc": {
    sheetRow: { tab: "USA by state", name: "South Carolina" },
    source: "https://ed.sc.gov/instruction/standards",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-sd": {
    sheetRow: { tab: "USA by state", name: "South Dakota" },
    source: "https://doe.sd.gov/contentstandards",
    notes: "Sheet: Checked 13 Nov 2026. New ELA tested from 2027; new maths from 2028.",
  },
  "us-tn": {
    sheetRow: { tab: "USA by state", name: "Tennessee" },
    source: "https://tn.gov/education/districts/academic-standards.html",
    notes: "Sheet: Checked 13 Nov 2026. Revised ELA from 2029-30. New social studies from 2027-28. Next maths review aimed at 2031-32.",
  },
  "us-tx": {
    sheetRow: { tab: "USA by state", name: "Texas" },
    source: "https://tea.texas.gov/teks",
    notes: "Sheet: Checked 13 Nov 2026. New social studies TEKS adopted 26 Jun 2026, rolling out from 2030-31 (K-5 first).",
  },
  "us-ut": {
    sheetRow: { tab: "USA by state", name: "Utah" },
    source: "https://schools.utah.gov/curr/utahcorestandards",
    notes: "USBE: new P-12 mathematics draft went to the Board in October 2026; outcome not found. ELA 2021, SEEd science.",
  },
  "us-vt": {
    sheetRow: { tab: "USA by state", name: "Vermont" },
    source: "https://education.vermont.gov",
    notes: "Vermont Framework of Standards and Learning Opportunities (Common Core and NGSS), from aggregator and NGSS lead-state pages.",
  },
  "us-va": {
    sheetRow: { tab: "USA by state", name: "Virginia" },
    source: "https://doe.virginia.gov/teaching-learning-assessment/k-12-standards-instruction",
    notes: "Sheet: Checked 13 Nov 2026. History and social science SOL (2023) fully in place 2025-26.",
  },
  "us-wa": {
    sheetRow: { tab: "USA by state", name: "Washington" },
    source: "https://ospi.k12.wa.us/student-success/resources-subject-area/mathematics/mathematics-k-12-learning-standards",
    notes: "OSPI: revised ELA and mathematics standards formally adopted 2026, required from 2027-28; science NGSS.",
  },
  "us-wv": {
    sheetRow: { tab: "USA by state", name: "West Virginia" },
    source: "https://wvde.us",
    notes: "Sheet: Checked 13 Nov 2026. Nothing new found in this check.",
  },
  "us-wi": {
    sheetRow: { tab: "USA by state", name: "Wisconsin" },
    source: "https://dpi.wi.gov/standards",
    notes: "Sheet: Checked 13 Nov 2026. High-school maths work under way in 2025-26.",
  },
  "us-wy": {
    sheetRow: { tab: "USA by state", name: "Wyoming" },
    source: "https://edu.wyoming.gov/for-district-leadership/standards",
    notes: "Sheet: Checked 13 Nov 2026. ELA review under way.",
  },
  "us-dodea": {
    sheetRow: { tab: "USA by state", name: "DoDEA (US military base schools worldwide)" },
    source: "https://www.dodea.edu/education/curriculum",
    notes: "dodea.edu: College and Career Ready Standards for Mathematics from 2015-16 and for Literacy from 2017; science standards from 2017-18 per a school site only.",
  },
  "ca-on": {
    sheetRow: { tab: "Canada", name: "Ontario" },
    source: "https://www.dcp.edu.gov.on.ca/en/",
    notes: "New Kindergarten Curriculum (2026) replaces the 2016 program from 2026-27 (school boards, CTV, Queen's). Grades 1 to 8 dates from the research sheet and a school board page. Revised History 7, 8 and 10 in 2026-27 and the financial literacy graduation requirement are from the sheet only. The ministry site did not load directly.",
  },
  "ca-bc": {
    sheetRow: { tab: "Canada", name: "British Columbia" },
    source: "https://curriculum.gov.bc.ca/curriculum/overview",
    notes: "curriculum.gov.bc.ca: Know-Do-Understand model and Core Competencies; K to 9 proficiency scale, 10 to 12 letter grades; Literacy 10, Numeracy 10, Literacy 12 and 80 credits for the Dogwood (ministry and district pages). No 2026 changes found. Covers Yukon now and NWT from 2027-28 (research sheet).",
  },
  "ca-ab": {
    sheetRow: { tab: "Canada", name: "Alberta" },
    source: "https://www.alberta.ca/curriculum-subject-areas",
    notes: "ATA: K to 6 social studies Grades 4 to 6 mandatory September 2026. Alberta: Grades 7 to 9 maths, social studies, career education and financial literacy, PE and wellness piloted 2026-27 (98 boards), mandatory September 2027. Grades 7 to 9 science mandatory September 2028 per the Western Standard only. PATs from reference knowledge.",
  },
};
