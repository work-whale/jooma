// Opt-in differentiation, shared by the field component and every tool route.
//
// Replaces the old always-on `abilityLevel` single-select. Two things changed:
// the teacher now opts IN (default "no"), and they pick any combination of the
// four attainment bands rather than exactly one.
//
// Both halves of the feature read this file so the enum cannot drift: the
// control renders DIFFERENTIATION_BANDS, and assistant-tools.ts imports
// DIFFERENTIATION_VALUES for its JSON Schema. That file's own rule 3 warns that
// a hand-copied option list which falls out of sync makes validatePrefill drop
// the value and the control render blank — so nothing here gets copied.

/** The four bands, in ascending attainment order. Drives the control. */
export const DIFFERENTIATION_BANDS = [
  { value: "WBS", label: "WBS", detail: "Working Below Standard" },
  { value: "WTS", label: "WTS", detail: "Working Towards Standard" },
  { value: "EXS", label: "EXS", detail: "Expected Standard" },
  { value: "GDS", label: "GDS", detail: "Greater Depth Standard" },
] as const;

/** Just the values — for JSON Schema enums and validation. */
export const DIFFERENTIATION_VALUES = ["WBS", "WTS", "EXS", "GDS"] as const;

export type DifferentiationBand = (typeof DIFFERENTIATION_VALUES)[number];

/** Whether differentiation is switched on. */
export type Differentiate = "yes" | "no";

/** Full names, for naming the bands in prose. */
const BAND_NAMES: Record<string, string> = {
  WBS: "Working Below Standard",
  WTS: "Working Towards Standard",
  EXS: "Expected Standard",
  GDS: "Greater Depth Standard",
};

/**
 * What each band needs from the adaptation section. These are blended into one
 * instruction rather than emitted as separate blocks — a teacher picking three
 * bands wants one section they can read for a mixed class, not three to
 * reconcile.
 */
const BAND_GUIDANCE: Record<string, string> = {
  WBS:
    "pupils working below the standard, who need significantly simplified access to the same learning — " +
    "heavily scaffolded steps, pre-taught vocabulary, concrete or practical representations, and reduced " +
    "reading and recording demands, without reducing the material to busywork",
  WTS:
    "pupils working towards the standard, who need targeted scaffolding — graphic organisers, sentence " +
    "frames, partially completed worked examples, or modified task demands that maintain access to the " +
    "learning objective without removing cognitive challenge",
  EXS:
    "pupils at the expected standard, for whom the section should describe what successful engagement " +
    "looks like and how to keep them on track and appropriately challenged throughout",
  GDS:
    "pupils working at greater depth, who need extension that deepens understanding rather than simply " +
    "accelerating pace — higher-order thinking, independent enquiry, justification, or links to " +
    "examination-level challenge",
};

/** Canonical order, regardless of the order the teacher clicked them in. */
export function orderedBands(levels: readonly string[]): DifferentiationBand[] {
  const chosen = new Set(levels);
  return DIFFERENTIATION_VALUES.filter((b) => chosen.has(b));
}

/** True for one of the four band codes. Guards a `band` a route was sent. */
export function isBand(v: unknown): v is DifferentiationBand {
  return typeof v === "string" && (DIFFERENTIATION_VALUES as readonly string[]).includes(v);
}

/**
 * How to pitch a WHOLE resource at one band, for the tools that make one
 * version per band (Worksheet, Comprehension, Homework, Model text).
 *
 * Unlike BAND_GUIDANCE, which describes a section of advice to the teacher,
 * this shapes the material itself. The objective stays the same in every
 * version: only the access to it changes.
 */
const BAND_PITCH: Record<DifferentiationBand, string> = {
  WBS:
    "pupils working below the expected standard. Keep the same learning objective but make it fully accessible: " +
    "short sentences and familiar vocabulary, a word bank or key words wherever pupils must recall a term, sentence " +
    "starters for written answers, a partly worked example before each new kind of question, more selected-response " +
    "questions (multiple choice, matching, true or false, gap fill) than open writing, small steps, and a light " +
    "reading load. Still real learning, never busywork",
  WTS:
    "pupils working towards the expected standard. Keep the same learning objective with targeted support: one " +
    "worked example where a new kind of question starts, sentence frames for explanations, a word bank for key " +
    "vocabulary, and a gentle climb in difficulty, with fewer extended answers than the expected version",
  EXS:
    "pupils working at the expected standard for the year group: the normal pitch, with a climb from recall to " +
    "application and one question that stretches",
  GDS:
    "pupils working at greater depth. Keep the same learning objective but deepen it rather than speeding it up: " +
    "little or no recall, more reasoning, explaining, justifying, comparing and applying in unfamiliar contexts, " +
    "open-ended challenge, and minimal scaffolding",
};

/**
 * The prompt line that pitches a whole resource at one band. The band's code
 * and name must never reach the page a pupil holds: a child should not read
 * "Working Below Standard" at the top of their sheet. Only teacher notes may
 * name it.
 */
export function bandPitch(band: DifferentiationBand): string {
  return (
    `This is the ${band} (${BAND_NAMES[band]}) version of the resource, one of several the teacher is making for ` +
    `the same lesson. Pitch every part of it for ${BAND_PITCH[band]}. Never print the band code, its name, or ` +
    `any label of ability anywhere a pupil will read it.`
  );
}

/**
 * The token_usage `step` for one band's request.
 *
 * One click makes one request per band. Every one of them is charged for what
 * it spends, but only the first should count as a generation against the
 * hourly fair-use limit: `is_counted_generation` counts rows whose step is
 * null, so the others are tagged. A client that lies about its index only
 * dodges that count; the spend ceiling still caps what it costs.
 */
export function bandUsageStep(band: unknown, bandIndex: unknown): string | null {
  return isBand(band) && typeof bandIndex === "number" && bandIndex > 0 ? "Band version" : null;
}

/** "WTS (Working Towards Standard)", for teacher-facing notes. */
export function bandName(band: DifferentiationBand): string {
  return `${band} (${BAND_NAMES[band]})`;
}

/** "WBS, WTS and GDS" — for naming the selection in prose. */
function joinBands(bands: readonly string[]): string {
  if (bands.length === 1) return bands[0];
  return `${bands.slice(0, -1).join(", ")} and ${bands[bands.length - 1]}`;
}

/**
 * The prompt fragment for a tool's adaptation section.
 *
 * Returns "" when differentiation is off, when nothing was selected, and when
 * nothing selected was a recognised band — so a caller can treat empty as "omit
 * the whole section, heading included". Emitting an empty heading instead is
 * the failure this guards against: it reads as a section the model forgot to
 * fill in.
 */
export function differentiationPrompt(
  differentiate: Differentiate | undefined,
  levels: string[] | undefined,
): string {
  if (differentiate !== "yes") return "";
  if (!Array.isArray(levels) || levels.length === 0) return "";

  const bands = orderedBands(levels);
  if (bands.length === 0) return "";

  const detail = bands
    .map((b) => `- **${b} (${BAND_NAMES[b]})**: ${BAND_GUIDANCE[b]}`)
    .join("\n");

  const scope =
    bands.length === 1
      ? `pitched for ${bands[0]} (${BAND_NAMES[bands[0]]}) pupils`
      : `covering a mixed group spanning ${joinBands(bands)}`;

  return (
    `Write a SINGLE, blended adaptation section ${scope}. Do not write one ` +
    `separate block per band and do not use the band codes as sub-headings — ` +
    `write it as continuous, practical guidance a teacher can act on for the ` +
    `class as a whole, weaving in the following needs:\n\n${detail}\n\n` +
    `Reference specific adjustments rather than generic statements.`
  );
}

/**
 * Read the two fields back out of a saved tool run.
 *
 * Runs saved before differentiation became opt-in hold the old single-select
 * `abilityLevel` string instead. Those reopen as "yes" with that one band, so a
 * past run still shows the differentiation it was generated with rather than
 * silently coming back switched off.
 */
export function restoreDifferentiation(
  input: Record<string, unknown>,
): { differentiate: Differentiate; levels: string[] } {
  const legacy = typeof input.abilityLevel === "string" ? input.abilityLevel : undefined;

  const saved = input.differentiate;
  const differentiate: Differentiate =
    saved === "yes" || saved === "no" ? saved : legacy ? "yes" : "no";

  const savedLevels = Array.isArray(input.differentiationLevels)
    ? (input.differentiationLevels as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : undefined;

  return {
    differentiate,
    levels: savedLevels ?? (legacy ? [legacy] : []),
  };
}

/**
 * The one-line summary some prompts want alongside the full section (e.g. in a
 * bulleted list of the request parameters). Empty when differentiation is off.
 */
export function differentiationSummary(
  differentiate: Differentiate | undefined,
  levels: string[] | undefined,
): string {
  if (differentiate !== "yes") return "";
  if (!Array.isArray(levels) || levels.length === 0) return "";

  const bands = orderedBands(levels);
  if (bands.length === 0) return "";

  return bands.map((b) => `${b} (${BAND_NAMES[b]})`).join(", ");
}
