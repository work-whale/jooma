// Lays out a crossword from clue and answer pairs. Pure and seeded: the same
// entries and seed always give the same grid.
//
// Greedy, the way people build small crosswords by hand: the longest answer
// goes across, then each next answer goes where it crosses the most letters
// already down, never lying alongside another answer. That is tried with
// several orderings and the best kept: the most answers placed, then the
// smallest grid. Answers that cannot cross anything are left in `unplaced`
// for the editor to show. The grid is never wider or taller than 15.

import { seeded } from "@/app/lib/seeded-random";
import type { CrosswordEntry } from "../types";
import { enumeration, gridLetters } from "./letters";

export const MAX_CROSSWORD = 15;
export const MAX_ENTRIES = 12;
const ATTEMPTS = 24;

export interface CrosswordLayout {
  width: number;
  height: number;
  placed: CrosswordEntry[];
  unplaced: string[];
}

interface Item { clue: string; answer: string; letters: string }
interface Placed extends Item { row: number; col: number; dir: "across" | "down" }

class Board {
  cells = new Map<string, { letter: string; across: boolean; down: boolean }>();
  minR = 0; maxR = -1; minC = 0; maxC = -1;
  placed: Placed[] = [];

  at(r: number, c: number) { return this.cells.get(`${r},${c}`); }

  /** Crossings if the word fits here without breaking a rule, else -1. */
  score(letters: string, r: number, c: number, dir: "across" | "down"): number {
    const [dr, dc] = dir === "across" ? [0, 1] : [1, 0];
    // Nothing touching either end.
    if (this.at(r - dr, c - dc) || this.at(r + dr * letters.length, c + dc * letters.length)) return -1;
    let crossings = 0;
    for (let i = 0; i < letters.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cell = this.at(rr, cc);
      if (cell) {
        // A crossing: same letter, and the square is not already part of an
        // answer running this way.
        if (cell.letter !== letters[i] || (dir === "across" ? cell.across : cell.down)) return -1;
        crossings++;
      } else if (this.at(rr + dc, cc + dr) || this.at(rr - dc, cc - dr)) {
        // A new square with a neighbour at its side would make a word that
        // is not an answer.
        return -1;
      }
    }
    const minR = Math.min(this.minR, r);
    const maxR = Math.max(this.maxR, r + dr * (letters.length - 1));
    const minC = Math.min(this.minC, c);
    const maxC = Math.max(this.maxC, c + dc * (letters.length - 1));
    if (this.placed.length && (maxR - minR + 1 > MAX_CROSSWORD || maxC - minC + 1 > MAX_CROSSWORD)) return -1;
    return crossings;
  }

  put(item: Item, r: number, c: number, dir: "across" | "down") {
    const [dr, dc] = dir === "across" ? [0, 1] : [1, 0];
    for (let i = 0; i < item.letters.length; i++) {
      const key = `${r + dr * i},${c + dc * i}`;
      const cell = this.cells.get(key) ?? { letter: item.letters[i], across: false, down: false };
      if (dir === "across") cell.across = true; else cell.down = true;
      this.cells.set(key, cell);
    }
    if (this.placed.length === 0) { this.minR = r; this.maxR = r; this.minC = c; this.maxC = c; }
    this.minR = Math.min(this.minR, r);
    this.maxR = Math.max(this.maxR, r + dr * (item.letters.length - 1));
    this.minC = Math.min(this.minC, c);
    this.maxC = Math.max(this.maxC, c + dc * (item.letters.length - 1));
    this.placed.push({ ...item, row: r, col: c, dir });
  }

  area() { return (this.maxR - this.minR + 1) * (this.maxC - this.minC + 1); }
}

function attempt(items: Item[], random: () => number): Board {
  const board = new Board();
  const [first, ...rest] = items;
  if (!first || first.letters.length > MAX_CROSSWORD) return board;
  board.put(first, 0, 0, "across");
  let pending = rest;
  // Go round until nothing more will go in: a word that could not cross
  // anything early on may cross a later one.
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    const left: Item[] = [];
    for (const item of pending) {
      let best: { r: number; c: number; dir: "across" | "down"; score: number } | null = null;
      for (const [key, cell] of board.cells) {
        const [cr, cc] = key.split(",").map(Number);
        for (let i = 0; i < item.letters.length; i++) {
          if (item.letters[i] !== cell.letter) continue;
          for (const dir of ["across", "down"] as const) {
            const r = dir === "down" ? cr - i : cr;
            const c = dir === "across" ? cc - i : cc;
            const crossings = board.score(item.letters, r, c, dir);
            if (crossings < 1) continue;
            const before = board.area();
            const growth = Math.max(board.maxR, r + (dir === "down" ? item.letters.length - 1 : 0)) - Math.min(board.minR, r) + 1;
            const width = Math.max(board.maxC, c + (dir === "across" ? item.letters.length - 1 : 0)) - Math.min(board.minC, c) + 1;
            const score = crossings * 100 - (growth * width - before) + random();
            if (!best || score > best.score) best = { r, c, dir, score };
          }
        }
      }
      if (best) board.put(item, best.r, best.c, best.dir);
      else left.push(item);
    }
    pending = left;
  }
  return board;
}

export function buildCrossword(entries: { clue: string; answer: string }[], seed: number): CrosswordLayout {
  const seen = new Set<string>();
  const items: Item[] = [];
  const unusable: string[] = [];
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    const letters = gridLetters(e.answer);
    if (letters.length < 2 || letters.length > MAX_CROSSWORD || seen.has(letters)) {
      unusable.push(e.answer);
      continue;
    }
    seen.add(letters);
    items.push({ clue: e.clue, answer: e.answer, letters });
  }
  if (items.length === 0) return { width: 0, height: 0, placed: [], unplaced: unusable };

  const random = seeded(`cw:${seed}:${items.map((i) => i.letters).join("|")}`);
  let best: Board | null = null;
  for (let a = 0; a < ATTEMPTS; a++) {
    // The first try is longest first; the rest jitter the order so a
    // different word leads and the crossings fall differently.
    const order = [...items]
      .map((it) => ({ it, k: it.letters.length + (a === 0 ? 0 : random() * 4) }))
      .sort((x, y) => y.k - x.k)
      .map((x) => x.it);
    const board = attempt(order, random);
    if (
      !best ||
      board.placed.length > best.placed.length ||
      (board.placed.length === best.placed.length && board.area() < best.area())
    ) best = board;
  }
  const board = best!;

  // Squares counted from the top left, and the start squares numbered in
  // reading order. An across and a down answer starting on one square share
  // its number.
  const starts = [...new Set(board.placed.map((p) => `${p.row - board.minR},${p.col - board.minC}`))]
    .map((k) => k.split(",").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numberAt = new Map(starts.map(([r, c], i) => [`${r},${c}`, i + 1]));

  const placed: CrosswordEntry[] = board.placed
    .map((p) => {
      const row = p.row - board.minR;
      const col = p.col - board.minC;
      return { number: numberAt.get(`${row},${col}`)!, dir: p.dir, row, col, letters: p.letters, answer: p.answer, clue: p.clue };
    })
    .sort((a, b) => (a.dir === b.dir ? a.number - b.number : a.dir === "across" ? -1 : 1));

  const placedLetters = new Set(placed.map((p) => p.letters));
  return {
    width: board.maxC - board.minC + 1,
    height: board.maxR - board.minR + 1,
    placed,
    unplaced: [...unusable, ...items.filter((i) => !placedLetters.has(i.letters)).map((i) => i.answer)],
  };
}

/** The filled grid: a letter per square, null where there is none. */
export function crosswordCells(layout: { width: number; height: number; placed: CrosswordEntry[] }): (string | null)[][] {
  const cells: (string | null)[][] = Array.from({ length: layout.height }, () => Array<string | null>(layout.width).fill(null));
  for (const p of layout.placed) {
    for (let i = 0; i < p.letters.length; i++) {
      const r = p.row + (p.dir === "down" ? i : 0);
      const c = p.col + (p.dir === "across" ? i : 0);
      if (cells[r]) cells[r][c] = p.letters[i];
    }
  }
  return cells;
}

/** The number printed in each start square, keyed "row,col". */
export function crosswordNumbers(placed: CrosswordEntry[]): Map<string, number> {
  return new Map(placed.map((p) => [`${p.row},${p.col}`, p.number]));
}

/** A clue as printed: the clue and its length pattern. */
export function clueText(p: CrosswordEntry): string {
  const e = enumeration(p.answer);
  return e ? `${p.clue} ${e}` : p.clue;
}
