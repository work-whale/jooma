// The server's view of a Live call, for as long as it lasts.
//
// The browser talks to OpenAI directly, so the browser sees the usage, and the
// browser cannot be trusted with it. This joins the same call from the server
// (the Realtime API's "sideband" connection, by call id), adds up what every
// reply cost from the usage OpenAI reports, and writes it to asset_cost as it
// goes, so a long call counts against the month's ceiling while it is still
// running. It also ends the call: at the time cap, when the session's budget
// is spent, and, whatever else happens, if it cannot see the call. A call the
// server cannot meter is a call nobody is paying for.

import WebSocket from "ws";
import type { RealtimeResponseUsage } from "openai/resources/realtime/realtime";
import { realtimeCostUsd } from "./speech";
import { LIVE_MAX_SECONDS, LIVE_TRANSCRIBE_USD_PER_MINUTE, LIVE_WARN_SECONDS, type LiveSurface } from "./live";

/** How often the running cost is written down. */
const FLUSH_MS = 60_000;
/** How long the server waits to see the call before ending it. */
const OPEN_TIMEOUT_MS = 10_000;
/** After Jo is asked to say goodbye, how long before the line is cut anyway. */
const GOODBYE_MS = 8_000;
/** Realtime audio comes to about ten tokens a second. */
const AUDIO_TOKENS_PER_SECOND = 10;

export interface Sideband {
  on(event: "open", fn: () => void): unknown;
  on(event: "message", fn: (data: unknown) => void): unknown;
  on(event: "close" | "error", fn: () => void): unknown;
  send(data: string): void;
  close(): void;
}

export interface WatchDeps {
  open(callId: string): Sideband;
  hangUp(callId: string): Promise<void>;
  record(usd: number, seconds: number): Promise<void>;
  now(): number;
}

export interface WatchOptions {
  callId: string;
  userId: string;
  surface: LiveSurface;
  /** What this session may spend, in USD. Null: no ceiling, time cap only. */
  budgetUsd: number | null;
}

/** What transcribing one of the teacher's turns cost. */
export function transcriptionCostUsd(usage: unknown): number {
  const u = usage as { type?: string; seconds?: number; input_token_details?: { audio_tokens?: number }; input_tokens?: number } | undefined;
  if (!u) return 0;
  const seconds =
    u.type === "duration"
      ? (u.seconds ?? 0)
      : (u.input_token_details?.audio_tokens ?? u.input_tokens ?? 0) / AUDIO_TOKENS_PER_SECOND;
  return (seconds / 60) * LIVE_TRANSCRIBE_USD_PER_MINUTE;
}

function openaiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

export const realDeps = (opts: WatchOptions): WatchDeps => ({
  open: (callId) =>
    new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${openaiKey()}` },
    }) as unknown as Sideband,
  hangUp: async (callId) => {
    try {
      const res = await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey()}` },
      });
      // A call that has already ended answers with an error, which is fine.
      if (!res.ok && res.status !== 404) console.warn("[live] hangup answered", res.status);
    } catch (err) {
      console.warn("[live] hangup failed:", err);
    }
  },
  // Imported when used, so the pure parts of this file load without a database.
  record: async (usd, seconds) => {
    const { recordAssetCost } = await import("./usage");
    await recordAssetCost(opts.surface === "panel" ? "jo" : "assistant", "audio", seconds, usd, "live", null, opts.userId);
  },
  now: () => Date.now(),
});

/** Watches one call until it ends. Resolves once the last cost is written. */
export function watchLiveCall(opts: WatchOptions, deps: WatchDeps = realDeps(opts)): Promise<void> {
  return new Promise<void>((resolve) => {
    const started = deps.now();
    let spent = 0;
    let unrecorded = 0;
    let recordedAt = started;
    let opened = false;
    let warned = false;
    let closing = false;
    let ended = false;

    const record = async () => {
      if (unrecorded <= 0) return;
      const usd = unrecorded;
      const seconds = (deps.now() - recordedAt) / 1000;
      unrecorded = 0;
      recordedAt = deps.now();
      await deps.record(usd, seconds);
    };

    const socket = deps.open(opts.callId);
    const send = (event: object) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        /* the call is ending anyway */
      }
    };

    // Every way out comes through here: the line is cut and the cost written,
    // whether the teacher hung up, the time ran out, or the server lost sight
    // of the call.
    const finish = async (why: string) => {
      if (ended) return;
      ended = true;
      clearInterval(tick);
      clearTimeout(openTimer);
      clearTimeout(hardStop);
      if (why !== "closed") console.info(`[live] ending ${opts.callId}: ${why}`);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      await deps.hangUp(opts.callId);
      await record();
      resolve();
    };

    // Jo says it, rather than the line going dead mid-sentence.
    const say = (line: string) =>
      send({ type: "response.create", response: { instructions: `Say this to the teacher, in your own words, briefly: ${line}` } });

    const wrapUp = (why: string, line: string) => {
      if (closing) return;
      closing = true;
      say(line);
      setTimeout(() => void finish(why), GOODBYE_MS);
    };

    const openTimer = setTimeout(() => {
      if (!opened) void finish("sideband never opened");
    }, OPEN_TIMEOUT_MS);
    // Whatever happens, the call does not outlive the function watching it.
    const hardStop = setTimeout(() => void finish("hard stop"), (LIVE_MAX_SECONDS + 30) * 1000);

    const tick = setInterval(() => {
      const elapsed = (deps.now() - started) / 1000;
      if (elapsed >= LIVE_MAX_SECONDS) {
        wrapUp("time", "Our ten minutes are up, so I'm ending Live now. Start it again whenever you like.");
      } else if (elapsed >= LIVE_WARN_SECONDS && !warned) {
        warned = true;
        say("There's about a minute left in this Live session.");
      }
      if (deps.now() - recordedAt >= FLUSH_MS) void record();
    }, 1000);

    socket.on("open", () => {
      opened = true;
    });
    socket.on("message", (data) => {
      let event: { type?: string; response?: { usage?: RealtimeResponseUsage }; usage?: unknown };
      try {
        event = JSON.parse(String(data));
      } catch {
        return;
      }
      let cost = 0;
      if (event.type === "response.done") cost = realtimeCostUsd(event.response?.usage);
      else if (event.type === "conversation.item.input_audio_transcription.completed") cost = transcriptionCostUsd(event.usage);
      if (!cost) return;
      spent += cost;
      unrecorded += cost;
      if (closing && event.type === "response.done") void finish("wrapped up");
      else if (opts.budgetUsd !== null && spent >= opts.budgetUsd) {
        wrapUp("credit", "You've used this month's credits, so I'm ending Live now. You can top up from the menu.");
      }
    });
    socket.on("close", () => void finish("closed"));
    socket.on("error", () => void finish("sideband error"));
  });
}
