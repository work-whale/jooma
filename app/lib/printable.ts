// A saved run as a sheet, when it can be drawn as one: a designed sheet
// (Worksheet, Comprehension, Lesson Plan...), the first of a set of
// differentiated versions, or a quiz, new or old shape, as its printable
// version. Null for markdown and for decks.
//
// The one question every reader of someone else's output asks (the Library's
// Word download, the shared resource view, the slideshow's "use a previous
// output"), so the answer lives in one place.

import { primaryOutput } from "@/app/lib/bands";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { parseQuiz, quizToSheet } from "@/app/lib/quiz/quiz";
import type { SheetDoc } from "@/app/lib/sheets/types";
import { parseReports, reportsMarkdown } from "@/app/lib/reports/reports";
import { swapIn } from "@/app/lib/reports/privacy";

export function printableSheet(slug: string, output: string | null | undefined, input?: Record<string, unknown>): SheetDoc | null {
  if (typeof output !== "string") return null;
  const first = primaryOutput(output);
  const sheet = parseSheet(first);
  if (sheet) return sheet;
  if (slug === "quiz-generator") {
    const quiz = parseQuiz(first, input);
    return quiz && quiz.questions.length ? quizToSheet(quiz) : null;
  }
  return null;
}

/**
 * A saved run as text a reader can show or download: a class's reports as
 * markdown (names in for the teacher, or "Pupil 1" and "[PUPIL]" when the
 * text is on its way to a model), otherwise the output itself, or the first
 * of a set of differentiated versions.
 */
export function readableOutput(output: string, opts: { forModel?: boolean } = {}): string {
  const reports = parseReports(output);
  if (!reports) return primaryOutput(output);
  if (!opts.forModel) return reportsMarkdown(reports, swapIn);
  const anonymous = { ...reports, pupils: reports.pupils.map((p, i) => ({ ...p, name: `Pupil ${i + 1}` })) };
  return reportsMarkdown(anonymous, (text) => text);
}
