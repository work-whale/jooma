// A sheet as markdown: what Copy puts on the clipboard, what the slideshow's
// "use a previous output" reads as lesson material, and what the admin
// previews show. Also the source of the outline rail's headings, so its links
// match the section titles on the page.

import { isSheetOutput } from "./normalize";
import { parsePartialJson } from "./stream";
import { isBandSetOutput } from "@/app/lib/bands";
import { isQuestion, type SheetBlock, type SheetDoc, type SheetQuestion } from "./types";
import { showsIntro, showsObjective, showsPictures, showsSlip, visibleNotes } from "./visibility";
import { formatLetterDate } from "./letter";
import { clueText, directionName, sortBank, sortRows } from "./puzzles";
import { sheetToolProfile } from "./tools";
import { clockText, phaseClock, phaseRows, phaseWording, stageLabel } from "./lesson";
import { disclaimerFor, durationText, examStyle } from "./exam-styles";
import { levelLabel } from "./model-answers";
import { lessonItems, lessonLabel, TOPIC_MAP_COLUMNS, UNIT_COLUMNS, visibleColumns, type UnitColumn } from "./unit";
import { withPupilName } from "./pupil";
import { PRIVATE_ROLES } from "./behaviour";
import { headedSections, shownSections } from "./visibility";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** A lesson table's shown columns: the teacher's choice, or the tool's. */
export function sequenceColumns(doc: SheetDoc): UnitColumn[] {
  return visibleColumns(doc, sheetToolProfile(doc.tool)?.unitColumns ?? TOPIC_MAP_COLUMNS);
}

/** Questions numbered 1, 2, 3... down the whole sheet, in page order, or
 *  from 1 again in each section for a tool that says so (a lesson plan's
 *  starter and exit quizzes are two separate quizzes). */
export function questionNumbers(doc: SheetDoc): Map<string, number> {
  const numbers = new Map<string, number>();
  const restart = sheetToolProfile(doc.tool)?.restartNumbers ?? false;
  let n = 0;
  for (const s of doc.sections) {
    if (restart) n = 0;
    for (const b of s.blocks) if (isQuestion(b)) numbers.set(b.id, ++n);
  }
  return numbers;
}

/**
 * What each question is called on the page: "1", "2", or, on an exam paper,
 * by question and part, "1", "2(a)", "2(b)": every section is one question,
 * and a question with one part is just its number.
 */
export function questionLabels(doc: SheetDoc): Map<string, string> {
  if (!sheetToolProfile(doc.tool)?.partNumbering) {
    return new Map([...questionNumbers(doc)].map(([id, n]) => [id, String(n)]));
  }
  const out = new Map<string, string>();
  let q = 0;
  for (const s of doc.sections) {
    const parts = s.blocks.filter(isQuestion);
    if (parts.length === 0) continue;
    q++;
    if (parts.length === 1) out.set(parts[0].id, String(q));
    else parts.forEach((b, i) => out.set(b.id, `${q}(${LETTERS[i]})`));
  }
  return out;
}

/** Every mark on the sheet, worked out from its questions. */
export function totalMarks(doc: SheetDoc): number {
  return doc.sections.reduce((sum, s) => sum + s.blocks.reduce((a, b) => a + (isQuestion(b) ? b.marks : 0), 0), 0);
}

/** An exam paper's cover, as words: the same on the page, in Word and in Copy. */
export function examCover(doc: SheetDoc) {
  if (!doc.exam) return null;
  const style = examStyle(doc.exam.styleId);
  const tier = doc.exam.tier ? `${doc.exam.tier === "higher" ? "Higher" : "Foundation"} tier` : "";
  return {
    level: [style.level, doc.exam.subject].filter(Boolean).join(" "),
    tier,
    time: durationText(doc.exam.minutes),
    total: totalMarks(doc),
    instructions: style.instructions,
    disclaimer: disclaimerFor(style),
  };
}

/** Whether an exam paper shows its cover page. */
export function showsCover(doc: SheetDoc): boolean {
  return !!doc.exam && doc.design.cover !== false;
}

/** The answers page's heading for this sheet's tool. */
export function answersTitle(doc: SheetDoc): string {
  return sheetToolProfile(doc.tool)?.answersTitle ?? "Answers";
}

type Clocks = Map<string, { start: number; end: number }>;

function exemplarMarkdown(b: Extract<SheetBlock, { type: "exemplar" }>): string {
  const body =
    b.form === "steps" ? b.parts.map((p, i) => `${i + 1}. ${p}`).join("\n") : b.form === "points" ? b.parts.map((p) => `- ${p}`).join("\n") : b.parts.join("\n\n");
  return [
    `#### ${levelLabel(b.level)} (${b.awarded}/${b.outOf} marks)`,
    body,
    ...(b.annotations.length ? ["**Where the marks come from:**", ...b.annotations.map((a) => `- "${a.quote}": ${a.note}`)] : []),
    b.commentary ? `*${b.commentary}*` : "",
  ].filter(Boolean).join("\n\n");
}

function lines(n: number): string {
  return Array.from({ length: n }, () => "____________________________________________").join("\n");
}

function blockMarkdown(b: SheetBlock, number: number | string | undefined, doc?: SheetDoc, clocks?: Clocks): string {
  const lead = number !== undefined ? `**${number}.** ` : "";
  const marks = isQuestion(b) && b.marks > 0 ? ` [${b.marks} mark${b.marks === 1 ? "" : "s"}]` : "";
  switch (b.type) {
    case "text":
      return b.text;
    case "image":
      return b.src ? `![${b.alt.replace(/[[\]]/g, "")}](${b.src})` : "";
    case "callout":
      return `> **${b.label}** ${b.text}`;
    case "passage":
      return [b.title ? `### ${b.title}` : "", ...b.paragraphs].filter(Boolean).join("\n\n");
    case "wordbank":
      return `**${b.title}:** ${b.words.join(", ")}`;
    case "table":
      // Without headings (a plan's details): one "label: value" line a row.
      if (b.headers.length === 0) return b.rows.map((r) => `**${r[0] ?? ""}:** ${r.slice(1).join(" ")}`.trimEnd()).join("  \n");
      return [
        `| ${b.headers.join(" | ")} |`,
        `| ${b.headers.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");
    case "exemplar":
      return exemplarMarkdown(b);
    case "twocol":
      return [b.left, b.right]
        .filter((s) => s.title || s.items.length)
        .map((s) => [s.title ? `**${s.title}**` : "", ...s.items.map((it) => `- ${it}`)].filter(Boolean).join("\n"))
        .join("\n\n");
    case "sequence": {
      const columns = doc ? sequenceColumns(doc) : UNIT_COLUMNS;
      const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s*\n\s*/g, " ");
      const headers = ["Lesson", ...columns.map((c) => c.label)];
      return [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...b.lessons.map((l, i) => `| ${[lessonLabel(l, i), ...columns.map((c) => lessonItems(l, c.id).join(c.list ? "; " : " "))].map(cell).join(" | ")} |`),
      ].join("\n");
    }
    case "list":
      return [
        b.title ? `**${b.title}**` : "",
        ...b.items.map((it, i) => (b.style === "number" ? `${i + 1}. ${it}` : b.style === "check" ? `- [ ] ${it}` : `- ${it}`)),
      ].filter(Boolean).join("\n");
    case "phase": {
      const layout = doc ? phaseWording(doc) : undefined;
      const t = clocks?.get(b.id);
      const when = t ? ` (${clockText(t.start)} to ${clockText(t.end)}, ${b.minutes} min)` : ` (${b.minutes} min)`;
      return [
        `### ${stageLabel(b.stage, layout)}: ${b.title}${when}`,
        ...phaseRows(b, layout).map((r) => (r.items.length ? [`**${r.label}:**`, ...r.items.map((x) => `- ${x}`)].join("\n") : `**${r.label}:** ${r.text}`)),
      ].join("\n\n");
    }
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
    case "sort": {
      const names = b.categories.map((c) => c.name || " ");
      return [
        `${lead}${b.prompt}${marks}`,
        `**Sort these:** ${sortBank(b).join(", ")}`,
        "",
        `| ${names.join(" | ")} |`,
        `| ${names.map(() => "---").join(" | ")} |`,
        ...Array.from({ length: sortRows(b) }, () => `| ${names.map(() => " ").join(" | ")} |`),
      ].join("\n");
    }
    case "wordsearch":
      return [
        `${lead}${b.prompt}${marks}`,
        "```",
        ...b.grid.map((row) => row.split("").join(" ")),
        "```",
        `**Find:** ${b.placements.map((p) => p.word).join(", ")}`,
      ].join("\n");
    case "crossword": {
      const clues = (dir: "across" | "down") => b.placed.filter((p) => p.dir === dir).map((p) => `- ${p.number}. ${clueText(p)}`);
      return [
        `${lead}${b.prompt}${marks}`,
        "_The grid is on the printed sheet._",
        "**Across**",
        ...clues("across"),
        "**Down**",
        ...clues("down"),
        b.wordBank ? `**Word bank:** ${b.placed.map((p) => p.answer).sort((x, y) => x.localeCompare(y)).join(", ")}` : "",
      ].filter(Boolean).join("\n");
    }
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
    case "sort":
      return q.categories.filter((c) => c.items.length).map((c) => `${c.name}: ${c.items.join(", ")}`).join("; ");
    case "wordsearch":
      return q.placements.map((p) => `${p.word} (row ${p.row + 1}, ${directionName(p)})`).join("; ");
    case "crossword":
      return q.placed.map((p) => `${p.number} ${p.dir}: ${p.answer}`).join("; ");
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
  return doc.design.answers && (visibleNotes(doc).length > 0 || doc.sections.some((s) => s.blocks.some(isQuestion)));
}

/**
 * Just the headings, for the outline rail: the title, each section, and the
 * answers page. SheetDocument gives its headings the ids extractHeadings
 * derives from this same string, so the rail's links land on them.
 */
export function sheetOutline(stored: SheetDoc): string {
  // Read with the child's name in, as the page draws it, so the rail's
  // headings and the page's ids agree.
  const doc = withPupilName(stored);
  // A letter has one heading: its "Re:" line.
  if (doc.letter) return `# ${doc.title || "Letter"}`;
  return [
    `# ${doc.title || "Worksheet"}`,
    ...headedSections(doc).map((s) => `## ${s.title || "Section"}`),
    ...(hasAnswersPage(doc) ? [`## ${answersTitle(doc)}`] : []),
  ].join("\n");
}

/** A letter as text: letterhead, paragraphs, sign-off and reply slip. */
function letterMarkdown(doc: SheetDoc): string {
  const l = doc.letter!;
  const out: string[] = [];
  if (l.school) out.push(`**${l.school}**`);
  out.push(formatLetterDate(l.date), l.salutation, `**Re: ${doc.title}**`);
  for (const s of doc.sections) {
    if (s.title) out.push(`## ${s.title}`);
    for (const b of s.blocks) {
      const md = blockMarkdown(b, undefined, doc);
      if (md) out.push(md);
    }
  }
  // The sign-off, then room for a signature, then the name and role on lines
  // of their own (a markdown hard break is two spaces before the newline).
  out.push(l.signOff, [l.senderName, l.senderRole].filter(Boolean).join("  \n"));
  if (l.slip && showsSlip(doc)) {
    out.push(
      "---",
      "*Cut here and return to school*",
      `### ${l.slip.title}`,
      ...(l.slip.returnBy ? [`**Please return by:** ${l.slip.returnBy}`] : []),
      l.slip.statement,
      ...l.slip.fields.map((f) => `${f}: ______________________________`),
    );
  }
  return out.filter((p) => p !== "").join("\n\n");
}

export function sheetToMarkdown(stored: SheetDoc, opts: { answers?: boolean; forModel?: boolean } = {}): string {
  // A document about one child is copied with the child's name in it, as
  // it reads on the page. Bound for a model instead (a slideshow made from
  // it), it keeps "[PUPIL]" and leaves out the parts built from what the
  // teacher typed: the details, incident log and signatures.
  const doc = opts.forModel
    ? { ...stored, sections: stored.sections.filter((s) => !PRIVATE_ROLES.includes(s.role ?? "")) }
    : withPupilName(stored);
  if (doc.letter) return letterMarkdown(doc);
  const numbers = questionLabels(doc);
  const clocks = phaseClock(doc);
  const out: string[] = [`# ${doc.title || "Worksheet"}`];
  if (doc.subtitle) out.push(`*${doc.subtitle}*`);
  const cover = showsCover(doc) ? examCover(doc) : null;
  if (cover) {
    out.push(
      [cover.level, cover.tier].filter(Boolean).join(", "),
      `**Time allowed:** ${cover.time}. **Total marks:** ${cover.total}.`,
      cover.instructions.map((i) => `- ${i}`).join("\n"),
      ...(cover.disclaimer ? [`*${cover.disclaimer}*`] : []),
    );
  }
  if (doc.objective && showsObjective(doc)) out.push(`**Learning objective:** ${doc.objective}`);
  if (doc.intro && showsIntro(doc)) out.push(`> **${doc.intro.label}** ${doc.intro.text}`);
  for (const s of shownSections(doc)) {
    // A built-in part with no title (a profile's dates) has no heading.
    if (s.title || !s.role) out.push(`## ${s.title}`);
    if (s.instructions) out.push(`*${s.instructions}*`);
    for (const b of s.blocks) {
      if (b.type === "image" && !showsPictures(doc)) continue;
      const md = blockMarkdown(b, numbers.get(b.id), doc, clocks);
      if (md) out.push(md);
    }
  }
  const withAnswers = opts.answers ?? doc.design.answers;
  if (withAnswers) {
    const restart = sheetToolProfile(doc.tool)?.restartNumbers ?? false;
    const lines: string[] = [];
    for (const s of shownSections(doc)) {
      // An exam's mark scheme gives each part's marks and mark points too.
      const marked = !!doc.exam;
      const answers = s.blocks
        .filter(isQuestion)
        .map((q) => ({ n: numbers.get(q.id)!, a: answerText(q), marks: q.marks, points: q.type === "long" ? q.criteria : [] }))
        .filter((x) => x.a || x.points.length);
      if (!answers.length) continue;
      if (restart) lines.push(`### ${s.title}`);
      for (const x of answers) {
        lines.push(`${x.n}. ${x.a}${marked ? ` [${x.marks} mark${x.marks === 1 ? "" : "s"}]` : ""}`);
        if (marked) lines.push(...x.points.map((p) => `   - ${p}`));
      }
    }
    if (lines.length) out.push(`## ${answersTitle(doc)}`, ...lines);
    for (const { note } of visibleNotes(doc)) out.push(`## ${note.title || "Teacher notes"}`, ...note.points.map((p) => `- ${p}`));
  }
  return out.join("\n\n");
}
