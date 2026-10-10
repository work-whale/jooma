// A sheet as markdown: what Copy puts on the clipboard, what the slideshow's
// "use a previous output" reads as lesson material, and what the admin
// previews show. Also the source of the outline rail's headings, so its links
// match the section titles on the page.

import { isSheetOutput } from "./normalize";
import { parsePartialJson } from "./stream";
import { isBandSetOutput } from "@/app/lib/bands";
import { isQuestion, type SheetBlock, type SheetDoc, type SheetQuestion } from "./types";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Questions numbered 1, 2, 3... down the whole sheet, in page order. */
export function questionNumbers(doc: SheetDoc): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const s of doc.sections) for (const b of s.blocks) if (isQuestion(b)) numbers.set(b.id, ++n);
  return numbers;
}

function lines(n: number): string {
  return Array.from({ length: n }, () => "____________________________________________").join("\n");
}

function blockMarkdown(b: SheetBlock, number: number | undefined): string {
  const lead = number !== undefined ? `**${number}.** ` : "";
  const marks = isQuestion(b) && b.marks > 0 ? ` [${b.marks} mark${b.marks === 1 ? "" : "s"}]` : "";
  switch (b.type) {
    case "text":
      return b.text;
    case "callout":
      return `> **${b.label}** ${b.text}`;
    case "passage":
      return [b.title ? `### ${b.title}` : "", ...b.paragraphs].filter(Boolean).join("\n\n");
    case "wordbank":
      return `**${b.title}:** ${b.words.join(", ")}`;
    case "table":
      return [
        `| ${b.headers.join(" | ")} |`,
        `| ${b.headers.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");
    case "mcq":
      return [`${lead}${b.prompt}${marks}`, ...b.options.map((o, i) => `- ${LETTERS[i]}) ${o}`)].join("\n");
    case "truefalse":
      return [`${lead}${b.prompt || "True or false?"}${marks}`, ...b.statements.map((s) => `- ${s.text} (True / False)`)].join("\n");
    case "matching":
      return [`${lead}${b.prompt}${marks}`, ...b.left.map((l, i) => `- ${i + 1}. ${l}`), ...b.right.map((r, i) => `- ${LETTERS[i]}) ${r}`)].join("\n");
    case "fillblanks":
      return [
        `${lead}${b.prompt}${marks}`,
        b.wordBank.length ? `**Word bank:** ${b.wordBank.join(", ")}` : "",
        ...b.sentences.map((s) => `- ${s.replace(/___/g, "__________")}`),
      ].filter(Boolean).join("\n");
    case "short":
      return [`${lead}${b.quote ? `"${b.quote}" ` : ""}${b.prompt}${marks}`, lines(b.lines)].join("\n");
    case "long":
      return [`${lead}${b.prompt}${marks}`, lines(b.lines)].join("\n");
    case "calc":
      return [`${lead}${b.prompt}${marks}`, b.working ? "Working:" : "", "Answer: __________"].filter(Boolean).join("\n");
    case "order":
      return [`${lead}${b.prompt}${marks}`, ...b.items.map((it) => `- [ ] ${it}`)].join("\n");
    case "wordorder":
      return [`${lead}${b.prompt}${marks}`, b.words.join(" / "), lines(1)].join("\n");
    case "picture":
      return [`${lead}${b.prompt}${marks}`, b.options.map((o) => `${o.emoji} ${o.label}`).join("   ")].join("\n");
    case "label":
      return [
        `${lead}${b.prompt}${marks}`,
        b.wordBank.length ? `**Word bank:** ${b.wordBank.join(", ")}` : "",
        ...b.items.map((it, i) => `- ${i + 1}. ${it.clue}: __________`),
      ].filter(Boolean).join("\n");
  }
}

/** The answer to one question, in a line or two. Empty when there is none. */
export function answerText(q: SheetQuestion): string {
  switch (q.type) {
    case "mcq":
      return q.answers.map((i) => `${LETTERS[i]}) ${q.options[i] ?? ""}`).join(", ");
    case "truefalse":
      return q.statements.map((s, i) => `${i + 1}. ${s.answer ? "True" : "False"}`).join("  ");
    case "matching":
      return q.left.map((_, i) => `${i + 1}${LETTERS[q.pairs[i]] ?? "?"}`).join(", ");
    case "fillblanks":
      return q.answers.join(", ");
    case "short":
    case "long":
    case "calc":
    case "wordorder":
      return q.answer;
    case "order":
      return q.order.map((i) => q.items[i]).join(", then ");
    case "picture":
      return q.options[q.answer] ? `${q.options[q.answer].emoji} ${q.options[q.answer].label}` : "";
    case "label":
      return q.items.map((it, i) => `${i + 1}. ${it.answer}`).join("  ");
  }
}

/**
 * Readable text from the start of a stored output, for previews that only
 * get a slice of it (the admin showcase list reads the first 600 characters).
 * A sheet's slice is cut-off JSON, which parsePartialJson reads anyway.
 * Markdown is returned as it is.
 */
export function outputExcerpt(output: string): string {
  // Differentiated versions: the first one, read from the cut-off set the
  // same way. Its output arrives as a (possibly cut-off) string.
  if (isBandSetOutput(output)) {
    const set = parsePartialJson(output) as { bands?: { output?: unknown }[] } | null;
    const first = set?.bands?.[0]?.output;
    return typeof first === "string" ? outputExcerpt(first) : "";
  }
  if (!isSheetOutput(output)) return output;
  const raw = parsePartialJson(output) as Partial<SheetDoc> | null;
  if (!raw) return "";
  const parts: unknown[] = [raw.title, raw.objective, raw.intro?.text];
  for (const s of raw.sections ?? []) {
    parts.push(s?.title);
    for (const b of (s?.blocks ?? []) as unknown as Record<string, unknown>[]) {
      parts.push(b?.text ?? b?.prompt ?? (Array.isArray(b?.paragraphs) ? b.paragraphs.join(" ") : undefined));
    }
  }
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" · ");
}

/** Whether the sheet ends with an answers page: switched on, and something to
 *  put on it. */
export function hasAnswersPage(doc: SheetDoc): boolean {
  return doc.design.answers && (doc.teacherNotes.length > 0 || doc.sections.some((s) => s.blocks.some(isQuestion)));
}

/**
 * Just the headings, for the outline rail: the title, each section, and the
 * answers page. SheetDocument gives its headings the ids extractHeadings
 * derives from this same string, so the rail's links land on them.
 */
export function sheetOutline(doc: SheetDoc): string {
  return [
    `# ${doc.title || "Worksheet"}`,
    ...doc.sections.map((s) => `## ${s.title || "Section"}`),
    ...(hasAnswersPage(doc) ? ["## Answers"] : []),
  ].join("\n");
}

export function sheetToMarkdown(doc: SheetDoc, opts: { answers?: boolean } = {}): string {
  const numbers = questionNumbers(doc);
  const out: string[] = [`# ${doc.title || "Worksheet"}`];
  if (doc.subtitle) out.push(`*${doc.subtitle}*`);
  if (doc.objective) out.push(`**Learning objective:** ${doc.objective}`);
  if (doc.intro) out.push(`> **${doc.intro.label}** ${doc.intro.text}`);
  for (const s of doc.sections) {
    out.push(`## ${s.title}`);
    if (s.instructions) out.push(`*${s.instructions}*`);
    for (const b of s.blocks) out.push(blockMarkdown(b, numbers.get(b.id)));
  }
  const withAnswers = opts.answers ?? doc.design.answers;
  if (withAnswers) {
    const answers = doc.sections.flatMap((s) => s.blocks).filter(isQuestion).map((q) => ({ n: numbers.get(q.id)!, a: answerText(q) })).filter((x) => x.a);
    if (answers.length) out.push("## Answers", ...answers.map((x) => `${x.n}. ${x.a}`));
    for (const note of doc.teacherNotes) out.push(`## ${note.title || "Teacher notes"}`, ...note.points.map((p) => `- ${p}`));
  }
  return out.join("\n\n");
}
