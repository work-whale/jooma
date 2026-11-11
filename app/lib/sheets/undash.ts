// Long dashes out of what a model wrote.
//
// Jooma's copy never uses em or en dashes, and the prompts say so, but a model
// still slips one in now and then ("erosion—hydraulic action, abrasion—and
// deposition"). The batch 2 tools (unit plans, behaviour plan, one page
// profile, cover lesson) pass their drafts through this before arranging
// them. A range between numbers reads as "to"; any other dash becomes a comma.
// Hyphens are left alone.

/** One string with its long dashes replaced. */
export function undashText(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/^,\s*/, "");
}

/** Every string in a draft, at any depth, with its long dashes replaced. */
export function undash<T>(value: T): T {
  if (typeof value === "string") return undashText(value) as T;
  if (Array.isArray(value)) return value.map(undash) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = undash(v);
    return out as T;
  }
  return value;
}
