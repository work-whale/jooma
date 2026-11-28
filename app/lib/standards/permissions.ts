/*
 * Which standards frameworks Jooma may show teachers and name in its output.
 *
 * NGSS is off. Jooma is a paid product, so it needs written permission first:
 *   - WestEd owns the NGSS trademark. Commercial users must send samples to
 *     nextgenscience@wested.org and wait for approval (4 to 6 weeks), then put
 *     an asterisk and footnote on every page that names it.
 *   - The National Academies Press holds the copyright in the standards text.
 *     The free NGSS licence covers states, schools, teachers and non-profits,
 *     not a paid company.
 * The data stays in app/lib/standards/data/ngss.json. When both say yes, set
 * ngss to true here, add the footnote where the name shows, and update the
 * tests in tests/unit/standards.spec.ts.
 *
 * No imports, so the curriculum registry can read it without a cycle.
 */

export const FRAMEWORK_PERMITTED = {
  "ccss-math": true,
  "ccss-ela": true,
  ngss: false,
  ac9: true,
  // Curriculum for Excellence: Crown copyright, Open Government Licence v3.0
  // (https://education.gov.scot/terms-of-use, checked 2026-11-20).
  "cfe-early": true,
  "cfe-first": true,
  "cfe-second": true,
  "cfe-third-fourth": true,
  // Northern Ireland: the Order is on legislation.gov.uk, where all content is
  // available under the Open Government Licence v3.0 (checked 2026-11-20). CCEA's
  // own documents are CCEA copyright and are not used.
  "nic-fs": true,
  "nic-ks1": true,
  "nic-ks2": true,
  "nic-ks3": true,
  "nic-ks4": true,
  // Japan's Course of Study: MEXT's website follows the Government of Japan
  // Standard Terms of Use (Ver. 2.0), which allow commercial use with the
  // source named and, for an edited work, a note that it was edited
  // (https://www.mext.go.jp/en/other/title01/detail01/1375290.htm, checked
  // 2026-11-28). Excerpts in the original Japanese, credited in credits.ts.
  "jp-cos": true,
  // Taiwan's Curriculum Guidelines of 12-Year Basic Education, on NAER's
  // site: NAER's open data declaration grants all its site material free,
  // non-exclusive and irrevocable, for any use including adaptation, with the
  // source credited (https://www.naer.edu.tw/PageDoc?fid=324, checked
  // 2026-11-28). Mandarin and mathematics in the original Chinese; English and
  // science in NAER's official English translation. Credited in credits.ts.
  "tw-108-zh": true,
  "tw-108-en": true,
} as const satisfies Record<
  "ccss-math" | "ccss-ela" | "ngss" | "ac9" | "cfe-early" | "cfe-first" | "cfe-second" | "cfe-third-fourth" | "nic-fs" | "nic-ks1" | "nic-ks2" | "nic-ks3" | "nic-ks4" | "jp-cos" | "tw-108-zh" | "tw-108-en",
  boolean
>;

/** True while the model must not write the NGSS name in its output. */
export const NGSS_NAME_BLOCKED = !FRAMEWORK_PERMITTED.ngss;
