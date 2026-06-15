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

// USD per 1M tokens. `cachedInput` is the discounted rate for prompt tokens that
// hit OpenAI's prompt cache (half price on gpt-4o). Keep this in sync with
// https://openai.com/api/pricing and the figures in docs/tool-costs.md.
const PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-2024-08-06": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

// Unknown models fall back to gpt-4o pricing so cost is over- not under-stated.
const FALLBACK = PRICING["gpt-4o"];

export type Usage = OpenAI.Completions.CompletionUsage;

/** Exact USD cost of one completion, charging cached prompt tokens at the lower
 *  cached rate. */
export function costUsd(model: string, usage: Usage): number {
  const p = PRICING[model] ?? FALLBACK;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const freshInput = Math.max(0, usage.prompt_tokens - cached);
  return (
    (freshInput / 1_000_000) * p.input +
    (cached / 1_000_000) * p.cachedInput +
    (usage.completion_tokens / 1_000_000) * p.output
  );
}

/** Append one telemetry row. Resolves the caller from the request cookies so the
 *  RLS insert (auth.uid() = user_id) passes. Never throws — telemetry must not
 *  break a generation. */
export async function recordUsage(
  toolSlug: string,
  model: string,
  usage: Usage | null | undefined,
): Promise<void> {
  if (!usage) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    await supabase.from("token_usage").insert({
      user_id: user.id,
      tool_slug: toolSlug,
      model,
      prompt_tokens: usage.prompt_tokens,
      cached_tokens: cached,
      completion_tokens: usage.completion_tokens,
      cost_usd: Number(costUsd(model, usage).toFixed(6)),
    });
  } catch {
    // Swallow — a telemetry failure must never surface to the user.
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
): Promise<void> {
  if (!(costUsd > 0)) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("asset_cost").insert({
      user_id: user.id,
      tool_slug: toolSlug,
      kind,
      units: Math.round(units),
      cost_usd: Number(costUsd.toFixed(6)),
    });
  } catch {
    // Swallow — telemetry must never surface to the user.
  }
}

type StreamParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  "stream" | "stream_options"
> & { toolSlug: string };

/** Run a streaming chat completion and return a plain-text streaming Response,
 *  recording exact token usage when the stream closes. Replaces the hand-rolled
 *  ReadableStream boilerplate every text tool used to carry. `toolSlug` is the
 *  key the usage report groups by — pass the tool's API slug. */
export async function streamChat({ toolSlug, ...params }: StreamParams): Promise<Response> {
  const client = getOpenAI();
  const openaiStream = await client.chat.completions.create({
    ...params,
    stream: true,
    // Ask OpenAI to emit a final usage-only chunk so the count is exact.
    stream_options: { include_usage: true },
  });

  const encoder = new TextEncoder();
  let usage: Usage | null = null;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          // The include_usage final chunk carries usage and no content delta.
          if (chunk.usage) usage = chunk.usage;
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
        await recordUsage(toolSlug, params.model, usage);
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
