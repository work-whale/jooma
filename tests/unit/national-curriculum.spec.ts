import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import primary from "@/app/lib/national-curriculum/data/primary.json";
import earlyYears from "@/app/lib/national-curriculum/data/early-years.json";
import {
  stageForYear,
  isCurriculumYear,
  statementsForYear,
  subjectsIn,
  strandsIn,
  statementsIn,
  type NcStatement,
} from "@/app/lib/national-curriculum";

/*
 * The curriculum the slides wizard aligns a deck to.
 *
 * ── The bug this exists for ──
 * The old picker offered the GCSE strands (Cell biology, Atomic structure...)
 * for every year, with no statements at all, so a Year 3 science deck was
 * "aligned" to KS4 biology. These tests pin the replacement to the documents:
 * the right strands for each year, the right number of statements, and every
 * statement present word for word in its source.
 *
 * Expected counts come from the documents themselves, and two of them match
 * what Chalkie shows for the same year (Year 4 Science strands, Year 4
 * fractions), which is how teachers will check us.
 */

const P = primary as unknown as { statements: NcStatement[] };
const E = earlyYears as unknown as { statements: NcStatement[] };

test.describe("which years are covered, and under which stage", () => {
  test("follows Jooma's grouping: Nursery and Reception, Years 1 to 3, Years 4 to 6", () => {
    expect(stageForYear("Nursery")).toBe("pre-key-stage");
    expect(stageForYear("Reception")).toBe("pre-key-stage");
    expect(stageForYear("Year 1")).toBe("key-stage-1");
    expect(stageForYear("Year 3")).toBe("key-stage-1");
    expect(stageForYear("Year 4")).toBe("key-stage-2");
    expect(stageForYear("Year 6")).toBe("key-stage-2");
  });

  test("years beyond Year 6 are not covered", () => {
    for (const y of ["Year 7", "Year 9", "Year 11", "Year 13", "Adult learners", "", undefined]) {
      expect(stageForYear(y)).toBeNull();
      expect(isCurriculumYear(y)).toBe(false);
    }
  });
});

test.describe("the statements each year gets", () => {
  test("Year 4 Science has exactly its six strands", () => {
    const y4 = statementsForYear(P, "Year 4");
    expect(strandsIn(y4, "Science").sort()).toEqual(
      [
        "Animals, including humans",
        "Electricity",
        "Living things and their habitats",
        "Sound",
        "States of matter",
        "Working scientifically",
      ].sort(),
    );
  });

  test("Year 4 fractions has the document's ten statements", () => {
    const y4 = statementsForYear(P, "Year 4");
    const fractions = statementsIn(y4, "Maths", "Number: fractions (including decimals)");
    expect(fractions).toHaveLength(10);
    expect(fractions[0].text).toBe("Recognise and show, using diagrams, families of common equivalent fractions");
    // Stacked fractions in the PDF come through as fractions, not stray digits.
    expect(fractions.map((s) => s.text)).toContain("Recognise and write decimal equivalents to 1/4, 1/2, 3/4");
  });

  test("Year 3 is labelled Key Stage 1 but aligns to what the curriculum sets for Year 3", () => {
    expect(stageForYear("Year 3")).toBe("key-stage-1");
    const y3 = statementsForYear(P, "Year 3");
    // Year 3 Science and Maths are the Year 3 programmes.
    expect(strandsIn(y3, "Science")).toEqual(expect.arrayContaining(["Rocks", "Light", "Forces and magnets"]));
    // Foundation subjects come from the curriculum's key stage 2 lists.
    const history = statementsIn(y3, "History");
    expect(history.map((s) => s.text)).toContain("The Roman Empire and its impact on Britain");
    expect(history.every((s) => s.years.includes(3) && !s.years.includes(2))).toBe(true);
  });

  test("every year from 1 to 6 has English, Maths and Science", () => {
    for (const y of ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"] as const) {
      const subjects = subjectsIn(statementsForYear(P, y));
      expect(subjects.slice(0, 3)).toEqual(["English", "Maths", "Science"]);
    }
  });

  test("no GCSE strand survives anywhere", () => {
    const strands = new Set([...P.statements, ...E.statements].map((s) => s.strand));
    for (const gcse of ["Cell biology", "Coordination and control", "Atomic structure", "Chemical analysis", "Wave motion", "Health Education (Secondary)"]) {
      expect(strands.has(gcse)).toBe(false);
    }
  });

  test("Reception has the 7 areas and 17 Early Learning Goals, three statements each", () => {
    const r = statementsForYear(E, "Reception");
    expect(subjectsIn(r)).toHaveLength(7);
    const goals = subjectsIn(r).flatMap((area) => strandsIn(r, area));
    expect(goals).toHaveLength(17);
    for (const area of subjectsIn(r)) {
      for (const goal of strandsIn(r, area)) expect(statementsIn(r, area, goal)).toHaveLength(3);
    }
  });

  test("Nursery has Development Matters statements in every area", () => {
    const n = statementsForYear(E, "Nursery");
    expect(subjectsIn(n)).toHaveLength(7);
    expect(n.length).toBeGreaterThan(80);
  });

  test("ids are unique across both files", () => {
    const ids = [...P.statements, ...E.statements].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/*
 * Word for word against the documents.
 *
 * Compared as letters only, lower case: the builder capitalises, drops trailing
 * full stops and writes dashes as hyphens, and the PDF's stacked fractions and
 * superscripts extract as loose digits. None of that is a change of wording,
 * and stripping to letters makes the comparison blind to all of it.
 *
 * A statement merged from a stem and a sub-bullet ("Spell: the days of the
 * week") is not contiguous in the source, so each ": " fragment is checked on
 * its own. Every fragment of a contiguous statement is contiguous too, so this
 * loses nothing for the rest.
 */
const letters = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

const RUNNING_HEADERS = new Set([
  "English", "Mathematics", "Science", "Art and design", "Computing", "Design and technology",
  "Geography", "History", "Languages", "Music", "Physical education",
]);

async function pdfText(path: string): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const { text } = await extractText(pdf, { mergePages: false });
  // Drop each page's running header and page number, which otherwise land in
  // the middle of a statement that crosses a page break.
  return text
    .map((page) => page.split("\n").filter((l) => !/^\s*\d+\s*$/.test(l) && !RUNNING_HEADERS.has(l.trim())).join("\n"))
    .join("\n");
}

function htmlText(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

function missingFrom(source: string, statements: NcStatement[]): string[] {
  const hay = letters(source);
  return statements
    .filter((s) => s.text.split(/:\s/).some((fragment) => !hay.includes(letters(fragment))))
    .map((s) => `${s.id}: ${s.text}`);
}

/*
 * The source documents are committed in docs/. Should one ever be missing
 * from a checkout, its check is skipped rather than failed; download links
 * are in scripts/build-national-curriculum.mjs.
 */
const PRIMARY_PDF = "docs/PRIMARY_national_curriculum.pdf";
const EYFS_PDF = "docs/EYFS_statutory_framework_from_September_2026.pdf";
const DM_HTML = "docs/Development_Matters_2023.html";
const skipWithout = (path: string) => test.skip(!existsSync(path), `${path} is missing from this checkout`);

test.describe("every statement is in its source, word for word", () => {
  test.setTimeout(120_000);

  test("Years 1 to 6, against the national curriculum PDF", async () => {
    skipWithout(PRIMARY_PDF);
    const source = await pdfText(PRIMARY_PDF);
    expect(missingFrom(source, P.statements)).toEqual([]);
  });

  test("Reception, against the EYFS statutory framework", async () => {
    skipWithout(EYFS_PDF);
    const source = await pdfText(EYFS_PDF);
    expect(missingFrom(source, statementsForYear(E, "Reception"))).toEqual([]);
  });

  test("Nursery, against Development Matters", () => {
    skipWithout(DM_HTML);
    const source = htmlText(DM_HTML);
    expect(missingFrom(source, statementsForYear(E, "Nursery"))).toEqual([]);
  });
});
