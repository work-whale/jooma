// The AI assistant.
//
// Three stages per turn, each recording its own cost so an admin can see what
// each is worth:
//
//   1. guardrail   — a one-token gpt-4o-mini yes/no. Off-topic short-circuits
//                    here, so a refused request costs a fraction of a penny and
//                    never reaches the expensive model.
//   2. tool-select — a non-streaming pass that decides whether this request
//                    should open one of Jooma's tools prefilled.
//   3. the reply   — streamed, on the configured model (gpt-5.6-luna).
//
// ── Why tool selection is a separate pass ──
// streamChat returns text/plain, and a tool call is structured data that has to
// reach the client alongside the prose. Rather than fork the streaming protocol
// that 35 routes and their clients already share, the tool call is decided
// first and returned in a response header; the body stays plain text. streamChat
// is untouched.
//
// ── Billing ──
// Every stage goes through recordUsage with tool_slug 'assistant', so assistant
// spend lands in token_usage exactly like a tool's, feeds monthly_ai_spend (the
// teacher's credit meter), and appears in the admin usage and margin reports.
// The plan gate and the spend ceiling are both enforced in proxy.ts BEFORE this
// handler runs — see checkAssistantAccess and COST_BEARING_PATHS.
import { NextRequest, NextResponse } from "next/server";
import { streamChat, createCompletion, currentUserId } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import {
  assistantSystem,
  isEducationRelated,
  OFF_TOPIC_REPLY,
} from "@/app/lib/assistant-prompt";
import {
  prefillFunctionDef,
  clarifyFunctionDef,
  toolSchemaDigest,
  assistantToolFor,
} from "@/app/lib/assistant-tools";
import {
  validatePrefill,
  validateClarify,
  type ToolPrefill,
  type ToolClarify,
} from "@/app/lib/toolPrefill";

/** Header carrying the prefill decision. Base64 so it is header-safe. */
const TOOL_HEADER = "x-assistant-tool";

/** Header carrying a clarifying question, when Jo asks one instead. */
const CLARIFY_HEADER = "x-assistant-clarify";

/**
 * What the tool-selection pass decided.
 *
 * A discriminated union rather than two nullable returns, so the two outcomes
 * cannot both be set: Jo either opens a tool or asks about it, never both.
 */
type ToolDecision =
  | { kind: "prefill"; prefill: ToolPrefill }
  | { kind: "clarify"; clarify: ToolClarify };

/** Set when the body is the guardrail's refusal rather than a model answer. */
const REFUSAL_HEADER = "x-assistant-refusal";

interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

interface AssistantBody {
  messages?: AssistantMessage[];
  /** A tool the teacher picked in the composer. Overrides auto-selection. */
  tool?: string | null;
  attachment?: { source: string; text: string } | null;
  /** Clarifying questions already asked for this build request. See MAX_ASKS. */
  askCount?: number;
}

/**
 * How many clarifying questions one build request may ask.
 *
 * Bounded in code rather than in the prompt, for the reason recorded in
 * toolPrefill.ts: a prompt is a request, and "ask rarely" has to be a
 * guarantee. Past the cap the clarify function is simply not offered, so the
 * model has nothing to ask WITH and must open the tool instead.
 *
 * Two is the judgement: enough to turn "make me slides" into a year group and a
 * slide count, few enough that a teacher who was already clear is never
 * interrogated.
 */
const MAX_ASKS = 2;

// How much conversation to carry. Chat has no natural end, so without a cap the
// prompt grows every turn until it is both slow and expensive — and the oldest
// turns are the least relevant. Counted in messages rather than tokens because
// the cost of being approximate here is small and the code stays obvious.
const MAX_HISTORY = 20;
/** Cap on any single message, so one paste cannot blow up the context. */
const MAX_MESSAGE_CHARS = 8_000;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AssistantBody;
  const { tool, attachment } = body;

  // Clamped rather than trusted: this arrives from the client, and a negative
  // or absurd value would either disable the cap or disable asking entirely.
  const askCount = Math.max(
    0,
    Math.min(MAX_ASKS, Number.isFinite(body.askCount) ? Number(body.askCount) : 0),
  );

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const history = messages
    .filter(
      (m): m is AssistantMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim() !== "",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  if (history.length === 0) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const latestUser = [...history].reverse().find((m) => m.role === "user");
  if (!latestUser) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  // Captured while the request context is alive. Everything downstream runs
  // after the response is handed off, where the session cookie is gone — the
  // same constraint documented on currentUserId().
  const userId = await currentUserId();

  // ── 1. Guardrail ──
  // Fails open (see isEducationRelated), so a classifier outage degrades to
  // prompt-only scoping rather than refusing everyone.
  if (!(await isEducationRelated(history, userId))) {
    return new Response(OFF_TOPIC_REPLY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        // Marks this as a refusal rather than an answer. It is a 200 with a
        // plain body — deliberately, so it streams like anything else — which
        // left the client unable to tell the two apart and storing refusals as
        // real assistant turns. Those then came back as context on the next
        // turn and made a second refusal more likely. The client uses this to
        // show the message without writing it to history.
        [REFUSAL_HEADER]: "1",
      },
    });
  }

  // ── 2. Tool selection ──
  //
  // Either a tool to open, or a question to ask first when a field it needs is
  // genuinely ambiguous. A tool the teacher picked in the composer skips the
  // choosing and goes straight to extracting that tool's fields.
  const decision = await selectTool(history, userId, {
    forcedSlug: typeof tool === "string" ? tool : null,
    canAsk: askCount < MAX_ASKS,
  });
  const prefill = decision?.kind === "prefill" ? decision.prefill : null;
  const clarify = decision?.kind === "clarify" ? decision.clarify : null;

  // ── 3. The reply ──
  const system = assistantSystem({ attachment });

  // When a tool was chosen, the reply's job changes: it should introduce the
  // card rather than answer at length, because the tool is about to do the work.
  // Matches the landing page's "I'll open the Lesson Planner and prefill it
  // from your request."
  const replyGuidance = prefill
    ? `\n\nYou are opening the ${prefill.slug.replace(/-/g, " ")} for this teacher, prefilled from their request. Tell them so in ONE short sentence. A card linking to the tool is shown directly beneath your message, so do not add a link, do not list the fields you filled in, and do not produce the resource yourself.`
    : clarify
      // The chips carry the question, so repeating it in prose would ask
      // twice. One short line of context, then let the teacher pick.
      ? `\n\nYou need one detail before building this. The question and its answers are shown as buttons directly beneath your message, so do NOT ask it again and do NOT list the options. Say in ONE short sentence what you are about to make, and nothing else.`
      : "";

  const response = await streamChat({
    toolSlug: "assistant",
    ...(await labModelFor(body, "assistant", "gpt-5.6-luna")),
    max_completion_tokens: 1500,
    messages: [
      { role: "system", content: system + replyGuidance },
      ...history,
    ],
    // The teacher's own words only. Passing the assembled prompt would scan our
    // own system text, which is full of "safeguarding" and "SEND" — the
    // documented false-positive source.
    safeguardingText: latestUser.content,
  });

  if (!prefill && !clarify) return response;

  // Re-wrap so the decision rides along with the stream. The body is passed
  // through untouched, so streamChat's usage recording is unaffected.
  const headers = new Headers(response.headers);
  if (prefill) {
    headers.set(
      TOOL_HEADER,
      Buffer.from(JSON.stringify(prefill), "utf8").toString("base64"),
    );
  } else if (clarify) {
    headers.set(
      CLARIFY_HEADER,
      Buffer.from(JSON.stringify(clarify), "utf8").toString("base64"),
    );
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * The extra instruction sent when the teacher picked a tool themselves.
 *
 * The model is still asked to extract fields, because that is what fills the
 * form, but it is no longer choosing WHICH tool — `tool_choice` forces the call
 * and the slug is overwritten afterwards regardless. This exists so the model
 * extracts for the RIGHT tool: told to open the Quiz Generator, it should be
 * looking for a quiz's fields, not a lesson plan's.
 */
function forcedInstruction(tool: ReturnType<typeof assistantToolFor>): string {
  if (!tool) return "";
  const required = (tool.fields as { required?: string[] }).required ?? [];
  return `

THE TEACHER HAS ALREADY CHOSEN THE TOOL: "${tool.slug}" (${tool.label}).

Do not pick a different one and do not decide whether a tool is warranted — that decision is made. Call prefill_tool with slug "${tool.slug}" and extract that tool's fields from the conversation.${
    required.length
      ? ` It requires: ${required.join(", ")}. Where the teacher has not stated one, infer the most reasonable value from what they did say rather than omitting it — an omitted required field throws the whole prefill away and the teacher gets nothing.`
      : ""
  }`;
}

/**
 * Decide whether this turn should open a tool, and with what.
 *
 * Non-streaming and cheap: gpt-4o-mini is enough to match a request to one of
 * six tools and pull the fields out of a sentence, and it keeps the pre-pass
 * well under the cost of the reply it precedes.
 *
 * Returns null on anything doubtful — no call, an unknown slug, fields that
 * fail validation, or an error. Answering in chat is always a safe fallback;
 * opening the wrong tool with half-right fields is not.
 */
async function selectTool(
  history: { role: "user" | "assistant"; content: string }[],
  userId: string | null,
  opts: {
    /** A tool the teacher picked, which wins over the model's own choice. */
    forcedSlug?: string | null;
    /** False once the question allowance is spent — see MAX_ASKS. */
    canAsk?: boolean;
  } = {},
): Promise<ToolDecision | null> {
  // Resolved rather than trusted: the slug arrives from a client, and an
  // unknown one must fall back to ordinary auto-selection rather than force a
  // tool that does not exist.
  const forced = opts.forcedSlug ? assistantToolFor(opts.forcedSlug) : undefined;
  const canAsk = opts.canAsk !== false;

  try {
    const completion = await createCompletion({
      toolSlug: "assistant",
      step: "tool-select",
      userId,
      // gpt-4o-mini, deliberately.
      //
      // luna was tried here and made things WORSE, not better: it stopped
      // calling the tool at all, so a teacher asking for a lesson plan got the
      // whole plan written into the chat instead of the Lesson Planner opening.
      // Answering in chat is this function's null path, and it is silent by
      // design (see the catch below), which is exactly what made the regression
      // hard to spot. mini's failure mode was milder — it opened the right tool
      // but sometimes omitted yearGroup — so it stays until a replacement is
      // proven to call the tool at least as reliably.
      //
      // If you try another model here, verify the tool call FIRST, not the
      // field quality: a model that fills fields perfectly and never calls the
      // function is a worse assistant than one that calls it and misses a field.
      model: "gpt-4o-mini",
      max_completion_tokens: 400,
      temperature: 0,
      // The clarify function is withheld in two cases, and withholding it is
      // the enforcement: a model cannot ask a question it has not been given.
      //
      //   - a forced tool, because the teacher has already said what they want
      //   - the question allowance spent, so the gather cannot chain forever
      tools: forced || !canAsk
        ? [prefillFunctionDef()]
        : [prefillFunctionDef(), clarifyFunctionDef()],
      // A picked tool must actually open. Left to its own judgement the model
      // treats a thin request as conversation and calls nothing, which would
      // make the pill feel ignored — the exact complaint it exists to fix.
      ...(forced
        ? { tool_choice: { type: "function" as const, function: { name: "prefill_tool" } } }
        : {}),
      messages: [
        {
          role: "system",
          content: `You decide whether a teacher's message should open one of Jooma's tools, prefilled.

Call prefill_tool ONLY when the teacher is asking for something to be PRODUCED — a document, resource, plan, report or presentation. The tools available to you, and what each is for, are listed in the prefill_tool description; choose from those.

Do not call it when the teacher is asking a question ABOUT teaching rather than asking for an artefact. "How do I get parents more involved?" is a conversation. "Write a letter to parents about the trip" is the Letter Writer. When in doubt, answer conversationally — a wrong tool is more annoying than no tool.

Call ask_clarifying_question INSTEAD of prefill_tool when you know which tool they want but a field it NEEDS is genuinely ambiguous, and guessing it wrong would waste a generation. Ask about ONE field, offer two or three concrete answers, and pass everything you already understood in the fields argument.

Ask only about a field the chosen tool actually needs and the teacher has not supplied. One field per question. Never ask about something they already answered earlier in the thread — read the whole conversation before asking, because a question they have answered reads as not listening. If the teacher named the year group and the topic, that is enough to build from: infer the rest and call prefill_tool.

When you call prefill_tool, ALWAYS include these in fields when the tool has them:
- yearGroup, whenever the teacher names or implies a year. "a year 5 lesson plan" means yearGroup "Year 5". Use the exact forms listed in the prefill_tool description; "Y5", "year five" and "5" are all rejected and the teacher's year group is then lost.
- curriculum. Default it to "2014 National Curriculum" unless they name a Scottish, Welsh, Northern Irish or Early Years context.
These two gate the Generate button on most tools, so omitting them leaves the teacher with a form they cannot submit.

${toolSchemaDigest()}${forcedInstruction(forced)}`,
        },
        // Only the recent turns: the decision is about what is being asked now,
        // and older context mostly adds noise and cost.
        //
        // A gather needs more than a glance backwards, though: by the third
        // turn the topic is four messages back, and dropping it would ask for
        // something the teacher opened with. Eight covers a question, an answer,
        // a second question and its answer, with the original request intact.
        ...history.slice(-8),
      ],
    });

    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== "function") {
      // Why no tool: the difference between "this was conversation" and "the
      // model was cut off mid-call" is invisible from the outside, and both
      // land the teacher in a chat reply. finish_reason tells them apart —
      // "length" means the token budget ran out and the cap needs raising.
      console.warn("[assistant] no tool call", {
        finish_reason: completion.choices[0]?.finish_reason,
        model: completion.model,
        completion_tokens: completion.usage?.completion_tokens,
      });
      return null;
    }

    // Validation is the security boundary as well as the quality one: this
    // rejects unknown tools, drops unknown fields, enforces enums and caps
    // string lengths before any of it reaches a form. See toolPrefill.ts.
    if (call.function.name === "prefill_tool") {
      const raw = JSON.parse(call.function.arguments);

      // The teacher's choice wins over whatever the model echoed back.
      //
      // tool_choice forces the CALL, not its arguments: the slug enum still
      // offers all 35 tools, and a model told to open the Quiz Generator can
      // still return "worksheet-generator" in the payload. Overwriting here is
      // what makes the pill a guarantee rather than another suggestion — which
      // is the whole point, since asking for a tool in prose already fails.
      // cleanFields then allow-lists the fields against THIS tool's schema, so
      // anything extracted for the wrong one is dropped rather than smuggled in.
      if (forced) (raw as { slug?: string }).slug = forced.slug;

      const prefill = validatePrefill(raw);

      // TEMPORARY DIAGNOSTIC — remove once the missing yearGroup is resolved.
      //
      // Prints what the model SENT beside what survived validation, because
      // those two cases look identical from the outside and need opposite
      // fixes. A prefill can arrive without a year group because the model
      // never wrote one, or because it wrote "Y5" and cleanFields dropped it:
      // enum matching is exact after normalising case and spacing, so a near
      // miss is discarded with no error anywhere.
      //
      //   sent has yearGroup, kept does not  -> validation is too strict
      //   neither has it                     -> the prompt is not landing
      const sent = Object.keys((raw as { fields?: object })?.fields ?? {});
      const kept = prefill ? Object.keys(prefill.fields) : [];
      console.log("[assistant] prefill fields", {
        slug: (raw as { slug?: string })?.slug,
        sent,
        kept,
        dropped: sent.filter((f) => !kept.includes(f)),
        yearGroupSent: (raw as { fields?: Record<string, unknown> })?.fields?.yearGroup,
        curriculumSent: (raw as { fields?: Record<string, unknown> })?.fields?.curriculum,
        rejectedEntirely: prefill === null,
      });

      return prefill ? { kind: "prefill", prefill } : null;
    }

    if (call.function.name === "ask_clarifying_question") {
      const clarify = validateClarify(JSON.parse(call.function.arguments));
      return clarify ? { kind: "clarify", clarify } : null;
    }

    return null;
  } catch (err) {
    // Never fatal. A failed tool-selection pass degrades to a normal chat reply,
    // which is a perfectly good answer to most messages.
    console.warn("[assistant] tool selection failed:", err);
    return null;
  }
}
