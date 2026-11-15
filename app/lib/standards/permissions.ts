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
} as const satisfies Record<"ccss-math" | "ccss-ela" | "ngss" | "ac9", boolean>;

/** True while the model must not write the NGSS name in its output. */
export const NGSS_NAME_BLOCKED = !FRAMEWORK_PERMITTED.ngss;
