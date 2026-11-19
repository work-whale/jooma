/*
 * E10's "{resource idea}" (Jooma 4.5 Step 6): one quick thing to make, for a
 * Free teacher who has not been in for 14 days.
 *
 * Owner's choice (19 Nov): a short list written here, editable in the admin
 * console (table lifecycle_ideas, kind 'e10'), each opening a real tool. Not a
 * pre-filled form: every tool needs the teacher's own topic before a prefill
 * is valid, so the link opens the tool and the idea says what to make.
 *
 * Everyone gets the same idea in a given UK week (Sunday to Saturday, the Free
 * refill week), and the list rotates. The cost line uses the tool's measured
 * estimate, never the spec's "10 credits".
 *
 * Pure.
 */

import { ukWeekKey } from "@/app/lib/run-out-offer";
import { estimateFor, roundEstimate } from "@/app/lib/tool-estimates";
import { v2ToolForSlug } from "@/app/lib/tools";

export interface Idea {
  /** Reads after "Here's a quick one for this week:". No full stop. */
  text: string;
  toolSlug: string;
}

export const DEFAULT_IDEAS: readonly Idea[] = [
  { text: "a 10 question retrieval quiz on last week's topic", toolSlug: "quiz-generator" },
  { text: "a worksheet at three levels for Monday's lesson", toolSlug: "worksheet-generator" },
  { text: "a short reading comprehension with questions and answers", toolSlug: "comprehension-generator" },
  { text: "a 20 minute homework task on this week's topic", toolSlug: "homework-generator" },
  { text: "five exam style questions to end a lesson", toolSlug: "exam-question-generator" },
  { text: "a model paragraph that shows the class what good looks like", toolSlug: "model-text-generator" },
  { text: "a cover lesson ready for a day you might be out", toolSlug: "cover-lesson" },
  { text: "a letter home about next half term's topic", toolSlug: "letter-writer" },
];

const WEEK_MS = 7 * 86_400_000;
/** A fixed Sunday, so the rotation does not depend on when the list changed. */
const EPOCH = Date.UTC(2026, 0, 4);

/** This UK week's idea. An empty list (nothing saved in admin) uses the defaults. */
export function pickIdea(ideas: readonly Idea[], now: Date): Idea {
  const list = ideas.length ? ideas : DEFAULT_IDEAS;
  const [y, m, d] = ukWeekKey(now).split("-").map(Number);
  const week = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / WEEK_MS);
  return list[((week % list.length) + list.length) % list.length];
}

/** What the email needs: the words, the tool's page and its rounded cost. */
export function ideaFor(idea: Idea): { text: string; href: string; cost: number } {
  return {
    text: idea.text,
    href: v2ToolForSlug(idea.toolSlug)?.href ?? "/tools",
    cost: roundEstimate(estimateFor(idea.toolSlug)),
  };
}
