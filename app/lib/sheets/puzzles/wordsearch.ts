// Builds a word search from a list of words. Pure and seeded: the same words,
// level and seed always give the same grid.
//
//   easy    8 x 8,  across and down only,                    up to 8 words
//   medium  12 x 12, across, down and diagonally down-right, up to 12 words
//   hard    15 x 15, all eight directions, backwards too,     up to 15 words
//
// The grid grows to fit the longest word, up to 15. A word that is too long,
// a repeat, or one that will not fit goes into `skipped` for the editor to
// show, rather than being placed badly.

import { seeded, shuffle } from "@/app/lib/seeded-random";
import type { PuzzleLevel, WordPlacement } from "../types";
import { gridLetters } from "./letters";

export const MAX_GRID = 15;

type Dir = [-1 | 0 | 1, -1 | 0 | 1];

const ACROSS: Dir = [0, 1];
const DOWN: Dir = [1, 0];
const DIAGONAL: Dir = [1, 1];
const ALL: Dir[] = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];

export const WORD_SEARCH_LEVELS: Record<PuzzleLevel, { size: number; maxWords: number; dirs: Dir[] }> = {
  easy: { size: 8, maxWords: 8, dirs: [ACROSS, DOWN] },
  medium: { size: 12, maxWords: 12, dirs: [ACROSS, DOWN, DIAGONAL] },
  hard: { size: MAX_GRID, maxWords: 15, dirs: ALL },
};

export interface WordSearchGrid {
  grid: string[];
  placements: WordPlacement[];
  skipped: string[];
}

export function buildWordSearch(words: string[], level: PuzzleLevel, seed: number): WordSearchGrid {
  const cfg = WORD_SEARCH_LEVELS[level];
  const random = seeded(`ws:${seed}:${level}:${words.join("|")}`);
  const skipped: string[] = [];

  // Usable words, in the teacher's order, each once.
  const seen = new Set<string>();
  const usable: { word: string; letters: string }[] = [];
  for (const word of words) {
    const letters = gridLetters(word);
    if (letters.length < 2 || letters.length > MAX_GRID || seen.has(letters) || usable.length >= cfg.maxWords) {
      skipped.push(word);
      continue;
    }
    seen.add(letters);
    usable.push({ word, letters });
  }

  const size = Math.min(MAX_GRID, Math.max(cfg.size, ...usable.map((u) => u.letters.length)));
  const cells: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  const placements: WordPlacement[] = [];

  // Longest first: they are the hardest to fit.
  const order = [...usable].sort((a, b) => b.letters.length - a.letters.length);
  for (const { word, letters } of order) {
    const options: { row: number; col: number; dir: Dir; overlap: number }[] = [];
    for (const dir of cfg.dirs) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const endR = row + dir[0] * (letters.length - 1);
          const endC = col + dir[1] * (letters.length - 1);
          if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
          let overlap = 0;
          let fits = true;
          for (let i = 0; i < letters.length; i++) {
            const cell = cells[row + dir[0] * i][col + dir[1] * i];
            if (cell === null) continue;
            if (cell !== letters[i]) { fits = false; break; }
            overlap++;
          }
          // Never wholly on top of another word.
          if (fits && overlap < letters.length) options.push({ row, col, dir, overlap });
        }
      }
    }
    if (options.length === 0) {
      skipped.push(word);
      continue;
    }
    // A random fit, leaning towards sharing a letter now and then, which
    // makes a grid feel made rather than scattered.
    const shuffled = shuffle(options, random);
    const crossing = shuffled.find((o) => o.overlap > 0);
    const pick = crossing && random() < 0.35 ? crossing : shuffled[0];
    for (let i = 0; i < letters.length; i++) cells[pick.row + pick.dir[0] * i][pick.col + pick.dir[1] * i] = letters[i];
    placements.push({ word, row: pick.row, col: pick.col, dr: pick.dir[0], dc: pick.dir[1] });
  }

  const A = "A".charCodeAt(0);
  const grid = cells.map((row) => row.map((c) => c ?? String.fromCharCode(A + Math.floor(random() * 26))).join(""));

  // Placements back in the teacher's word order, so the list and the answers
  // read the same way round.
  const rank = new Map(words.map((w, i) => [w, i]));
  placements.sort((a, b) => (rank.get(a.word) ?? 0) - (rank.get(b.word) ?? 0));
  return { grid, placements, skipped };
}

/** The cells a placed word covers, as "row,col". */
export function placementCells(p: WordPlacement): string[] {
  const n = gridLetters(p.word).length;
  return Array.from({ length: n }, (_, i) => `${p.row + p.dr * i},${p.col + p.dc * i}`);
}

const DIR_NAME: Record<string, string> = {
  "0,1": "across", "1,0": "down", "1,1": "diagonally down", "-1,1": "diagonally up",
  "0,-1": "backwards", "-1,0": "up", "-1,-1": "diagonally up and back", "1,-1": "diagonally down and back",
};

export function directionName(p: WordPlacement): string {
  return DIR_NAME[`${p.dr},${p.dc}`] ?? "";
}
