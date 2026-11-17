/*
 * The resources check in front of every cost-bearing request (Jooma 4.5
 * spec Step 2). Pure: generation-guard.ts reads my_resources() and hands the
 * row here, so the proxy and /api/generate-slideshow cannot drift apart.
 *
 *   - A generation is refused BEFORE it starts when its typical cost (the
 *     same rounded estimate as the "about N resources" chip) is more than
 *     what is left. One that has started always finishes; the balance floors
 *     at 0 for display.
 *   - A sub-asset with no estimate is refused only at 0 left.
 *   - Refining (modify, Jo's edits, edit-text) and Ask Jo chat never spend
 *     resources and are never refused for the balance. Free's refines are
 *     capped separately (use_refine), and chat sits behind the hourly limit.
 *   - Admins and School are never refused.
 */

import { picturesAllowed, type AccountPlan } from "@/app/lib/plan-config";
import { estimateCheck, outOfResourcesPayload, type OutOfResources } from "@/app/lib/resources";

/** token_usage slugs that never count as resources spent. The SQL in
 *  resources_spent() must list exactly these; a unit test holds them together. */
export const UNCHARGED_SLUGS: readonly string[] = ["modify", "jo", "edit-text", "assistant"];

const UNCHARGED_PATHS: ReadonlySet<string> = new Set(["/api/modify", "/api/jo", "/api/edit-text", "/api/assistant"]);

export function chargesResources(slug: string): boolean {
  return !UNCHARGED_SLUGS.includes(slug);
}

export interface ResourcesRow {
  plan: string | null;
  total: number | null;
  next_refill_at: string | null;
}

export interface ResourceBlock {
  blocked: true;
  action: "upgrade" | "topup";
  message: string;
  prompt: OutOfResources;
}

const PLANS = new Set(["free", "pro_trial", "standard", "pro", "max", "school"]);

export function resourceGate(
  row: ResourcesRow | null | undefined,
  opts: { path: string; estimate: number | null; isAdmin: boolean },
): ResourceBlock | null {
  if (opts.isAdmin || !row || !PLANS.has(row.plan ?? "")) return null;
  if (UNCHARGED_PATHS.has(opts.path)) return null;
  const plan = row.plan as AccountPlan;
  if (plan === "school") return null;

  const left = Math.max(0, Math.floor(Number(row.total ?? 0)));
  const refillAt = row.next_refill_at ? new Date(row.next_refill_at) : null;
  const action = plan === "free" || plan === "pro_trial" ? "upgrade" : "topup";

  if (opts.estimate !== null) {
    const check = estimateCheck(opts.estimate, left);
    if (check.ok) return null;
    return {
      blocked: true,
      action,
      message: check.message,
      prompt: outOfResourcesPayload(plan, { needed: check.needed, left, refillAt }),
    };
  }

  if (left > 0) return null;
  return {
    blocked: true,
    action,
    message: "You have no resources left right now.",
    prompt: outOfResourcesPayload(plan, { needed: 1, left: 0, refillAt }),
  };
}

/** Routes that only make generated pictures. */
const PICTURE_PATHS: ReadonlySet<string> = new Set(["/api/generate-image"]);

/** P5: generated pictures are Pro, Max and the trial only. */
export function pictureGate(
  plan: string | null,
  path: string,
): { blocked: true; prompt: "P5"; message: string } | null {
  if (!PICTURE_PATHS.has(path)) return null;
  if (!PLANS.has(plan ?? "") || picturesAllowed(plan as AccountPlan)) return null;
  return { blocked: true, prompt: "P5", message: "Generated pictures come with Pro. This deck will use library photos for now." };
}
