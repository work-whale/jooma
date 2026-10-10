// Reading a Jo turn while it is still arriving.
//
// The answer streams as one JSON object (see sheet-schema.ts). This turns the
// text received so far into what the panel can act on: Jo's reply so far, a
// follow up question once it is whole, and the ops that are FINISHED. An op is
// finished once the one after it has started, or the summary has: until then
// its text may still be growing, and playing half a sentence into the sheet
// would be wrong.

import { parsePartialJson } from "@/app/lib/sheets/stream";
import type { JoClarify, JoOp } from "./types";

export interface JoProgress {
  reply: string;
  /** Set once the question and its options have fully arrived. */
  clarify: JoClarify | null;
  /** Only the ops that have fully arrived, in order. */
  ops: JoOp[];
  summary: string;
  /** The ops list has closed, so no more are coming. */
  opsDone: boolean;
}

const EMPTY: JoProgress = { reply: "", clarify: null, ops: [], summary: "", opsDone: false };

function asClarify(v: unknown): JoClarify | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const question = typeof c.question === "string" ? c.question.trim() : "";
  const options = Array.isArray(c.options)
    ? c.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((o) => o.trim())
    : [];
  if (!question || options.length === 0) return null;
  return { question, options: options.slice(0, 6), multi: c.multi === true };
}

/**
 * @param text     everything received so far
 * @param isOp     the guard for this document's ops
 * @param finished the stream has ended, so the last op is whole too
 */
export function readJoProgress(text: string, isOp: (v: unknown) => v is JoOp, finished = false): JoProgress {
  const parsed = parsePartialJson(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
  const o = parsed as Record<string, unknown>;

  const reply = typeof o.reply === "string" ? o.reply : "";
  const opsStarted = "ops" in o;
  const summaryStarted = "summary" in o;
  const clarify = opsStarted || finished ? asClarify(o.clarify) : null;

  const raw = Array.isArray(o.ops) ? o.ops : [];
  const whole = finished || summaryStarted ? raw : raw.slice(0, -1);
  const ops = whole.filter(isOp);

  return {
    reply,
    clarify,
    ops,
    summary: typeof o.summary === "string" ? o.summary : "",
    opsDone: finished || summaryStarted,
  };
}
