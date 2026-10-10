// What the Design panel's toggles leave on the page. The sheet, the Word file
// and Copy all read these, so a piece switched off is gone from every one.
//
// The toggles for the learning objective, the intro box and the
// differentiation note came after sheets were already being saved, so a
// design without them reads as on: an older sheet looks as it always did.

import type { SheetDoc, SheetNote } from "./types";

/** The note explaining who this version is pitched at. The prompts give it
 *  one of these titles: "How this version is pitched: ..." for a version per
 *  band, "Differentiation" for one blended sheet. */
export function isDifferentiationNote(note: SheetNote): boolean {
  return /^\s*(how this version is pitched|differentiation)\b/i.test(note.title);
}

export function hasDifferentiationNote(doc: SheetDoc): boolean {
  return doc.teacherNotes.some(isDifferentiationNote);
}

export function showsObjective(doc: SheetDoc): boolean {
  return doc.design.objective !== false;
}

export function showsIntro(doc: SheetDoc): boolean {
  return doc.design.intro !== false;
}

/** The teacher notes printed on the answers page, each with its index in
 *  doc.teacherNotes so an edit still lands on the right one. */
export function visibleNotes(doc: SheetDoc): { note: SheetNote; index: number }[] {
  const hideDiff = doc.design.diffNote === false;
  return doc.teacherNotes.map((note, index) => ({ note, index })).filter(({ note }) => !(hideDiff && isDifferentiationNote(note)));
}
