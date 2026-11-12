// Phonics support as a sheet.
//
// For one grapheme (the letters that spell a sound, such as "ai"): a short
// note on the sound, word banks by word shape, the common words that use it,
// a decodable text, made-up words for decoding practice (pupils meet these in
// the Year 1 Phonics Screening Check), five activities with support and
// challenge, misconceptions and ways to check. When the teacher named their
// scheme, a note at the top says this is extra practice alongside it.
//
// The model fills one fixed shape (phonicsResponseFormat in
// app/lib/phonics-prompt.ts); code arranges it. Pure, free of React,
// normalize.ts and schema.ts.

import { undash } from "./undash";
import { activitySection } from "./activity";

/** The word banks, in page order: [model field, heading]. */
export const PHONICS_BANKS: [string, string][] = [
  ["cvc", "CVC words"],
  ["ccvc", "CCVC words"],
  ["cvcc", "CVCC words"],
  ["twoSyllable", "Two-syllable words"],
  ["longer", "Longer words"],
];

/** Made-up words per row of the table, so it prints as cards to cut out. */
const PSEUDO_PER_ROW = 4;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

export interface PhonicsArrangeInfo {
  /** The note about the school's scheme, or "" (app/lib/phonics-schemes.ts). */
  schemeNote: string;
  /** What the scheme calls tricky words and made-up words. */
  trickyLabel: string;
  pseudoLabel: string;
}

/** `words` cut into rows of `per`, the last row padded with blanks. */
export function rowsOf(words: string[], per: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < words.length; i += per) {
    const row = words.slice(i, i + per);
    rows.push([...row, ...Array.from({ length: per - row.length }, () => "")]);
  }
  return rows;
}

const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The model's resource (complete or mid-stream) as a generic sheet draft. */
export function arrangePhonics(raw: unknown, info: PhonicsArrangeInfo): Raw {
  const r = obj(undash(raw));
  const banks = obj(r.wordBanks);
  const text = obj(r.decodableText);
  const paragraphs = strs(text.paragraphs);
  const pseudo = strs(r.pseudoWords);
  const common = strs(r.commonWords);
  const tricky = strs(r.trickyWords);

  const sections: (Raw | null)[] = [
    {
      role: "about",
      title: "About this sound",
      emoji: "🔤",
      instructions: "",
      blocks: [
        ...(info.schemeNote ? [{ type: "callout", variant: "remember", label: "Your scheme", emoji: "📘", text: info.schemeNote }] : []),
        ...(str(r.about) ? [{ type: "text", text: str(r.about) }] : []),
      ],
    },
    {
      role: "words",
      title: "Word bank",
      emoji: "🧺",
      instructions: "",
      blocks: PHONICS_BANKS.map(([field, title]) => ({ type: "wordbank", title, words: strs(banks[field]) })).filter((b) => b.words.length),
    },
    {
      role: "common",
      title: "Common words",
      emoji: "⭐",
      instructions: "",
      blocks: [
        ...(common.length ? [{ type: "wordbank", title: "Words to decode", words: common }] : []),
        ...(tricky.length ? [{ type: "wordbank", title: capFirst(info.trickyLabel || "tricky words"), words: tricky }] : []),
      ],
    },
    {
      role: "decodable",
      title: "Decodable text",
      emoji: "📖",
      instructions: paragraphs.length ? "Every word can be sounded out with the sounds taught so far, apart from the common words above." : "",
      blocks: paragraphs.length ? [{ type: "passage", title: str(text.title), paragraphs }] : [],
    },
    {
      role: "pseudo",
      title: capFirst(info.pseudoLabel || "nonsense words"),
      emoji: "👽",
      instructions: pseudo.length ? "Made-up words that test decoding alone, as in the Year 1 Phonics Screening Check. Cut them out as cards." : "",
      blocks: pseudo.length ? [{ type: "table", headers: [], rows: rowsOf(pseudo, PSEUDO_PER_ROW) }] : [],
    },
    ...arr(r.activities).map((a, i) => activitySection(a, { role: "activity", emoji: "🎲", prefix: `Activity ${i + 1}: ` })),
    {
      role: "misconceptions",
      title: "Common misconceptions",
      emoji: "⚠️",
      instructions: "",
      blocks: strs(r.misconceptions).length ? [{ type: "list", title: "", style: "bullet", items: strs(r.misconceptions) }] : [],
    },
    {
      role: "assessment",
      title: "Checking progress",
      emoji: "✅",
      instructions: "",
      blocks: strs(r.assessment).length ? [{ type: "list", title: "", style: "check", items: strs(r.assessment) }] : [],
    },
  ];

  return {
    title: str(r.title),
    objective: "",
    intro: null,
    sections: sections.filter((s): s is Raw => !!s && (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
