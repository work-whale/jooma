/** A word as it goes into a grid: capitals A to Z only. Accents are dropped
 *  and spaces, hyphens and apostrophes removed ("Water cycle" is WATERCYCLE). */
export function gridLetters(word: string): string {
  return word
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
