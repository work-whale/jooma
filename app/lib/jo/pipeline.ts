// One turn of Jo editing a resource, shared by the signed in route
// (/api/jo) and the free try route (/api/try/jo).
//
// Two stages:
//
//   1. guardrail: the assistant's own cheap on-topic check. The history it
//      sees opens with Jo offering to change THIS resource, so a short request
//      like "make it shorter" reads as the follow up it is.
//   2. the edit: streamed, strict json_schema (see sheet-schema.ts). The body
//      is the JSON as it is written, which the panel reads as it arrives.
//
// Usage is recorded under tool_slug 'jo', so it lands in token_usage, feeds
// the teacher's spend ceiling and shows in the admin reports like any tool.
// The plan gate and the ceiling are enforced in proxy.ts before the signed in
// route runs (see isAssistantRequest and COST_BEARING_PATHS).

import { NextResponse } from "next/server";
import { currentUserId, streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { isEducationRelated, OFF_TOPIC_REPLY } from "@/app/lib/assistant-prompt";
import type { SheetTool } from "@/app/lib/sheets/types";
import { joSheetResponseFormat } from "./sheet-schema";
import { JO_MAX_ASKS, joSheetSystem } from "./prompts";
import type { JoTurnBody } from "./types";

/** Marks a refusal, sent as a whole JSON answer with no ops. */
export const JO_REFUSAL_HEADER = "x-jo-refusal";

const MAX_HISTORY = 16;
const MAX_MESSAGE_CHARS = 4_000;
/** A sheet as JSON is a few thousand characters; this is a generous ceiling
 *  that still stops a forged body from filling the context. */
const MAX_SNAPSHOT_CHARS = 120_000;

export interface JoTurnOptions {
  guest?: {
    /** The free try's run id, which a guest's spend is recorded against. */
    runId: string;
  };
  /** Called once a STREAMED turn has finished, before the stream closes. `ok`
   *  is false when the model failed or wrote nothing. A turn answered without
   *  the model (a refusal, carrying JO_REFUSAL_HEADER) or refused with an
   *  error status never calls it: the caller can see those from the response. */
  onFinish?: (ok: boolean) => Promise<void>;
}

/** The whole answer for a turn that never reached the model. */
function wholeAnswer(reply: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ reply, clarify: null, ops: [], summary: "" }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

function sheetToolOf(snapshot: unknown): SheetTool | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as { tool?: unknown; sections?: unknown };
  if (!Array.isArray(s.sections)) return null;
  return s.tool === "worksheet" || s.tool === "comprehension" ? s.tool : null;
}

export async function runJoTurn(body: JoTurnBody, opts: JoTurnOptions = {}): Promise<Response> {
  if (body?.kind !== "sheet") {
    return NextResponse.json({ error: "Jo can't edit this yet." }, { status: 400 });
  }
  const tool = sheetToolOf(body.snapshot);
  if (!tool) return NextResponse.json({ error: "Missing document" }, { status: 400 });
  const snapshot = JSON.stringify(body.snapshot);
  if (snapshot.length > MAX_SNAPSHOT_CHARS) {
    return NextResponse.json({ error: "This document is too long for Jo to edit." }, { status: 413 });
  }

  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  const latest = [...history].reverse().find((m) => m.role === "user");
  if (!latest) return NextResponse.json({ error: "No message provided" }, { status: 400 });

  const askCount = Math.max(0, Math.min(JO_MAX_ASKS, Number.isFinite(body.askCount) ? Number(body.askCount) : 0));
  const userId = opts.guest ? null : await currentUserId();
  const title = (body.snapshot as { title?: unknown }).title;
  const opener = {
    role: "assistant" as const,
    content: `Here is your ${tool === "worksheet" ? "worksheet" : "reading comprehension"}${typeof title === "string" && title ? `, "${title.slice(0, 120)}"` : ""}. What would you like me to change on it?`,
  };

  if (!(await isEducationRelated([opener, ...history], userId))) {
    return wholeAnswer(OFF_TOPIC_REPLY, { [JO_REFUSAL_HEADER]: "1" });
  }

  try {
    return await streamChat({
      toolSlug: "jo",
      ...(await modelFor("jo", "gpt-5.6-luna")),
      ...(opts.guest ? { step: "guest" } : {}),
      runId: opts.guest?.runId ?? null,
      max_completion_tokens: opts.guest ? 5000 : 8000,
      response_format: joSheetResponseFormat(tool),
      messages: [
        { role: "system", content: joSheetSystem({ tool, canAsk: askCount < JO_MAX_ASKS, guest: !!opts.guest }) },
        { role: "system", content: `THE SHEET NOW (JSON):\n${snapshot}${body.focus ? `\n\nThe teacher last worked on: ${String(body.focus).slice(0, 60)}` : ""}` },
        opener,
        ...history,
      ],
      safeguardingText: latest.content,
      onComplete: opts.onFinish ? (_text, ok) => opts.onFinish!(ok) : undefined,
    });
  } catch (err) {
    console.error("[jo] turn failed to start:", err);
    return NextResponse.json({ error: "Jo couldn't start on that. Please try again." }, { status: 502 });
  }
}
