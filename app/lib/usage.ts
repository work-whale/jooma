// Accurate token + cost telemetry for OpenAI text generations. The numbers here
// are NOT estimates: `completion.usage` is the exact count OpenAI bills on. We
// read it off the response (non-streaming) or the final `include_usage` stream
// chunk (streaming), price it with the table below, and append one row to
// `token_usage` (see the 20260613000000 migration).
//
// Why server-side: usage only exists inside the route handler. The `tool_runs`
// history row is created client-side after the stream finishes, where usage is
// gone — so cost telemetry lives in its own table written from here.
import "server-only";
import OpenAI from "openai";
import { getOpenAI } from "@/app/lib/openai";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { scanForSafeguarding, EXCERPT_MAX } from "@/app/lib/safeguarding";
import { MODELS, isKnownModel, isReasoning } from "@/app/lib/models";

// Pricing lives in app/lib/models.ts so the admin dropdown and the cost maths
// cannot disagree about what a model costs. Unknown models fall back to gpt-4o
// rates so cost is over- not under-stated.
const FALLBACK = MODELS["gpt-4o"];

export type Usage = OpenAI.Completions.CompletionUsage;

/** Prompt tokens written to gpt-5.6's explicit cache. Billed at 1.25x input and
 *  absent from the gpt-4o response shape, hence the widening. */
function cacheWriteTokens(usage: Usage): number {
  const details = usage.prompt_tokens_details as { cache_write_tokens?: number } | undefined;
  return details?.cache_write_tokens ?? 0;
}

/** Reasoning tokens (gpt-5.6). Already counted inside completion_tokens and
 *  therefore already billed as output — split out only for visibility. */
function reasoningTokens(usage: Usage): number {
  return usage.completion_tokens_details?.reasoning_tokens ?? 0;
}

/** Exact USD cost of one completion, charging cached prompt tokens at the lower
 *  cached rate and cache writes at their premium.
 *
 *  Note reasoning tokens need no term here: OpenAI counts them inside
 *  completion_tokens, so they are already priced at the output rate. */
export function costUsd(model: string, usage: Usage): number {
  const p = isKnownModel(model) ? MODELS[model] : FALLBACK;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const written = cacheWriteTokens(usage);
  // Cache writes are reported inside prompt_tokens alongside cached reads, so
  // subtract both to avoid charging the same token twice.
  const freshInput = Math.max(0, usage.prompt_tokens - cached - written);
  return (
    (freshInput / 1_000_000) * p.input +
    (cached / 1_000_000) * p.cachedInput +
    (written / 1_000_000) * (p.cacheWrite ?? p.input) +
    (usage.completion_tokens / 1_000_000) * p.output
  );
}

/**
 * Insert with one retry on a transient network failure.
 *
 * On Fluid Compute a warm instance can be frozen the moment its response is
 * sent. A telemetry write still in flight is suspended with it, and when the
 * instance is thawed for a later request the socket it was holding is long
 * dead — surfacing as `ECONNRESET` during the TLS handshake, often logged
 * against a completely unrelated request. Retrying establishes a fresh
 * connection on the now-live instance.
 *
 * This is a backstop. The real fix is for callers to await the write before
 * their handler returns, so the instance can't be frozen mid-flight.
 */
async function insertWithRetry(
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
  label: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabaseAdmin.from(table).insert(rows as never);
    if (!error) return;

    // Only network-level failures are worth retrying. A constraint violation or
    // a bad column will fail identically the second time.
    const transient =
      error.message?.includes("fetch failed") ||
      error.message?.includes("ECONNRESET") ||
      error.message?.includes("socket");

    if (!transient || attempt === 2) {
      console.error(`[usage] ${table} insert failed for ${label}:`, error);
      return;
    }
  }
}

/**
 * Resolve the signed-in user id, if the request context still has one.
 *
 * IMPORTANT: this must be called while the request is still being handled.
 * Cookie access is scoped to the request, so calling it from a stream's
 * `finally` — after the response has been handed to the client — yields no
 * user. That is exactly how token_usage silently stopped recording: the write
 * was attempted after the stream closed, found no user, and returned.
 * `streamChat` therefore captures the id up front and passes it in.
 */
export async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Append one telemetry row.
 *
 * Writes with the service-role client rather than the caller's session: the
 * insert frequently happens after a stream has closed, when there is no session
 * left for RLS to check. `userId` is therefore required — pass the id captured
 * while the request was live.
 *
 * Never throws (telemetry must not break a generation) but DOES log failures.
 * These writes now feed the free-plan gate, so silent loss means unmetered
 * generations, not just a gap in a report.
 */
export async function recordUsage(
  toolSlug: string,
  model: string,
  usage: Usage | null | undefined,
  step?: string | null,
  userId?: string | null,
  /** Ties this spend to one generation. Without it, the admin console has to
   *  guess which run a cost row belongs to from its timestamp — which cannot
   *  tell one long deck from two quick ones. Optional so existing callers are
   *  unaffected; they fall back to the time window. */
  runId?: string | null,
  /** The reasoning settings this call ran with, so a cost change can be
   *  attributed to a settings change rather than guessed at. Undefined for
   *  gpt-4o, which has no such settings. */
  reasoning?: { effort?: string | null; verbosity?: string | null },
): Promise<void> {
  if (!usage) {
    // Not silent: without a usage payload there is no row, so a generation
    // goes unmetered. Most often means OpenAI's include_usage chunk never
    // arrived (aborted stream, or a caller that forgot stream_options).
    console.warn(`[usage] no usage payload for ${toolSlug} — token_usage row dropped`);
    return;
  }
  try {
    const uid = userId ?? (await currentUserId());
    // A guest generation from /create has no user yet, but it has a run id,
    // and the spend is real. Kept with a null owner; claimGuestWork hands the
    // row to the teacher by run_id when the guest signs up.
    if (!uid && !runId) {
      console.warn(`[usage] no user for ${toolSlug} — token_usage row dropped`);
      return;
    }
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    await insertWithRetry(
      "token_usage",
      {
        user_id: uid,
        tool_slug: toolSlug,
        model,
        prompt_tokens: usage.prompt_tokens,
        cached_tokens: cached,
        completion_tokens: usage.completion_tokens,
        cost_usd: Number(costUsd(model, usage).toFixed(6)),
        step: step ?? null,
        run_id: runId ?? null,
        // Zero on gpt-4o, which reports neither. Kept as columns rather than
        // derived later because the usage payload is gone once this returns.
        reasoning_tokens: reasoningTokens(usage),
        cache_write_tokens: cacheWriteTokens(usage),
        effort: reasoning?.effort ?? null,
        verbosity: reasoning?.verbosity ?? null,
      },
      toolSlug,
    );
  } catch (err) {
    console.error(`[usage] recordUsage threw for ${toolSlug}:`, err);
  }
}

/** Append one per-unit asset-cost row (AI image or TTS audio). Images and audio
 *  aren't token-billed, so they live in `asset_cost` rather than `token_usage`.
 *  `units` = image count or character count (informational). Never throws. */
export async function recordAssetCost(
  toolSlug: string,
  kind: "image" | "audio",
  units: number,
  costUsd: number,
  step?: string | null,
  slideLabel?: string | null,
  userId?: string | null,
  /** See recordUsage — ties this spend to one generation. */
  runId?: string | null,
): Promise<void> {
  if (!(costUsd > 0)) return;
  try {
    const uid = userId ?? (await currentUserId());
    // See recordUsage: a guest's spend is kept against its run id.
    if (!uid && !runId) {
      console.warn(`[usage] no user for ${toolSlug} — asset_cost row dropped`);
      return;
    }
    await insertWithRetry(
      "asset_cost",
      {
        user_id: uid,
        tool_slug: toolSlug,
        kind,
        units: Math.round(units),
        cost_usd: Number(costUsd.toFixed(6)),
        step: step ?? null,
        slide_label: slideLabel ?? null,
        run_id: runId ?? null,
      },
      toolSlug,
    );
  } catch (err) {
    console.error(`[usage] recordAssetCost threw for ${toolSlug}:`, err);
  }
}

/** Cost components of one generated deck — the split shown when an admin expands
 *  a slideshow on the Usage detail page. `images` is one entry per slide that
 *  used AI images. `text + audio + youtube + Σimages` equals the deck's all-in
 *  cost.
 *
 *  `youtube` is optional because decks recorded before it was tracked have no
 *  such key; read it as `youtube ?? 0`. */
export interface SlideCostBreakdown {
  text: number;
  audio: number;
  youtube?: number;
  images: { label: string; cost_usd: number; count: number }[];
  /** The deck's run. slide_cost has no run_id column, so a guest deck's row is
   *  found by this key when claimGuestWork hands it to its new owner. */
  run_id?: string;
}

/** Persist the all-in cost (and optional component breakdown) for a generated
 *  deck — one row per slideshow. Powers the per-deck breakdown on the admin
 *  Usage page; independent of tool-total accounting. Never throws. */
export async function recordSlideCosts(
  rows: { slideLabel: string; costUsd: number; breakdown?: SlideCostBreakdown }[],
  userId?: string | null,
): Promise<void> {
  const valid = rows.filter((r) => r.costUsd > 0 && r.slideLabel);
  if (valid.length === 0) return;
  try {
    const uid = userId ?? (await currentUserId());
    // A guest deck carries its run in the breakdown; see recordUsage.
    if (!uid && !valid.every((r) => r.breakdown?.run_id)) {
      console.warn("[usage] no user for generate-slideshow — slide_cost rows dropped");
      return;
    }
    await insertWithRetry(
      "slide_cost",
      valid.map((r) => ({
        user_id: uid,
        tool_slug: "generate-slideshow",
        slide_label: r.slideLabel,
        cost_usd: Number(r.costUsd.toFixed(6)),
        breakdown: r.breakdown ?? null,
      })),
      "generate-slideshow",
    );
  } catch (err) {
    console.error("[usage] recordSlideCosts threw:", err);
  }
}

/**
 * Scan a prompt for apparent pupil safeguarding content and record a flag.
 *
 * Never throws, by the same contract as recordUsage: a safeguarding detector
 * that can break a lesson plan is a worse product than no detector at all.
 *
 * WRITES WITH THE SERVICE ROLE, and `userId` is required — for exactly the
 * reason recordUsage does (see its note above). This runs in the stream's
 * `finally`, after the response has been handed off, where the request's
 * cookies are gone. Calling the record_safeguarding_flag() RPC on the caller's
 * own client would hit `auth.uid() is null` and raise 'not authenticated',
 * losing precisely the flags that matter with only a log line to show for it.
 *
 * The RPC still exists and is still the right path for any caller that runs
 * inside a live request; this one cannot.
 */
export async function recordSafeguardingScan(
  toolSlug: string,
  text: string,
  userId: string | null,
  runId?: string | null,
): Promise<void> {
  try {
    const hit = scanForSafeguarding(text);
    if (!hit) return;

    if (!userId) {
      console.warn(`[safeguarding] no user for ${toolSlug} — flag dropped`);
      return;
    }

    await insertWithRetry(
      "safeguarding_flags",
      {
        user_id: userId,
        tool_slug: toolSlug,
        reason: hit.reason,
        // Capped here as well as in the database. Belt and braces on the one
        // field that could otherwise duplicate sensitive pupil content.
        excerpt: hit.excerpt.slice(0, EXCERPT_MAX),
        severity: hit.severity,
        status: "review",
        run_id: runId ?? null,
      },
      toolSlug,
    );
  } catch (err) {
    console.error(`[safeguarding] scan threw for ${toolSlug}:`, err);
  }
}

/**
 * Params gpt-5.6 (terra/luna) accepts on chat.completions that gpt-4o does not.
 *
 * Verified against the live API rather than assumed:
 *   - `reasoning_effort` and `verbosity` are flat snake_case here, NOT the
 *     nested reasoning:{} / text:{} objects the Responses API takes.
 *   - Sending either to gpt-4o is a 400, so they are only ever spread in when
 *     isReasoning(model).
 * Routes never set these by hand — modelFor() supplies them.
 *
 * Typed as plain strings rather than the SDK's ChatCompletionReasoningEffort:
 * openai@6 predates gpt-5.6 and its union omits `xhigh` and `max`, both of
 * which the API accepts. The cast lives in applyModelParams, in one place.
 */
export interface ReasoningParams {
  reasoning_effort?: string;
  verbosity?: string;
}

/**
 * Apply the model-family differences to an outgoing request.
 *
 * Two asymmetries, both confirmed by live 400s:
 *   1. gpt-5.6 REJECTS reasoning params it doesn't know? No — it rejects
 *      `temperature` at any value other than the default 1. Only edit-text
 *      sets one, so it is stripped here rather than special-cased there.
 *   2. gpt-4o rejects reasoning_effort/verbosity, so they are omitted for it.
 *
 * `max_completion_tokens` needs no translation: gpt-5.6 rejects `max_tokens`
 * outright, but all three gpt-4o models accept `max_completion_tokens`, so the
 * routes use that one name for every model.
 */
function applyModelParams<T extends Record<string, unknown>>(
  params: T & { model: string },
  reasoning: ReasoningParams,
): Omit<T, "reasoning_effort" | "verbosity"> & {
  reasoning_effort?: OpenAI.ReasoningEffort;
  verbosity?: "low" | "medium" | "high";
} {
  type Out = Omit<T, "reasoning_effort" | "verbosity"> & {
    reasoning_effort?: OpenAI.ReasoningEffort;
    verbosity?: "low" | "medium" | "high";
  };

  // gpt-4o rejects both params outright, so strip them rather than send them.
  if (!isReasoning(params.model)) {
    const { reasoning_effort: _e, verbosity: _v, ...rest } = params as T & ReasoningParams;
    return rest as unknown as Out;
  }

  // gpt-5.6 rejects any temperature other than the default 1 (confirmed 400).
  // Only edit-text sets one, so it is dropped here rather than special-cased.
  const { temperature: _t, ...rest } = params as T & { temperature?: number };
  return {
    ...(rest as unknown as Out),
    // Cast at the SDK boundary: openai@6 predates gpt-5.6, so its
    // ChatCompletionReasoningEffort union is missing `xhigh` and `max`, which
    // the API does accept. Values are constrained by REASONING_EFFORTS in
    // models.ts and by a CHECK constraint in the database, so the widening is
    // safe. Remove once the SDK catches up.
    ...(reasoning.reasoning_effort
      ? { reasoning_effort: reasoning.reasoning_effort as OpenAI.ReasoningEffort }
      : {}),
    ...(reasoning.verbosity
      ? { verbosity: reasoning.verbosity as "low" | "medium" | "high" }
      : {}),
  };
}

type StreamParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  "stream" | "stream_options" | "reasoning_effort"
> &
  ReasoningParams & {
    toolSlug: string;
    /** Sub-step attribution on the token_usage row. Normally null; set to
     *  'model-lab' by labModelFor() so an admin's model comparison is visible
     *  in cost totals without being counted as a teacher's run. */
    step?: string | null;
    /** Ties this generation's telemetry (and any safeguarding flag) to one run. */
    runId?: string | null;
    /**
     * Called with the full text once the model has finished, BEFORE the stream
     * closes, for the same freezing reason recordUsage runs there. The guest
     * route uses it to keep the output for the visitor to claim. Errors are
     * caught and logged: the reader already has every token.
     */
    onComplete?: (text: string, ok: boolean) => Promise<void>;
    /**
     * The teacher's own words, for safeguarding scanning.
     *
     * Prefer passing this explicitly. Most routes assemble one large user prompt
     * that mixes the teacher's free text with our own boilerplate — and that
     * boilerplate mentions "SEND", "safeguarding" and similar, which is a real
     * false-positive source. When omitted, the scan falls back to the user
     * messages, which is better than nothing but noisier.
     */
    safeguardingText?: string;
  };

/** Run a streaming chat completion and return a plain-text streaming Response,
 *  recording exact token usage when the stream closes. Replaces the hand-rolled
 *  ReadableStream boilerplate every text tool used to carry. `toolSlug` is the
 *  key the usage report groups by — pass the tool's API slug. */
export async function streamChat({
  toolSlug,
  step,
  runId,
  safeguardingText,
  onComplete,
  ...params
}: StreamParams): Promise<Response> {
  // Resolve the user NOW, while the request context (and therefore its cookies)
  // is still alive. recordUsage runs in the stream's `finally`, long after the
  // response has been handed off, where the session is no longer readable.
  const userId = await currentUserId();

  // Capture the text to scan while we still have the request. Falls back to the
  // user turns — never the system prompt, which is ours and full of our own
  // vocabulary ("safeguarding", "SEND", "Teachers' Standards").
  const scanText =
    safeguardingText ??
    params.messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");

  // Reasoning settings arrive from modelFor() spread into params. Captured here
  // so they can be recorded alongside the cost they produced.
  const reasoning: ReasoningParams = {
    reasoning_effort: params.reasoning_effort,
    verbosity: params.verbosity,
  };

  const client = getOpenAI();
  const openaiStream = await client.chat.completions.create({
    ...applyModelParams(params, reasoning),
    stream: true,
    // Ask OpenAI to emit a final usage-only chunk so the count is exact.
    stream_options: { include_usage: true },
  });

  const encoder = new TextEncoder();
  let usage: Usage | null = null;
  let full = "";
  let ok = true;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          // The include_usage final chunk carries usage and no content delta.
          if (chunk.usage) usage = chunk.usage;
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            if (onComplete) full += text;
            controller.enqueue(encoder.encode(text));
          }
        }
      } catch (err) {
        ok = false;
        controller.error(err);
      } finally {
        // ORDER MATTERS: record BEFORE closing the stream.
        //
        // controller.close() tells the platform the response is complete, and
        // Vercel may freeze or reclaim the instance from that moment. Anything
        // awaited afterwards can simply never run — the write is suspended
        // mid-flight and the request logs clean, with no row and no error.
        //
        // The user has already received every token by this point, so the extra
        // few ms before close costs them nothing.
        await recordUsage(toolSlug, params.model, usage, step ?? null, userId, runId, {
          effort: reasoning.reasoning_effort,
          verbosity: reasoning.verbosity,
        });
        // Safeguarding runs here for exactly the same reason and under the same
        // constraint: after close() the instance may be frozen and the insert
        // would simply never happen. The scan itself is a synchronous regex
        // pass over the prompt — microseconds — and it writes nothing at all
        // for the overwhelming majority of generations.
        await recordSafeguardingScan(toolSlug, scanText, userId, runId);
        if (onComplete) {
          try {
            await onComplete(full, ok && full.trim().length > 0);
          } catch (err) {
            console.error(`[usage] onComplete threw for ${toolSlug}:`, err);
          }
        }
        try { controller.close(); } catch { /* already errored */ }
      }
    },
    cancel() {
      openaiStream.controller.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type CompletionParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "stream" | "reasoning_effort"
> &
  ReasoningParams & {
    toolSlug: string;
    step?: string | null;
    userId?: string | null;
    runId?: string | null;
    /**
     * Skip the token_usage write, for the rare caller that records this call's
     * usage itself — e.g. one that must pair it with a related asset cost under
     * a shared step and run id. Such a caller MUST still write the row, since
     * token_usage feeds the spend ceiling: a skipped row is an unmetered
     * generation, not just a gap in a report.
     */
    skipUsage?: boolean;
  };

/**
 * Run a NON-streaming chat completion and record its usage.
 *
 * The streaming tools all go through streamChat; this is its counterpart for
 * the routes that need the whole response at once — chiefly the ones using a
 * strict json_schema, which parse the result before returning it.
 *
 * Exists so those routes get model selection and reasoning-param handling from
 * the same place rather than each re-implementing the family differences. It
 * returns the raw completion so callers keep full control of parsing.
 */
export async function createCompletion({
  toolSlug,
  step,
  userId,
  runId,
  skipUsage,
  ...params
}: CompletionParams): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const reasoning: ReasoningParams = {
    reasoning_effort: params.reasoning_effort,
    verbosity: params.verbosity,
  };

  const client = getOpenAI();
  const completion = await client.chat.completions.create({
    ...applyModelParams(params, reasoning),
    stream: false,
  });

  // Awaited, not fired and forgotten: on Fluid Compute the instance can be
  // frozen the moment the handler returns, suspending an in-flight write.
  if (!skipUsage) {
    await recordUsage(
      toolSlug,
      params.model,
      completion.usage,
      step ?? null,
      userId ?? null,
      runId ?? null,
      { effort: reasoning.reasoning_effort, verbosity: reasoning.verbosity },
    );
  }

  return completion;
}
