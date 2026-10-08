import { test, expect } from "@playwright/test";
import { kindsForTypes, sheetResponseFormat } from "@/app/lib/sheets/schema";

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

  test("none ticked means every kind the tool supports (the model picks a mix)", () => {
    expect(kindsForTypes("worksheet", [])).toHaveLength(11);
    expect(kindsForTypes("comprehension", undefined)).toEqual(["mcq", "truefalse", "fillblanks", "short", "long"]);
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

  test("stays under the 100 property limit at its largest, and strict throughout", () => {
    for (const f of [
      sheetResponseFormat({ tool: "worksheet", kinds: kindsForTypes("worksheet", []), passage: false }),
      sheetResponseFormat({ tool: "comprehension", kinds: kindsForTypes("comprehension", []), passage: true }),
    ]) {
      expect(countProperties(f.json_schema.schema)).toBeLessThanOrEqual(100);
      expect(everyObjectStrict(f.json_schema.schema)).toBe(true);
      expect(f.json_schema.strict).toBe(true);
    }
  });
});
