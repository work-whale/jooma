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

/** The canonical host. The apex redirects here, and metadataBase says the same. */
export const SITE_URL = "https://www.jooma.ai";

/** The registered legal entity behind Jooma, exactly as Companies House (or
 *  the equivalent register) has it. Null until it is confirmed: Stripe shows
 *  the account as an individual, and "Jooma Ltd", which the site used to say,
 *  is not on the register. While null it is left out of the structured data,
 *  llms.txt and the About page rather than stated without a source. The terms
 *  and privacy policy still name "Jooma Ltd" and need the same correction,
 *  which is a legal wording decision for the business, not this file. */
export const LEGAL_NAME: string | null = null;
export const CONTACT_EMAIL = "info@jooma.ai";

/** Jooma's own profiles elsewhere (LinkedIn, X, and so on): the structured
 *  data's sameAs, which is how a search engine ties those accounts to this
 *  site. Clean URLs only, no tracking or language parameters. An empty list
 *  is left out of the markup rather than published as []. */
export const SAME_AS: string[] = [
  "https://www.facebook.com/profile.php?id=61594030149333",
  "https://www.instagram.com/jooma.ai/",
];

/** The Companies House number, once supplied. Null leaves it out. */
export const COMPANY_NUMBER: string | null = null;

/** The meta and social card description. Kept under 160 characters, which is
 *  roughly where Google cuts a description off. */
export const SITE_DESCRIPTION =
  "Teaching resources for UK teachers. Type a topic and a year group and Jooma makes the slides, worksheet, lesson plan or report you need in about a minute.";

/** The plain definition: the structured data description, and the sentence an
 *  answer engine can lift whole when someone asks what Jooma is. */
export const BRAND_DEFINITION =
  "Jooma makes teaching resources for UK teachers and school leaders. Type a topic and a year group and it builds the slides, worksheet, lesson plan or report you need, matched to the UK curriculum, in about a minute.";
