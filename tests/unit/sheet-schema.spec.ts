import { test, expect } from "@playwright/test";
import { allowedKinds, kindsForTypes, sheetResponseFormat } from "@/app/lib/sheets/schema";
import { joSheetResponseFormat } from "@/app/lib/jo/sheet-schema";
import { SHEET_TOOLS } from "@/app/lib/sheets/tools";

/*
 * "Only these question types" is enforced by the schema, not asked for in
 * prose: the block variants offered to the model are exactly the ticked
 * types. And the schema has to stay inside OpenAI's structured output limits,
 * or every generation fails at the API.
 */

type Json = Record<string, unknown>;

function variantsOf(format: ReturnType<typeof sheetResponseFormat>): string[] {
  const schema = format.json_schema.schema as Json;
  const sections = (schema.properties as Json).sections as Json;
  const blocks = (((sections.items as Json).properties as Json).blocks as Json).items as { anyOf: Json[] };
  return blocks.anyOf.map((v) => ((v.properties as Json).type as { enum: string[] }).enum[0]);
}

/** Every object property in the schema, the figure OpenAI limits. */
function countProperties(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + countProperties(x), 0);
  const o = node as Json;
  let n = o.properties ? Object.keys(o.properties as Json).length : 0;
  for (const v of Object.values(o)) n += countProperties(v);
  return n;
}

/** How deep objects nest: OpenAI allows 10 levels. */
function objectDepth(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  if (Array.isArray(node)) return Math.max(0, ...node.map(objectDepth));
  const o = node as Json;
  const below = Math.max(0, ...Object.values(o).map(objectDepth));
  return (o.type === "object" ? 1 : 0) + below;
}

/** Strict mode needs every property required and no extras, at every level. */
function everyObjectStrict(node: unknown): boolean {
  if (!node || typeof node !== "object") return true;
  if (Array.isArray(node)) return node.every(everyObjectStrict);
  const o = node as Json;
  if (o.type === "object") {
    const keys = Object.keys((o.properties as Json) ?? {});
    const required = (o.required as string[]) ?? [];
    if (o.additionalProperties !== false || keys.length !== required.length || !keys.every((k) => required.includes(k))) return false;
  }
  return Object.values(o).every(everyObjectStrict);
}

test.describe("kindsForTypes", () => {
  test("maps the worksheet form's labels onto sheet question kinds", () => {
    expect(kindsForTypes("worksheet", ["Multiple Choice", "Multiple-Select", "True/False"])).toEqual(["mcq", "truefalse"]);
    expect(kindsForTypes("worksheet", ["Wh- Questions"])).toEqual(["short"]);
  });

  test("maps the comprehension form's labels", () => {
    expect(kindsForTypes("comprehension", ["Gap fill", "Vocabulary in context", "Extended writing"])).toEqual(["fillblanks", "short", "long"]);
  });

  test("none ticked means the tool's default mix, which never includes a puzzle", () => {
    expect(kindsForTypes("worksheet", [])).toHaveLength(11);
    for (const k of ["sort", "wordsearch", "crossword"] as const) expect(kindsForTypes("worksheet", [])).not.toContain(k);
    expect(kindsForTypes("comprehension", undefined)).toEqual(["mcq", "truefalse", "fillblanks", "short", "long"]);
  });

  test("the puzzle chips map to the puzzle kinds, on worksheets only", () => {
    expect(kindsForTypes("worksheet", ["Sorting / Categorising", "Word Search", "Crossword"])).toEqual(["sort", "wordsearch", "crossword"]);
    expect(kindsForTypes("comprehension", ["Crossword"])).toEqual(kindsForTypes("comprehension", []));
    expect(allowedKinds("worksheet")).toEqual(expect.arrayContaining(["sort", "wordsearch", "crossword", ...kindsForTypes("worksheet", [])]));
  });

  test("a kind the tool cannot make is not offered", () => {
    // Comprehension has no labelling diagrams.
    expect(kindsForTypes("comprehension", ["Labeling"])).toEqual(["mcq", "truefalse", "fillblanks", "short", "long"]);
  });
});

test.describe("sheetResponseFormat", () => {
  test("offers only the ticked question types", () => {
    const f = sheetResponseFormat({ tool: "worksheet", kinds: ["mcq", "calc"], passage: false });
    expect(variantsOf(f)).toEqual(["text", "callout", "wordbank", "table", "mcq", "calc"]);
  });

  test("a passage only when the model writes it; tables only on worksheets", () => {
    expect(variantsOf(sheetResponseFormat({ tool: "comprehension", kinds: ["short"], passage: true }))).toEqual(["text", "callout", "wordbank", "passage", "short"]);
    expect(variantsOf(sheetResponseFormat({ tool: "comprehension", kinds: ["short"], passage: false }))).not.toContain("passage");
  });

  test("a puzzle asks for its words only, never a grid", () => {
    const f = sheetResponseFormat({ tool: "worksheet", kinds: ["sort", "wordsearch", "crossword"], passage: false });
    const text = JSON.stringify(f.json_schema.schema);
    expect(variantsOf(f)).toEqual(["text", "callout", "wordbank", "table", "sort", "wordsearch", "crossword"]);
    for (const field of ["grid", "placements", "placed", "key", "seed", "level"]) expect(text).not.toContain(`"${field}"`);
  });

  // OpenAI allows 5000 object properties and 10 levels of nesting. The budget
  // here is far tighter: every property costs tokens on every generation.
  // Every registered sheet tool, so a tool added to app/lib/sheets/tools.ts is
  // held to the same limits without anyone remembering to list it here.
  test("stays within budget at its largest, every kind and pictures included, and strict throughout", () => {
    for (const tool of SHEET_TOOLS) {
      const f = sheetResponseFormat({ tool, kinds: allowedKinds(tool), passage: true, images: true });
      expect(countProperties(f.json_schema.schema), tool).toBeLessThanOrEqual(200);
      expect(objectDepth(f.json_schema.schema), tool).toBeLessThanOrEqual(10);
      expect(everyObjectStrict(f.json_schema.schema), tool).toBe(true);
      expect(f.json_schema.strict).toBe(true);
    }
  });

  test("Jo's edit schema for every tool is strict and inside OpenAI's limits", () => {
    for (const tool of SHEET_TOOLS) {
      const schema = joSheetResponseFormat(tool).json_schema.schema;
      expect(countProperties(schema), tool).toBeLessThan(5000);
      expect(objectDepth(schema), tool).toBeLessThanOrEqual(10);
      expect(everyObjectStrict(schema), tool).toBe(true);
    }
  });

  test("Jo's edit schema offers the puzzles too, so it can rewrite one", () => {
    const text = JSON.stringify(joSheetResponseFormat("worksheet"));
    for (const k of ["sort", "wordsearch", "crossword"]) expect(text).toContain(`"enum":["${k}"]`);
  });
});
