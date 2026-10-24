/**
 * What Jooma is, said once.
 *
 * Search engines and assistants describe a site from whatever it says about
 * itself, and this one used to say something different in every place: the
 * page title, the meta description, the social card, the footer, the terms and
 * the structured data each had their own line, and none of them said who it is
 * for and what it makes in one sentence. These are the lines they now share.
 *
 * Under the landing language rule (scripts/check-language.mjs), so no dashes
 * and no standalone "AI": these strings reach the homepage.
 */

/** The meta and social card description. Kept under 160 characters, which is
 *  roughly where Google cuts a description off. */
export const SITE_DESCRIPTION =
  "Teaching resources for UK teachers. Type a topic and a year group and Jooma makes the slides, worksheet, lesson plan or report you need in about a minute.";

/** The plain definition: the structured data description, and the sentence an
 *  answer engine can lift whole when someone asks what Jooma is. */
export const BRAND_DEFINITION =
  "Jooma makes teaching resources for UK teachers and school leaders. Type a topic and a year group and it builds the slides, worksheet, lesson plan or report you need, matched to the UK curriculum, in about a minute.";
