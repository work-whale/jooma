// A sheet as a Word document, built from its blocks rather than from a
// screenshot, so the teacher gets text they can keep editing in Word.
//
// Word has no CSS, so the look is carried by what Word does have: the theme's
// colours on headings, shaded single cell tables for callouts, passages and
// word banks, two column tables for multiple choice, bordered paragraphs for
// answer lines. Answers start on a new page, as on screen.
//
// Arial throughout: a theme's web font is rarely installed on a school
// laptop, and Word's substitute for a missing font is unpredictable.

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from "docx";
import { answersTitle, answerText, examCover, hasAnswersPage, questionLabels, showsCover } from "./markdown";
import { levelLabel } from "./model-answers";
import { clockText, phaseClock, phaseRows, stageLabel } from "./lesson";
import { sheetToolProfile } from "./tools";
import { getSheetTheme } from "./themes";
import { showsIntro, showsObjective, showsPictures, showsSlip, visibleNotes } from "./visibility";
import { formatLetterDate } from "./letter";
import { sheetImages } from "./normalize";
import { clueText, crosswordCells, crosswordNumbers, placementCells, sortBank, sortRows } from "./puzzles";
import { isQuestion, type ImageBlock, type SheetBlock, type SheetDoc, type SheetQuestion } from "./types";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const FONT = "Arial";
/** Half points, per font size setting. */
const SIZE: Record<SheetDoc["design"]["fontScale"], number> = { s: 21, m: 23, l: 26, xl: 30 };

type Child = Paragraph | Table;

const hex = (c: string) => c.replace("#", "").toUpperCase();

/** **bold** spans as runs. Fractions stay as 3/4, which Word reads fine. */
function runs(text: string, opts: { size: number; color?: string; bold?: boolean; italics?: boolean }): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
      return new TextRun({ text: bold ? part.slice(2, -2) : part, font: FONT, size: opts.size, color: opts.color, bold: bold || opts.bold, italics: opts.italics });
    });
}

/** Each picture size's frame on the page (sheet-css .js-photo-frame), in
 *  pixels. Word cannot crop to a frame, so a picture fits inside it instead. */
const PICTURE_FRAME: Record<ImageBlock["size"], { w: number; h: number }> = {
  s: { w: 195, h: 130 },
  m: { w: 300, h: 200 },
  l: { w: 480, h: 320 },
};

interface WordPicture {
  type: "jpg" | "png" | "gif";
  data: ArrayBuffer;
  width: number;
  height: number;
}

/**
 * One picture's bytes in a type Word takes, with its natural size. Storage
 * may hold WebP, which Word cannot show, so anything else is redrawn as a
 * JPEG. Null when it cannot be fetched or decoded: the document is built
 * without it rather than not at all.
 */
async function wordPicture(src: string): Promise<WordPicture | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const native = ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" } as const)[blob.type as "image/jpeg"];
    if (native) {
      bitmap.close();
      return { type: native, data: await blob.arrayBuffer(), width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return jpeg ? { type: "jpg", data: await jpeg.arrayBuffer(), width, height } : null;
  } catch {
    return null;
  }
}

/** Fits a picture inside its frame, keeping its shape. */
export function fitPicture(size: ImageBlock["size"], width: number, height: number): { width: number; height: number } {
  const frame = PICTURE_FRAME[size] ?? PICTURE_FRAME.m;
  if (!(width > 0 && height > 0)) return { width: frame.w, height: frame.h };
  const scale = Math.min(frame.w / width, frame.h / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

export async function buildSheetDocx(doc: SheetDoc): Promise<Blob> {
  const theme = getSheetTheme(doc.design.themeId);
  const c = theme.colors;
  const size = SIZE[doc.design.fontScale] ?? SIZE.m;
  const numbers = questionLabels(doc);
  const clocks = phaseClock(doc);
  // Fetched before the document is built: Word embeds the bytes.
  const pictures = new Map<string, WordPicture>();
  if (showsPictures(doc)) {
    const found = await Promise.all(sheetImages(doc).filter((b) => b.src).map(async (b) => [b.id, await wordPicture(b.src)] as const));
    for (const [id, pic] of found) if (pic) pictures.set(id, pic);
  }

  const para = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new Paragraph({
      children: runs(text, { size: o.size ?? size, color: o.color ?? hex(c.ink), bold: o.bold, italics: o.italics }),
      spacing: { after: o.after ?? 100 },
      alignment: o.align,
    });

  /** A single cell table: the box a callout, word bank or passage sits in. */
  const box = (children: Paragraph[], fill: string, border: string, dashed = false) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: dashed ? BorderStyle.DASHED : BorderStyle.SINGLE, size: 10, color: border },
        bottom: { style: dashed ? BorderStyle.DASHED : BorderStyle.SINGLE, size: 10, color: border },
        left: { style: dashed ? BorderStyle.DASHED : BorderStyle.SINGLE, size: 10, color: border },
        right: { style: dashed ? BorderStyle.DASHED : BorderStyle.SINGLE, size: 10, color: border },
        insideHorizontal: NONE,
        insideVertical: NONE,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children,
              shading: { type: ShadingType.CLEAR, color: "auto", fill },
              margins: { top: 120, bottom: 120, left: 180, right: 180 },
            }),
          ],
        }),
      ],
    });

  const spacer = () => new Paragraph({ children: [], spacing: { after: 120 } });

  /** Answer lines: empty paragraphs with a bottom border. */
  const lines = (n: number): Paragraph[] =>
    Array.from({ length: n }, () =>
      new Paragraph({
        children: [],
        spacing: { before: 260, after: 0 },
        border: { bottom: { style: theme.look.lines === "solid" ? BorderStyle.SINGLE : theme.look.lines === "dotted" ? BorderStyle.DOTTED : BorderStyle.DASHED, size: 6, color: hex(c.muted) } },
      }),
    );

  const grid = (cells: ParagraphChild[][], cols: number): Table => {
    const rows: TableRow[] = [];
    for (let i = 0; i < cells.length; i += cols) {
      rows.push(
        new TableRow({
          children: Array.from({ length: cols }, (_, j) =>
            new TableCell({
              width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: cells[i + j] ?? [] })],
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
            }),
          ),
        }),
      );
    }
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows });
  };

  const tr = (text: string, o: { bold?: boolean; color?: string } = {}) => new TextRun({ text, font: FONT, size, bold: o.bold, color: o.color ?? hex(c.ink) });

  const wordBank = (title: string, words: string[]) =>
    box([new Paragraph({ children: [tr(`${title}:  `, { bold: true, color: hex(c.heading) }), tr(words.join("   •   "))] })], hex(c.paper), hex(c.accent), true);

  /**
   * A puzzle grid: one fixed square per letter. A null square has no border,
   * so a crossword shows only its answer squares. `numbers` are the small clue
   * numbers; `shade` marks squares on the answers page.
   */
  const letterGrid = (
    rows: (string | null)[][],
    o: { numbers?: Map<string, number>; shade?: Set<string>; hideLetters?: boolean; cell?: number } = {},
  ): Table => {
    const cols = rows[0]?.length ?? 0;
    const cell = o.cell ?? Math.min(440, Math.floor(6600 / Math.max(cols, 1)));
    const line = { style: BorderStyle.SINGLE, size: 6, color: hex(c.ink) };
    return new Table({
      alignment: AlignmentType.CENTER,
      layout: TableLayoutType.FIXED,
      width: { size: cell * cols, type: WidthType.DXA },
      columnWidths: Array.from({ length: cols }, () => cell),
      borders: noBorders,
      rows: rows.map((row, r) =>
        new TableRow({
          height: { value: cell, rule: HeightRule.EXACT },
          children: row.map((ch, col) => {
            const key = `${r},${col}`;
            const on = ch !== null;
            const n = o.numbers?.get(key);
            return new TableCell({
              width: { size: cell, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              borders: on ? { top: line, bottom: line, left: line, right: line } : { top: NONE, bottom: NONE, left: NONE, right: NONE },
              shading: on && o.shade?.has(key) ? { type: ShadingType.CLEAR, color: "auto", fill: hex(c.soft) } : undefined,
              margins: { top: 0, bottom: 0, left: 20, right: 20 },
              children: [
                new Paragraph({
                  alignment: n !== undefined && o.hideLetters ? AlignmentType.LEFT : AlignmentType.CENTER,
                  children: [
                    ...(n !== undefined ? [new TextRun({ text: `${n}`, font: FONT, size: 12, color: hex(c.muted), superScript: !o.hideLetters })] : []),
                    ...(on && !o.hideLetters ? [new TextRun({ text: ch!, font: FONT, size: Math.min(size, Math.round(cell / 14)), bold: !!o.shade?.has(key) })] : []),
                  ],
                }),
              ],
            });
          }),
        }),
      ),
    });
  };

  /** The answers page's picture of a solved word search or crossword. */
  const solvedGrid = (q: SheetQuestion): Child[] => {
    if (q.type === "wordsearch" && q.grid.length) {
      return [letterGrid(q.grid.map((row) => row.split("")), { shade: new Set(q.placements.flatMap(placementCells)), cell: 260 }), spacer()];
    }
    if (q.type === "crossword" && q.placed.length) {
      return [letterGrid(crosswordCells(q), { cell: 300 }), spacer()];
    }
    return [];
  };

  const questionBody = (q: SheetQuestion): Child[] => {
    switch (q.type) {
      case "mcq":
        return [grid(q.options.map((o, i) => [tr(q.answers.length > 1 ? "☐  " : "○  "), tr(`${LETTERS[i]}  `, { bold: true, color: hex(c.heading) }), ...runs(o, { size })]), 2)];
      case "truefalse":
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { ...noBorders, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: hex(c.line) } },
            rows: [
              new TableRow({ children: ["", "True", "False"].map((h, i) => new TableCell({ width: { size: i ? 12 : 76, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: i ? AlignmentType.CENTER : undefined, children: [tr(h, { bold: true, color: hex(c.muted) })] })] })) }),
              ...q.statements.map((s) =>
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: runs(s.text, { size }) })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [tr("○")] })] }),
                    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [tr("○")] })] }),
                  ],
                }),
              ),
            ],
          }),
        ];
      case "matching": {
        const rows = Math.max(q.left.length, q.right.length);
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: Array.from({ length: rows }, (_, i) =>
              new TableRow({
                children: [
                  new TableCell({ width: { size: 42, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: q.left[i] !== undefined ? [tr(`${i + 1}  `, { bold: true, color: hex(c.heading) }), ...runs(q.left[i], { size }), tr("   •")] : [] })] }),
                  new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [] })] }),
                  new TableCell({ width: { size: 42, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: q.right[i] !== undefined ? [tr("•   "), tr(`${LETTERS[i]}  `, { bold: true, color: hex(c.heading) }), ...runs(q.right[i], { size })] : [] })] }),
                ],
              }),
            ),
          }),
        ];
      }
      case "fillblanks":
        return [
          ...(q.wordBank.length ? [wordBank("Word bank", q.wordBank), spacer()] : []),
          ...q.sentences.map((s) => new Paragraph({ children: runs(s.replace(/___/g, "______________"), { size }), spacing: { after: 160, line: 360 } })),
        ];
      case "short":
      case "long":
        return lines(q.lines);
      case "calc":
        return [
          ...(q.working ? [box([new Paragraph({ children: [tr("Working", { bold: true, color: hex(c.muted) })] }), ...Array.from({ length: 5 }, () => new Paragraph({ children: [] }))], "FFFFFF", hex(c.muted), true)] : []),
          new Paragraph({ children: [tr("Answer:  ", { bold: true }), tr("____________________")], spacing: { before: 160 } }),
        ];
      case "order":
        return q.items.map((it) => new Paragraph({ children: [tr("☐   "), ...runs(it, { size })], spacing: { after: 80 } }));
      case "wordorder":
        return [box([new Paragraph({ children: [tr(q.words.join("   /   "), { bold: true })] })], hex(c.soft), hex(c.line)), ...lines(1)];
      case "picture":
        return [grid(q.options.map((o) => [tr(`${o.emoji}  `), tr(o.label), tr("   ○")]), Math.min(3, Math.max(1, q.options.length)))];
      case "label":
        return [
          ...(q.wordBank.length ? [wordBank("Word bank", q.wordBank), spacer()] : []),
          ...q.items.map((it, i) => new Paragraph({ children: [tr(`${i + 1}  `, { bold: true, color: hex(c.heading) }), ...runs(it.clue, { size }), tr("   ____________________")], spacing: { after: 120 } })),
        ];
      case "sort": {
        const rows = sortRows(q);
        return [
          wordBank("Sort these", sortBank(q)),
          spacer(),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: q.categories.map((cat) =>
                  new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(c.soft) }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [tr(cat.name, { bold: true, color: hex(c.heading) })] })] }),
                ),
              }),
              ...Array.from({ length: rows }, () =>
                new TableRow({
                  height: { value: 440, rule: HeightRule.ATLEAST },
                  children: q.categories.map(() => new TableCell({ children: [new Paragraph({ children: [] })] })),
                }),
              ),
            ],
          }),
        ];
      }
      case "wordsearch":
        return q.grid.length
          ? [letterGrid(q.grid.map((row) => row.split(""))), spacer(), wordBank("Find", q.placements.map((p) => p.word))]
          : [];
      case "crossword": {
        if (!q.placed.length) return [];
        const clues = (dir: "across" | "down") => [
          new Paragraph({ children: [tr(dir === "across" ? "Across" : "Down", { bold: true, color: hex(c.heading) })], spacing: { after: 60 } }),
          ...q.placed.filter((p) => p.dir === dir).map((p) => new Paragraph({ spacing: { after: 60 }, children: [tr(`${p.number}  `, { bold: true }), ...runs(clueText(p), { size })] })),
        ];
        return [
          letterGrid(crosswordCells(q), { numbers: crosswordNumbers(q.placed), hideLetters: true }),
          spacer(),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [new TableRow({ children: [new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: clues("across") }), new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: clues("down") })] })],
          }),
          ...(q.wordBank ? [spacer(), wordBank("Word bank", q.placed.map((p) => p.answer).sort((x, y) => x.localeCompare(y)))] : []),
        ];
      }
    }
  };

  const block = (b: SheetBlock): Child[] => {
    if (isQuestion(b)) {
      const n = numbers.get(b.id);
      const head = new Paragraph({
        keepNext: true,
        spacing: { before: 160, after: 100 },
        children: [
          tr(`${n}.  `, { bold: true, color: hex(c.heading) }),
          ...(b.domain ? [tr(`[${b.domain}] `, { bold: true, color: hex(c.muted) })] : []),
          ...(b.type === "short" && b.quote ? [new TextRun({ text: `"${b.quote}"  `, font: FONT, size, italics: true })] : []),
          ...runs(b.prompt, { size, bold: true }),
          ...(b.marks > 0 ? [tr(`   (${b.marks} mark${b.marks === 1 ? "" : "s"})`, { color: hex(c.muted) })] : []),
        ],
      });
      return [head, ...questionBody(b), spacer()];
    }
    switch (b.type) {
      case "text":
        return [para(b.text)];
      case "image": {
        const pic = pictures.get(b.id);
        if (!pic) return [];
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new ImageRun({
                type: pic.type,
                data: pic.data,
                transformation: fitPicture(b.size, pic.width, pic.height),
                altText: { name: b.alt || "Picture", description: b.alt, title: b.alt },
              }),
            ],
          }),
        ];
      }
      case "callout":
        return [box([new Paragraph({ children: [tr(`${b.emoji}  ${b.label}  `, { bold: true, color: hex(c.heading) }), ...runs(b.text, { size })] })], hex(c.panel), hex(c.accent)), spacer()];
      case "wordbank":
        return [wordBank(b.title, b.words), spacer()];
      case "passage":
        return [
          box(
            [
              ...(b.title ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [tr(b.title, { bold: true, color: hex(c.heading) })] })] : []),
              ...b.paragraphs.map((p, i) =>
                new Paragraph({
                  spacing: { after: 140, line: 312 },
                  children: [...(doc.design.lineNumbers ? [new TextRun({ text: `${i + 1}   `, font: FONT, size: size - 4, bold: true, color: hex(c.muted) })] : []), ...runs(p, { size })],
                }),
              ),
            ],
            hex(c.panel),
            hex(c.line),
          ),
          spacer(),
        ];
      case "exemplar": {
        const body =
          b.form === "prose"
            ? b.parts.map((p) => new Paragraph({ spacing: { after: 100 }, children: runs(p, { size }) }))
            : b.parts.map((p, i) => new Paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 360 }, children: [tr(b.form === "steps" ? `${i + 1}.  ` : "•  ", { bold: true, color: hex(c.heading) }), ...runs(p, { size })] }));
        return [
          box(
            [
              new Paragraph({ spacing: { after: 100 }, children: [tr(`${levelLabel(b.level)}   `, { bold: true, color: hex(c.heading) }), tr(`${b.awarded} / ${b.outOf} marks`, { color: hex(c.muted) })] }),
              ...body,
              ...(b.annotations.length
                ? [
                    new Paragraph({ spacing: { before: 120, after: 60 }, children: [tr("Where the marks come from", { bold: true })] }),
                    ...b.annotations.map((a) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `"${a.quote}"  `, font: FONT, size, italics: true }), ...runs(a.note, { size })] })),
                  ]
                : []),
              ...(b.commentary ? [new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: b.commentary, font: FONT, size, italics: true, color: hex(c.muted) })] })] : []),
            ],
            hex(b.level === "full" ? c.panel : c.paper),
            hex(c.line),
          ),
          spacer(),
        ];
      }
      case "list":
        return [
          ...(b.title ? [new Paragraph({ keepNext: true, spacing: { after: 60 }, children: [tr(b.title, { bold: true, color: hex(c.heading) })] })] : []),
          ...b.items.map((it, i) =>
            new Paragraph({
              spacing: { after: 60 },
              indent: { left: 360, hanging: 360 },
              children: [tr(b.style === "number" ? `${i + 1}.  ` : b.style === "check" ? "☐  " : "•  ", { bold: b.style === "number", color: hex(c.heading) }), ...runs(it, { size })],
            }),
          ),
          spacer(),
        ];
      case "phase": {
        const layout = doc.lesson?.layout;
        const t = clocks.get(b.id);
        const when = t ? `${clockText(t.start)} to ${clockText(t.end)}  (${b.minutes} min)` : `${b.minutes} min`;
        const cell = (children: Paragraph[], width: number, fill?: string) =>
          new TableCell({ width: { size: width, type: WidthType.PERCENTAGE }, children, shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined, margins: { top: 80, bottom: 80, left: 120, right: 120 } });
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  cell([new Paragraph({ children: [tr(stageLabel(b.stage, layout).toUpperCase(), { bold: true, color: hex(c.heading) })] }), new Paragraph({ children: [tr(when, { color: hex(c.muted) })] })], 26, hex(c.soft)),
                  cell([new Paragraph({ children: [tr(b.title, { bold: true, color: hex(c.heading) })] })], 74, hex(c.soft)),
                ],
              }),
              ...phaseRows(b, layout).map((r) =>
                new TableRow({
                  children: [
                    cell([new Paragraph({ children: [tr(r.label, { bold: true })] })], 26),
                    cell(r.items.length ? r.items.map((x) => new Paragraph({ bullet: { level: 0 }, children: runs(x, { size }) })) : [new Paragraph({ children: runs(r.text, { size }) })], 74),
                  ],
                }),
              ),
            ],
          }),
          spacer(),
        ];
      }
      case "table":
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ tableHeader: true, children: b.headers.map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(c.soft) }, children: [new Paragraph({ children: [tr(h, { bold: true, color: hex(c.heading) })] })] })) }),
              ...b.rows.map((r) => new TableRow({ children: r.map((cell) => new TableCell({ children: [new Paragraph({ children: runs(cell, { size }) })], margins: { top: 80, bottom: 80, left: 100, right: 100 } })) })),
            ],
          }),
          spacer(),
        ];
    }
  };

  const children: Child[] = [];
  // An exam paper opens with its cover, on a page of its own.
  const cover = showsCover(doc) ? examCover(doc) : null;
  if (cover) {
    children.push(
      para([cover.level, cover.tier].filter(Boolean).join(", ").toUpperCase(), { bold: true, color: hex(c.muted), after: 80 }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: doc.title || "Exam paper", font: FONT, size: Math.round(size * 2.2), bold: true, color: hex(c.heading) })] }),
      para(`Time allowed: ${cover.time}`, { bold: true }),
      para(`Total marks: ${cover.total}`, { bold: true, after: 240 }),
      new Paragraph({ spacing: { after: 160 }, children: [tr("Name ", { bold: true }), tr("________________________________   "), tr("Class ", { bold: true }), tr("____________")] }),
      para("Instructions", { bold: true, color: hex(c.heading), after: 60 }),
      ...cover.instructions.map((i) => new Paragraph({ bullet: { level: 0 }, children: runs(i, { size }) })),
      ...(cover.disclaimer ? [spacer(), para(cover.disclaimer, { italics: true, color: hex(c.muted), size: size - 4 })] : []),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }
  // A letter: school and date on the right, the salutation and "Re:" line.
  const letter = doc.letter;
  if (letter) {
    if (letter.school) children.push(para(letter.school, { bold: true, color: hex(c.heading), align: AlignmentType.RIGHT, after: 40 }));
    children.push(para(formatLetterDate(letter.date), { align: AlignmentType.RIGHT, after: 280 }));
    children.push(para(letter.salutation, { after: 200 }));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [tr("Re: ", { bold: true, color: hex(c.heading) }), tr(doc.title, { bold: true, color: hex(c.heading) })] }));
  }
  // With a cover, the title and the candidate's details are on it already.
  if (!cover && !letter && doc.design.nameDate) {
    children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 160 }, children: [tr("Name ", { bold: true }), tr("______________________   "), tr("Date ", { bold: true }), tr("______________")] }));
  }
  if (!cover && !letter && doc.subtitle) children.push(para(doc.subtitle.toUpperCase(), { bold: true, color: hex(c.muted), size: size - 4, after: 40 }));
  if (!cover && !letter) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: doc.title || "Worksheet", font: FONT, size: Math.round(size * 2), bold: true, color: hex(c.heading) })] }));
  if (doc.objective && showsObjective(doc)) children.push(box([new Paragraph({ children: [tr("Learning objective:  ", { bold: true, color: hex(c.heading) }), ...runs(doc.objective, { size })] })], hex(c.soft), hex(c.soft)), spacer());
  if (doc.intro && showsIntro(doc)) children.push(...block({ id: "intro", type: "callout", ...doc.intro }));

  for (const s of doc.sections) {
    const title = `${theme.look.emoji && s.emoji ? `${s.emoji}  ` : ""}${s.title}`;
    // A letter's paragraphs sit under no heading.
    if (letter && !s.title) {
      for (const b of s.blocks) children.push(...block(b));
      continue;
    }
    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 280, after: 120 },
        shading: theme.look.section === "band" ? { type: ShadingType.CLEAR, color: "auto", fill: hex(c.soft) } : undefined,
        border: theme.look.section === "band" ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 12, color: hex(c.accent), space: 4 } },
        children: [new TextRun({ text: title, font: FONT, size: Math.round(size * 1.35), bold: true, color: hex(c.heading) })],
      }),
    );
    if (s.instructions) children.push(para(s.instructions, { italics: true, color: hex(c.muted) }));
    for (const b of s.blocks) children.push(...block(b));
  }

  if (letter) {
    children.push(para(letter.signOff, { after: 720 }));
    if (letter.senderName) children.push(para(letter.senderName, { bold: true, after: 20 }));
    if (letter.senderRole) children.push(para(letter.senderRole, { color: hex(c.muted) }));
    const slip = letter.slip;
    if (slip && showsSlip(doc)) {
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 480, after: 160 },
          border: { top: { style: BorderStyle.DASHED, size: 12, color: hex(c.muted), space: 8 } },
          children: [tr("Cut here and return to school", { color: hex(c.muted) })],
        }),
        new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [tr(slip.title, { bold: true, color: hex(c.heading) })] }),
        ...(slip.returnBy ? [new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [tr("Please return by: ", { bold: true }), tr(slip.returnBy)] })] : []),
        new Paragraph({ keepNext: true, spacing: { after: 160 }, children: runs(slip.statement, { size }) }),
        ...slip.fields.map((f, i) => new Paragraph({ keepNext: i < slip.fields.length - 1, spacing: { before: 200, after: 0 }, children: [tr(`${f}  `, { bold: true }), tr("______________________________________")] })),
      );
    }
  }

  if (hasAnswersPage(doc)) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: answersTitle(doc), font: FONT, size: Math.round(size * 1.6), bold: true, color: hex(c.heading) })] }));
    const restart = sheetToolProfile(doc.tool)?.restartNumbers ?? false;
    for (const s of doc.sections) {
      if (restart && s.blocks.some(isQuestion)) {
        children.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 80 }, children: [tr(s.title, { bold: true, color: hex(c.heading) })] }));
      }
      for (const b of s.blocks) {
        if (!isQuestion(b)) continue;
        const a = answerText(b);
        const criteria = b.type === "long" ? b.criteria : [];
        if (!a && !criteria.length) continue;
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              tr(`${numbers.get(b.id)}.  `, { bold: true, color: hex(c.heading) }),
              ...runs(a, { size }),
              ...(doc.exam ? [tr(`   [${b.marks} mark${b.marks === 1 ? "" : "s"}]`, { color: hex(c.muted) })] : []),
            ],
          }),
        );
        for (const cr of criteria) children.push(new Paragraph({ bullet: { level: 0 }, children: runs(cr, { size }) }));
        children.push(...solvedGrid(b));
      }
    }
    for (const { note } of visibleNotes(doc)) {
      children.push(spacer());
      children.push(
        box(
          [new Paragraph({ children: [tr(note.title || "Teacher notes", { bold: true, color: hex(c.heading) })], spacing: { after: 80 } }), ...note.points.map((p) => new Paragraph({ bullet: { level: 0 }, children: runs(p, { size }) }))],
          hex(c.panel),
          hex(c.line),
        ),
      );
    }
  }

  const word = new Document({
    styles: { default: { document: { run: { font: FONT, size } } } },
    sections: [
      {
        properties: {
          page: {
            size: doc.design.paper === "letter" ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 },
            margin: { top: 1000, bottom: 1000, left: 1080, right: 1080 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(word);
}
