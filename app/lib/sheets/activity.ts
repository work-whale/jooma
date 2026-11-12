// One classroom activity as sheet blocks, shared by the tools that list
// activities (Phonics, Early Years Plan).
//
// The model writes each activity in one fixed shape (activitySchema); code
// turns it into blocks every sheet already draws, prints and exports: a line
// on what it is for, what you need, the steps, the words to use, and a box
// with how to support and stretch. Support and Challenge replace the
// WBS/WTS/EXS/GDS bands those tools used to offer: the bands are KS1 and KS2
// labels that neither Early Years nor phonics groups use.
//
// Pure, free of React, normalize.ts and schema.ts (the tool registry imports
// this, and schema.ts imports the registry). The schema the model writes
// against is activitySchema in app/lib/activity-schema.ts.

/** The rule the prompts give for an activity's fields, in one place. */
export const ACTIVITY_FIELDS_RULE =
  "Each activity has: title (a short, specific name), focus (one sentence: what it teaches), resources (what you need), steps (3 to 5 short steps for the adult), vocabulary (2 to 5 words to use with the children), support (one sentence: how to make it easier for a child who needs it), challenge (one sentence: how to stretch a child who is ready).";

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str_ = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** An activity's title, or "" while it has not streamed in. */
export function activityTitle(raw: unknown): string {
  return str_(obj(raw).title);
}

/**
 * One activity's blocks, in reading order. A part with nothing in it is left
 * out (mid-stream, or a model that skipped it); support and challenge share
 * one box and it appears as soon as either has something.
 */
export function activityBlocks(raw: unknown): Raw[] {
  const a = obj(raw);
  const focus = str_(a.focus);
  const resources = strs(a.resources);
  const steps = strs(a.steps);
  const vocabulary = strs(a.vocabulary);
  const support = str_(a.support);
  const challenge = str_(a.challenge);
  const adapt = [support ? `**Support:** ${support}` : "", challenge ? `**Challenge:** ${challenge}` : ""].filter(Boolean).join("  ");
  return [
    ...(focus ? [{ type: "text", text: focus }] : []),
    ...(resources.length ? [{ type: "list", title: "You will need", style: "bullet", items: resources }] : []),
    ...(steps.length ? [{ type: "list", title: "What to do", style: "number", items: steps }] : []),
    ...(vocabulary.length ? [{ type: "wordbank", title: "Words to use", words: vocabulary }] : []),
    ...(adapt ? [{ type: "callout", variant: "tip", label: "Adapt it", emoji: "🪜", text: adapt }] : []),
  ];
}

/** One activity as a section of its own: its title as the heading. */
export function activitySection(raw: unknown, opts: { role?: string; emoji?: string; prefix?: string } = {}): Raw | null {
  const title = activityTitle(raw);
  const blocks = activityBlocks(raw);
  if (!title && blocks.length === 0) return null;
  return { role: opts.role ?? "", title: opts.prefix ? `${opts.prefix}${title}` : title, emoji: opts.emoji ?? "", instructions: "", blocks };
}
