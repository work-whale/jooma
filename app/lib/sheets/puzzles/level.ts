// How hard a puzzle is, from the year group and the differentiation band.
//
// Nursery to Year 2 get easy grids, Years 3 to 6 medium, Year 7 and up hard.
// A WBS or WTS version is one step easier, a GDS version one step harder.
// The crossword's word bank is for the younger end, and for the pupils a
// WBS or WTS version is written for.

import { PUZZLE_LEVELS, type PuzzleLevel } from "../types";

export interface PuzzleDefaults {
  level: PuzzleLevel;
  wordBank: boolean;
  seed?: number;
}

function yearIndex(yearGroup: string | undefined | null): number | null {
  if (!yearGroup) return null;
  if (/nursery/i.test(yearGroup)) return -1;
  if (/reception/i.test(yearGroup)) return 0;
  const m = yearGroup.match(/Year (\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

const easier = (band: string | undefined | null) => band === "WBS" || band === "WTS";
const harder = (band: string | undefined | null) => band === "GDS";

export function puzzleLevel(yearGroup: string | undefined | null, band?: string | null): PuzzleLevel {
  const y = yearIndex(yearGroup);
  const base = y === null ? 1 : y <= 2 ? 0 : y <= 6 ? 1 : 2;
  const step = easier(band) ? -1 : harder(band) ? 1 : 0;
  return PUZZLE_LEVELS[Math.min(2, Math.max(0, base + step))];
}

export function crosswordWordBank(yearGroup: string | undefined | null, band?: string | null): boolean {
  if (easier(band)) return true;
  const y = yearIndex(yearGroup);
  return y !== null && y <= 4;
}

export function puzzleDefaults(yearGroup: string | undefined | null, band?: string | null): PuzzleDefaults {
  return { level: puzzleLevel(yearGroup, band), wordBank: crosswordWordBank(yearGroup, band) };
}

/** The defaults for a sheet already made, read from its subtitle
 *  ("Year 5 · Maths"): for a puzzle the teacher or Jo adds afterwards. */
export function puzzleDefaultsFromSubtitle(subtitle: string): PuzzleDefaults {
  const year = subtitle.split("·")[0]?.trim() ?? "";
  return puzzleDefaults(year);
}
