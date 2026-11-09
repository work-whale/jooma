import { test, expect } from "@playwright/test";
import {
  buildCrossword,
  buildWordSearch,
  crosswordCells,
  gridLetters,
  enumeration,
  placementCells,
  puzzleDefaults,
  puzzleDefaultsFromSubtitle,
  refreshPuzzle,
  sortBank,
  sortRows,
  WORD_SEARCH_LEVELS,
} from "@/app/lib/sheets/puzzles";
import { normalizeBlock, normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { newBlock, updateBlock } from "@/app/lib/sheets/edit";
import { answerText, sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { sheetSnapshot, applySheetOp } from "@/app/lib/jo/sheet-ops";
import { worksheetRequest } from "@/app/lib/worksheet-prompt";
import type { CrosswordQuestion, SheetDoc, SortQuestion, WordPlacement, WordSearchQuestion } from "@/app/lib/sheets/types";

/*
 * Puzzle blocks: sorting, word search and crossword. The model writes the
 * words; app/lib/sheets/puzzles builds the grids, seeded so the same words
 * always give the same grid, and stores them so a saved sheet never changes.
 */

const SPACE = ["planet", "orbit", "comet", "star", "moon", "sun", "galaxy", "meteor", "asteroid", "telescope", "gravity", "rocket"];

function readWord(grid: string[], p: WordPlacement): string {
  return placementCells(p).map((k) => { const [r, c] = k.split(",").map(Number); return grid[r][c]; }).join("");
}

test.describe("word search", () => {
  for (const level of ["easy", "medium", "hard"] as const) {
    test(`${level}: every placed word reads in the grid, in its allowed directions, and every square is a capital`, () => {
      const cfg = WORD_SEARCH_LEVELS[level];
      const { grid, placements, skipped } = buildWordSearch(SPACE, level, 7);
      expect(grid.length).toBeGreaterThanOrEqual(cfg.size);
      for (const row of grid) {
        expect(row).toHaveLength(grid.length);
        expect(row).toMatch(/^[A-Z]+$/);
      }
      expect(placements.length + skipped.length).toBe(SPACE.length);
      expect(placements.length).toBeLessThanOrEqual(cfg.maxWords);
      for (const p of placements) {
        expect(readWord(grid, p), p.word).toBe(gridLetters(p.word));
        expect(cfg.dirs.some(([dr, dc]) => dr === p.dr && dc === p.dc), `${p.word} ${p.dr},${p.dc}`).toBe(true);
      }
    });
  }

  test("easy grids never run diagonally or backwards", () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const p of buildWordSearch(SPACE.slice(0, 8), "easy", seed).placements) {
        expect(p.dr >= 0 && p.dc >= 0 && !(p.dr === 1 && p.dc === 1)).toBe(true);
      }
    }
  });

  test("the grid grows to fit the longest word, never past 15, and a longer word is skipped", () => {
    const grown = buildWordSearch(["photosynthesis", "leaf"], "easy", 1);
    expect(grown.grid).toHaveLength(14);
    expect(grown.placements.map((p) => p.word)).toEqual(["photosynthesis", "leaf"]);
    const tooLong = buildWordSearch(["electromagnetism", "leaf"], "hard", 1);
    expect(tooLong.grid).toHaveLength(15);
    expect(tooLong.skipped).toEqual(["electromagnetism"]);
  });

  test("phrases lose their spaces in the grid but keep them in the list", () => {
    const { grid, placements } = buildWordSearch(["water cycle", "rain"], "medium", 3);
    const p = placements.find((x) => x.word === "water cycle")!;
    expect(readWord(grid, p)).toBe("WATERCYCLE");
  });

  test("the same words and seed give the same grid; another seed gives another", () => {
    expect(buildWordSearch(SPACE, "medium", 4)).toEqual(buildWordSearch(SPACE, "medium", 4));
    expect(buildWordSearch(SPACE, "medium", 4).grid).not.toEqual(buildWordSearch(SPACE, "medium", 5).grid);
  });
});

/** Every rule a crossword must keep, checked on the filled grid. */
function checkCrossword(layout: ReturnType<typeof buildCrossword>) {
  const cells = crosswordCells(layout);
  expect(layout.width).toBeLessThanOrEqual(15);
  expect(layout.height).toBeLessThanOrEqual(15);
  const owner = new Map<string, number>();
  layout.placed.forEach((p, i) => {
    for (let k = 0; k < p.letters.length; k++) {
      const r = p.row + (p.dir === "down" ? k : 0);
      const c = p.col + (p.dir === "across" ? k : 0);
      // Crossings agree.
      expect(cells[r][c]).toBe(p.letters[k]);
      owner.set(`${r},${c}`, (owner.get(`${r},${c}`) ?? 0) | (1 << i));
    }
    // Nothing runs on from either end.
    const [dr, dc] = p.dir === "across" ? [0, 1] : [1, 0];
    expect(cells[p.row - dr]?.[p.col - dc] ?? null).toBeNull();
    expect(cells[p.row + dr * p.letters.length]?.[p.col + dc * p.letters.length] ?? null).toBeNull();
  });
  // Every run of two or more letters, across or down, is an answer: no two
  // answers lie side by side to make a word that is not one.
  const runs = new Set(layout.placed.map((p) => `${p.dir}:${p.row},${p.col}:${p.letters}`));
  for (const dir of ["across", "down"] as const) {
    for (let a = 0; a < (dir === "across" ? layout.height : layout.width); a++) {
      let start = -1;
      let word = "";
      const lim = dir === "across" ? layout.width : layout.height;
      for (let b = 0; b <= lim; b++) {
        const ch = b < lim ? (dir === "across" ? cells[a][b] : cells[b][a]) : null;
        if (ch) { if (start < 0) start = b; word += ch; continue; }
        if (word.length >= 2) {
          const key = dir === "across" ? `${dir}:${a},${start}:${word}` : `${dir}:${start},${a}:${word}`;
          expect(runs.has(key), `stray ${key}`).toBe(true);
        }
        start = -1; word = "";
      }
    }
  }
  // All connected.
  const filled = [...owner.keys()];
  const seen = new Set([filled[0]]);
  const queue = [filled[0]];
  while (queue.length) {
    const [r, c] = queue.pop()!.split(",").map(Number);
    for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      const k = `${nr},${nc}`;
      if (owner.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
    }
  }
  expect(seen.size).toBe(filled.length);
}

test.describe("crossword", () => {
  const ENTRIES = [
    { clue: "The star our planet goes round", answer: "sun" },
    { clue: "It goes round the Earth", answer: "moon" },
    { clue: "The path a planet takes", answer: "orbit" },
    { clue: "Our home planet", answer: "Earth" },
    { clue: "An icy body with a tail", answer: "comet" },
    { clue: "A pull between masses", answer: "gravity" },
    { clue: "A huge group of stars", answer: "galaxy" },
    { clue: "It carries astronauts", answer: "rocket" },
  ];

  test("places the answers by the rules: crossings agree, nothing touches side by side, all connected, within 15 by 15", () => {
    for (let seed = 0; seed < 15; seed++) {
      const layout = buildCrossword(ENTRIES, seed);
      expect(layout.placed.length).toBeGreaterThanOrEqual(6);
      checkCrossword(layout);
    }
  });

  test("numbers the start squares in reading order, shared by an across and a down that start together", () => {
    const layout = buildCrossword(ENTRIES, 2);
    const starts = [...new Map(layout.placed.map((p) => [`${p.row},${p.col}`, p])).values()].sort((a, b) => a.row - b.row || a.col - b.col);
    expect(starts.map((p) => p.number)).toEqual(starts.map((_, i) => i + 1));
    expect(layout.placed.filter((p) => p.dir === "across").map((p) => p.number)).toEqual(
      [...layout.placed.filter((p) => p.dir === "across").map((p) => p.number)].sort((a, b) => a - b),
    );
  });

  test("an answer with no letter in common with the rest is left unplaced, not forced in", () => {
    const layout = buildCrossword([{ clue: "a", answer: "abc" }, { clue: "b", answer: "cab" }, { clue: "c", answer: "xyz" }], 1);
    expect(layout.unplaced).toEqual(["xyz"]);
    checkCrossword(layout);
  });

  test("is the same for the same entries and seed", () => {
    expect(buildCrossword(ENTRIES, 9)).toEqual(buildCrossword(ENTRIES, 9));
  });

  test("a two word answer shows its length pattern", () => {
    expect(enumeration("water cycle")).toBe("(5,5)");
    expect(enumeration("Earth")).toBe("(5)");
  });
});

test.describe("sorting", () => {
  const q = { categories: [{ name: "Solid", items: ["ice", "wood", "rock"] }, { name: "Liquid", items: ["water", "milk"] }], seed: 3 };

  test("the bank holds every item once, shuffled by the seed", () => {
    const bank = sortBank(q);
    expect([...bank].sort()).toEqual(["ice", "milk", "rock", "water", "wood"]);
    expect(sortBank(q)).toEqual(bank);
  });

  test("every column gets as many lines as the biggest group, so the page gives nothing away", () => {
    expect(sortRows(q)).toBe(3);
  });
});

test.describe("levels", () => {
  test("follow the year group, and a band moves them a step", () => {
    expect(puzzleDefaults("Year 1").level).toBe("easy");
    expect(puzzleDefaults("Year 4").level).toBe("medium");
    expect(puzzleDefaults("Year 9").level).toBe("hard");
    expect(puzzleDefaults("Mixed").level).toBe("medium");
    expect(puzzleDefaults("Year 4", "WBS").level).toBe("easy");
    expect(puzzleDefaults("Year 4", "GDS").level).toBe("hard");
    expect(puzzleDefaults("Year 9", "GDS").level).toBe("hard");
    expect(puzzleDefaults("Reception", "WTS").level).toBe("easy");
  });

  test("the crossword word bank is for Nursery to Year 4, and for WBS and WTS versions", () => {
    expect(puzzleDefaults("Nursery").wordBank).toBe(true);
    expect(puzzleDefaults("Year 4").wordBank).toBe(true);
    expect(puzzleDefaults("Year 5").wordBank).toBe(false);
    expect(puzzleDefaults("Year 8", "WTS").wordBank).toBe(true);
    expect(puzzleDefaults("Year 8", "GDS").wordBank).toBe(false);
  });

  test("a sheet already made gives its year through its subtitle", () => {
    expect(puzzleDefaultsFromSubtitle("Year 2 · Science").level).toBe("easy");
    expect(puzzleDefaultsFromSubtitle("Mixed years · Science").level).toBe("medium");
  });
});

test.describe("normalising", () => {
  const draft = {
    title: "Space",
    sections: [{
      title: "Puzzles",
      blocks: [
        { type: "wordsearch", prompt: "Find the words.", words: SPACE.slice(0, 6), marks: 3 },
        { type: "crossword", prompt: "Fill it in.", entries: [{ clue: "Our star", answer: "sun" }, { clue: "Earth's satellite", answer: "moon" }, { clue: "", answer: "nope" }], marks: 2 },
        { type: "sort", prompt: "Sort them.", categories: [{ name: "Planets", items: ["Mars", "Venus", "mars"] }, { name: "Stars", items: ["Sun", "Mars", "Sirius"] }, { name: "", items: [] }], marks: 5 },
      ],
    }],
  };

  test("the year and band set the level and word bank; the grids are built and keyed", () => {
    const y2 = normalizeDraft(draft, sheetContext("worksheet", { yearGroup: "Year 2", subject: "Science" }));
    const ws = y2.sections[0].blocks[0] as WordSearchQuestion;
    const cw = y2.sections[0].blocks[1] as CrosswordQuestion;
    expect(ws.level).toBe("easy");
    expect(ws.grid).toHaveLength(8);
    expect(ws.key).not.toBe("");
    expect(cw.wordBank).toBe(true);
    expect(cw.entries).toHaveLength(2);
    expect(cw.placed.length).toBeGreaterThan(0);

    const y9gds = normalizeDraft(draft, sheetContext("worksheet", { yearGroup: "Year 9", subject: "Science", band: "GDS" }));
    expect((y9gds.sections[0].blocks[0] as WordSearchQuestion).grid).toHaveLength(15);
    expect((y9gds.sections[0].blocks[1] as CrosswordQuestion).wordBank).toBe(false);
  });

  test("a sorting question keeps each item once, in the first group to list it, and drops empty groups", () => {
    const doc = normalizeDraft(draft, sheetContext("worksheet", { yearGroup: "Year 4" }));
    const sort = doc.sections[0].blocks[2] as SortQuestion;
    expect(sort.categories).toEqual([{ name: "Planets", items: ["Mars", "Venus"] }, { name: "Stars", items: ["Sun", "Sirius"] }]);
  });

  test("the same streamed draft gives the same grid every time it is normalised", () => {
    const ctx = sheetContext("worksheet", { yearGroup: "Year 5" });
    expect(normalizeDraft(draft, ctx)).toEqual(normalizeDraft(draft, ctx));
  });

  test("a saved grid is kept as it is while its key matches, and rebuilt once its words change", () => {
    const doc = normalizeDraft(draft, sheetContext("worksheet", { yearGroup: "Year 5" }));
    const saved = doc.sections[0].blocks[0] as WordSearchQuestion;
    // A grid saved by an older builder: same key, different letters. Kept.
    const older = { ...saved, grid: saved.grid.map((r) => r.toLowerCase()) };
    expect((normalizeBlock(older, older.id) as WordSearchQuestion).grid).toEqual(older.grid);
    expect(refreshPuzzle(older)).toBe(older);
    // An edited word list: rebuilt, and the new word is in the grid.
    const edited = updateBlock(doc, 0, 0, { words: [...saved.words, "nebula"] });
    const after = edited.sections[0].blocks[0] as WordSearchQuestion;
    expect(after.key).not.toBe(saved.key);
    expect(after.placements.map((p) => p.word)).toContain("nebula");
  });

  test("Shuffle (a new seed) and Harder (a new level) rebuild the grid; the crossword word bank toggle does not", () => {
    const doc = normalizeDraft(draft, sheetContext("worksheet", { yearGroup: "Year 5" }));
    const ws = doc.sections[0].blocks[0] as WordSearchQuestion;
    const cw = doc.sections[0].blocks[1] as CrosswordQuestion;
    expect((updateBlock(doc, 0, 0, { seed: ws.seed + 1 }).sections[0].blocks[0] as WordSearchQuestion).grid).not.toEqual(ws.grid);
    expect((updateBlock(doc, 0, 0, { level: "hard" }).sections[0].blocks[0] as WordSearchQuestion).grid).toHaveLength(15);
    const toggled = updateBlock(doc, 0, 1, { wordBank: !cw.wordBank }).sections[0].blocks[1] as CrosswordQuestion;
    expect(toggled.placed).toBe(cw.placed);
  });

  test("a new puzzle from the editor is pitched to the sheet's year", () => {
    expect((newBlock("wordsearch", puzzleDefaultsFromSubtitle("Year 1 · English")) as WordSearchQuestion).grid).toHaveLength(8);
    expect((newBlock("crossword", puzzleDefaultsFromSubtitle("Year 3 · English")) as CrosswordQuestion).wordBank).toBe(true);
  });
});

test.describe("exports and Jo", () => {
  function doc(): SheetDoc {
    return normalizeDraft(
      {
        title: "Space",
        sections: [{
          title: "Puzzles",
          blocks: [
            { type: "sort", prompt: "Sort them.", categories: [{ name: "Planets", items: ["Mars", "Venus"] }, { name: "Stars", items: ["Sun", "Sirius"] }], marks: 4 },
            { type: "wordsearch", prompt: "Find the words.", words: ["moon", "star", "comet"], marks: 2 },
            { type: "crossword", prompt: "Fill it in.", entries: [{ clue: "Our star", answer: "sun" }, { clue: "Earth's satellite", answer: "moon" }, { clue: "Path round the Sun", answer: "orbit" }], marks: 3 },
          ],
        }],
      },
      sheetContext("worksheet", { yearGroup: "Year 6", subject: "Science" }),
    );
  }

  test("each puzzle has an answer for the answers page", () => {
    const [sort, ws, cw] = doc().sections[0].blocks as [SortQuestion, WordSearchQuestion, CrosswordQuestion];
    expect(answerText(sort)).toBe("Planets: Mars, Venus; Stars: Sun, Sirius");
    for (const w of ["moon", "star", "comet"]) expect(answerText(ws)).toContain(w);
    for (const p of cw.placed) expect(answerText(cw)).toContain(`${p.number} ${p.dir}: ${p.answer}`);
  });

  test("Copy gives the grid, the clues and the sort table as text", () => {
    const md = sheetToMarkdown(doc());
    expect(md).toContain("**Sort these:**");
    expect(md).toContain("| Planets | Stars |");
    expect(md).toContain("**Find:** moon, star, comet");
    expect(md).toContain("**Across**");
    expect(md).toMatch(/```\n([A-Z] ){7,}[A-Z]\n/);
  });

  test("a Word document builds with every puzzle in it", async () => {
    const blob = await buildSheetDocx(doc());
    expect(blob.size).toBeGreaterThan(2000);
  });

  test("Jo sees the words, never the grids, and a rewrite keeps the puzzle's level", () => {
    const d = doc();
    const snap = JSON.stringify(sheetSnapshot(d));
    for (const field of ["\"grid\"", "\"placements\"", "\"placed\"", "\"key\""]) expect(snap).not.toContain(field);
    expect(snap).toContain("\"words\":[\"moon\",\"star\",\"comet\"]");

    const ws = d.sections[0].blocks[1] as WordSearchQuestion;
    const hard = { ...d, sections: [{ ...d.sections[0], blocks: d.sections[0].blocks.map((b) => (b.id === ws.id ? refreshPuzzle({ ...ws, level: "hard" as const }) : b)) }] };
    const applied = applySheetOp(hard, { op: "replaceBlock", label: "", blockId: ws.id, block: { type: "wordsearch", prompt: "Find them.", words: ["moon", "sun", "mars"], marks: 2 } });
    const rewritten = applied!.doc.sections[0].blocks[1] as WordSearchQuestion;
    expect(rewritten.level).toBe("hard");
    expect(rewritten.grid).toHaveLength(15);
    expect(rewritten.placements.map((p) => p.word)).toEqual(["moon", "sun", "mars"]);
  });

  test("the worksheet prompt explains a puzzle only when one is on offer", () => {
    const base = { curriculum: "2014 National Curriculum", yearGroup: "Year 4", subject: "Science", learningObjective: "Space" };
    const user = (types: string[]) => {
      const built = worksheetRequest({ ...base, questionTypes: types });
      if ("error" in built) throw new Error(built.error);
      return built.messages[1].content;
    };
    expect(user([])).not.toMatch(/- (sort|wordsearch|crossword):/);
    const p = user(["Word Search", "Crossword"]);
    expect(p).toContain("- wordsearch:");
    expect(p).toContain("- crossword:");
    expect(p).not.toContain("- sort:");
    expect(p).toContain("never write a grid");
  });

  test("a sheet with puzzles survives a save and a reload exactly", () => {
    const d = doc();
    expect(JSON.parse(serializeSheet(d))).toEqual(d);
  });
});

/* ── Words in other languages (generation languages, 2026-11-08) ─────────── */

test("gridLetters: English words are exactly as they always were", () => {
  expect(gridLetters("Water cycle")).toBe("WATERCYCLE");
  expect(gridLetters("photosynthesis")).toBe("PHOTOSYNTHESIS");
  expect(gridLetters("rock-pool")).toBe("ROCKPOOL");
  expect(gridLetters("don't")).toBe("DONT");
  expect(gridLetters("café")).toBe("CAFE");
  expect(gridLetters("naïve")).toBe("NAIVE");
  expect(gridLetters("x²")).toBe("X");
});

test("gridLetters: accents drop, letters with no accent to drop are spelt out, nothing is lost", () => {
  // Accents drop, as French and Spanish crosswords do.
  expect(gridLetters("évaporation")).toBe("EVAPORATION");
  expect(gridLetters("niño")).toBe("NINO");
  expect(gridLetters("Größe")).toBe("GROSSE");
  expect(gridLetters("Ökosystem")).toBe("OKOSYSTEM");
  expect(gridLetters("öö")).toBe("OO");
  // These used to vanish entirely.
  expect(gridLetters("łódź")).toBe("LODZ");
  expect(gridLetters("Straße")).toBe("STRASSE");
  expect(gridLetters("cœur")).toBe("COEUR");
  expect(gridLetters("Ærø")).toBe("AERO");
  // Every letter of a word in a Chalkie language survives as at least one grid letter.
  for (const w of ["pszczoła", "źdźbło", "sääsk", "jõgi", "fotossíntese", "ação", "över", "città"]) {
    const letters = w.replace(/[^\p{L}]/gu, "").length;
    expect(gridLetters(w).length, w).toBeGreaterThanOrEqual(letters);
  }
});

test("a word search with Polish words places every word, read back as its grid letters", () => {
  const words = ["pszczoła", "łąka", "źdźbło", "kwiat", "miód", "ul"];
  const { grid, placements } = buildWordSearch(words, "easy", 3);
  expect(placements.length).toBe(words.length);
  for (const p of placements) expect(readWord(grid, p), p.word).toBe(gridLetters(p.word));
  // The grid itself is still plain A to Z.
  expect(grid.join("")).toMatch(/^[A-Z]+$/);
});
