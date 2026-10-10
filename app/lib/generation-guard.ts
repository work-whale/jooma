// Server-side enforcement of the plan gates (see plans.ts). This is the trusted
// path: it runs in proxy.ts on every gated request, so it can't be bypassed
// from the client. The limits themselves live in plans.ts.
//
// The gates, in the order they run:
//
//   PLAN gate           No active subscription (plan "free") means no
//                       generating at all. Path-agnostic, like the cost gate.
//   RATE gate           Fair-use generations per hour. GENERATION_PATHS only.
//   COST gate (paid)    Measured provider spend a month against the plan's
//                       ceiling (Standard 75p, Pro £1.50, Max £3.75).
//                       Denominated in real cost, so it is path-agnostic:
//                       anything that records spend counts, and no list needs
//                       maintaining.
//
// Both read from a single my_generation_gate() RPC so one request costs one
// round-trip.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_SPEND_CEILING_PENCE,
  PLAN_CREDITS,
  TRIAL_DAYS,
  asPlanId,
  can,
  hasActivePlan,
  planCredits,
} from "./plans";

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

// Slug lists that must agree, checked where they are declared rather than in a
// test suite the repo does not have a runner for.
//
// GENERATION_PATHS and the TOOLS catalogue drift silently and expensively: a
// tool added to the grid but missing here is UNCAPPED, so a free account can
// run it without limit. A tool here but missing from the grid is unreachable
// but still burns quota — which `lesson-slideshow` was for months, hidden from
// the grid while Jo still routed every slides request to it. It has since been
// removed outright, so the `unlisted` warning below should now stay silent: if
// it ever fires again, something has been half-deleted.
//
// Dev-only and non-fatal: this warns while you are working, and never risks
// taking production down over a naming mismatch.
if (process.env.NODE_ENV !== "production") {
  // Imported lazily so the catalogue is not pulled into the request path.
  import("./tools")
    .then(({ TOOLS }) => {
      const catalogue = new Set(TOOLS.map((t) => t.href.replace("/tools/", "")));
      const gated = new Set([...GENERATION_PATHS].map((p) => p.slice("/api/".length)));

      // Known and deliberate: the Slideshow Generator's endpoint is
      // /api/generate-slideshow, which is excluded as a sub-asset route and
      // self-gates in its own handler instead.
      const EXPECTED_UNGATED = new Set(["slideshow"]);

      const uncapped = [...catalogue].filter(
        (s) => !gated.has(s) && !EXPECTED_UNGATED.has(s),
      );
      const unlisted = [...gated].filter((s) => !catalogue.has(s));

      if (uncapped.length) {
        console.warn(
          `[generation-guard] UNCAPPED: in the tool grid but not GENERATION_PATHS — ${uncapped.join(", ")}. ` +
            "Free accounts can run these without limit.",
        );
      }
      if (unlisted.length) {
        console.warn(
          `[generation-guard] unlisted: gated but absent from the tool grid — ${unlisted.join(", ")}. ` +
            "Unreachable from the UI, but still spends money and burns quota.",
        );
      }
    })
    .catch(() => {
      /* Diagnostic only — never let it break a request. */
    });
}

/** True when this request is an AI generation subject to the Free count caps. */
export function isGenerationRequest(method: string, pathname: string): boolean {
  return method === "POST" && GENERATION_PATHS.has(pathname);
}

// Routes that spend real money but do NOT produce a saved generation. They are
// deliberately absent from GENERATION_PATHS — a refinement must not burn one of
// a free user's five — but they must still be blocked once a paid user has
// exhausted their spend ceiling, or the ceiling leaks.
const COST_BEARING_PATHS: ReadonlySet<string> = new Set([
  // The AI assistant. Deliberately here rather than in GENERATION_PATHS: a chat
  // turn spends real money and must stop at the spend ceiling, but it is not a
  // saved generation and must not count against the hourly rate limit: a
  // teacher asking three follow-up questions has not produced three resources.
  //
  // An account with no plan is refused here by the plan gate in checkAllGates,
  // and the assistant is additionally gated in proxy.ts via can(plan,
  // "assistant").
  "/api/assistant",
  // Jo editing a resource, and reading a reply aloud. Same reasoning as the
  // assistant: real spend, not a new resource.
  "/api/jo",
  "/api/jo/speak",
  "/api/modify",
  "/api/generate",
  "/api/generate-image",
  "/api/generate-audio",
  "/api/generate-activity",
  "/api/generate-lesson-outline",
  "/api/suggest-vocabulary",
  "/api/suggest-subject",
  "/api/edit-text",
  "/api/find-youtube",
  "/api/extract-resource",
]);

/** True when this request should be checked against the spend ceiling. Every
 *  generation qualifies, plus the sub-asset and refinement routes above. */
export function isCostBearingRequest(method: string, pathname: string): boolean {
  return (
    method === "POST" &&
    (GENERATION_PATHS.has(pathname) || COST_BEARING_PATHS.has(pathname))
  );
}

/**
 * The tool slug this request belongs to, or null if it isn't a tool request.
 *
 * Used to decide whether an admin has switched the tool off (see
 * tool-availability.ts). Two shapes count:
 *
 *   POST /api/<slug>   — the endpoint that spends money
 *   GET  /tools/<slug> — the page a teacher would land on
 *
 * The API side is deliberately restricted to paths already known to be tool
 * endpoints rather than treating any /api/* segment as a slug: otherwise a
 * tool_settings row named `stripe` or `auth` could take out checkout or login.
 */
export function toolSlugFor(method: string, pathname: string): string | null {
  if (method === "POST" && (GENERATION_PATHS.has(pathname) || COST_BEARING_PATHS.has(pathname))) {
    return pathname.slice("/api/".length);
  }
  if (method === "GET" && pathname.startsWith("/tools/")) {
    const rest = pathname.slice("/tools/".length);
    // Only the tool's own page — never its nested routes (e.g. an editor at
    // /tools/slideshow/<id>), which have their own access rules.
    if (!rest || rest.includes("/")) return null;
    return rest;
  }
  return null;
}

// ── Assistant plan gate ──────────────────────────────────────────────────────
// Paths the assistant owns, page and API. Checked against can(plan, "assistant")
// before the spend gates, because a plan that cannot use the feature at all
// should not cost a gate round-trip to refuse.
// Jo's in-place edits and its voice are the same feature, so the same plan.
const ASSISTANT_APIS: ReadonlySet<string> = new Set(["/api/assistant", "/api/jo", "/api/jo/speak"]);

/** True when this request targets the assistant API. */
export function isAssistantRequest(method: string, pathname: string): boolean {
  return method === "POST" && ASSISTANT_APIS.has(pathname);
}

export type QuotaBlockReason =
  | "credit_exhausted"
  | "rate_limited"
  /** No active subscription, or a plan without this feature. Only choosing a
   *  plan fixes it. */
  | "plan_required";

export interface QuotaResult {
  blocked: true;
  reason: QuotaBlockReason;
  /** Human-readable copy, safe to render directly. */
  message: string;
  /** Which CTA the client should offer. `wait` offers none — the limit clears
   *  on its own, and there is nothing to sell. */
  action: "upgrade" | "topup" | "wait";
  // Rate gate only:
  used?: number;
  limit?: number;
  /** Seconds until it is worth trying again. Rate limit only. */
  retryAfter?: number;
  // Cost gate only (pence):
  spendPence?: number;
  ceilingPence?: number;
}

interface GateRow {
  plan: string | null;
  is_admin: boolean | null;
  used_today: number | null;
  used_month: number | null;
  used_hour: number | null;
  rate_limit_hour: number | null;
  spend_pence: number | string | null;
  credit_pence: number | string | null;
}

/** The block every cost-bearing request gets without an active subscription.
 *  Exported so the copy is pinned by a test rather than retyped. */
export function noPlanBlock(): QuotaResult {
  return {
    blocked: true,
    reason: "plan_required",
    action: "upgrade",
    message:
      `Choose a plan to start creating. Every plan starts with a ${TRIAL_DAYS} day ` +
      "free trial, and you can cancel before it ends.",
  };
}

/**
 * Resolve every gate for the caller in one round-trip.
 *
 * Returns `null` when the request is allowed, including for admins, who are
 * exempt so they can test tools freely without subscribing, and for plans with
 * no ceiling (School, not modelled).
 *
 * `countsAsGeneration` should be true only for GENERATION_PATHS; the cost
 * ceiling is checked either way.
 */
export async function checkAllGates(
  supabase: SupabaseClient,
  opts: { countsAsGeneration: boolean },
): Promise<QuotaResult | null> {
  const { data, error } = await supabase.rpc("my_generation_gate");
  if (error) {
    // Fail OPEN. A telemetry/DB blip must not take the whole product down; the
    // worst case is a little unmetered spend, which the admin margin report
    // will surface. Failing closed would block paying users on a transient.
    console.warn("[generation-guard] my_generation_gate failed:", error.message);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as GateRow | undefined;
  if (!row) return null;
  if (row.is_admin) return null; // admins bypass every gate

  const plan = asPlanId(row.plan);

  // ── 0. An active subscription at all ──
  // First, and for every cost-bearing request rather than only generations:
  // Free was withdrawn, so an account with no subscription (a signup who never
  // checked out, a lapsed subscriber, an old Free account) may not spend
  // anything, refinements and sub-assets included. Its spend ceiling is null,
  // so without this the cost gate below would never stop it.
  if (!hasActivePlan(plan)) return noPlanBlock();

  // ── 1. Fair-use rate limit (generations only) ──
  // Checked FIRST, before the cost ceiling: someone generating too fast should
  // be told to slow down, not sold credit. Offering an upgrade to a Pro user
  // who was merely quick would be insulting and would not fix anything.
  //
  // 0 (or a missing setting) means unlimited — see the migration note. The
  // limit only applies to real generations, so sub-asset and refinement calls
  // made while assembling one output do not compound against it.
  if (opts.countsAsGeneration) {
    const hourLimit = Number(row.rate_limit_hour ?? 0);
    const usedHour = Number(row.used_hour ?? 0);
    if (hourLimit > 0 && usedHour >= hourLimit) {
      return {
        blocked: true,
        reason: "rate_limited",
        action: "wait",
        message:
          `You've generated ${hourLimit} times in the last hour. That's a fair-use limit ` +
          "to keep Jooma quick for everyone — try again shortly.",
        used: usedHour,
        limit: hourLimit,
        // The window is rolling, so the true wait is until the oldest run ages
        // out. Without querying for that timestamp, a conservative few minutes
        // is a better prompt than a precise number that needs another round-trip.
        retryAfter: 300,
      };
    }
  }

  // ── 2. Cost ceiling (path-agnostic) ──
  // Checked first: it is the margin guard, and on plans that have one there is
  // no count cap to fall through to anyway.
  const ceiling = AI_SPEND_CEILING_PENCE[plan];
  if (ceiling !== null) {
    const spendPence = Number(row.spend_pence ?? 0);
    const creditPence = Number(row.credit_pence ?? 0);
    const allowance = ceiling + creditPence;
    if (spendPence >= allowance) {
      const monthly = planCredits(plan) ?? PLAN_CREDITS;
      return {
        blocked: true,
        reason: "credit_exhausted",
        action: "topup",
        // Credits, not pence: the internal meter is model spend, but naming a
        // pound figure for the ALLOWANCE next to the subscription price reads as
        // poor value. The £1.50 top-up PRICE is fine to state — they pay it.
        message:
          `You've used this month's ${monthly.toLocaleString("en-GB")} credits. ` +
          `Add ${PLAN_CREDITS.toLocaleString("en-GB")} more for £1.50 — they last ` +
          `until the end of the month.`,
        spendPence,
        ceilingPence: allowance,
      };
    }
  }

  return null;
}

/**
 * Whether this account may use the assistant at all.
 *
 * Separate from checkAllGates because it is a plan ENTITLEMENT, not a quota: no
 * amount of waiting or topping up gives an account without a subscription the
 * assistant, only choosing a plan. Returns null when allowed.
 *
 * Why this exists at all: AI_SPEND_CEILING_PENCE.free is null, so the cost gate
 * never fires for an account with no plan. Every paid plan includes the
 * assistant, so in practice this refuses exactly the accounts with no plan.
 *
 * Fails OPEN on an RPC error, matching checkAllGates: a telemetry blip must not
 * withhold a paid feature from someone paying for it.
 */
export async function checkAssistantAccess(
  supabase: SupabaseClient,
): Promise<QuotaResult | null> {
  const { data, error } = await supabase.rpc("my_generation_gate");
  if (error) {
    console.warn("[generation-guard] assistant gate lookup failed:", error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as GateRow | undefined;
  if (!row) return null;
  if (row.is_admin) return null; // admins bypass every gate

  const plan = asPlanId(row.plan);
  if (can(plan, "assistant")) return null;
  if (!hasActivePlan(plan)) return noPlanBlock();

  return {
    blocked: true,
    reason: "plan_required",
    action: "upgrade",
    message: "The assistant is not part of your plan. Change plan to chat with it.",
  };
}

/** The body every gate returns. Shared so the proxy and any route that
 *  self-gates (see /api/generate-slideshow) can't drift apart. */
export function quotaBlockBody(q: QuotaResult) {
  return {
    error: q.message,
    // Unchanged for the count gates so existing clients keep working; `reason`
    // carries the new granularity.
    code:
      q.reason === "credit_exhausted"
        ? "ai_credit_exhausted"
        : q.reason === "rate_limited"
          ? "rate_limited"
          : q.reason === "plan_required"
            ? "plan_required"
            : "generation_limit_reached",
    reason: q.reason,
    action: q.action,
    ...(q.used !== undefined ? { used: q.used } : {}),
    ...(q.limit !== undefined ? { limit: q.limit } : {}),
    ...(q.retryAfter !== undefined ? { retryAfter: q.retryAfter } : {}),
    ...(q.spendPence !== undefined ? { spendPence: q.spendPence } : {}),
    ...(q.ceilingPence !== undefined ? { ceilingPence: q.ceilingPence } : {}),
  };
}

/**
 * HTTP status for a block.
 *
 * A rate limit is 429, not 402: nothing is owed, and 402 would be a lie about
 * why the request failed. It also keeps UpgradeGate out of the way — see
 * quotaBlockHeaders below.
 */
export function quotaBlockStatus(q: QuotaResult): number {
  return q.reason === "rate_limited" ? 429 : 402;
}

/**
 * Headers for a block.
 *
 * `x-upgrade-required` is what UpgradeGate keys off (with a 402) to show the
 * upgrade modal, so it must NOT be sent for a rate limit — a Pro user who
 * generated too fast has nothing to upgrade to, and offering it would be both
 * wrong and annoying. Rate limits send Retry-After instead.
 */
export function quotaBlockHeaders(q: QuotaResult): Record<string, string> {
  if (q.reason === "rate_limited") {
    return q.retryAfter !== undefined ? { "retry-after": String(q.retryAfter) } : {};
  }
  return { "x-upgrade-required": "1" };
}

