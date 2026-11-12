// Phonics schemes and the words each one uses.
//
// In England every state primary school teaches phonics through one
// systematic synthetic phonics (SSP) scheme, and most use one on the DfE's
// validated list. Each scheme has its own words for the same ideas: Read
// Write Inc. calls a digraph a "special friend" and a tricky word a "red
// word", Essential Letters and Sounds says "harder to read and spell words".
// A resource in another scheme's words confuses five year olds, so when the
// teacher names their scheme the prompt uses its words.
//
// Only the words: never a scheme's own texts, rhymes, mnemonics, characters
// or artwork, which are its copyright. The page says the resource is extra
// practice alongside the scheme, not part of it.
//
// CHECK WITH THE USER: these terms were written from general knowledge of the
// schemes and should be confirmed by someone who teaches them.

export interface PhonicsScheme {
  id: string;
  name: string;
  /** What the scheme calls the words that cannot yet be sounded out. */
  tricky: string;
  /** What it calls two letters making one sound, or "" for the plain term. */
  digraph: string;
  /** What it calls made-up words for decoding practice. */
  pseudo: string;
  /** How it describes blending, or "" for the plain term. */
  blending: string;
}

export const PHONICS_SCHEMES: PhonicsScheme[] = [
  { id: "little-wandle", name: "Little Wandle Letters and Sounds Revised", tricky: "tricky words", digraph: "", pseudo: "nonsense words", blending: "" },
  { id: "rwi", name: "Read Write Inc. Phonics", tricky: "red words", digraph: "special friends", pseudo: "alien words", blending: "Fred Talk" },
  { id: "els", name: "Essential Letters and Sounds", tricky: "harder to read and spell words", digraph: "", pseudo: "nonsense words", blending: "" },
  { id: "jolly", name: "Jolly Phonics", tricky: "tricky words", digraph: "", pseudo: "nonsense words", blending: "" },
  { id: "sounds-write", name: "Sounds-Write", tricky: "", digraph: "", pseudo: "nonsense words", blending: "" },
  { id: "twinkl", name: "Twinkl Phonics", tricky: "tricky words", digraph: "", pseudo: "nonsense words", blending: "" },
];

/** The id the form uses for a scheme typed in by hand. */
export const OTHER_SCHEME = "other";

/** The longest scheme name accepted from the form's "Other" box. */
const MAX_OTHER = 60;

export function phonicsScheme(id: unknown): PhonicsScheme | null {
  return PHONICS_SCHEMES.find((s) => s.id === id) ?? null;
}

/**
 * The scheme's name for the page and the prompt: a known scheme's, or the
 * teacher's own typed name, cleaned to plain words and capped. "" for none.
 */
export function schemeName(id: unknown, other?: unknown): string {
  const known = phonicsScheme(id);
  if (known) return known.name;
  if (id !== OTHER_SCHEME || typeof other !== "string") return "";
  return other.replace(/[^\p{L}\p{N} .,'&()+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_OTHER).trim();
}

/** The line the prompt gives about the scheme, or "" when none was named. */
export function schemePromptLine(id: unknown, other?: unknown): string {
  const name = schemeName(id, other);
  if (!name) return "";
  const s = phonicsScheme(id);
  const terms = s
    ? [
        s.tricky ? `call words that cannot yet be decoded "${s.tricky}"` : "do not use a \"tricky words\" label; describe such words as having an unusual spelling",
        s.digraph ? `call two letters that make one sound "${s.digraph}"` : "",
        `call made-up words "${s.pseudo}"`,
        s.blending ? `call oral blending "${s.blending}"` : "",
      ].filter(Boolean)
    : [];
  return (
    `The school teaches phonics with ${name}. Write everything as extra practice that sits alongside that scheme` +
    (terms.length ? `, using its words: ${terms.join("; ")}.` : ", using its words where you know them.") +
    " Never reproduce the scheme's own texts, rhymes, mnemonics, characters or pictures, and never claim the resource is part of the scheme."
  );
}

/** The note at the top of the page when a scheme was named. */
export function schemeNote(id: unknown, other?: unknown): string {
  const name = schemeName(id, other);
  return name ? `Extra practice to use alongside ${name}. It is not part of the scheme, so check the sounds and words match where your class is in it.` : "";
}
