// The editing operations on a sheet, as pure functions over the document.
// The editor calls these and keeps each result for undo; nothing here touches
// the page.

import { newSheetId } from "./normalize";
import type { BlockType, SheetBlock, SheetDoc, SheetSection } from "./types";

function withSection(doc: SheetDoc, si: number, fn: (s: SheetSection) => SheetSection): SheetDoc {
  return { ...doc, sections: doc.sections.map((s, i) => (i === si ? fn(s) : s)) };
}

export function updateBlock(doc: SheetDoc, si: number, bi: number, patch: Partial<SheetBlock>): SheetDoc {
  return withSection(doc, si, (s) => ({
    ...s,
    blocks: s.blocks.map((b, i) => (i === bi ? ({ ...b, ...patch } as SheetBlock) : b)),
  }));
}

export function moveBlock(doc: SheetDoc, si: number, bi: number, dir: -1 | 1): SheetDoc {
  const section = doc.sections[si];
  const target = bi + dir;
  // Off the top or bottom of a section, the block moves into the neighbour.
  if (target < 0 || target >= section.blocks.length) {
    const next = si + dir;
    if (next < 0 || next >= doc.sections.length) return doc;
    const block = section.blocks[bi];
    return {
      ...doc,
      sections: doc.sections.map((s, i) => {
        if (i === si) return { ...s, blocks: s.blocks.filter((_, j) => j !== bi) };
        if (i === next) return { ...s, blocks: dir === 1 ? [block, ...s.blocks] : [...s.blocks, block] };
        return s;
      }),
    };
  }
  return withSection(doc, si, (s) => {
    const blocks = [...s.blocks];
    [blocks[bi], blocks[target]] = [blocks[target], blocks[bi]];
    return { ...s, blocks };
  });
}

export function duplicateBlock(doc: SheetDoc, si: number, bi: number): SheetDoc {
  return withSection(doc, si, (s) => {
    const copy = { ...structuredClone(s.blocks[bi]), id: newSheetId("b") };
    return { ...s, blocks: [...s.blocks.slice(0, bi + 1), copy, ...s.blocks.slice(bi + 1)] };
  });
}

export function deleteBlock(doc: SheetDoc, si: number, bi: number): SheetDoc {
  return withSection(doc, si, (s) => ({ ...s, blocks: s.blocks.filter((_, i) => i !== bi) }));
}

export function insertBlock(doc: SheetDoc, si: number, block: SheetBlock, at?: number): SheetDoc {
  return withSection(doc, si, (s) => {
    const i = at ?? s.blocks.length;
    return { ...s, blocks: [...s.blocks.slice(0, i), block, ...s.blocks.slice(i)] };
  });
}

export function updateSection(doc: SheetDoc, si: number, patch: Partial<SheetSection>): SheetDoc {
  return withSection(doc, si, (s) => ({ ...s, ...patch }));
}

export function moveSection(doc: SheetDoc, si: number, dir: -1 | 1): SheetDoc {
  const target = si + dir;
  if (target < 0 || target >= doc.sections.length) return doc;
  const sections = [...doc.sections];
  [sections[si], sections[target]] = [sections[target], sections[si]];
  return { ...doc, sections };
}

export function deleteSection(doc: SheetDoc, si: number): SheetDoc {
  return { ...doc, sections: doc.sections.filter((_, i) => i !== si) };
}

export function addSection(doc: SheetDoc): SheetDoc {
  const section: SheetSection = {
    id: newSheetId("s"),
    title: "New section",
    emoji: "✏️",
    instructions: "",
    blocks: [newBlock("short")],
  };
  return { ...doc, sections: [...doc.sections, section] };
}

/** A starting block of each type, filled with placeholders to type over. */
export function newBlock(type: BlockType): SheetBlock {
  const id = newSheetId("b");
  const q = { id, prompt: "Write your question here", marks: 1, domain: "" };
  switch (type) {
    case "text": return { id, type: "text", text: "Write some text here." };
    case "callout": return { id, type: "callout", variant: "tip", label: "Top tip", emoji: "💡", text: "Write a helpful reminder here." };
    case "passage": return { id, type: "passage", title: "", paragraphs: ["Write or paste the text here."] };
    case "wordbank": return { id, type: "wordbank", title: "Word bank", words: ["word", "word", "word"] };
    case "table": return { id, type: "table", headers: ["Heading", "Heading"], rows: [["", ""], ["", ""]] };
    case "mcq": return { ...q, type: "mcq", options: ["Option A", "Option B", "Option C", "Option D"], answers: [0] };
    case "truefalse": return { ...q, prompt: "True or false?", type: "truefalse", statements: [{ text: "A statement", answer: true }, { text: "A statement", answer: false }] };
    case "matching": return { ...q, prompt: "Draw a line to match each one.", type: "matching", left: ["Term", "Term", "Term"], right: ["Meaning", "Meaning", "Meaning"], pairs: [0, 1, 2] };
    case "fillblanks": return { ...q, prompt: "Fill in the gaps.", type: "fillblanks", sentences: ["A sentence with a ___ in it."], answers: ["gap"], wordBank: [] };
    case "short": return { ...q, type: "short", lines: 2, answer: "", quote: "" };
    case "long": return { ...q, marks: 4, type: "long", lines: 6, answer: "", criteria: [] };
    case "calc": return { ...q, type: "calc", working: true, answer: "" };
    case "order": return { ...q, prompt: "Put these in order. Number them 1 to 4.", type: "order", items: ["First", "Second", "Third", "Fourth"], order: [0, 1, 2, 3] };
    case "wordorder": return { ...q, prompt: "Put the words in order to make a sentence.", type: "wordorder", words: ["words", "the", "Order"], answer: "Order the words" };
    case "picture": return { ...q, prompt: "Circle the right picture.", type: "picture", options: [{ emoji: "🍎", label: "Apple" }, { emoji: "🍌", label: "Banana" }, { emoji: "🍇", label: "Grapes" }], answer: 0 };
    case "label": return { ...q, prompt: "Label the parts.", type: "label", items: [{ clue: "A clue", answer: "part" }], wordBank: ["part"] };
  }
}
