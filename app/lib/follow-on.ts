import { CHUNK_SIZE, MAX_PUPILS } from "@/app/lib/reports/reports";
import { DIFFERENTIATION_BANDS } from "@/app/lib/differentiation";

/*
 * Which follow-up requests the server lets off the generation count.
 *
 * Some tools deliver one piece of work in several requests: a class's reports
 * five pupils at a time, a differentiated sheet one band at a time, a quiz
 * that gets questions added or rewritten afterwards. Only the first should
 * count against the hourly fair-use limit, so the others are recorded under a
 * `step`, which is_counted_generation ignores.
 *
 * The browser says which request is a follow-up (chunkIndex, redo, action,
 * bandIndex), and a hand-made request can say anything. So the claim is only
 * honoured while the teacher has budget for it: each counted generation of
 * the tool in the last hour buys `cap` follow-ups of each kind, plus one
 * parent's worth for a job still running. Past that, the request counts.
 *
 * WHY THE EXTRA PARENT'S WORTH
 * The pieces run side by side (reports two at a time, bands all at once), and
 * a parent's token_usage row is only written when its stream ends. So the
 * follow-ups usually arrive before their parent is on record. Without the
 * allowance a real teacher's second chunk would often be counted. The cost is
 * that one job's worth of follow-ups per tool per hour can be faked, which is
 * small, and every one of them still spends credit.
 *
 * Spend is not what this protects: every request, counted or not, comes out of
 * the monthly credit ceiling. It keeps the hourly limit and the billing page's
 * count honest. The database read lives in follow-on-server.ts; this file is
 * pure so it can be unit tested.
 */

export const FOLLOW_ON_WINDOW_MINUTES = 60;

interface FollowOnKind {
  /** Tools whose requests may carry this kind's steps. */
  tools: readonly string[];
  /** The step names this kind records, sharing one budget. */
  steps: readonly string[];
  /** Follow-ups allowed per counted generation. */
  cap: number;
}

export const FOLLOW_ON_KINDS = {
  /** Every chunk of a class after the first: a full class of MAX_PUPILS. */
  reportBatch: {
    tools: ["report-writer"],
    steps: ["Report batch"],
    cap: Math.ceil(MAX_PUPILS / CHUNK_SIZE) - 1,
  },
  /** "Rewrite this one". Generous: normal use never reaches it. */
  reportRedo: {
    tools: ["report-writer"],
    steps: ["Report redo"],
    cap: 20,
  },
  /** Adding a question and refining one share a budget. */
  quizEdit: {
    tools: ["quiz-generator"],
    steps: ["Quiz add", "Quiz refine"],
    cap: 20,
  },
  /** Every band after the first, for the four differentiated tools. */
  bandVersion: {
    tools: ["worksheet-generator", "comprehension-generator", "homework-generator", "model-text-generator"],
    steps: ["Band version"],
    cap: DIFFERENTIATION_BANDS.length - 1,
  },
} as const satisfies Record<string, FollowOnKind>;

function kindFor(toolSlug: string, step: string): FollowOnKind | null {
  for (const kind of Object.values(FOLLOW_ON_KINDS) as FollowOnKind[]) {
    if (kind.tools.includes(toolSlug) && kind.steps.includes(step)) return kind;
  }
  return null;
}

/**
 * The step a request is recorded under: the claimed follow-up step while the
 * budget allows it, otherwise null, which counts as a generation.
 *
 * `recentSteps` is the `step` of each of this teacher's token_usage rows for
 * this tool within FOLLOW_ON_WINDOW_MINUTES. A step this tool never records
 * (a forged "Deck text", say) is refused outright.
 */
export function confirmStep(
  toolSlug: string,
  claimedStep: string | null,
  recentSteps: readonly (string | null)[],
): string | null {
  if (claimedStep === null) return null;
  const kind = kindFor(toolSlug, claimedStep);
  if (!kind) return null;

  let parents = 0;
  let used = 0;
  for (const step of recentSteps) {
    if (step === null) parents++;
    else if (kind.steps.includes(step)) used++;
  }
  return used < (parents + 1) * kind.cap ? claimedStep : null;
}
