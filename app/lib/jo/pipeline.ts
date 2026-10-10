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
import { joSlidesResponseFormat } from "./slide-schema";
import { JO_MAX_ASKS, joSheetSystem, joSlidesSystem } from "./prompts";
import type { JoTurnBody } from "./types";

/** Marks a refusal, sent as a whole JSON answer with no ops. */
export const JO_REFUSAL_HEADER = "x-jo-refusal";

const MAX_HISTORY = 16;
const MAX_MESSAGE_CHARS = 4_000;
/** A sheet or a deck's words as JSON are a few thousand characters (a deck's
 *  snapshot carries no images); this is a generous ceiling that still stops a
 *  forged body from filling the context. */
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

/** What Jo is editing this turn: what to call it, and how to answer. */
interface JoTarget {
  /** As a teacher would say it: "worksheet", "slide deck". */
  name: string;
  /** Heads the document in the prompt. */
  heading: string;
  system: string;
  response_format: ReturnType<typeof joSheetResponseFormat> | ReturnType<typeof joSlidesResponseFormat>;
}

function targetFor(body: JoTurnBody, canAsk: boolean, guest: boolean): JoTarget | null {
  const snap = body.snapshot && typeof body.snapshot === "object" ? (body.snapshot as Record<string, unknown>) : null;
  if (!snap) return null;
  if (body.kind === "sheet") {
    const tool = snap.tool;
    if (!Array.isArray(snap.sections) || (tool !== "worksheet" && tool !== "comprehension")) return null;
    return {
      name: tool === "worksheet" ? "worksheet" : "reading comprehension",
      heading: "THE SHEET NOW (JSON)",
      system: joSheetSystem({ tool: tool as SheetTool, canAsk, guest }),
      response_format: joSheetResponseFormat(tool as SheetTool),
    };
  }
  if (body.kind === "slides") {
    if (!Array.isArray(snap.slides) || snap.slides.length === 0) return null;
    return {
      name: "slide deck",
      heading: "THE DECK NOW (JSON)",
      system: joSlidesSystem({ canAsk, guest }),
      response_format: joSlidesResponseFormat(),
    };
  }
  return null;
}

export async function runJoTurn(body: JoTurnBody, opts: JoTurnOptions = {}): Promise<Response> {
  const askCount = Math.max(0, Math.min(JO_MAX_ASKS, Number.isFinite(body?.askCount) ? Number(body.askCount) : 0));
  const target = body ? targetFor(body, askCount < JO_MAX_ASKS, !!opts.guest) : null;
  if (!target) return NextResponse.json({ error: "Missing document" }, { status: 400 });
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

  const userId = opts.guest ? null : await currentUserId();
  const title = (body.snapshot as { title?: unknown }).title;
  const opener = {
    role: "assistant" as const,
    content: `Here is your ${target.name}${typeof title === "string" && title ? `, "${title.slice(0, 120)}"` : ""}. What would you like me to change on it?`,
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
      response_format: target.response_format,
      messages: [
        { role: "system", content: target.system },
        { role: "system", content: `${target.heading}:\n${snapshot}${body.focus ? `\n\nThe teacher is looking at: ${String(body.focus).slice(0, 60)}` : ""}` },
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
