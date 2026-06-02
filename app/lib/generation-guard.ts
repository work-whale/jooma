// Server-side enforcement of the monthly AI-generation cap (see plans.ts). This
// is the trusted gate: it runs in proxy.ts on every request, so a free user
// can't bypass it from the client. The limit itself lives in plans.ts.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asPlanId, generationGate } from "./plans";

// The API routes that count as one generation against the cap. Each is a tool's
// primary endpoint and produces exactly one saved tool_run, so counting these
// matches the user-visible notion of "a generation".
//
// Deliberately EXCLUDED (do not count toward the limit): /api/modify
// (refinements of an existing output) and all utility/sub-asset endpoints
// (fetch-image, generate-image, generate-audio, generate-outline,
// generate-activity, generate-slideshow, suggest-vocabulary, find-youtube,
// extract-resource, upload-image, upload-video). When a new tool is added,
// add its route here or it will go uncapped.
const GENERATION_PATHS: ReadonlySet<string> = new Set([
  "/api/assembly-planner",
  "/api/behaviour-support-plan",
  "/api/comprehension-generator",
  "/api/cover-lesson",
  "/api/cpd-slideshow",
  "/api/ect-report-writer",
  "/api/exam-question-generator",
  "/api/eyfs-action-plan",
  "/api/eyfs-planner",
  "/api/homework-generator",
  "/api/inspection-prep",
  "/api/learning-walk-report",
  "/api/lesson-observation-report",
  "/api/lesson-planner",
  "/api/lesson-slideshow",
  "/api/letter-writer",
  "/api/medium-term-planner",
  "/api/meeting-planner",
  "/api/model-answer-generator",
  "/api/model-text-generator",
  "/api/newsletter-writer",
  "/api/one-page-profile",
  "/api/performance-management",
  "/api/phonics-support",
  "/api/policy-generator",
  "/api/pupil-premium-planner",
  "/api/quiz-generator",
  "/api/report-writer",
  "/api/risk-assessment",
  "/api/school-improvement-plan",
  "/api/sensory-activities",
  "/api/smart-targets",
  "/api/targeted-intervention",
  "/api/topic-overview",
  "/api/worksheet-generator",
]);

/** True when this request is an AI generation subject to the monthly cap. */
export function isGenerationRequest(method: string, pathname: string): boolean {
  return method === "POST" && GENERATION_PATHS.has(pathname);
}

export interface QuotaResult {
  blocked: boolean;
  used: number;
  limit: number;
}

/** Resolve the caller's plan + usage and decide if this generation is allowed.
 *  Returns null when no cap applies (unlimited plan), so callers can skip the
 *  block. `userId` is passed in to avoid a second auth round-trip. */
export async function checkGenerationQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaResult | null> {
  const [{ data: profile }, { data: count }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase.rpc("my_generation_count_this_month"),
  ]);

  const plan = asPlanId(profile?.plan);
  const used = typeof count === "number" ? count : 0;
  const gate = generationGate(plan, used);

  if (gate.limit === null) return null; // unlimited plan — no cap
  return { blocked: !gate.allowed, used: gate.used, limit: gate.limit };
}
