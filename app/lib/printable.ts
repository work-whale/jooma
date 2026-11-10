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
