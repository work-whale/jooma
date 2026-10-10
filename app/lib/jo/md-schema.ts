// The structured output Jo answers a text tool edit with. Same shape and order
// as the others (reply, clarify, ops, summary); see sheet-schema.ts.

import { strictObject } from "@/app/lib/sheets/schema";

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;
const strList = { type: "array", items: str } as const;

function op(name: string, properties: Record<string, unknown>) {
  return strictObject({ op: { type: "string", enum: [name] }, label: str, ...properties });
}

export function joMarkdownResponseFormat() {
  const ops = [
    op("editText", { sectionId: str, find: str, replace: str }),
    op("replaceSection", { sectionId: str, heading: str, markdown: str }),
    op("insertSection", { afterSectionId: str, level: int, heading: str, markdown: str }),
    op("deleteSection", { sectionId: str }),
  ];
  const schema = strictObject({
    reply: str,
    clarify: { anyOf: [strictObject({ question: str, options: strList, multi: bool }), { type: "null" }] },
    ops: { type: "array", items: { anyOf: ops } },
    summary: str,
  });
  return {
    type: "json_schema" as const,
    json_schema: { name: "jo_markdown_edit", strict: true, schema },
  };
}
