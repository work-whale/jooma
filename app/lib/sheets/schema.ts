// The structured-output schema a sheet is generated against.
//
// Strict json_schema (every field required, no extra fields), with one variant
// per block type under `anyOf`. The question variants offered are narrowed to
// the types the teacher ticked, so "use only these question types" is enforced
// by the schema itself rather than requested in prose and hoped for.
//
// Kept under OpenAI's original limit of 100 object properties in total: the
// worksheet variants carry no `domain`, and only the comprehension schema has
// a passage.

import type { QuestionType, SheetTool } from "./types";

type Json = Record<string, unknown>;

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;
const strList = { type: "array", items: str } as const;
const intList = { type: "array", items: int } as const;

function obj(properties: Json): Json {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

function variant(type: string, properties: Json): Json {
  return obj({ type: { type: "string", enum: [type] }, ...properties });
}

/**
 * The teacher-facing question types, from both forms, mapped to the sheet's
 * question kinds. Several map to the same kind: "Closed Questions" and "Wh-
 * Questions" are short answers with a particular kind of prompt.
 */
const TYPE_TO_KIND: Record<string, QuestionType> = {
  // Worksheet (QuestionTypesField)
  "Multiple Choice": "mcq",
  "True/False": "truefalse",
  "Matching": "matching",
  "Multiple-Select": "mcq",
  "Short Answer": "short",
  "Fill in the Blanks": "fillblanks",
  "Essay / Open-Ended": "long",
  "Numerical / Computational": "calc",
  "Labeling": "label",
  "Ordering / Sequencing": "order",
  "Hotspot / Picture Selection": "picture",
  "Closed Questions": "short",
  "Wh- Questions": "short",
  "Word Ordering": "wordorder",
  // Comprehension (ComprehensionForm)
  "Multiple choice": "mcq",
  "Short answer": "short",
  "Extended writing": "long",
  "True / False": "truefalse",
  "Gap fill": "fillblanks",
  "Vocabulary in context": "short",
};

/** Every kind each tool can produce when the teacher picks no types. */
const ALL_KINDS: Record<SheetTool, QuestionType[]> = {
  worksheet: ["mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label"],
  comprehension: ["mcq", "truefalse", "fillblanks", "short", "long"],
};

/** The question kinds a request may use: the ticked types' kinds, or every
 *  kind the tool supports when none are ticked. */
export function kindsForTypes(tool: SheetTool, teacherTypes: string[] | undefined): QuestionType[] {
  const picked = [...new Set((teacherTypes ?? []).map((t) => TYPE_TO_KIND[t]).filter((k): k is QuestionType => !!k))];
  const allowed = ALL_KINDS[tool];
  const out = picked.filter((k) => allowed.includes(k));
  return out.length > 0 ? out : allowed;
}

function questionVariant(kind: QuestionType, tool: SheetTool): Json {
  // Only comprehension questions are tagged with a reading domain.
  const tail: Json = tool === "comprehension" ? { marks: int, domain: str } : { marks: int };
  switch (kind) {
    case "mcq":
      return variant("mcq", { prompt: str, options: strList, answers: intList, ...tail });
    case "truefalse":
      return variant("truefalse", { prompt: str, statements: { type: "array", items: obj({ text: str, answer: bool }) }, ...tail });
    case "matching":
      return variant("matching", { prompt: str, left: strList, right: strList, pairs: intList, ...tail });
    case "fillblanks":
      return variant("fillblanks", { prompt: str, sentences: strList, answers: strList, wordBank: strList, ...tail });
    case "short":
      return tool === "comprehension"
        ? variant("short", { prompt: str, quote: str, lines: int, answer: str, ...tail })
        : variant("short", { prompt: str, lines: int, answer: str, ...tail });
    case "long":
      return variant("long", { prompt: str, lines: int, answer: str, criteria: strList, ...tail });
    case "calc":
      return variant("calc", { prompt: str, working: bool, answer: str, ...tail });
    case "order":
      return variant("order", { prompt: str, items: strList, order: intList, ...tail });
    case "wordorder":
      return variant("wordorder", { prompt: str, words: strList, answer: str, ...tail });
    case "picture":
      return variant("picture", { prompt: str, options: { type: "array", items: obj({ emoji: str, label: str }) }, answer: int, ...tail });
    case "label":
      return variant("label", { prompt: str, items: { type: "array", items: obj({ clue: str, answer: str }) }, wordBank: strList, ...tail });
  }
}

/**
 * The response_format for one generation.
 *
 * `passage` is offered only to a comprehension whose passage the model writes;
 * a teacher's own text is placed by the server, word for word, and never sent
 * back through the model.
 */
export function sheetResponseFormat(opts: { tool: SheetTool; kinds: QuestionType[]; passage: boolean }) {
  const content: Json[] = [
    variant("text", { text: str }),
    variant("callout", { variant: { type: "string", enum: ["fact", "remember", "tip", "challenge"] }, label: str, text: str, emoji: str }),
    variant("wordbank", { title: str, words: strList }),
  ];
  if (opts.passage) content.push(variant("passage", { title: str, paragraphs: strList }));
  if (opts.tool === "worksheet") content.push(variant("table", { headers: strList, rows: { type: "array", items: strList } }));

  const blocks = [...content, ...opts.kinds.map((k) => questionVariant(k, opts.tool))];

  const schema = obj({
    title: str,
    objective: str,
    intro: obj({ variant: { type: "string", enum: ["fact", "remember", "tip", "challenge"] }, label: str, text: str, emoji: str }),
    sections: {
      type: "array",
      items: obj({ title: str, emoji: str, instructions: str, blocks: { type: "array", items: { anyOf: blocks } } }),
    },
    teacherNotes: { type: "array", items: obj({ title: str, points: strList }) },
  });

  return {
    type: "json_schema" as const,
    json_schema: { name: `${opts.tool}_sheet`, strict: true, schema },
  };
}
