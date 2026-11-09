/** Letters that carry no separable accent, so the NFD step below cannot reduce
 *  them to A to Z, spelt out the way crosswords in those languages do. Before
 *  this they were deleted outright, so Polish "łódź" went in as ODZ and German
 *  "Straße" as STRAE. English words never contain them, so English grids are
 *  unchanged. */
const SPELT_OUT: Record<string, string> = {
  ß: "SS", ẞ: "SS",
  Æ: "AE", æ: "AE",
  Œ: "OE", œ: "OE",
  Ø: "O", ø: "O",
  Ł: "L", ł: "L",
  Đ: "D", đ: "D",
  Ð: "D", ð: "D",
  Þ: "TH", þ: "TH",
  ı: "I",
};
const SPELT_OUT_RE = new RegExp(`[${Object.keys(SPELT_OUT).join("")}]`, "g");

/** A word as it goes into a grid: capitals A to Z only. Accents are dropped
 *  (é is E, ñ is N, the usual convention in French and Spanish crosswords),
 *  letters with no accent to drop are spelt out (ł is L, ß is SS), and spaces,
 *  hyphens and apostrophes removed ("Water cycle" is WATERCYCLE). */
export function gridLetters(word: string): string {
  return word
    .replace(SPELT_OUT_RE, (c) => SPELT_OUT[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/** The length pattern a crossword clue ends with: "(5)", or "(5,5)" for two
 *  words. */
export function enumeration(answer: string): string {
  const parts = answer
    .split(/[\s]+/)
    .map((w) => gridLetters(w).length)
    .filter((n) => n > 0);
  return parts.length ? `(${parts.join(",")})` : "";
}
