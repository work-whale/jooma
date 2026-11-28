/*
 * The candidate list for the topic matcher (/api/suggest-subject).
 *
 * The route numbers a year's statements and asks the model which ones a lesson
 * would teach. A whole year can be large (Scotland's Third and fourth level is
 * 567 statements, about 33,000 tokens), and guests can call the route, so two
 * things keep the list small:
 *
 *   1. The teacher's subject ("Maths", from the worksheet's Subject field) or,
 *      failing that, the lesson topic, narrows the list to the curriculum's own
 *      subject ("Numeracy and mathematics"). When it names nothing this year
 *      has, every statement stays: never an empty list.
 *   2. A hard cap, whatever the filter did: at most MAX_CANDIDATES statements,
 *      the ones sharing the most words with the topic, and at most
 *      MAX_PROMPT_CHARS characters of prompt.
 *
 * Pure and shared by the route and the tests: no server-only imports.
 */

/** The fields the matcher reads: England's statements and every framework's
 *  share them. */
export interface Candidate {
  id: string;
  subject: string;
  strand: string;
  text: string;
}

export const MAX_CANDIDATES = 150;
/** System and user message together. About 12,000 tokens. */
export const MAX_PROMPT_CHARS = 50_000;

const TOPIC_CHARS = 300;
const YEAR_CHARS = 40;
const SUBJECT_CHARS = 80;
const STRAND_CHARS = 120;
const TEXT_CHARS = 220;

/*
 * A subject a teacher might type, and the curriculum subjects it means. The
 * targets are tried in tiers: the first tier that names a subject this year
 * has wins, so "Music" in England is Music, not Art and design as well, and
 * falls back to "Expressive arts" in Scotland and "The Arts" in Northern
 * Ireland, where music sits inside a wider area.
 */
interface Concept {
  typed: RegExp;
  tiers: RegExp[];
  /** Set this concept aside for a typed text that means something narrower in
   *  this curriculum ("digital technologies" is not Design and Technologies). */
  skip?: (typed: string, subjects: string[]) => boolean;
}

const WIDER_WORLD = /social studies|world around us|environment and society|understanding the world/i;
const WIDER_ARTS = /expressive|\bthe arts\b/i;
// Australia: Humanities and Social Sciences is one subject from Foundation to Year 6, then
// History, Geography, Civics and Citizenship and Economics and Business from Year 7.
const HASS = /humanities and social sciences/i;
const HASS_SECONDARY = /^(history|geography|civics and citizenship|economics and business)$/i;
const PE_TIERS = [/physical education|physical development/i, /health and wellbeing/i];

const CONCEPTS: Concept[] = [
  { typed: /\b(maths?|mathematics|numeracy|arithmetic|algebra|geometry|statistics)\b/i, tiers: [/math|numeracy/i] },
  {
    typed: /\b(english|literacy|reading|writing|phonics|spelling|grammar|ela|language arts|literature)\b/i,
    tiers: [/\benglish\b|literacy|language arts|communication and language/i],
  },
  {
    typed: /\b(sciences?|scientific|biology|chemistry|physics)\b/i,
    // Typing "Humanities and Social Sciences" does not mean Science.
    tiers: [/(?<!social )scien/i, WIDER_WORLD],
    skip: (typed) => HASS.test(typed),
  },
  { typed: /\b(history|historical)\b/i, tiers: [/\bhistory\b/i, WIDER_WORLD, HASS] },
  { typed: /\b(geography|geographical)\b/i, tiers: [/\bgeography\b/i, WIDER_WORLD, HASS] },
  { typed: /\bsocial studies\b/i, tiers: [WIDER_WORLD, HASS] },
  { typed: /\b(hass|humanities)\b/i, tiers: [HASS, HASS_SECONDARY] },
  { typed: /\b(civics|citizenship)\b/i, tiers: [/civics and citizenship/i, HASS] },
  { typed: /\b(economics|economy|business)\b/i, tiers: [/economics and business/i, HASS] },
  { typed: /\b(art|drawing|painting|sculpture)\b/i, tiers: [/^art\b|\bart and design\b/i, /visual arts/i, WIDER_ARTS] },
  { typed: /\bvisual arts\b/i, tiers: [/visual arts/i] },
  { typed: /\bmedia\b/i, tiers: [/media arts/i] },
  { typed: /\b(music|musical)\b/i, tiers: [/\bmusic\b/i, WIDER_ARTS] },
  { typed: /\b(drama|dance)\b/i, tiers: [/\b(drama|dance)\b/i, WIDER_ARTS] },
  {
    typed: /\b(pe|p\.e\.|physical education|sports?|gymnastics|athletics)\b/i,
    tiers: PE_TIERS,
  },
  // "P.E." ends in a dot, so the word boundary above never sees it.
  { typed: /(?:^|[^a-z])p\.e\.(?:$|[^a-z])/i, tiers: PE_TIERS },
  // Australia's Health and Physical Education is one subject.
  { typed: /\b(health|healthy|wellbeing|well-being)\b/i, tiers: [/health and physical education/i] },
  {
    typed: /\b(pshe|pshce|rshe|rse|pdmu|wellbeing|well-being|health|citizenship|personal development)\b/i,
    tiers: [/personal development|personal, social|health and wellbeing|learning for life/i],
  },
  // "RE" only as a word on its own: "re-telling" is not religious education.
  { typed: /\b(re(?![-\w])|r\.e\.|rme|rerc|religious|religions?)\b/i, tiers: [/religio/i] },
  { typed: /\b(computing|computer science|ict|coding|programming)\b/i, tiers: [/computing/i, /digital technolog/i, /technolog/i] },
  { typed: /\bdigital tech(nology|nologies)?\b/i, tiers: [/digital technolog/i] },
  {
    typed: /\b(design and technology|d&t|dt|technology|technologies)\b/i,
    tiers: [/design and technolog|technology and design/i, /technolog/i],
    skip: (typed, subjects) => /digital tech/i.test(typed) && subjects.some((x) => /digital technolog/i.test(x)),
  },
  {
    typed: /\b(french|spanish|german|italian|mandarin|chinese|japanese|polish|urdu|mfl|modern languages?|languages)\b/i,
    tiers: [/modern languages|^languages$/i],
  },
  { typed: /\b(latin|greek|classics|classical)\b/i, tiers: [/classical/i] },
  { typed: /\bgaelic\b/i, tiers: [/gaelic/i] },
  // A national language taught as the school's own: Japan's 国語 is listed as
  // "Japanese". In England "Japanese" finds no such subject and stays a modern
  // language (above).
  { typed: /\b(japanese|kokugo)\b|国語/i, tiers: [/^japanese$/i] },
  // Subjects typed in Japanese or Chinese, which have no word boundaries.
  { typed: /算数|数学|數學/, tiers: [/math/i] },
  { typed: /理科|自然科学|自然科學/, tiers: [/(?<!social )scien/i] },
  { typed: /英語|英文/, tiers: [/\benglish\b/i] },
  // Taiwan's 國語文 is listed as "Mandarin". In England "Mandarin" or
  // "Chinese" finds no such subject and stays a modern language (above).
  { typed: /\b(mandarin|chinese)\b|國語|國文|国语|中文/i, tiers: [/^mandarin$/i] },
  { typed: /自然/, tiers: [/(?<!social )scien/i] },
  // Norway's norsk is listed as "Norwegian"; subjects typed in Norwegian.
  // In England "Norwegian" finds no such subject.
  { typed: /\b(norwegian|norsk)\b/i, tiers: [/^norwegian$/i] },
  { typed: /\bmatematikk\b/i, tiers: [/math/i] },
  { typed: /\bnaturfag\b/i, tiers: [/(?<!social )scien/i] },
  { typed: /\bengelsk\b/i, tiers: [/\benglish\b/i] },
];

/** The curriculum subjects (from `subjects`, in its order) the typed text
 *  names. Empty when it names none of them. */
export function matchingSubjects(typed: string | null | undefined, subjects: string[]): string[] {
  const text = (typed ?? "").trim();
  if (!text) return [];
  const hit = new Set<string>();
  for (const c of CONCEPTS) {
    if (!c.typed.test(text) || c.skip?.(text, subjects)) continue;
    for (const tier of c.tiers) {
      const found = subjects.filter((s) => tier.test(s));
      if (found.length) {
        found.forEach((s) => hit.add(s));
        break;
      }
    }
  }
  return subjects.filter((s) => hit.has(s));
}

/** The statements of the subject the teacher typed, or failing that the
 *  subject the topic names; every statement when neither names one. */
export function filterBySubject<T extends Candidate>(statements: T[], subject: string | null | undefined, topic?: string | null): T[] {
  const subjects = [...new Set(statements.map((s) => s.subject))];
  for (const hint of [subject, topic]) {
    const wanted = new Set(matchingSubjects(hint, subjects));
    if (wanted.size) return statements.filter((s) => wanted.has(s.subject));
  }
  return statements;
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "into", "about", "that", "this", "their", "year", "lesson", "pupils", "students", "how", "what", "why", "when", "using", "use", "learn", "learning", "our", "your", "are", "can",
]);

/** A topic's words, lower case, a final "s" dropped so "fractions" finds "fraction". */
function topicWords(topic: string): string[] {
  const words = topic.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)))];
}

/** At most `max` statements: those sharing the most topic words, in the
 *  input's order. A list already under the cap comes back whole. */
export function capCandidates<T extends Candidate>(statements: T[], topic: string, max = MAX_CANDIDATES): T[] {
  if (statements.length <= max) return statements;
  const words = topicWords(topic);
  const scored = statements.map((s, i) => {
    const hay = `${s.subject} ${s.strand} ${s.text}`.toLowerCase();
    return { i, score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
  });
  const keep = scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.i)
    .sort((a, b) => a - b);
  return keep.map((i) => statements[i]);
}

export const SUGGEST_SYSTEM =
  "You align a lesson to the curriculum statements it would directly teach. " +
  "From the numbered list, return the numbers of one to three statements a lesson on this topic would teach, " +
  "most relevant first, all from the same subject. Prefer the statement that names the topic's content. " +
  "Return an empty list if no statement is a reasonable fit.";

/**
 * The messages for the model and the candidates they number (1 is
 * candidates[0]). Filtered by subject, capped by count, then cut to fit
 * MAX_PROMPT_CHARS: a statement whose line would not fit is left out, with
 * everything after it.
 */
export function suggestPrompt(input: { topic: string; year: string; statements: Candidate[]; subject?: string | null }): {
  system: string;
  user: string;
  candidates: Candidate[];
} {
  const topic = input.topic.trim().slice(0, TOPIC_CHARS);
  const year = input.year.slice(0, YEAR_CHARS);
  const capped = capCandidates(filterBySubject(input.statements, input.subject, topic), topic);

  const head = `Lesson topic: "${topic}"\nYear group: ${year}\n\nStatements:`;
  let budget = MAX_PROMPT_CHARS - SUGGEST_SYSTEM.length - head.length;
  const lines: string[] = [];
  const candidates: Candidate[] = [];
  for (const s of capped) {
    const line = `\n${lines.length + 1}. [${s.subject.slice(0, SUBJECT_CHARS)} > ${s.strand.slice(0, STRAND_CHARS)}] ${s.text.slice(0, TEXT_CHARS)}`;
    if (line.length > budget) break;
    budget -= line.length;
    lines.push(line);
    candidates.push(s);
  }
  return { system: SUGGEST_SYSTEM, user: head + lines.join(""), candidates };
}

/** The candidates the model's numbers point at: whole numbers in range, each
 *  once, in the model's order. Anything else is dropped. */
export function resolvePicks<T>(picks: unknown, candidates: T[]): T[] {
  if (!Array.isArray(picks)) return [];
  const seen = new Set<number>();
  const out: T[] = [];
  for (const n of picks) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > candidates.length || seen.has(n)) continue;
    seen.add(n);
    out.push(candidates[n - 1]);
  }
  return out;
}

/**
 * What the "Align to curriculum" card posts to the matcher. England's body is
 * exactly what it always was (topic, year, no curriculum id), so the subject
 * is added only for another curriculum, and only when the card has one (the
 * worksheet's Subject field; the slides wizard has none).
 */
export function suggestBody(input: { topic: string; year: string; england: boolean; curriculumId?: string; subject?: string }): {
  topic: string;
  year: string;
  curriculumId: string | undefined;
  subject?: string;
} {
  const body = { topic: input.topic, year: input.year, curriculumId: input.england ? undefined : input.curriculumId };
  const subject = input.subject?.trim();
  return !input.england && subject ? { ...body, subject } : body;
}

/**
 * What the card remembers it has asked the matcher, or null while it must not
 * ask yet. The teacher's curriculum loads after the slides wizard opens (the
 * hook starts on England), so the card waits for it, and a change of
 * curriculum is a new question rather than one already answered.
 */
export function suggestKey(input: { curriculumKnown: boolean; curriculumId: string; year: string; topic: string }): string | null {
  const topic = input.topic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!input.curriculumKnown || !topic) return null;
  return `${input.curriculumId}::${input.year}::${topic}`;
}
