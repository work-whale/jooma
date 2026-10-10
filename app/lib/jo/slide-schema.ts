// The structured output Jo answers a slide deck edit with. Same shape and
// order as the sheet one (reply, clarify, ops, summary); see sheet-schema.ts.

import { strictObject } from "@/app/lib/sheets/schema";
import { PICKER_THEMES } from "@/app/lib/slideshowThemes";
import { ADDABLE_LAYOUTS, SLIDE_TEXT_KEYS } from "./types";

const str = { type: "string" } as const;
const bool = { type: "boolean" } as const;
const strList = { type: "array", items: str } as const;

function op(name: string, properties: Record<string, unknown>) {
  return strictObject({ op: { type: "string", enum: [name] }, label: str, ...properties });
}

export function joSlidesResponseFormat() {
  const fields = {
    type: "array",
    items: strictObject({ key: { type: "string", enum: [...SLIDE_TEXT_KEYS] }, value: str }),
  };
  const ops = [
    op("rewriteSlide", { slideId: str, fields }),
    op("setSlideText", { slideId: str, textId: str, text: str }),
    op("addSlide", { afterSlideId: str, layout: { type: "string", enum: [...ADDABLE_LAYOUTS] }, fields, imageQuery: str }),
    op("deleteSlide", { slideId: str }),
    op("moveSlide", { slideId: str, afterSlideId: str }),
    op("setTheme", { themeId: { type: "string", enum: PICKER_THEMES.map((t) => t.id) } }),
  ];
  const schema = strictObject({
    reply: str,
    clarify: { anyOf: [strictObject({ question: str, options: strList, multi: bool }), { type: "null" }] },
    ops: { type: "array", items: { anyOf: ops } },
    summary: str,
  });
  return {
    type: "json_schema" as const,
    json_schema: { name: "jo_slides_edit", strict: true, schema },
  };
}
