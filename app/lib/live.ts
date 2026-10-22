// Live mode: a spoken conversation with Jo in real time.
//
// gpt-realtime-2.1-mini does the talking, over WebRTC straight from the
// browser. It does not edit anything itself: it has one tool per surface that
// hands the teacher's request to the pipeline that already does the work
// (/api/jo beside a resource, /api/assistant on the Ask Jo page), so every
// change goes through the same prompts, gates and costs as a typed message.
//
// Shared by the route that opens the call, the server that watches it, and
// the browser, so nothing here reaches for a server-only module.

import { FX_USD_TO_GBP } from "@/app/admin/format";
import { toCredits } from "./plans";

export type LiveSurface = "panel" | "assistant";

export const LIVE_MODEL = "gpt-realtime-2.1-mini";
/** The same voice Jo reads aloud in (JO_VOICE in lib/speech). */
export const LIVE_VOICE = "marin";
/** What the teacher said, as text: for the hand-off to Jo and for the thread.
 *  $0.0045 a minute. https://developers.openai.com/api/docs/models/gpt-transcribe */
export const LIVE_TRANSCRIBE_MODEL = "gpt-transcribe";
export const LIVE_TRANSCRIBE_USD_PER_MINUTE = 0.0045;

/** A session's length, and when Jo says a minute is left. */
export const LIVE_MAX_SECONDS = 600;
export const LIVE_WARN_SECONDS = 540;

/** What a minute of conversation costs, for the warning before a session.
 *  An estimate: the real cost of each reply is metered from the usage the API
 *  reports (lib/live-watch). Tune it from the "live" rows in asset_cost. */
export const LIVE_USD_PER_MINUTE_ESTIMATE = 0.03;

/** Credits a minute of Live uses, as the warning states it. */
export function liveCreditsPerMinute(): number {
  return Math.max(1, toCredits(LIVE_USD_PER_MINUTE_ESTIMATE * FX_USD_TO_GBP * 100));
}

/**
 * What a session may spend, in USD: whatever is left of the month's allowance.
 * Null when the account has no ceiling (an admin), where only the time cap
 * applies.
 */
export function liveBudgetUsd(opts: {
  spendPence: number;
  ceilingPence: number | null;
  creditPence: number;
  usdToGbp: number;
}): number | null {
  if (opts.ceilingPence === null) return null;
  const leftPence = opts.ceilingPence + opts.creditPence - opts.spendPence;
  if (leftPence <= 0) return 0;
  return leftPence / 100 / opts.usdToGbp;
}

const VOICE_RULES = [
  "You are Jo, the voice of Jooma, helping a UK teacher. You are talking out loud, live.",
  "Speak British English, warmly and calmly, like a helpful colleague in the staffroom.",
  "Keep every reply short, one to three sentences, because it is spoken.",
  "Only help with teaching and school life. If asked about anything else, kindly say that is not something you can help with.",
  "When you pass a request to a tool, use the teacher's own words. Do not reword, shorten or add to them.",
  "While a tool is working, say a few words such as 'On it' and then wait for its result.",
  "Never say something has been done unless the tool's result says so. If the result has an error, say so plainly.",
  "If the result has a question, ask it, with its options.",
].join("\n");

function panelInstructions(docLabel: string): string {
  return [
    VOICE_RULES,
    `The teacher has their ${docLabel} open beside you.`,
    `For any request to change, add, remove, rewrite, simplify or fix anything in the ${docLabel}, call edit_resource.`,
    "When it returns, tell the teacher briefly what changed. Do not read the changes out word for word.",
    `To answer a question about what the ${docLabel} says, call read_resource first.`,
  ].join("\n");
}

const ASSISTANT_INSTRUCTIONS = [
  VOICE_RULES,
  "You are on the Ask Jo page, where Jooma answers teaching questions and sets up resource tools.",
  "Call ask_jo for any request for a resource (a lesson plan, worksheet, quiz, letter, slideshow and so on) and for any question that needs a considered answer.",
  "When ask_jo returns a tool card, tell the teacher the tool is ready and to tap the card to open it.",
  "When it returns a written answer, give the gist in a few spoken sentences, and say the full answer is on screen.",
].join("\n");

const REQUEST = {
  type: "object",
  properties: { request: { type: "string", description: "The teacher's request, in their own words." } },
  required: ["request"],
  additionalProperties: false,
} as const;

function tools(surface: LiveSurface, docLabel: string) {
  if (surface === "assistant") {
    return [
      {
        type: "function",
        name: "ask_jo",
        description:
          "Pass the teacher's request to Jooma, which writes a full answer or sets up the right resource tool with the details filled in.",
        parameters: REQUEST,
      },
    ];
  }
  return [
    {
      type: "function",
      name: "edit_resource",
      description: `Make a change to the teacher's ${docLabel}. The change happens on their screen as they watch.`,
      parameters: REQUEST,
    },
    {
      type: "function",
      name: "read_resource",
      description: `Read the ${docLabel} as it is now.`,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

/** The session a Live call opens with. */
export function liveSessionConfig(surface: LiveSurface, docLabel: string) {
  return {
    type: "realtime",
    model: LIVE_MODEL,
    instructions: surface === "assistant" ? ASSISTANT_INSTRUCTIONS : panelInstructions(docLabel),
    audio: {
      input: {
        transcription: { model: LIVE_TRANSCRIBE_MODEL, language: "en" },
        // Waits for the end of a thought, not just a pause, so a teacher who
        // stops to think is not cut off.
        turn_detection: { type: "semantic_vad" },
        noise_reduction: { type: "near_field" },
      },
      output: { voice: LIVE_VOICE },
    },
    tools: tools(surface, docLabel),
    tool_choice: "auto",
    // Spoken replies are short; this stops a runaway one running up a bill.
    max_output_tokens: 1024,
  };
}

/** A label from the page, cut down to something safe to put in instructions. */
export function cleanDocLabel(raw: unknown): string {
  const label = typeof raw === "string" ? raw.replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 40) : "";
  return label || "resource";
}
