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
  "south-africa": {
    sheetRow: { tab: "Countries", name: "South Africa" },
    source: "https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements(CAPS).aspx",
    notes: "Africa build (2026-11-25). Confirmed in the Step 0 check: CAPS for Grades R to 12 is in force (phased in from 2012 to 2014 by grade band, so the version is dated 2012-01-01); the DBE's \"curriculum strengthening\" of CAPS (up to 20% new content, aimed at full implementation by 2027) has no fixed date, so no second version yet; Whole School Evaluation; the National Senior Certificate at Grade 12. Reference (workbook and general knowledge, not re-opened on the official site): SACE standards, the Quality Management System, SIAS and White Paper 6 wording, the Birth to Four framework name, the seven-level scale, and the Grade R start age (5 because the year starts in January, so it lines up with England's Year 1, not Reception). Licence: closed. The DBE's Creative Commons notice allows non-commercial reuse only; permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "kenya": {
    sheetRow: { tab: "Countries", name: "Kenya" },
    source: "https://kicd.ac.ke/",
    notes: "Africa build (2026-11-25). Confirmed in the Step 0 check: Competency-Based Education from PP1, with Senior School (Grade 10) from January 2026 and Grades 11 and 12 in 2027 and 2028; KPSEA in Grade 6 and KJSEA in Grade 9; KCSE continues only for the last 8-4-4 cohorts. Confirmed 2026-11-25: the KJSEA eight-level scale (EE1 to BE2), from KNEC as reported in December 2025. Reference (workbook and general knowledge, not re-opened on the official site): EARC, IEP and TPAD wording, the Directorate of Quality Assurance and Standards, the three-term year. Licence: closed (KICD documents are all rights reserved); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "nigeria": {
    sheetRow: { tab: "Countries", name: "Nigeria" },
    source: "https://nerdc.gov.ng/content_manager/cd.html",
    notes: "Africa build (2026-11-25). Confirmed in the Step 0 check: the revised Basic and Senior Secondary curriculum from 2025-26 in Primary 1, Primary 4, JSS 1 and SS 1, rolling up year by year to 2027-28 (the one version's label says so); BECE at JSS 3 and WASSCE and NECO SSCE at SS 3. Reference (workbook and general knowledge, not re-opened on the official site): the Federal Education Quality Assurance Service name, the National Policy on Special Needs Education, the TRCN standards, ECCDE. No attainment scale: none was confirmed. Licence: closed (NERDC reserves all rights); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "ghana": {
    sheetRow: { tab: "Countries", name: "Ghana" },
    source: "https://nacca.gov.gh/",
    notes: "Africa build (2026-11-25). The workbook row was never checked against an official source. Fact check 2026-11-25: the Common Core Programme is taught in B7 to B9, JHS 1 to 3 (it was designed for B7 to B10 but put in place for JHS only; GES training reports and the September 2020 B7 to B9 subject documents); NaSIA inspects; the National Teaching Council sets the National Teachers' Standards (ntc.gov.gh, 2017 standards). Still Reference (general knowledge and the Step 0 notes): the Standards-Based Curriculum for KG to B6, the new Senior High School curriculum from 2024-25, BECE and WASSCE, the Inclusive Education Policy. Confirmed in Step 0 only that NaCCA owns the curriculum text. No attainment scale: the SBC proficiency labels could not be confirmed. Licence: closed (NaCCA PDFs are all rights reserved and the Ministry says no one may commercialise the curriculum); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "uganda": {
    sheetRow: { tab: "Countries", name: "Uganda" },
    source: "https://ncdc.go.ug/",
    notes: "Africa build (2026-11-25). Confirmed 2026-11-25: the UCE is 20% school-based assessment and 80% examination; the Directorate of Education Standards inspects. Confirmed in the Step 0 check: a revised primary curriculum is planned from 2028 starting P1 to P3 if approved (no version added until it is). Reference (workbook and general knowledge, not re-opened on the official site): the competency-based Lower Secondary Curriculum from 2020, the aligned A-level curriculum, the UNEB exams, the Learning Framework for Early Childhood Development, the term dates. No teacher standards or attainment scale: none was confirmed. Licence: unclear (no reuse statement found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "india-cbse": {
    sheetRow: { tab: "Countries", name: "India" },
    source: "https://cbseacademic.nic.in/",
    notes: "Asia build (2026-11-25). Confirmed in the Step 0 check: NCF-SE 2023 and the CBSE 2026-27 changes (new NCERT textbooks in Class 9, a three-language rule from Class 6), from the workbook row checked 13 Nov; the 2025-26 version is the one before it. Reference (workbook and general knowledge, not re-opened on the official site): the Affiliation Bye-Laws wording, the CWSN wording, the 50 hours of CPD a year, the A1 to E scale, NCF-FS 2022, and the stage names. Licence: closed. NCERT prohibits republishing and use in digital content packages or software, and no CBSE policy was found; permission request to CBSE (and NCERT for the NCF text) on docs/curricula-permissions.md. Profile only, no statements. On the Other split systems tab, the CBSE and NCERT rows are covered by this entry; CISCE, State boards and NIOS are out of scope for now.",
  },
  "pakistan": {
    sheetRow: { tab: "Countries", name: "Pakistan" },
    source: "https://ncc.gov.pk/",
    notes: "Asia build (2026-11-25). Confirmed in the Step 0 check: the New National Curriculum of Pakistan 2026 for early childhood to Grade 5 from 2027-28, with Punjab starting on 1 April 2027 (the second version's label says the provinces set their own start). Reference (workbook and general knowledge, not re-opened on the official site): the starting ages (ECE 5, Grade 1 6), the inspection wording, the SEN wording, the National Professional Standards for Teachers, the SSC and HSSC boards, the April start. No attainment scale: none was confirmed. Licence: unclear (no reuse statement found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "philippines": {
    sheetRow: { tab: "Countries", name: "Philippines" },
    source: "https://www.deped.gov.ph/",
    notes: "Asia build (2026-11-25). Confirmed 2026-11-25: Key Stage 1 is Kindergarten to Grade 3 and Key Stage 2 is Grades 4 to 6 (DepEd MATATAG FAQ). Confirmed in the Step 0 check: MATATAG covers Kindergarten to Grade 10 now (the last phase, Grades 6, 9 and 10, started in 2026-27) and the Strengthened Senior High School curriculum starts in Grade 11 in 2026-27 and Grade 12 in 2027-28. Reference (workbook and general knowledge, not re-opened on the official site): the National Achievement Test, School-Based Management assessment, RA 11650 wording, the PPST, the grading descriptors, the June to April year. Licence: closed until DepEd approves. RA 8293 s.176 leaves no copyright in government works but needs the agency's prior approval to exploit one for profit; permission request on docs/curricula-permissions.md (likely the easiest yes). Profile only, no statements.",
  },
  "malaysia": {
    sheetRow: { tab: "Countries", name: "Malaysia" },
    source: "https://www.moe.gov.my/",
    notes: "Asia build (2026-11-25). Confirmed in the Step 0 check: the KP2027 rollout (Year 1 and Form 1 from 2027, rolling up year by year, preschool in 2026). Confirmed 2026-11-25: the school year returned to a January start in 2026 (KPM calendar, reported 28 Oct 2025). Reference (workbook and general knowledge, not re-opened on the official site): the Jemaah Nazir (JNJK) inspectorate, PPKI and the Inclusive Education Programme, Standard Guru Malaysia, the TP1 to TP6 mastery levels, KSPK, SPM and STPM, the abolition of UPSR and PT3. Licence: unclear (no reuse statement found for the DSKP documents); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "singapore": {
    sheetRow: { tab: "Countries", name: "Singapore" },
    source: "https://www.moe.gov.sg/",
    notes: "Asia build (2026-11-25). Confirmed in the Step 0 check: the Singapore-Cambridge Secondary Education Certificate (SEC) replaces the O-Level and N-Level from 2027, with 2026 the last O-Level and N-Level year (SEAB), so the second version starts on 2027-01-01. The workbook row was never checked against an official source. Fact check 2026-11-25: Full Subject-Based Banding with G1, G2 and G3 and the first SEC sitting in 2027 (moe.gov.sg Full SBB pages, SEAB); the School Excellence Model with MOE validation about once every six years (MOE, TIMSS encyclopedia); the Teacher Growth Model (Academy of Singapore Teachers); mainstream SEN support now comes from SEN Officers, previously Allied Educators (Learning and Behavioural Support) (MOE parliamentary reply, 9 May 2023), so the prompt was changed. Still Reference (general knowledge): the PSLE Achievement Levels, SPED schools, the NEL Framework, the Mother Tongue arrangement, and whether Secondary 5 stays under Full SBB (not confirmed; the year is kept, as it does no harm). Secondary 5 and JC 1 share age 16 (two routes after Secondary 4). Licence: closed. The MOE site reserves all rights and its own licences are for non-commercial educational use only; permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "hong-kong": {
    sheetRow: { tab: "Countries", name: "Hong Kong" },
    source: "https://www.edb.gov.hk/",
    notes: "Asia build (2026-11-25). Confirmed in the Step 0 check: Primary Science and Primary Humanities replace General Studies from 2025-26 at P1 and P4 and in all primary years by 2027-28 (EDB circular). The workbook row was never checked against an official source. Fact check 2026-11-25: the TSA runs at P3 and S3 (EDB Circular Memorandum 57/2025, HKEAA), with P6 voluntary in 2026; the prompt's general wording stays right. Still Reference (general knowledge): the four key stages, the HKDSE, the School Development and Accountability framework and External School Review, the Whole School Approach and the SENCO, T-standard+, the Kindergarten Education Curriculum Guide (2017), Citizenship and Social Development replacing Liberal Studies in 2021. Key Stage and SENCO are real terms in Hong Kong, so they appear in its prompt on purpose. No attainment scale: none was confirmed. Licence: closed. The EDB allows download only for personal or non-commercial internal use; permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "jamaica": {
    sheetRow: { tab: "Countries", name: "Jamaica" },
    source: "https://moey.gov.jm/",
    notes: "Caribbean build (2026-11-25). Confirmed in the Step 0 check: the National Standards Curriculum was modified for 2025-26 (Grades 1 to 9) after Hurricane Melissa (Bulletin 141); that was for one year only, so it is a note here and not a version. The workbook row was never checked against an official source. Fact check 2026-11-25: the Primary Exit Profile is still sat in Grades 4 to 6, with literacy and numeracy assessments added to Grade 6 from 2026 (JIS, June 2026); the National Education Inspectorate still inspects schools (2026 reports). Still Reference (workbook and general knowledge, not re-opened on the official site): the NSC and its Grade 1 to 9 span, CSEC and CAPE from the Caribbean Examinations Council, the National Education Inspectorate, the Special Education Unit, the Jamaica Teaching Council standards, the Early Childhood Commission, the September to July year. No attainment scale: none was confirmed. CSEC and CAPE are shared with Trinidad and Tobago. Licence: closed (the Ministry site says All Rights Reserved and no NSC reuse terms were found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "trinidad-and-tobago": {
    sheetRow: { tab: "Countries", name: "Trinidad and Tobago" },
    source: "https://www.moe.gov.tt/",
    notes: "Caribbean build (2026-11-25). The workbook row was never checked against an official source. Fact check 2026-11-25: the Division of School Supervision and Management (DSSM) and the Student Support Services Division (SSSD) are both on moe.gov.tt; the year is three terms from September to July (Ministry notice, August 2025: 14, 12 and 13 weeks); no primary curriculum newer than the 2013 guides was found (a revised primary assessment framework is planned in the Education Policy 2023 to 2027). Still Reference (workbook and general knowledge): the Infants, Standards and Forms year names, the Secondary Entrance Assessment in Standard 5, CSEC and CAPE from the Caribbean Examinations Council (shared with Jamaica), the ECCE curriculum guide. No teacher standards or attainment scale: none was confirmed. Licence: unclear (no reuse statement found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "malta": {
    sheetRow: { tab: "Countries", name: "Malta" },
    source: "https://education.gov.mt/",
    notes: "Europe build (2026-11-25). The workbook row was never checked against an official source. Fact check 2026-11-25: two facts fixed. The Year 6 Benchmark ended after 2023 and Years 4 to 6 now sit national annual examinations, the Year 6 one called the End-of-Primary Examination (Eurydice news and assessment pages); external reviews are run by the Directorate for Quality and Standards in Education (DQSE) under the Education Act (Cap. 605), against the National Quality Standards updated in 2023, so the Quality Assurance Department wording was dropped. Also confirmed: middle school is Years 7 and 8 and secondary school Years 9 to 11 (Eurydice); MATSEC sets the SEC (University of Malta MATSEC key dates 2026-27). Still Reference (workbook and general knowledge): the National Curriculum Framework (2012) and the Learning Outcomes Framework (from 2018), the Early Years and Junior Years cycles, LSEs, INCOs and IEPs, the late September to June year. A review of the NCF is called for in the 2024 to 2030 strategy with no date, so there is one version. MATSEC and Singapore's Secondary Education Certificate share a name, so tell them apart by MATSEC. No teacher standards or attainment scale: none was confirmed. Licence: unclear (the NCF is copyright of the Ministry and no reuse terms were found for it or the Learning Outcomes Framework); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "uae-moe": {
    sheetRow: { tab: "Countries", name: "United Arab Emirates" },
    source: "https://www.moe.gov.ae/",
    notes: "Middle East build (2026-11-25). Confirmed: the EmSAT was cancelled for Grade 12 (WAM, November 2024), so the exams line says it is no longer required; Artificial Intelligence became compulsory in 2025-26 and merges with Design, Innovation and Computer Science into one Artificial Intelligence and Technology subject from 2026-27 (workbook, checked 13 November). Reference (general knowledge, not re-opened on the official site): the inspection and evaluation wording, inclusive education for students of determination with an Individual Education Plan, the UAE Teacher Licensing System, the Kindergarten curriculum (KG1 and KG2), the Cycle 1 to 3 stages and the General and Advanced streams, Arabic taught with English from Kindergarten, Arabic, Islamic Education and Moral, Social and Cultural Studies compulsory, the late August to early July year. Only the Ministry of Education curriculum is an entry (owner decision): private-school teachers pick the curriculum their school follows (England, US, IB or CBSE), so there are no KHDA, ADEK or SPEA entries. No attainment scale: none was confirmed. Licence: closed (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "saudi-arabia": {
    sheetRow: { tab: "Countries", name: "Saudi Arabia" },
    source: "https://www.moe.gov.sa/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: two semesters from 2025-26 for four years (Gulf News); 50 AI units and 22 updated subjects in 2026-27; NAFS in Grades 3, 6 and 9 set by ETEC (ETEC school guide 2026); ETEC school evaluation and performance cards (ETEC); the Secondary Tracks System and its five tracks, Qudurat and Tahsili; state-school English uses McGraw-Hill's Super Goal and Mega Goal books, so American English is the default. Reference (secondary sites): KG1 to KG3 at ages 3 to 5, Primary 1 to 6, Intermediate 7 to 9, the late August start. The version date is the start of 2026-27 rounded to the first of the month. No SEN or teacher standards line: none was confirmed. Licence: closed (the Ministry portal's terms say its materials are for educational, not-for-profit use); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "qatar": {
    sheetRow: { tab: "Countries", name: "Qatar" },
    source: "https://www.edu.gov.qa/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: Primary 1 to 6, Preparatory 7 to 9, Secondary 10 to 12 (Hukoomi, the government portal); AI, data science and financial literacy added and one unified Grade 10 science for 2026-27; private schools teach Arabic, Islamic Studies and Qatar History to the national standards (Qatar Tribune). Reference: KG1 and KG2, the Grade 12 Secondary School Certificate examinations. A new General Framework for the National Curriculum is being written, with no date. No inspection or SEN line: none was confirmed. Licence: unclear (no reuse terms found; Law No. 7 of 2002 allows teaching use only without commercial gain); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "kuwait": {
    sheetRow: { tab: "Countries", name: "Kuwait" },
    source: "https://www.moe.edu.kw/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: the new competency-based curriculum for Grades 1 to 9 from 2025-26 (Kuwait Times, Times Kuwait); Kindergarten, Primary 1 to 5, Intermediate 6 to 9, Secondary 10 to 12; the 2026-27 calendar (mid-September start, first-term and end-of-year exams, Grade 12 finals). Reference: KG1 and KG2 at 4 and 5. No inspection or SEN line: none was confirmed. Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "oman": {
    sheetRow: { tab: "Countries", name: "Oman" },
    source: "https://home.moe.gov.om/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: Cambridge-based mathematics and science in Grades 1 to 12 (TIMSS 2023 encyclopedia); Basic Education Cycle 1 (1 to 4), Cycle 2 (5 to 10), Post-Basic (11 and 12); separate schools for boys and girls from Cycle 2; the General Education Diploma with external Grade 12 exams each semester; the Ministries of Education and Higher Education merged on 12 January 2026 (Royal Decree 14/2026), still called the Ministry of Education. Reference: KG1 and KG2 at 4 and 5. The version date is the start of 2026-27 rounded to the first of the month. No inspection or SEN line: none was confirmed. Licence: unclear (no reuse terms found), and the Cambridge maths and science text belongs to Cambridge University Press and Assessment, not the Ministry; permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "bahrain": {
    sheetRow: { tab: "Countries", name: "Bahrain" },
    source: "https://www.moe.gov.bh/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: BQA National Examinations in Grade 9 (Arabic, English, mathematics, science; government schools) and Grade 12 (Arabic, English, mathematical skills; compulsory in government schools, optional in private) (BQA FAQ and schedule); BQA school reviews (BQA annual report 2025). Reference: Primary 1 to 6, Intermediate 7 to 9, Secondary 10 to 12; kindergartens are private, so the year list starts at Grade 1. No SEN line: none was confirmed. Licence: unclear (no reuse terms found for the curriculum); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "jordan": {
    sheetRow: { tab: "Countries", name: "Jordan" },
    source: "https://www.nccd.gov.jo/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: the two-year Tawjihi over Grades 11 and 12 from 2024-25, first graduates 2026, Grade 11 about 30% and Grade 12 about 70%; NCCD's new textbooks and the digital skills curriculum for Grades 1 to 12 from 2025-26. Reference: KG1 and KG2, Basic Education 1 to 10, academic and vocational streams. No inspection or SEN line: none was confirmed. Licence: closed (NCCD's notice says viewing its textbooks is no licence to copy, publish or exploit them commercially); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "egypt": {
    sheetRow: { tab: "Countries", name: "Egypt" },
    source: "https://moe.gov.eg/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: KG1 and KG2, Primary 1 to 6, Preparatory 1 to 3, Secondary 1 to 3 (workbook and several sources); the optional Egyptian Baccalaureate (Law 169 of 2025) from the Secondary 1 cohort of 2025-26, first exams in 2027, alongside Thanaweya Amma (Ahram, AACRAO); 99% opt-in for 2026-27 (EnterpriseAM); Egyptian-Japanese schools follow Education 2.0. Reference: the Basic Education Completion Certificate after Preparatory 3. No inspection or SEN line: none was confirmed. Licence: closed (Ministry textbooks: all rights reserved, no reproduction without prior written permission); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "israel": {
    sheetRow: { tab: "Countries", name: "Israel" },
    source: "https://pop.education.gov.il/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Confirmed: preprimary ages 3 to 6, primary Grades 1 to 6 (about a quarter of primary schools run 1 to 8), lower secondary 7 to 9, upper secondary 10 to 12, the Ministry's compulsory core curriculum and the Bagrut (TIMSS 2019 and PIRLS 2021 encyclopedias); Meitzav suspended by the minister in 2026 (Times of Israel). Reference: the separate streams (state, state-religious, Arab, Haredi). The kindergarten years are named by age, since the Hebrew names do not translate. No inspection or SEN line: none was confirmed. Licence: closed (the Ministry's terms of use: copyright of the State of Israel, no copying or redistribution without prior written agreement); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "turkey": {
    sheetRow: { tab: "Countries", name: "Turkey (Türkiye)" },
    source: "https://tymm.meb.gov.tr/",
    notes: "Stage 3 batch A (2026-11-27), docs/curricula-stage3-build.md A.1 to A.7. Under Europe, as the workbook files it, but released with batch A. Confirmed: in 2026-27 the Türkiye Century Education Model covers preschool, Grades 1 to 3, 5 to 7, the prep year and 9 to 11, while 4, 8 and 12 stay on the old programmes; LGS and YKS continue, with skill-based questions from 2028; Grade 1 entry at 69 months (MEB Eurydice). Reference: the 2027-28 start date for the all-grades version (1 September used). The Turkish stage and job names (ilkokul, ortaokul, lise, okul müdürü) are left out on purpose: in the first live run they pulled the worksheet into Turkish. No inspection or SEN line: none was confirmed. Licence: closed (MEB says copyright follows Law 5846 and permission must be asked; no open licence found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "china": {
    sheetRow: { tab: "Countries", name: "China" },
    source: "https://www.moe.gov.cn/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the compulsory education curriculum plan and standards (2022 edition, 16 subjects) from autumn 2022, with core competencies first; senior high standards (2017 edition, revised 2020); Grades 1 to 9 compulsory, then senior high. Reference: the zhongkao and gaokao, provinces choosing approved textbooks. Licence: unclear (Copyright Law Article 5 excludes administrative documents of state organs, but the standards are also sold as books); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "japan": {
    sheetRow: { tab: "Countries", name: "Japan" },
    source: "https://www.mext.go.jp/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the 2017-18 Course of Study (elementary 2020, junior high 2021, senior high 2022, workbook); the next Course of Study planned for elementary from 2030 and junior high from 2031 (several reports of the MEXT schedule); the National Assessment of Academic Ability in Elementary 6 and Junior High 3; the Common Test for University Admissions; special needs education in regular classes, resource rooms, special support classes and special needs schools; the April start. Reference: three terms in most schools; American English as the school English. Licence: open (MEXT's site follows the Government of Japan Standard Terms of Use 2.0, commercial use allowed with credit, compatible with CC BY 4.0). Statements (2026-11-28, docs/curricula-open-statements-build.md): 865 from the official Japanese text of the Course of Study (2017 elementary and junior high; 2018 senior high, compulsory first courses only) for national language, mathematics, science and English, framework jp-cos, shown in Japanese as published (owner: official text only, no translation).",
  },
  "south-korea": {
    sheetRow: { tab: "Countries", name: "South Korea" },
    source: "https://ncic.re.kr/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the 2022 Revised National Curriculum rollout (Elementary 1 to 6, Middle 1 and 2, High 1 and 2 in 2026; every grade in 2027); the high school credit system from 2025; the integrated CSAT from the 2028 admission year. Reference: the March start and two semesters (workbook), English from Elementary 3, American English. Licence: closed (NCIC marks the curriculum documents KOGL Type 2, no commercial use, also on data.go.kr); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "taiwan": {
    sheetRow: { tab: "Countries", name: "Taiwan" },
    source: "https://www.naer.edu.tw/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the Curriculum Guidelines of 12-Year Basic Education (108 curriculum) since 2019, competency-based; the CAP at the end of junior high; the GSAT each January. Reference: the elementary, junior high and senior or vocational high stages; American English. Licence: open (NAER's open data declaration, https://www.naer.edu.tw/PageDoc?fid=324: all site material free for any use including adaptation, with the source credited). Statements (2026-11-28, docs/curricula-open-statements-build.md): 724 from the official Chinese text for Mandarin and mathematics (framework tw-108-zh, shown in Chinese as published) and 997 from NAER's official English translation for English and science (framework tw-108-en); learning performances and learning content with their codes; senior high required courses only (owner: official text only, no translation).",
  },
  "vietnam": {
    sheetRow: { tab: "Countries", name: "Vietnam" },
    source: "https://moet.gov.vn/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the General Education Programme 2018 (Circular 32/2018/TT-BGDDT) in every grade; basic education Grades 1 to 9 and career-oriented education 10 to 12; one national textbook series, Connecting Knowledge with Life, from 2026-27 (VOV, VietnamNet); the national high school graduation examination. Reference: primary 1 to 5, lower secondary 6 to 9, upper secondary 10 to 12. Licence: open by statute (IP Law Article 15 puts legal and administrative documents, such as the Circular, outside copyright). Statements wait for the owner's decision. Profile only for now.",
  },
  "thailand": {
    sheetRow: { tab: "Countries", name: "Thailand" },
    source: "https://academic.obec.go.th/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the Basic Education Core Curriculum B.E. 2551 is still the national curriculum; the competency-based curriculum B.E. 2568 for Prathom 1 to 3 in schools that take it up, with a draft for Prathom 4 to 6 in 2026 (Thai PBS World, OBEC portal reports); O-NET in Prathom 6, Mathayom 3 and Mathayom 6; TCAS with TGAT, TPAT and A-Level. Reference: the Mathayom 1 to 3 and 4 to 6 split, the May start, the school director title. Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "indonesia": {
    sheetRow: { tab: "Countries", name: "Indonesia" },
    source: "https://kurikulum.kemendikdasmen.go.id/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: Kurikulum Merdeka as the national curriculum since 2024, Kurikulum 2013 allowed in some remote areas until 2026-27, and deep learning as a teaching approach, not a new curriculum (workbook, checked); the TKA in Grades 6, 9 and 12, not a graduation requirement, merged with the National Assessment from 2026 (Kompas, Tempo). Reference: SD, SMP and SMA or SMK, the phases A to F. Licence: unclear (Copyright Law 28/2014 Article 42 excludes laws and regulations; whether the BSKAP decision setting the learning outcomes counts is not settled); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "sri-lanka": {
    sheetRow: { tab: "Countries", name: "Sri Lanka" },
    source: "https://nie.lk/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: the new activity-based curriculum in Grade 1 from 2026, with the reforms for other grades postponed to 2027 (Ministry circular, Newswire); the Grade 5 Scholarship Examination, O/L and A/L. Reference: Grade 1 at age 5, the primary, junior secondary, senior secondary and collegiate stages, the January to December year. Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "nepal": {
    sheetRow: { tab: "Countries", name: "Nepal" },
    source: "https://moecdc.gov.np/",
    notes: "Stage 3 batch B (2026-11-27), docs/curricula-stage3-build.md B.1 to B.7. Confirmed: basic education Grades 1 to 8 and secondary 9 to 12; the Basic Level Examination (Grade 8), the SEE (Grade 10) and the NEB Grade 12 examinations. Reference: the National Curriculum Framework 2019 (workbook), Grade 1 at age 5, the mid-April start (the version is dated to the start of 2076 BS). Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "austria": {
    sheetRow: { tab: "Countries", name: "Austria" },
    source: "https://www.bmb.gv.at/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the new curricula for Volksschule, Mittelschule and the AHS lower level, ascending from 2023-24 and in every grade by 2026-27; new AHS upper level curricula from 2027-28 (studium.at, meinbezirk.at). Reference: iKMPLUS in Grades 3, 4, 7 and 8, the standardised Matura, the two semesters. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "belgium": {
    sheetRow: { tab: "Countries", name: "Belgium" },
    source: "https://www.enseignement.be/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. One national entry for the three communities (owner). Confirmed: Flemish new minimum goals for Dutch, mathematics, and science and technology in kindergarten and Primary 1 to 3 from September 2026, all new primary goals from September 2027 (Klasse); the Flemish tests in Primary 6 from 2026 and Secondary 6 from 2027; the French Community common core reaching S1 in 2026-27, the CE1D last held in June 2027 (RTBF, L'Avenir). Reference: the CEB and CESS, the German-speaking Community framework plans. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "bulgaria": {
    sheetRow: { tab: "Countries", name: "Bulgaria" },
    source: "https://www.mon.bg/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Reference (workbook and general knowledge, not re-opened on the official site): the standards under the Preschool and School Education Act (2016), Grade 1 at age 7, the stages, the external assessments in Grades 4, 7 and 10 and the state matriculation exams. Confirmed: Bulgaria adopted the euro on 1 January 2026. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "croatia": {
    sheetRow: { tab: "Countries", name: "Croatia" },
    source: "https://mzom.gov.hr/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the State Matura with Croatian, mathematics and a foreign language compulsory (Ministry page, UCAS); the School for Life subject curricula in every grade since 2019-20 (workbook). Reference: Grade 1 at age 7, primary Grades 1 to 8, secondary 1 to 4. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "cyprus": {
    sheetRow: { tab: "Countries", name: "Cyprus" },
    source: "https://www.moec.gov.cy/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the Pancyprian examinations in 2026 (Cyprus Mail, Ministry statements); new curricula moving away from a material-based approach (Eurydice). Reference: Primary 1 to 6, Gymnasium 1 to 3, Lyceum 1 to 3, the many English-medium private schools (workbook note). The version is dated generically. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "czech-republic": {
    sheetRow: { tab: "Countries", name: "Czech Republic" },
    source: "https://msmt.gov.cz/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the revised RVP ZV, voluntary from September 2025 in Grades 1 and 6, compulsory from 2027-28 at least in Grade 1 and in every grade from 2031-32, with English from Grade 1 (MSMT, Eurydice). Reference: the single entrance exam and the maturita, the two stages of basic school. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "denmark": {
    sheetRow: { tab: "Countries", name: "Denmark" },
    source: "https://www.uvm.dk/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: since 1 January 2025 the knowledge and skills objectives in Common Objectives are advisory, the competence goals binding (uvm.dk); new simplified curricula planned from 2027-28 (secondary report). Reference: Grade 0 at 6, the leaving examinations, the August to June year, English from Grade 1. No national tests line: the tests are being replaced and nothing was confirmed. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "estonia": {
    sheetRow: { tab: "Countries", name: "Estonia" },
    source: "https://www.hm.ee/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the transition to Estonian-language education (Grades 1 and 4 from 2024, Grades 1 to 6 in 2026-27, complete by 2030) (Ministry, ERR); some state examinations electronic from 2027. Reference: the 2011 curricula, Grade 1 at age 7, the basic school final examinations and state examinations. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "finland": {
    sheetRow: { tab: "Countries", name: "Finland" },
    source: "https://www.oph.fi/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed (workbook, checked 13 Nov 2026): the 2014 core curriculum in use, the law amended on 15 June 2026, new core curricula due by the end of October 2027 (the workbook says wait for them; the current ones stay in force until then, so the profile is built now). Reference: pre-primary at 6, Grade 1 at 7, no national tests in basic education, the matriculation examination, compulsory education to 18. Licence: probably open (EDUFI publishes the core curricula through open ePerusteet interfaces) but no licence text was confirmed. Statements wait for the owner's decision (after the Stage 3 profiles, as for Japan and Taiwan). Profile only for now.",
  },
  "france": {
    sheetRow: { tab: "Countries", name: "France" },
    source: "https://www.education.gouv.fr/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed (workbook, checked 13 Nov 2026): the 2025 French and mathematics programmes for cycles 1 to 3; cycle 1 in full from 2026-27; cycle 4 French, mathematics and modern languages in 5e 2026, 4e 2027, 3e 2028; lycee mathematics in seconde and premiere 2026-27, terminale 2027-28. Reference: the national assessments, the brevet, the baccalaureat, the school year. Licence: open (official programmes are public information reusable with source and date under the code des relations entre le public et l'administration, and education.gouv.fr content is under the Etalab Licence Ouverte 2.0, commercial use allowed). Statements wait for the owner's decision (after the Stage 3 profiles, as for Japan and Taiwan). Profile only for now.",
  },
  "germany": {
    sheetRow: { tab: "Countries", name: "Germany" },
    source: "https://www.kmk.org/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. One national entry for the 16 Laender (owner); the prompt follows the Land if the teacher names it. Confirmed: VERA comparison tests in Grades 3 and 8, built on the KMK educational standards (KMK). Reference: Grundschule 1 to 4 (1 to 6 in Berlin and Brandenburg, workbook), the Sekundarstufen, the Abitur. The version is dated generically. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "greece": {
    sheetRow: { tab: "Countries", name: "Greece" },
    source: "https://www.minedu.gov.gr/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the Panhellenic examinations in 2026 and a national dialogue on a national baccalaureate that is not law (athens-times, balkanarena). Reference: the IEP curricula from 2021, Primary 1 to 6, Gymnasio and Lykeio 1 to 3. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "hungary": {
    sheetRow: { tab: "Countries", name: "Hungary" },
    source: "https://www.oktatas.hu/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: NAT 2020 and its framework curricula introduced in Grades 1, 5 and 9 from September 2020, then year by year (TIMSS 2023 and PIRLS 2021 encyclopedias). Reference: the national competence measurements and the erettsegi. Hungarian words kept out of the terms except the exam name, written without accents. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "iceland": {
    sheetRow: { tab: "Countries", name: "Iceland" },
    source: "https://www.stjornarradid.is/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the 2011 National Curriculum Guide (subject areas 2013); the standardised tests in Grades 4, 7 and 10 were not held and the new Matsferill toolkit is still being built, so no compulsory-school test is named (Althingi report 2024-25). Reference: three-year upper secondary, the studentsprof, English and Danish as subjects. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "italy": {
    sheetRow: { tab: "Countries", name: "Italy" },
    source: "https://www.mim.gov.it/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed (workbook, checked 13 Nov 2026): the new Indicazioni nazionali (DM 221 of 9 December 2025) from 2026-27 in infanzia and the first classes of primaria and secondaria di primo grado, rolling up; the 2012 Indicazioni end in 2028-29 and 2030-31; upper secondary on the 2010 Indicazioni for licei. Reference: the INVALSI grades, the two state exams. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "latvia": {
    sheetRow: { tab: "Countries", name: "Latvia" },
    source: "https://www.izm.gov.lv/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: Skola2030 in Grades 1, 4, 7 and 10 from 2020-21 and in every grade by 2022-23 (Eurydice, OECD); Grade 9 centralised examinations in Latvian and mathematics, the foreign language a monitoring test, natural sciences added from 2026-27 (LSM). Reference: Grade 1 at 7, the Grade 12 centralised examinations. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "lithuania": {
    sheetRow: { tab: "Countries", name: "Lithuania" },
    source: "https://www.smm.lt/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the updated general curricula in Grades 1, 3, 5, 7, 9 and gymnasium III from 2023-24 and in the rest from 2024-25 (TIMSS 2023 encyclopedia, Eurydice). Reference: Grade 1 at 7, the PUPP, the national achievement tests and the matura. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "netherlands": {
    sheetRow: { tab: "Countries", name: "Netherlands" },
    source: "https://www.slo.nl/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed (workbook, checked 13 Nov 2026): new kerndoelen for Dutch and mathematics in force on 1 August 2026, citizenship, digital literacy and other areas on 1 August 2027, the full new curriculum by 2031. Reference: Groep 1 at 4, VMBO, HAVO and VWO, the doorstroomtoets and central final examinations. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "norway": {
    sheetRow: { tab: "Countries", name: "Norway" },
    source: "https://www.udir.no/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: LK20 in force since 2020; national tests in Grades 5, 8 and 9; the Grade 10 exam; the six upper secondary pathways are a proposal for 2030 to 2033, not built in (Eurydice, NordiskPost). Reference: English from Grade 1, Bokmal and Nynorsk. Licence: open (Udir's curriculum data in Grep is under the Norwegian Licence for Open Government Data, NLOD, commercial use allowed with credit to data.udir.no). Statements (2026-11-28, docs/curricula-open-statements-build.md): 592 competence aims from the LK20 curricula in force from 2026-08-01 (NOR01-08, MAT01-06, MAT08-01, MAT09-02, MAT05-04, MAT06-04, NAT01-05, ENG01-06), in Udir's English text from Grep (snapshot docs/standards/norway/grep-snapshot.json), framework no-lk20; upper secondary common core courses, vocational programme versions included (owner: official text only, no translation).",
  },
  "poland": {
    sheetRow: { tab: "Countries", name: "Poland" },
    source: "https://www.gov.pl/web/edukacja",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed (workbook, checked 13 Nov 2026): the Reforma26 Kompas Jutra core curriculum from 1 September 2026 in preschool and Grades 1 and 4, then year by year, and in post-primary schools from 2027-28. Reference: Grade 1 at 7, liceum and technikum lengths, the egzamin osmoklasisty and the matura. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "portugal": {
    sheetRow: { tab: "Countries", name: "Portugal" },
    source: "https://www.dge.mec.pt/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the ModA monitoring tests in Grades 4 and 6, built on the Essential Learnings, the provas finais in Grade 9 and the exames nacionais in 2025-26 (Despacho 14616-A/2025, IAVE). Reference: the Students' Profile (2017), the three cycles of basic education. No dated change confirmed. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "romania": {
    sheetRow: { tab: "Countries", name: "Romania" },
    source: "https://www.edu.ro/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: new high school framework plans from Grade 9 in 2026-27, extended year by year (Romania Insider, Euronews Romania). Reference: the preparatory class at 6, the national assessments in Grades 2, 4 and 6, the Evaluarea Nationala and the baccalaureate. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "serbia": {
    sheetRow: { tab: "Countries", name: "Serbia" },
    source: "https://prosveta.gov.rs/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the Grade 8 final exam (mala matura) in Serbian or mother tongue, mathematics and an elective subject, counted with school grades for secondary entry (Ministry calendar 2025-26, B92). Reference: the two cycles, Secondary 1 to 4, minority-language teaching. A state matura was not confirmed, so it is not named. The version is dated generically. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "slovakia": {
    sheetRow: { tab: "Countries", name: "Slovakia" },
    source: "https://www.minedu.sk/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the new State Educational Programme approved in 2023, compulsory in every basic school from 2026-27 starting with Grade 1, with outcomes for Grades 3, 5 and 9 (Eurydice, RSI). Reference: Testovanie 9, the maturita, teaching in Hungarian in some areas. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "slovenia": {
    sheetRow: { tab: "Countries", name: "Slovenia" },
    source: "https://www.gov.si/drzavni-organi/ministrstva/ministrstvo-za-vzgojo-in-izobrazevanje/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: renewed curricula from 2026-27 in Grades 1, 4 and 7, in some cases Grade 6 (zastarse.si, Svet24). Reference: the NPZ in Grades 6 and 9, the general matura. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "spain": {
    sheetRow: { tab: "Countries", name: "Spain" },
    source: "https://www.educacionfpydeportes.gob.es/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. One national entry; the prompt follows the autonomous community if the teacher names it (owner). Confirmed: the PAU, the LOMLOE university entrance test since June 2025 (Royal Decree 534/2024; La Moncloa, universities' PAU 2026 guides). Reference: the LOMLOE Royal Decrees of 2022 in every stage since 2023-24 (workbook), the diagnostic assessments in Primary 4 and ESO 2, the co-official languages. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "sweden": {
    sheetRow: { tab: "Countries", name: "Sweden" },
    source: "https://www.skolverket.se/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed (workbook, checked 13 Nov 2026): Lgr22 and the revised Gy11 in use; a ten-year compulsory school with new curricula and a new grading system from autumn 2028 (the workbook says wait for them; the current ones stay in force until then, so the profile is built now). Reference: the preschool class at 6, the national tests in Grades 3, 6 and 9, grades A to F. Licence: open (Skolverket's Syllabus API for curricula and syllabuses is under CC0 1.0). Statements wait for the owner's decision (after the Stage 3 profiles, as for Japan and Taiwan). Profile only for now.",
  },
  "switzerland": {
    sheetRow: { tab: "Countries", name: "Switzerland" },
    source: "https://www.edk.ch/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. One national entry for the 26 cantons (owner); the prompt follows the canton if the teacher names it. Confirmed: Lehrplan 21 in force in all 21 German-speaking cantons, covering eleven years with two years of kindergarten, and the Plan d'etudes romand in the French-speaking cantons (lehrplan21.ch, Eurydice). Reference: the Piano di studio in Ticino, kindergarten from 4, cantonal tests, the Swiss Matura. Defaults to English: no single Jooma language fits every canton. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "ukraine": {
    sheetRow: { tab: "Countries", name: "Ukraine" },
    source: "https://mon.gov.ua/",
    notes: "Stage 3 batch C (2026-11-27), docs/curricula-stage3-build.md C.1 to C.6. Confirmed: the profile upper secondary pilot in 150 lyceums from September 2026 and the nationwide start in Grade 10 from September 2027 (Ministry, ua.news); the NMT. Reference: NUS primary from 2018 and basic secondary from 2022 (workbook), the state final attestation, the move to twelve years. Licence: unclear (no reuse terms found; official texts may fall outside copyright by statute, not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "mexico": {
    sheetRow: { tab: "Countries", name: "Mexico" },
    source: "https://educacionbasica.sep.gob.mx/",
    notes: "Stage 3 batch D (2026-11-28), docs/curricula-stage3-build.md D.1 to D.7. Confirmed: the Plan de Estudio 2022 in every grade of basic education since 2023-08-28, SEP's 2025 second edition the current text; phases 2 (preescolar), 3 to 5 (primaria) and 6 (secundaria) (SEP and Mejoredu 2024-25 presentation); the Bachillerato Nacional under the MCCEMS (Acuerdo 21/08/25) from 2025-26 (DOF, SEP DGAIR); no national census test since Mejoredu was abolished in 2025 (UNESCO, April 2026). Reference: preescolar 3 years from age 3, secundaria from 12, the EXANI-II (Ceneval). Licence: unclear (no reuse terms found for the SEP plan; the copyright law's exclusion of official texts is not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "brazil": {
    sheetRow: { tab: "Countries", name: "Brazil" },
    source: "https://basenacionalcomum.mec.gov.br/",
    notes: "Stage 3 batch D (2026-11-28), docs/curricula-stage3-build.md D.1 to D.7. Confirmed: the new secondary rules of Lei 14.945/2024 start in the 1st serie in 2025, the 2nd in 2026 and the 3rd in 2027 (planalto.gov.br, state notices); the 2025 SAEB in the 2nd, 5th and 9th ano and the 3rd serie (INEP). Reference: the BNCC (2017 and 2018, CNE/CP resolutions 2/2017 and 4/2018), the nine-year fundamental from age 6 (Lei 11.274/2006), the ENEM, a school year from February. Licence: probably open, not confirmed (the gov.br portal is under CC BY-ND 3.0, which allows verbatim commercial reuse with credit; the BNCC site's own terms were not found). Statements wait for the owner's decision. Profile only for now.",
  },
  "argentina": {
    sheetRow: { tab: "Countries", name: "Argentina" },
    source: "https://www.argentina.gob.ar/educacion",
    notes: "Stage 3 batch D (2026-11-28), docs/curricula-stage3-build.md D.1 to D.7. Confirmed: the NAP are the federal common base agreed in the Consejo Federal de Educacion (educ.ar); each jurisdiction picks 6 years of primary and 6 of secondary or 7 and 5, about half each, Buenos Aires City 7 and 5 (CABA rules, 2017 national report); Aprender assesses Lengua and Matematica in the 6th grade of primary and the last year of secondary. CFE Resolution 476/24 is about initial teacher training, not the school curriculum, so it is not named. Reference: compulsory from age 4, a school year from March. Licence: probably open, not confirmed (argentina.gob.ar licenses its content under CC BY 4.0 unless stated otherwise; each NAP booklet's own notice still to be read). Statements wait for the owner's decision. Profile only for now.",
  },
  "chile": {
    sheetRow: { tab: "Countries", name: "Chile" },
    source: "https://www.curriculumnacional.cl/",
    notes: "Stage 3 batch D (2026-11-28), docs/curricula-stage3-build.md D.1 to D.7. Confirmed: the 2020 prioritisation ended in December 2025, so the full Bases Curriculares apply from 2026 (curriculumnacional.cl Cartilla N1); updated Bases for 1st basico to 2nd medio are still before the CNED (CNED 2026 documents); SIMCE 2025 in 4th and 8th basico and II medio (Mineduc). Reference: NT1 and NT2, 1st to 8th basico from age 6, 1st to 4th medio, the PAES, a school year from March. Licence: unclear (no reuse terms found for curriculumnacional.cl); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "colombia": {
    sheetRow: { tab: "Countries", name: "Colombia" },
    source: "https://www.mineducacion.gov.co/",
    notes: "Stage 3 batch D (2026-11-28), docs/curricula-stage3-build.md D.1 to D.7. Confirmed: the Estandares Basicos de Competencias by grade bands and the Derechos Basicos de Aprendizaje (Ministry, OECD review); the ICFES Pruebas Saber 3, 5, 9 and Saber 11 (ICFES). Reference: Transicion at 5 and Grados 1 to 11 under Ley 115 de 1994; the version is dated generically (calendar A schools start in January or February, calendar B in August). Licence: closed (the Ministry portal allows personal, non-commercial use with credit); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "peru": {
    sheetRow: { tab: "Countries", name: "Peru" },
    source: "https://www.minedu.gob.pe/curriculo/",
    notes: "Stage 3 batch D (2026-11-28), docs/curricula-stage3-build.md D.1 to D.7. Confirmed: the CNEB approved by RM 281-2016-MINEDU, applied from 2017-01-01 in all basic education (gob.pe); a commission to update it created in July 2026 (El Peruano), nothing dated; ENLA 2026 in 4th and 6th primaria and 2nd secundaria (El Peruano). Reference: inicial 3 to 5, primaria 1 to 6 from age 6, secundaria 1 to 5, cycles I to VII. Licence: unclear (no reuse terms found; the copyright law's exclusion of official texts is not relied on); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "ethiopia": {
    sheetRow: { tab: "Countries", name: "Ethiopia" },
    source: "https://moe.gov.et/",
    notes: "Stage 3 batch E (2026-11-28), docs/curricula-stage3-build.md, Batch E. Confirmed: the General Education Curriculum Framework (2020) sets two years of pre-primary for ages 5 and 6, primary Grades 1 to 6, middle Grades 7 and 8 and secondary Grades 9 to 12 (framework, Capital Ethiopia); the Council of Ministers approved rollout on 2023-02-27 and Grades 9 and 10 materials rolled out in September 2023 (Cambridge case study); Tigray adopted it in 2026 (allAfrica); the Grade 12 Secondary School Leaving Certificate Examination, run by the EAES, is the single university entrance exam covering Grades 9 to 12 (EAES schedule, 2026). Reference: mother-tongue teaching in primary set by the regional states, English later; exams at the end of primary and middle school (sources differ on which are regional or national, so none is named by grade). Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "rwanda": {
    sheetRow: { tab: "Countries", name: "Rwanda" },
    source: "https://www.reb.gov.rw/",
    notes: "Stage 3 batch E (2026-11-28), docs/curricula-stage3-build.md, Batch E. Confirmed: the revised primary curriculum in full from September 2025, and the new upper secondary pathways starting with S4 and moving up to S5 and S6 in the following years (The New Times); NESA's national examinations for P6 and S3 (Mineduc results) and the 2025-26 timetable (NESA). Reference: three years of nursery, P1 at 6, Kinyarwanda in the first primary years and English after that, a school year from September. Sources differ on whether S6 in 2026-27 is on the old curriculum, so the version label says S5 and S6 follow later. Licence: unclear (no reuse terms found for REB documents); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "tanzania": {
    sheetRow: { tab: "Countries", name: "Tanzania" },
    source: "https://www.tie.go.tz/",
    notes: "Stage 3 batch E (2026-11-28), docs/curricula-stage3-build.md, Batch E. Confirmed: the 1+6+4+2 structure of the Education and Training Policy (2014, 2023 edition), rolled out from 2024 with pre-primary, Standard I and Standard III; in 2027 the last Standard VII class and the first Standard VI class both finish primary (The Citizen, Daily News); the Form 5 curriculum moved to 2025; the Amali (vocational) secondary stream is piloted in 39 schools, national rollout in 2028 (The Citizen, 2026). Reference: the NECTA examinations (primary leaving, FTNA, CSEE, ACSEE), Kiswahili in primary and English in secondary, Zanzibar's own system. The 2028-01-01 version is when Standard VII ends. Licence: closed (the curriculum documents are copyright of the Ministry of Education, Science and Technology and TIE, and no reuse terms were found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "zambia": {
    sheetRow: { tab: "Countries", name: "Zambia" },
    source: "https://www.moe.gov.zm/",
    notes: "Stage 3 batch E (2026-11-28), docs/curricula-stage3-build.md, Batch E. Confirmed: the 3-6-4-2 structure (ECE cut from 4 to 3 years, primary from 7 to 6, Grade 1 entry from 7 to 6, secondary six years in Forms) (UNICEF Zambia budget brief 2025); phased in from 2025 with ECE Level 1, Grade 1 and Form 1 (Lusaka Times, January 2026); the last Junior Secondary exams in 2025, the last 2013-curriculum Primary and School Certificate exams in 2028 and the first Advanced Level exams in 2027 (ECZ); Education (Amendment) Act No. 17 of 2026 (Parliament). Reference: Grade 7 and Grades 10 to 12 kept in the year list for classes finishing on the 2013 curriculum; local-language teaching in the early grades. The 2029-01-01 version is when the transition ends. Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
  "zimbabwe": {
    sheetRow: { tab: "Countries", name: "Zimbabwe" },
    source: "https://mopse.co.zw/",
    notes: "Stage 3 batch E (2026-11-28), docs/curricula-stage3-build.md, Batch E. Confirmed: the Heritage-Based Curriculum Framework 2024 to 2030, approved by Cabinet in 2024 for ECD to upper secondary, with school-based projects in place of CALA and five secondary pathways, and full implementation in all schools directed in 2026 (The Herald, NewsDay). Reference: ECD A and B, Grades 1 to 7, Forms 1 to 6, the ZIMSEC Grade 7, O level and A level examinations, the US dollar and ZiG currencies. The continuous assessment weighting is left out: only one source gave it. Licence: unclear (no reuse terms found); permission request on docs/curricula-permissions.md. Profile only, no statements.",
  },
};
