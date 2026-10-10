// The structured output Jo answers a sheet edit with.
//
// Strict json_schema, so every op arrives whole and typed. The properties are
// ordered reply, clarify, ops, summary on purpose: a model writes them in
// schema order, so the panel can show Jo's reply while the edits are still
// being written, and play each op as soon as the next one starts.
//
// A block Jo writes uses the very same variants as a generated one
// (sheetBlockVariants), held once under $defs and referenced from each op.

import { kindsForTypes, sheetBlockVariants, strictObject } from "@/app/lib/sheets/schema";
import type { SheetTool } from "@/app/lib/sheets/types";

const str = { type: "string" } as const;
const bool = { type: "boolean" } as const;
const strList = { type: "array", items: str } as const;
const block = { $ref: "#/$defs/block" } as const;

function op(name: string, properties: Record<string, unknown>) {
  return strictObject({ op: { type: "string", enum: [name] }, label: str, ...properties });
}

export function joSheetResponseFormat(tool: SheetTool) {
  const blocks = sheetBlockVariants({ tool, kinds: kindsForTypes(tool, undefined), passage: tool === "comprehension" });

  const ops = [
    op("setText", { target: str, text: str }),
    op("replaceBlock", { blockId: str, block }),
    op("insertBlock", { sectionId: str, afterBlockId: str, block }),
    op("deleteBlock", { blockId: str }),
    op("addSection", { afterSectionId: str, title: str, emoji: str, instructions: str, blocks: { type: "array", items: block } }),
    op("deleteSection", { sectionId: str }),
    op("setDesign", {
      key: { type: "string", enum: ["fontScale", "answers", "nameDate", "lineNumbers", "paper", "objective", "intro", "diffNote"] },
      value: str,
    }),
  ];

  const schema = {
    ...strictObject({
      reply: str,
      clarify: { anyOf: [strictObject({ question: str, options: strList, multi: bool }), { type: "null" }] },
      ops: { type: "array", items: { anyOf: ops } },
      summary: str,
    }),
    $defs: { block: { anyOf: blocks } },
  };

  return {
    type: "json_schema" as const,
    json_schema: { name: "jo_sheet_edit", strict: true, schema },
  };
}
