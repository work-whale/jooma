// Turns a validated prefill into an ordered, timed sequence of field fills.
//
// This is the "what and when" half of Jo typing into a form; useToolLaunch owns
// the "how", calling the form's existing setters on the schedule this produces.
// Split out because it is pure — no React, no DOM, no timers — so the ordering
// and timing rules can be tested directly rather than observed through an
// animation.
//
// ── Why only free text types ────────────────────────────────────────────────
// A teacher should see the form being filled the way a person fills it, but a
// character-by-character reveal only reads as typing in a control that can show
// a partial value. A <select> cannot: setting it to "Yea" matches no option and
// renders blank, so typing into one looks like a bug rather than an assistant.
// The same is true of a stepper, a checkbox and a chip group.
//
// So every field gets a step and fills in order, but only unconstrained strings
// TYPE. Everything else LANDS: one setter call, a short beat, on to the next.
//
// ── Order ───────────────────────────────────────────────────────────────────
// Taken from the tool's schema property order in assistant-tools.ts. Those are
// hand-written object literals, so insertion order is stable, and it already
// tracks the visual order of the forms: the registry spreads ...curriculumFields
// first, which is what WorksheetGeneratorForm renders first. Deriving order from
// the DOM instead would mean every form reporting its field order, which is the
// 35 file change this whole design exists to avoid.
//
// NOTE: property order in ASSISTANT_TOOLS is therefore load-bearing. Reordering
// a tool's `properties` changes the order Jo fills it in. Nothing breaks, but it
// will look wrong.
import { assistantToolFor } from "@/app/lib/assistant-tools";
import type { ToolPrefill } from "@/app/lib/toolPrefill";

/** Characters revealed per tick. Raised, never lowered, to meet the cap. */
export const CHARS_PER_TICK = 3;

/** One frame. Never go below this: more timers, no more visible motion. */
export const TICK_MS = 16;

/** Pause between fields, so each one reads as a discrete act. */
export const FIELD_GAP_MS = 110;

/** How long a non-typed field occupies before the next one starts. */
export const LAND_MS = 90;

/**
 * Ceiling on the whole sequence.
 *
 * A single field is capped at 600 characters (MAX_STRING in toolPrefill.ts),
 * which alone would take over three seconds at the base rate. The teacher is
 * waiting to press Generate, not to watch an animation, so the sequence speeds
 * up rather than running long.
 */
export const TOTAL_CAP_MS = 2_600;

/** Upper bound on the speed-up, so the fill stays legible as typing. */
const MAX_CHARS_PER_TICK = 24;

/**
 * How a field reaches its value.
 *
 * "type" reveals it progressively; "land" applies it in one call. The
 * distinction is about what the CONTROL can render, not about the data type.
 */
export type FillMode = "type" | "land";

export interface FillStep {
  /** Form state key, matching a setter in the caller's prefill map. */
  field: string;
  /** The final value. A typed step passes prefixes of this; a landed one, this. */
  value: string | number | boolean | string[];
  mode: FillMode;
  /** Short human label for the activity panel. */
  label: string;
  /** Characters per tick for this step. Only meaningful when mode is "type". */
  charsPerTick: number;
}

export interface FillPlan {
  slug: string;
  steps: FillStep[];
  /** Estimated wall-clock duration, after any speed-up. For tests and telemetry. */
  durationMs: number;
}

/** A tool's schema, as far as this module cares about it. */
interface FieldSpec {
  type?: string;
  enum?: readonly unknown[];
  description?: string;
}

/**
 * Whether a value can be revealed progressively.
 *
 * Only a string with no enum: an enum is a closed set rendered by a <select>,
 * where every prefix but the last matches no option.
 */
function modeFor(spec: FieldSpec | undefined, value: unknown): FillMode {
  if (typeof value !== "string") return "land";
  if (!spec || spec.type !== "string") return "land";
  if (spec.enum) return "land";
  return "type";
}

/**
 * A field key as a teacher would read it: yearGroup becomes "Year group".
 *
 * Matches the words printed beside the control on the form, so the panel and
 * the form agree about what each field is called.
 */
function humanise(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * The label the activity panel shows for a field.
 *
 * The FIELD NAME, humanised. Not the schema description.
 *
 * Descriptions were tried first, on the reasoning that they would never drift
 * from assistant-tools.ts. They are written for a MODEL, not a teacher, and
 * they read that way: subject's begins "Curriculum subject, e.g. 'Science'",
 * and truncating it at the first sentence produced the label
 * "Curriculum subject, e.g" on screen, because "e.g. " ends in a full stop and
 * a space exactly like a sentence does. Abbreviations make that class of
 * truncation unfixable in general, and a teacher watching a form fill in wants
 * the name of the field anyway, which is the words already printed beside it.
 */
function labelFor(field: string): string {
  return humanise(field);
}

/** What one step costs in milliseconds at a given rate. */
function stepDuration(step: FillStep, charsPerTick: number): number {
  if (step.mode !== "type") return LAND_MS + FIELD_GAP_MS;
  const chars = String(step.value).length;
  const ticks = Math.max(1, Math.ceil(chars / charsPerTick));
  return ticks * TICK_MS + FIELD_GAP_MS;
}

/** Total for a whole sequence at a given rate. */
function totalDuration(steps: FillStep[], charsPerTick: number): number {
  return steps.reduce((sum, step) => sum + stepDuration(step, charsPerTick), 0);
}

/**
 * Build the fill sequence for a validated prefill.
 *
 * `available` is the set of fields the form actually registered a setter for.
 * The schema supplies order, the setter map supplies membership: a field in the
 * schema with no setter cannot be filled, and a setter with no schema entry has
 * no defined position. Only the intersection gets a step.
 *
 * Returns null when there is nothing to animate, so the caller can fall back to
 * applying everything at once.
 */
export function buildFillPlan(
  prefill: ToolPrefill,
  available: Iterable<string>,
): FillPlan | null {
  const tool = assistantToolFor(prefill.slug);
  if (!tool) return null;

  const properties =
    (tool.fields as { properties?: Record<string, FieldSpec> }).properties ?? {};
  const settable = new Set(available);

  const steps: FillStep[] = [];
  for (const [field, spec] of Object.entries(properties)) {
    if (!settable.has(field)) continue;
    const value = prefill.fields[field];
    // Only fields the assistant actually filled. Clearing the rest is
    // useToolLaunch's job and happens instantly, before any of this runs.
    if (value === undefined) continue;

    steps.push({
      field,
      value,
      mode: modeFor(spec, value),
      label: labelFor(field),
      charsPerTick: CHARS_PER_TICK,
    });
  }

  if (steps.length === 0) return null;

  // Speed up until the sequence fits the ceiling. Raising the characters per
  // tick keeps one timer at one frame; shortening the tick would mean more
  // timers for no extra visible motion.
  let charsPerTick = CHARS_PER_TICK;
  while (
    charsPerTick < MAX_CHARS_PER_TICK &&
    totalDuration(steps, charsPerTick) > TOTAL_CAP_MS
  ) {
    charsPerTick += 1;
  }

  // Still over, so the remaining typing is more than the budget allows at a
  // legible rate. Those fields land instead: a long objective appearing at once
  // is better than a teacher waiting on an animation.
  let durationMs = totalDuration(steps, charsPerTick);
  if (durationMs > TOTAL_CAP_MS) {
    let running = 0;
    for (const step of steps) {
      const cost = stepDuration(step, charsPerTick);
      if (running + cost > TOTAL_CAP_MS && step.mode === "type") {
        step.mode = "land";
      }
      running += stepDuration(step, charsPerTick);
    }
    durationMs = totalDuration(steps, charsPerTick);
  }

  for (const step of steps) step.charsPerTick = charsPerTick;

  return { slug: prefill.slug, steps, durationMs };
}

/**
 * The whole sequence as a single instant step per field.
 *
 * Used under prefers-reduced-motion, where the fill must still happen and still
 * be reported, but nothing may animate and no timer may be created.
 */
export function instantPlan(plan: FillPlan): FillPlan {
  return {
    slug: plan.slug,
    steps: plan.steps.map((step) => ({ ...step, mode: "land" as const })),
    durationMs: 0,
  };
}
