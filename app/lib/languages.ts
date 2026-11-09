/*
 * The languages a teacher can generate resources in.
 *
 * Only the OUTPUT language: Jooma's own interface stays English. The list
 * matches Chalkie's public locales (2026-11-08); adding a language is one entry
 * here and nothing else.
 *
 * English (UK) is the default, and it is a strict no-op: languageInstruction()
 * returns "" for it, so a UK English generation sends OpenAI exactly the prompt
 * it always has. Every existing prompt already says "UK English"; the other
 * languages add one final instruction that overrides that line.
 *
 * Kept separate from curriculum on purpose. When other countries' curricula
 * arrive, a curriculum can name a default language here (a French curriculum
 * defaults to "fr") without the two being the same setting.
 *
 * Shared by client and server: no server-only imports.
 */

export interface Language {
  /** BCP 47 code. Also what is stored in localStorage and sent to the API. */
  code: string;
  /** English name, for the prompt and for admin. */
  label: string;
  /** What the teacher sees in the dropdown, in the language itself. */
  nativeLabel: string;
  /** How the prompt names it: "French", "Brazilian Portuguese". */
  promptName: string;
  /** Browser speech recognition locale (dictation). */
  speechLocale: string;
  /** ISO 639-1 code for OpenAI transcription in Live mode. */
  transcribeLang: string;
  /** Spelling-only English variant: the model writes English, spelt this way. */
  englishVariant?: boolean;
}

export const DEFAULT_LANGUAGE = "en-GB";

export const LANGUAGES: readonly Language[] = [
  { code: "en-GB", label: "English (UK)", nativeLabel: "English (UK)", promptName: "British English", speechLocale: "en-GB", transcribeLang: "en", englishVariant: true },
  { code: "en-US", label: "English (US)", nativeLabel: "English (US)", promptName: "American English", speechLocale: "en-US", transcribeLang: "en", englishVariant: true },
  { code: "en-AU", label: "English (Australia)", nativeLabel: "English (Australia)", promptName: "Australian English", speechLocale: "en-AU", transcribeLang: "en", englishVariant: true },
  { code: "en-CA", label: "English (Canada)", nativeLabel: "English (Canada)", promptName: "Canadian English", speechLocale: "en-CA", transcribeLang: "en", englishVariant: true },
  { code: "en-IE", label: "English (Ireland)", nativeLabel: "English (Ireland)", promptName: "Irish English", speechLocale: "en-IE", transcribeLang: "en", englishVariant: true },
  { code: "de", label: "German", nativeLabel: "Deutsch", promptName: "German", speechLocale: "de-DE", transcribeLang: "de" },
  { code: "es", label: "Spanish", nativeLabel: "Español", promptName: "Spanish", speechLocale: "es-ES", transcribeLang: "es" },
  { code: "et", label: "Estonian", nativeLabel: "Eesti", promptName: "Estonian", speechLocale: "et-EE", transcribeLang: "et" },
  { code: "fr", label: "French", nativeLabel: "Français", promptName: "French", speechLocale: "fr-FR", transcribeLang: "fr" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", promptName: "Italian", speechLocale: "it-IT", transcribeLang: "it" },
  { code: "pl", label: "Polish", nativeLabel: "Polski", promptName: "Polish", speechLocale: "pl-PL", transcribeLang: "pl" },
  { code: "pt", label: "Portuguese (Portugal)", nativeLabel: "Português (Portugal)", promptName: "European Portuguese", speechLocale: "pt-PT", transcribeLang: "pt" },
  { code: "pt-BR", label: "Portuguese (Brazil)", nativeLabel: "Português (Brasil)", promptName: "Brazilian Portuguese", speechLocale: "pt-BR", transcribeLang: "pt" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska", promptName: "Swedish", speechLocale: "sv-SE", transcribeLang: "sv" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** A known language code, or the default for anything else. The value arrives
 *  in a request body, so it is untrusted: never put it in a prompt unparsed. */
export function parseLanguage(value: unknown): string {
  return typeof value === "string" && BY_CODE.has(value) ? value : DEFAULT_LANGUAGE;
}

export function getLanguage(value: unknown): Language {
  return BY_CODE.get(parseLanguage(value))!;
}

/** True when the output should be anything other than UK English. */
export function isNonDefaultLanguage(value: unknown): boolean {
  return parseLanguage(value) !== DEFAULT_LANGUAGE;
}

/**
 * The instruction that switches a generation's language, appended as the LAST
 * system message so it outranks the "UK English" lines in the tool prompts.
 * Empty for UK English: nothing is added, the prompt is unchanged.
 */
export function languageInstruction(value: unknown): string {
  const lang = getLanguage(value);
  if (lang.code === DEFAULT_LANGUAGE) return "";

  if (lang.englishVariant) {
    return [
      `OUTPUT LANGUAGE: ${lang.promptName}.`,
      `Use ${lang.promptName} spelling, vocabulary and conventions in everything a teacher or pupil will read. This overrides any earlier instruction to use UK or British English spelling.`,
      "Keep JSON keys, schema field names and enum values exactly as specified.",
    ].join(" ");
  }

  return [
    `OUTPUT LANGUAGE: ${lang.promptName}.`,
    `Write every word a teacher or pupil will read in ${lang.promptName}: titles, instructions, questions, answers, passages, notes, labels and speaker notes. This overrides any earlier instruction to write in UK or British English.`,
    "Keep JSON keys, schema field names and enum values exactly as specified, in English.",
    "Any image search query or image description field stays in English, because the image search only understands English.",
    `Keep the UK school context (year groups, key stages, GCSE and the named curriculum) and express it naturally in ${lang.promptName}.`,
    `Where the instructions above quote English wording for you to use, such as starting an objective with "I am learning to", that is the pattern, not the words: write its natural ${lang.promptName} equivalent instead.`,
    `Quoted text the teacher supplied stays as they wrote it; write everything around it in ${lang.promptName}.`,
  ].join(" ");
}

/** For a spoken voice: the accent line used in place of the British one. */
export function voiceAccent(value: unknown): string {
  const lang = getLanguage(value);
  if (lang.englishVariant) return `${lang.promptName} accent`;
  return `a native ${lang.promptName} speaker, speaking ${lang.promptName}`;
}

/**
 * Append the language instruction to a chat's messages, as the final system
 * message. For UK English (or no language) the SAME array is returned
 * untouched, which is what keeps every existing generation byte for byte as
 * it was.
 */
export function withLanguage<M extends { role: string }>(messages: M[], value: unknown): M[] {
  const instruction = languageInstruction(value);
  if (!instruction) return messages;
  return [...messages, { role: "system", content: instruction } as unknown as M];
}

/** The `language` field of a parsed request body, whatever the body's type.
 *  Returns a known code (UK English for anything missing or unknown). */
export function requestLanguage(body: unknown): string {
  return parseLanguage(body && typeof body === "object" ? (body as { language?: unknown }).language : undefined);
}

/**
 * The language as it goes into a form's saved state (tool_runs.input and the
 * "nothing changed since you generated" snapshot). Omitted for UK English, so
 * an English form's state is exactly what it was before languages existed:
 * restoring an older run still reads as unchanged and keeps Generate disabled.
 */
export function languageFormState(value: unknown): { language?: string } {
  const code = parseLanguage(value);
  return code === DEFAULT_LANGUAGE ? {} : { language: code };
}
