// The reading content domains the Comprehension form offers, by key stage.
// Pulled out of ComprehensionForm so the "what does a prefilled form start
// with" rule can be tested without rendering it.

export interface ContentDomain {
  code: string;
  label: string;
  description: string;
}

export const KS1_DOMAINS: readonly ContentDomain[] = [
  { code: "1a", label: "Word meaning", description: "Draw on knowledge of vocabulary to understand texts" },
  { code: "1b", label: "Key aspects", description: "Identify and explain key aspects of fiction and non-fiction texts, such as characters, events, titles and information" },
  { code: "1c", label: "Sequence of events", description: "Identify and explain the sequence of events in texts" },
  { code: "1d", label: "Inference", description: "Make inferences from the text" },
  { code: "1e", label: "Prediction", description: "Predict what might happen on the basis of what has been read so far" },
];

export const KS2_DOMAINS: readonly ContentDomain[] = [
  { code: "2a", label: "Word meaning", description: "Give and explain the meaning of words in context" },
  { code: "2b", label: "Retrieval", description: "Retrieve and record information, and identify key details from fiction and non-fiction" },
  { code: "2c", label: "Summarising", description: "Summarise main ideas from more than one paragraph" },
  { code: "2d", label: "Inference", description: "Make inferences from the text and explain and justify inferences with evidence from the text" },
  { code: "2e", label: "Prediction", description: "Predict what might happen from details stated and implied" },
  { code: "2f", label: "Structure", description: "Identify and explain how information and narrative content is related and contributes to meaning as a whole" },
  { code: "2g", label: "Language choices", description: "Identify and explain how meaning is enhanced through choice of words and phrases" },
  { code: "2h", label: "Comparison", description: "Make comparisons within the text" },
];

export type KeyStage = "ks1" | "ks2";

export function keyStageFor(yearGroup: string, mixed: boolean): KeyStage {
  return !mixed && (yearGroup === "Year 1" || yearGroup === "Year 2") ? "ks1" : "ks2";
}

export function domainsFor(ks: KeyStage): readonly ContentDomain[] {
  return ks === "ks1" ? KS1_DOMAINS : KS2_DOMAINS;
}

/**
 * The domains a form opened by Jo starts with: every one for the key stage.
 *
 * Jo fills the year, topic and curriculum, never the domains, and the form
 * clears the domains whenever the key stage changes. So a prefilled form used
 * to open with nothing selected and Generate disabled, and nothing on screen
 * said why. Selecting them all is the same default the assistant's registry
 * already described, and the teacher can untick any of them.
 */
export function defaultDomainCodes(yearGroup: string, mixed: boolean): string[] {
  return domainsFor(keyStageFor(yearGroup, mixed)).map((d) => d.code);
}
