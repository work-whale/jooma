// Encoding and validation for the `?prefill=` payload the assistant hands to a
// tool page.
//
// Shared by both ends: the assistant route encodes, the tool page decodes. It is
// isomorphic (no server-only import) because both sides need it.
//
// TREAT THE PAYLOAD AS HOSTILE. It arrives in a URL, so anyone can hand-edit it,
// and it is fed straight into form state. Validation is therefore allow-list
// only: unknown tools are rejected, unknown fields are dropped, enums must
// match exactly, and strings are length-capped. Anything that fails validation
// yields null and the form opens empty — never a crash, never half-filled.
import { assistantToolFor } from "@/app/lib/assistant-tools";

/** One answer the teacher can pick in a clarifying question. */
export interface ClarifyOption {
  /** What the teacher sees on the chip. */
  label: string;
  /** The value written into the field when they pick it. */
  value: string;
}

/**
 * A question Jo asks before opening a tool.
 *
 * Carries the tool and everything already parsed, so answering resolves
 * straight to a prefill without going back to the model.
 */
export interface ToolClarify {
  slug: string;
  question: string;
  /** The field an answer fills in. */
  field: string;
  options: ClarifyOption[];
  /** What was understood from the request already. */
  fields: Record<string, string | number | boolean | string[]>;
}

/** What the assistant decided, and what the tool page consumes. */
export interface ToolPrefill {
  slug: string;
  fields: Record<string, string | number | boolean | string[]>;
}

/** Cap on any prefilled string. Comfortably above a real learning objective,
 *  well below anything that would bloat the URL or a form control. */
const MAX_STRING = 600;

/** Cap on the encoded payload, checked before we bother parsing it. */
const MAX_PAYLOAD = 8_000;

/** Cap on an open-ended array field, for schemas whose items are not an enum. */
const MAX_ARRAY = 50;

/** Case- and whitespace-insensitive key for comparing a value to an enum member. */
function normaliseEnum(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Base64url, so the payload survives a URL without percent-encoding soup.
 *
 * Uses TextEncoder/TextDecoder rather than raw btoa/atob because the fields
 * carry teacher-written text: btoa throws on any character above U+00FF, and a
 * curly quote or an accented name would be enough to break it.
 */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a validated prefill for use as a `?prefill=` value. */
export function encodePrefill(prefill: ToolPrefill): string {
  return toBase64Url(JSON.stringify(prefill));
}

/**
 * Validate a raw `{ slug, fields }` against the tool's schema.
 *
 * Returns null if the tool is unknown, if no field survives, or if a required
 * field is missing — an empty or partial form is worse than none, because it
 * looks like the assistant understood when it did not.
 *
 * Exported separately from decodePrefill so the assistant route can validate
 * the model's output before ever building a URL.
 */
export function validatePrefill(raw: unknown): ToolPrefill | null {
  if (!raw || typeof raw !== "object") return null;
  const { slug, fields } = raw as { slug?: unknown; fields?: unknown };

  if (typeof slug !== "string") return null;
  const tool = assistantToolFor(slug);
  if (!tool) return null; // not a wired tool — never open it
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;

  const clean = cleanFields(slug, fields as Record<string, unknown>);
  if (!clean || Object.keys(clean).length === 0) return null;

  // A prefill missing a required field would open a form the teacher still has
  // to complete, having been told it was filled in. Better to answer in chat.
  const required =
    (tool.fields as { required?: string[] }).required ?? [];
  if (required.some((f) => clean[f] === undefined)) return null;

  applyDefaults(tool, clean);

  return { slug, fields: clean };
}

/**
 * The curriculum almost every English school means.
 *
 * Must stay character-for-character one of CURRICULA in formOptions.ts, or the
 * <select> renders blank. cleanFields enforces that, so a typo here shows up as
 * the field simply not being defaulted rather than as a broken control.
 */
const DEFAULT_CURRICULUM = "2014 National Curriculum";

/**
 * Fill in what the teacher did not say and would not think to say.
 *
 * Applied AFTER validation, so a default can never rescue an otherwise empty or
 * invalid prefill: `clean` is already known to be non-empty and to carry every
 * required field. It only tops up what is missing.
 *
 * Currently just the curriculum, and only for tools that actually have the
 * field. Nobody types "using the 2014 National Curriculum" when they ask for a
 * Year 6 lesson, so the model correctly omits it, but the curriculum tools gate
 * Generate on it (LessonPlannerForm.tsx:46) and the teacher is left with a
 * complete-looking form they cannot submit.
 *
 * A DEFAULT BELONGS IN CODE, NOT IN A PROMPT. This was tried three times as
 * prose — in the per-tool schema description, in the function description, and
 * in the tool-select system prompt — and the model omitted it every time. A
 * prompt is a request; this is a guarantee. The prompt guidance stays for the
 * cases where a teacher DOES name a Scottish, Welsh or Northern Irish context,
 * which is a real choice the model should still make.
 */
function applyDefaults(
  tool: { fields: Record<string, unknown> },
  clean: Record<string, string | number | boolean | string[]>,
): void {
  const properties = (tool.fields as { properties?: Record<string, unknown> })
    .properties;
  // Only tools that have the field: a letter to parents has no curriculum, and
  // inventing one would be dropped by the setter loop anyway.
  if (!properties?.curriculum) return;
  if (clean.curriculum !== undefined) return;
  clean.curriculum = DEFAULT_CURRICULUM;
}

/**
 * Sanitise a raw field bag against a tool's schema.
 *
 * The allow-list half of validatePrefill, split out so a clarifying question
 * can carry partially parsed fields through the same checks. Deliberately does
 * NOT enforce required fields: a clarify is incomplete by definition, which is
 * the whole reason it is asking.
 */
function cleanFields(
  slug: string,
  fields: Record<string, unknown>,
): Record<string, string | number | boolean | string[]> | null {
  const tool = assistantToolFor(slug);
  if (!tool) return null;

  const schema = tool.fields as {
    properties: Record<string, {
      type?: string;
      enum?: readonly unknown[];
      minimum?: number;
      maximum?: number;
      items?: { type?: string; enum?: readonly unknown[] };
    }>;
    required?: string[];
  };

  const clean: Record<string, string | number | boolean | string[]> = {};

  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    const spec = schema.properties[key];
    if (!spec) continue; // unknown field — drop it rather than pass it through

    if (spec.type === "string") {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      // An enum is a closed set; anything outside it would not match a <select>
      // option anyway and would render as an empty control.
      //
      // Matched leniently but stored canonically. The model is told the exact
      // values, but "year 6" for "Year 6" is a common near-miss and silently
      // dropping it left the form showing whatever was there before — which
      // reads as the tool ignoring the teacher. Only the canonical member is
      // ever written, so this stays a strict allow-list.
      if (spec.enum) {
        const match = spec.enum.find(
          (e) => typeof e === "string" && normaliseEnum(e) === normaliseEnum(trimmed),
        );
        if (match === undefined) continue;
        clean[key] = match as string;
        continue;
      }
      clean[key] = trimmed.slice(0, MAX_STRING);
      continue;
    }

    if (spec.type === "integer" || spec.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) continue;
      const rounded = spec.type === "integer" ? Math.round(n) : n;
      if (spec.minimum !== undefined && rounded < spec.minimum) continue;
      if (spec.maximum !== undefined && rounded > spec.maximum) continue;
      clean[key] = rounded;
      continue;
    }

    if (spec.type === "boolean") {
      if (typeof value !== "boolean") continue;
      clean[key] = value;
      continue;
    }

    // Arrays of enum strings (differentiationLevels, questionTypes,
    // contentDomains). Same allow-list discipline as the scalar branches: keep
    // only recognised members, and skip the field entirely if none survive
    // rather than handing the form an empty multi-select it will render as
    // "nothing chosen" while claiming to have been prefilled.
    if (spec.type === "array") {
      if (!Array.isArray(value)) continue;
      const allowed = spec.items?.enum;
      const seen = new Set<string>();
      for (const item of value) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        // Same lenient match, canonical store, as the scalar branch above.
        if (allowed) {
          const match = allowed.find(
            (e) => typeof e === "string" && normaliseEnum(e) === normaliseEnum(trimmed),
          );
          if (match === undefined) continue;
          seen.add(match as string);
          continue;
        }
        seen.add(trimmed.slice(0, MAX_STRING));
      }
      if (seen.size === 0) continue;
      // Cap at the option count when the schema is closed, so a hand-edited URL
      // cannot pad the array with repeats of a valid value.
      const items = [...seen];
      clean[key] = allowed ? items.slice(0, allowed.length) : items.slice(0, MAX_ARRAY);
    }
  }

  return clean;
}

/** Cap on the question text. One sentence, not a paragraph. */
const MAX_QUESTION = 200;

/** Cap on an option label or value. These become chips, so they must stay short. */
const MAX_OPTION = 80;

/**
 * Validate a clarifying question from the model.
 *
 * Same hostile-input posture as validatePrefill: an unknown tool, an unknown
 * field, or options that are not real values for that field all yield null, and
 * Jo simply answers in chat instead. A bad question is worse than none, because
 * it stalls a teacher who was already clear.
 */
export function validateClarify(raw: unknown): ToolClarify | null {
  if (!raw || typeof raw !== "object") return null;
  const { slug, question, field, options, fields } = raw as Record<string, unknown>;

  if (typeof slug !== "string") return null;
  const tool = assistantToolFor(slug);
  if (!tool) return null;

  if (typeof question !== "string" || !question.trim()) return null;
  if (typeof field !== "string" || !field.trim()) return null;

  const schema = tool.fields as {
    properties: Record<string, { enum?: readonly unknown[] }>;
  };
  // The question must be about a field the tool actually has, or answering it
  // would fill in nothing.
  const spec = schema.properties[field];
  if (!spec) return null;

  if (!Array.isArray(options)) return null;
  const clean: ClarifyOption[] = [];
  const seen = new Set<string>();
  for (const raw of options) {
    if (!raw || typeof raw !== "object") continue;
    const { label, value } = raw as { label?: unknown; value?: unknown };
    if (typeof label !== "string" || typeof value !== "string") continue;
    const l = label.trim();
    const v = value.trim();
    if (!l || !v) continue;
    // A closed field can only be asked about with its own members, so a chip
    // can never write a value the form would render as nothing.
    if (spec.enum) {
      const match = spec.enum.find(
        (e) => typeof e === "string" && normaliseEnum(e) === normaliseEnum(v),
      );
      if (match === undefined) continue;
      if (seen.has(match as string)) continue;
      seen.add(match as string);
      clean.push({ label: l.slice(0, MAX_OPTION), value: match as string });
      continue;
    }
    if (seen.has(v)) continue;
    seen.add(v);
    clean.push({ label: l.slice(0, MAX_OPTION), value: v.slice(0, MAX_OPTION) });
  }

  // Two is the point: one option is not a choice, and more than three is a
  // form, which is what the tool page is for.
  if (clean.length < 2) return null;

  const parsed =
    fields && typeof fields === "object" && !Array.isArray(fields)
      ? (cleanFields(slug, fields as Record<string, unknown>) ?? {})
      : {};

  return {
    slug,
    question: question.trim().slice(0, MAX_QUESTION),
    field,
    options: clean.slice(0, 3),
    fields: parsed,
  };
}

/**
 * Decode and validate a `?prefill=` value.
 *
 * Never throws: malformed base64, invalid JSON and schema violations all return
 * null, and the caller opens an empty form.
 */
export function decodePrefill(raw: string | null | undefined): ToolPrefill | null {
  if (!raw || raw.length > MAX_PAYLOAD) return null;
  try {
    return validatePrefill(JSON.parse(fromBase64Url(raw)));
  } catch {
    return null;
  }
}

/** The URL the ToolLinkCard points at. */
export function prefillHref(prefill: ToolPrefill): string {
  return `/tools/${prefill.slug}?prefill=${encodePrefill(prefill)}`;
}
