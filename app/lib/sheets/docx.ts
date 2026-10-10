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
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { answerText, hasAnswersPage, questionNumbers } from "./markdown";
import { getSheetTheme } from "./themes";
import { showsIntro, showsObjective, visibleNotes } from "./visibility";
import { isQuestion, type SheetBlock, type SheetDoc, type SheetQuestion } from "./types";

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

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

export async function buildSheetDocx(doc: SheetDoc): Promise<Blob> {
  const theme = getSheetTheme(doc.design.themeId);
  const c = theme.colors;
  const size = SIZE[doc.design.fontScale] ?? SIZE.m;
  const numbers = questionNumbers(doc);

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
  if (doc.design.nameDate) {
    children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 160 }, children: [tr("Name ", { bold: true }), tr("______________________   "), tr("Date ", { bold: true }), tr("______________")] }));
  }
  if (doc.subtitle) children.push(para(doc.subtitle.toUpperCase(), { bold: true, color: hex(c.muted), size: size - 4, after: 40 }));
  children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: doc.title || "Worksheet", font: FONT, size: Math.round(size * 2), bold: true, color: hex(c.heading) })] }));
  if (doc.objective && showsObjective(doc)) children.push(box([new Paragraph({ children: [tr("Learning objective:  ", { bold: true, color: hex(c.heading) }), ...runs(doc.objective, { size })] })], hex(c.soft), hex(c.soft)), spacer());
  if (doc.intro && showsIntro(doc)) children.push(...block({ id: "intro", type: "callout", ...doc.intro }));

  for (const s of doc.sections) {
    const title = `${theme.look.emoji && s.emoji ? `${s.emoji}  ` : ""}${s.title}`;
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

  if (hasAnswersPage(doc)) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Answers", font: FONT, size: Math.round(size * 1.6), bold: true, color: hex(c.heading) })] }));
    for (const s of doc.sections) {
      for (const b of s.blocks) {
        if (!isQuestion(b)) continue;
        const a = answerText(b);
        const criteria = b.type === "long" ? b.criteria : [];
        if (!a && !criteria.length) continue;
        children.push(new Paragraph({ spacing: { after: 80 }, children: [tr(`${numbers.get(b.id)}.  `, { bold: true, color: hex(c.heading) }), ...runs(a, { size })] }));
        for (const cr of criteria) children.push(new Paragraph({ bullet: { level: 0 }, children: runs(cr, { size }) }));
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
