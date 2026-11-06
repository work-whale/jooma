// Puzzle blocks: the grids built from what the model (or the teacher) wrote.
//
// A word search or crossword stores its grid with a `key` naming what it was
// built from. refreshPuzzle rebuilds only when the key no longer matches: a
// word was edited, the level changed, or Shuffle bumped the seed. A saved
// sheet therefore keeps its exact grid, even if the builders change later.

import { hashString, seeded, shuffle } from "@/app/lib/seeded-random";
import type { CrosswordQuestion, SheetBlock, SortQuestion, WordSearchQuestion } from "../types";
import { buildCrossword } from "./crossword";
import { buildWordSearch } from "./wordsearch";

export function wordSearchKey(b: Pick<WordSearchQuestion, "words" | "level" | "seed">): string {
  return hashString(JSON.stringify(["ws", b.level, b.seed, b.words]));
}

export function crosswordKey(b: Pick<CrosswordQuestion, "entries" | "seed">): string {
  return hashString(JSON.stringify(["cw", b.seed, b.entries.map((e) => [e.clue, e.answer])]));
}

/** The block with its grid built, when it is a puzzle whose grid is missing
 *  or out of date. Anything else comes back as it is. */
export function refreshPuzzle<T extends SheetBlock>(block: T): T {
  if (block.type === "wordsearch") {
    const key = wordSearchKey(block);
    if (block.key === key && Array.isArray(block.grid) && block.grid.length) return block;
    return { ...block, key, ...buildWordSearch(block.words, block.level, block.seed) };
  }
  if (block.type === "crossword") {
    const key = crosswordKey(block);
    if (block.key === key && Array.isArray(block.placed)) return block;
    return { ...block, key, ...buildCrossword(block.entries, block.seed) };
  }
  return block;
}

/** Every item of a sorting question, shuffled into one bank by its seed. */
export function sortBank(q: Pick<SortQuestion, "categories" | "seed">): string[] {
  return shuffle(q.categories.flatMap((c) => c.items), seeded(`sort:${q.seed}`));
}

/** How many blank lines each column gets: the same in every column, so the
 *  page does not give away how many items each group has. */
export function sortRows(q: Pick<SortQuestion, "categories">): number {
  return Math.max(1, ...q.categories.map((c) => c.items.length));
}

export { buildCrossword, crosswordCells, crosswordNumbers, clueText, MAX_CROSSWORD, MAX_ENTRIES } from "./crossword";
export { buildWordSearch, placementCells, directionName, WORD_SEARCH_LEVELS, MAX_GRID } from "./wordsearch";
export { gridLetters, enumeration } from "./letters";
export { puzzleLevel, crosswordWordBank, puzzleDefaults, puzzleDefaultsFromSubtitle, type PuzzleDefaults } from "./level";
