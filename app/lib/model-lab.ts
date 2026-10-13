// Admin-only per-request model override, for the model lab (/admin/model-lab).
//
// The lab exists to answer "does this tool still produce good work on a cheaper
// model, and what does it actually cost?" — which means running the SAME input
// through several models and comparing. That only tells the truth if it goes
// through the tool's real route with the tool's real prompt, so rather than
// duplicating prompt-building into a separate lab endpoint, each route accepts
// an optional override in its request body.
//
// ── WHY THIS IS SAFE ──
// The override is honoured ONLY when the caller is a verified admin. A teacher
// posting `__labModel` gets it ignored entirely and their generation runs on the
// configured model exactly as before. The admin check is a real auth call
// (getUser + profiles.is_admin), not a header or a client assertion.
//
// ── WHY LAB RUNS STILL RECORD COST ──
// They spend real money, so they write a real token_usage row. What they do NOT
// do is masquerade as teacher usage: the row carries step='model-lab', which the
// existing admin_tool_step_breakdown() already groups by, so lab spend is
// visible in totals but separable from a tool's genuine per-run cost.
import "server-only";
import type { NextRequest } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { modelFor, type ResolvedModel } from "@/app/lib/tool-model";
import {
  DEFAULT_EFFORT,
  DEFAULT_VERBOSITY,
  isKnownModel,
  isReasoning,
  type ModelId,
} from "@/app/lib/models";

/** The step value every lab-originated token_usage row carries. */
export const LAB_STEP = "model-lab";

/** Body fields the lab adds. Double-underscored so they cannot collide with a
 *  tool's own field names, and so they read as plainly non-teacher-facing. */
export interface LabOverride {
  __labModel?: string;
  __labEffort?: string;
  __labVerbosity?: string;
}

export interface LabResolved extends ResolvedModel {
  /** Pass to streamChat so the row is tagged. null for a normal generation. */
  step: string | null;
}

/**
 * Is this request a genuine admin asking for a specific model?
 *
 * Returns null for every normal generation — no override present, or the caller
 * is not an admin — so callers fall through to the configured model.
 */
async function adminOverride(body: unknown): Promise<LabOverride | null> {
  const b = body as LabOverride | null | undefined;
  const wanted = b?.__labModel;
  if (!wanted) return null;

  // Only now is it worth the auth round-trip: this costs a request to Supabase,
  // and the overwhelming majority of generations never carry an override.
  if (!(await callerIsAdmin("__labModel"))) return null;
  return b ?? null;
}

/**
 * Is the signed-in caller a verified admin? A real auth call (getUser +
 * profiles.is_admin), never a header or a client assertion. Fails closed: on
 * any doubt the answer is no, and the request runs as configured.
 *
 * `field` only names the override in the warning when a non-admin sends one.
 */
export async function callerIsAdmin(field: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (!data?.is_admin) {
      console.warn(`[model-lab] non-admin sent ${field} — ignored`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[model-lab] override check failed, using configured settings:", err);
    return false;
  }
}

/**
 * Drop-in replacement for `modelFor` in a route that should support the lab.
 *
 * Identical behaviour to `modelFor` for every ordinary request. Spread the
 * result into streamChat exactly as before — it carries the extra `step`, which
 * streamChat passes through to recordUsage.
 *
 * Never throws.
 */
export async function labModelFor(
  body: unknown,
  slug: string,
  fallback: ModelId,
): Promise<LabResolved> {
  const override = await adminOverride(body);

  if (!override?.__labModel) {
    return { ...(await modelFor(slug, fallback)), step: null };
  }

  const wanted = override.__labModel;

  // An unknown model would be priced at gpt-4o rates by costUsd(), making the
  // lab's cost column quietly wrong — the one thing a cost-comparison tool must
  // never be. Refuse it and run as configured instead.
  if (!isKnownModel(wanted)) {
    console.warn(`[model-lab] unknown model "${wanted}" — using configured model`);
    return { ...(await modelFor(slug, fallback)), step: null };
  }

  if (!isReasoning(wanted)) {
    // gpt-4o rejects both reasoning params, so they are not carried over.
    return { model: wanted, step: LAB_STEP };
  }

  return {
    model: wanted,
    reasoning_effort: (override.__labEffort as LabResolved["reasoning_effort"]) ?? DEFAULT_EFFORT,
    verbosity: (override.__labVerbosity as LabResolved["verbosity"]) ?? DEFAULT_VERBOSITY,
    step: LAB_STEP,
  };
}
