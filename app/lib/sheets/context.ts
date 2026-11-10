// What a sheet needs besides the model's draft, built from the form's request:
// its subtitle, its starting design, and (for a comprehension on the teacher's
// own text) the passage, which never goes through the model.
//
// Shared by the browser, which normalises the stream as it arrives, and by the
// guest route, which stores the finished sheet for a visitor to claim. Both
// must produce the same document from the same request.

import { defaultFamilyForYear } from "@/app/lib/slideshowThemes";
import { defaultDesign, normalizeDraft, ownPassageSection, serializeSheet, type NormalizeContext } from "./normalize";
import { parsePartialJson } from "./stream";
import { DEFAULT_SHEET_THEME } from "./themes";
import { puzzleDefaults } from "./puzzles/level";
import { sheetToolProfile } from "./tools";
import type { SheetTool } from "./types";

export interface SheetRequestInfo {
  yearGroup?: string;
  subject?: string;
  /** Comprehension: whether the answers page is wanted. */
  includeAnswerKey?: boolean;
  textSource?: "generate" | "own" | "";
  ownText?: string;
  /** Worksheet: the worksheet type, whose starting design goes over the
   *  year's default (an exam paper drops the objective line). */
  template?: string;
  /** One band's version of a differentiated set: puzzles are pitched to it. */
  band?: string;
  /** Lesson plans: the form's curriculum and topic, kept for the buttons
   *  that make slides, a worksheet or a quiz from the plan. */
  curriculum?: string;
  topic?: string;
  /** Lesson plans: the layout and the lesson's length in minutes. */
  layout?: string;
  lessonLength?: number;
}

export function sheetContext(tool: SheetTool, info: SheetRequestInfo): NormalizeContext {
  const profile = sheetToolProfile(tool);
  const year = info.yearGroup && info.yearGroup !== "Mixed" ? info.yearGroup : "";
  const subtitle = [
    info.yearGroup === "Mixed" ? "Mixed years" : year,
    profile.subtitleLabel ?? info.subject?.trim(),
    profile.subtitleSuffix?.(info),
  ].filter(Boolean).join(" · ");
  const design = {
    ...defaultDesign(tool, DEFAULT_SHEET_THEME[defaultFamilyForYear(year)]),
    ...profile.startDesign(info),
  };
  return {
    tool,
    subtitle,
    design,
    puzzle: puzzleDefaults(info.yearGroup, info.band),
    ...(profile.arrange ? { arrange: (raw: unknown) => profile.arrange!(raw, info) } : {}),
    ...(profile.lessonMeta ? { lesson: profile.lessonMeta(info) } : {}),
    leadingSections:
      profile.ownPassage && info.textSource === "own" && info.ownText?.trim()
        ? [ownPassageSection(info.ownText)]
        : undefined,
  };
}

/** The stored form of a finished stream: the normalised sheet, serialised.
 *  Null when the stream held nothing usable. */
export function finishSheet(tool: SheetTool, streamed: string, info: SheetRequestInfo): string | null {
  const draft = parsePartialJson(streamed);
  if (!draft) return null;
  const doc = normalizeDraft(draft, sheetContext(tool, info));
  if (!doc.title && doc.sections.length === 0) return null;
  return serializeSheet(doc);
}
