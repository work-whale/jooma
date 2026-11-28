/*
 * The credit each standards licence asks for, on its own so the Terms page can
 * show them without loading the curriculum registry. Shown under the "Align to
 * curriculum" card whenever that framework's statements are listed, and in
 * section 13 of /terms.
 */

import type { FrameworkId } from "@/app/lib/curricula/types";

/** Scotland's Es and Os: Crown copyright, reused under the Open Government
 *  Licence v3.0 (education.gov.scot/terms-of-use). Also stored with the data. */
const CFE_CREDIT =
  "Curriculum for Excellence experiences and outcomes: © Crown copyright, Education Scotland. Contains public sector information licensed under the Open Government Licence v3.0.";

/** Northern Ireland's statutory requirements, from the 2007 Order on
 *  legislation.gov.uk (Open Government Licence v3.0). Also stored with the data. */
const NIC_CREDIT =
  "Northern Ireland Curriculum statutory requirements, from The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007: © Crown copyright. Contains public sector information licensed under the Open Government Licence v3.0.";

/** Japan's Course of Study, excerpted in Japanese under the Government of
 *  Japan Standard Terms of Use (Ver. 2.0): source named, edits noted. Also
 *  stored with the data (scripts/build-asia-standards.mjs). */
const JP_COS_CREDIT =
  "Course of Study (学習指導要領) for elementary, junior high and senior high schools: Ministry of Education, Culture, Sports, Science and Technology (MEXT), https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm. Statements are excerpts from the official Japanese text, edited by Jooma into a list. Used under the Government of Japan Standard Terms of Use (Ver. 2.0).";

/** Taiwan: NAER's open data declaration asks only that the source is
 *  credited; the credit also says the statements are edited excerpts. */
const TW_108_ZH_CREDIT =
  "Curriculum Guidelines of 12-Year Basic Education (十二年國民基本教育課程綱要) for Mandarin (國語文) and mathematics (數學): Ministry of Education, Taiwan, published by the National Academy for Educational Research (NAER), https://www.naer.edu.tw/eng/PageSyllabus?fid=148. Statements are excerpts from the official Chinese text, edited by Jooma into a list. Used under NAER's open data declaration, https://www.naer.edu.tw/PageDoc?fid=324.";
const TW_108_EN_CREDIT =
  "Curriculum Guidelines of 12-Year Basic Education for English and for natural science, official English translation: Ministry of Education, Taiwan, published by the National Academy for Educational Research (NAER), https://www.naer.edu.tw/eng/PageSyllabus?fid=148. Statements are excerpts from the official English text, edited by Jooma into a list. Used under NAER's open data declaration, https://www.naer.edu.tw/PageDoc?fid=324.";

/** Norway: NLOD asks for "Contains data under NLOD, made available on
 *  data.udir.no" (Udir's terms); the credit also says the aims are edited
 *  excerpts in Udir's English version. */
const NO_LK20_CREDIT =
  "Curricula of the Knowledge Promotion 2020 (LK20) for Norwegian, mathematics, natural science and English, in the English version published by the Norwegian Directorate for Education and Training (Udir), https://www.udir.no/lk20/. Statements are excerpts, edited by Jooma into a list. Contains data under NLOD (https://data.norge.no/nlod/en), made available on data.udir.no.";

/** Sweden: CC0 asks for no credit; Jooma names the source anyway, and says
 *  the items are edited excerpts. */
const SE_LGR22_CREDIT =
  "Syllabuses for Swedish, mathematics, English, biology, physics and chemistry in the compulsory school (Lgr22), Swedish National Agency for Education (Skolverket), from Skolverket's Syllabus API under CC0 1.0. Statements are excerpts, edited by Jooma into a list.";
const SE_GY25_CREDIT =
  "Subject syllabuses for Swedish, mathematics, English, natural science, biology, physics and chemistry in upper secondary school (GY25), Swedish National Agency for Education (Skolverket), from Skolverket's Syllabus API under CC0 1.0. Statements are excerpts, edited by Jooma into a list.";

/** The credit each licence asks for, shown under the card whenever that
 *  framework's statements are listed. tests/unit/standards.spec.ts holds these
 *  equal to the credit stored with the data. */
export const FRAMEWORK_CREDIT: Record<FrameworkId, string> = {
  "ccss-math":
    "Common Core State Standards: © Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.",
  "ccss-ela":
    "Common Core State Standards: © Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.",
  ngss: "NGSS is a registered trademark of WestEd. Neither WestEd nor the lead states and partners that developed the Next Generation Science Standards were involved in the production of this product, and do not endorse it.",
  ac9: "© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2010 to present, unless otherwise indicated. This material was downloaded from the Australian Curriculum website (accessed 15 November 2026) and was modified. The material is licensed under CC BY 4.0.",
  "cfe-early": CFE_CREDIT,
  "cfe-first": CFE_CREDIT,
  "cfe-second": CFE_CREDIT,
  "cfe-third-fourth": CFE_CREDIT,
  "nic-fs": NIC_CREDIT,
  "nic-ks1": NIC_CREDIT,
  "nic-ks2": NIC_CREDIT,
  "nic-ks3": NIC_CREDIT,
  "nic-ks4": NIC_CREDIT,
  "jp-cos": JP_COS_CREDIT,
  "tw-108-zh": TW_108_ZH_CREDIT,
  "tw-108-en": TW_108_EN_CREDIT,
  "no-lk20": NO_LK20_CREDIT,
  "se-lgr22": SE_LGR22_CREDIT,
  "se-gy25": SE_GY25_CREDIT,
};

/** A line under the card for a framework whose statements are not in English:
 *  Jooma shows the official text only, never its own translation (owner,
 *  2026-11-28). */
export const FRAMEWORK_LANGUAGE_NOTE: Partial<Record<FrameworkId, string>> = {
  "jp-cos": "Statements are shown in Japanese, as MEXT publishes them. Your resource is still written in the language you choose.",
  "tw-108-zh":
    "Mandarin and mathematics statements are shown in Chinese, as Taiwan's Ministry of Education publishes them. Your resource is still written in the language you choose.",
  "se-lgr22": "Statements are shown in Swedish, as Skolverket publishes them. Your resource is still written in the language you choose.",
  "se-gy25": "Statements are shown in Swedish, as Skolverket publishes them. Your resource is still written in the language you choose.",
};

