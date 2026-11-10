// Model Answers as a sheet.
//
// The model writes one fixed shape: for each question, answers at the levels
// asked for (full marks, a middle answer, a near miss), each with the marks it
// would get, notes that tie phrases in it to the mark scheme, and a line of
// commentary; then notes on teaching from it. Code arranges that into one
// section per question.
//
// Pure, and free of normalize.ts and schema.ts (both import this through the
// tool registry): it returns raw drafts that normalizeDraft validates. The
// schema the model writes against is in app/lib/model-answer-prompt.ts.


export type ExemplarLevel = "full" | "mid" | "low";
export const EXEMPLAR_LEVELS: { id: ExemplarLevel; label: string }[] = [
  { id: "full", label: "Full marks" },
  { id: "mid", label: "Middle answer" },
  { id: "low", label: "Near miss" },
];

export function levelLabel(level: ExemplarLevel): string {
  return EXEMPLAR_LEVELS.find((l) => l.id === level)?.label ?? "Answer";
}

export function isExemplarLevel(v: unknown): v is ExemplarLevel {
  return v === "full" || v === "mid" || v === "low";
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

/** The model's draft (complete or mid-stream) as a generic sheet draft. */
export function arrangeModelAnswers(raw: unknown): Raw {
  const r = obj(raw);
  const sections = arr(r.questions)
    .map(obj)
    .filter((q) => s(q.question))
    .map((q, i) => {
      const marks = typeof q.marks === "number" && q.marks > 0 ? Math.round(q.marks) : 0;
      const blocks: Raw[] = arr(q.exemplars).map(obj).map((e) => ({ ...e, type: "exemplar", outOf: marks }));
      const notes = arr(q.teachingNotes).filter((n): n is string => typeof n === "string" && n.trim() !== "");
      if (notes.length) blocks.push({ type: "list", title: "Teaching from this question", style: "bullet", items: notes });
      return {
        role: "question",
        title: `Question ${i + 1}`,
        emoji: "📝",
        // The question is shown once with its marks, even when the model
        // copied a "[6 marks]" from the prompt into its text.
        instructions: `${s(q.question).replace(/\s*[[(]\s*\d+\s*marks?\s*[\])]\s*$/i, "").trim()}${marks ? ` (${marks} mark${marks === 1 ? "" : "s"})` : ""}`,
        blocks,
      };
    });
  return { title: s(r.title), objective: "", intro: null, sections, teacherNotes: [] };
}

/**
 * Notes whose quoted phrase is not in the answer cannot point at anything, so
 * they join the commentary instead of being shown against nothing.
 */
export function placeAnnotations(parts: string[], annotations: { quote: string; note: string }[]): { annotations: { quote: string; note: string }[]; spare: string[] } {
  const text = parts.join(" ").toLowerCase();
  const kept: { quote: string; note: string }[] = [];
  const spare: string[] = [];
  for (const a of annotations) {
    if (!a.note) continue;
    if (a.quote && text.includes(a.quote.toLowerCase())) kept.push(a);
    else spare.push(a.note);
  }
  return { annotations: kept, spare };
}
