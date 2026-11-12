// A model text (a "WAGOLL": What A Good One Looks Like) as a sheet.
//
// In UK primary writing lessons a model text is shown to the class, and the
// teacher points out the features pupils will use in their own writing. So
// the sheet has two parts: the clean text to hand out or display, then a
// teacher copy on the exemplar block with each feature's quote marked in the
// text and numbered to its note. Either part can be switched off in Design.
//
// The model fills one fixed shape (modelTextResponseFormat in
// app/lib/model-text-prompt.ts); code arranges it. A feature whose quote is
// not in the text keeps its note but gets no marker (normalize.ts moves it to
// the teacher copy's commentary). Pure, free of React, normalize.ts and
// schema.ts.

import { undash } from "./undash";

/** The parts of a model text Design can switch off, by section role. */
export const MODEL_TEXT_PARTS: { id: string; label: string }[] = [
  { id: "text", label: "The text" },
  { id: "teacher", label: "Teacher copy" },
];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** The model's text (complete or mid-stream) as a generic sheet draft. */
export function arrangeModelText(raw: unknown): Raw {
  const r = obj(undash(raw));
  const paragraphs = strs(r.paragraphs);
  const features = arr(r.features)
    .map(obj)
    .map((f) => ({ feature: str(f.feature), quote: str(f.quote), why: str(f.why) }))
    .filter((f) => f.feature && (f.why || f.quote));

  const sections: Raw[] = [
    {
      role: "text",
      title: "The text",
      emoji: "📖",
      instructions: "",
      blocks: paragraphs.length ? [{ type: "passage", title: "", paragraphs }] : [],
    },
    {
      // No heading of its own: the block's band says "Teacher copy", and a
      // heading above a block this tall would sit alone at the foot of a page.
      role: "teacher",
      title: "",
      emoji: "",
      instructions: "",
      blocks: paragraphs.length
        ? [{
            type: "exemplar",
            purpose: "text",
            level: "full",
            awarded: 0,
            outOf: 0,
            form: "prose",
            parts: paragraphs,
            annotations: features.map((f) => ({ quote: f.quote, note: f.why ? `**${f.feature}.** ${f.why}` : `**${f.feature}.**` })),
            commentary: str(r.teacherNote),
          }]
        : [],
    },
  ];

  return {
    title: str(r.title),
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
