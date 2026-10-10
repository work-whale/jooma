// The structured output Jo answers a Quiz or Staff Slides edit with. Same
// shape and order as the others (reply, clarify, ops, summary); the item an op
// carries is the tool's own question or slide, under $defs.

import { strictObject } from "@/app/lib/sheets/schema";
import type { ListTool } from "./list-ops";

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;
const strList = { type: "array", items: str } as const;
const item = { $ref: "#/$defs/item" } as const;

function op(name: string, properties: Record<string, unknown>) {
  return strictObject({ op: { type: "string", enum: [name] }, label: str, ...properties });
}

function itemSchema(tool: ListTool) {
  if (tool === "quiz") return strictObject({ question: str, options: strList, correctIndex: int });
  return strictObject({
    type: { type: "string", enum: ["title", "content", "quote", "stat", "two-column", "activity"] },
    title: str,
    subtitle: str,
    body: str,
    bullets: strList,
    callout: {
      anyOf: [strictObject({ type: { type: "string", enum: ["key-point", "reflection", "try-this", "discussion"] }, text: str }), { type: "null" }],
    },
    quote: str,
    quoteAuthor: str,
    stat: str,
    statLabel: str,
    statContext: str,
    leftTitle: str,
    leftContent: str,
    rightTitle: str,
    rightContent: str,
    activityPrompt: str,
    activitySubtask: str,
    imageSuggestion: str,
  });
}

export function joListResponseFormat(tool: ListTool) {
  const ops = [
    op("replaceItem", { itemId: str, item }),
    op("insertItem", { afterItemId: str, item }),
    op("deleteItem", { itemId: str }),
    op("moveItem", { itemId: str, afterItemId: str }),
  ];
  const schema = {
    ...strictObject({
      reply: str,
      clarify: { anyOf: [strictObject({ question: str, options: strList, multi: bool }), { type: "null" }] },
      ops: { type: "array", items: { anyOf: ops } },
      summary: str,
    }),
    $defs: { item: itemSchema(tool) },
  };
  return {
    type: "json_schema" as const,
    json_schema: { name: tool === "quiz" ? "jo_quiz_edit" : "jo_staff_slides_edit", strict: true, schema },
  };
}
