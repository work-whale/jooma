// Which kind of deck the main Slides engine is making.
//
// "pupil" is the Slides tool, as it always was. "staff" is Staff Slides
// (CPD for teachers) and "assembly" is the deck an assembly script hands
// off to (app/lib/deck-prompt.ts has their prompt). Pure, so it can be tested.

import { activityPairsForContentCount } from "./deck-prompt";
import { staffBudget } from "./staff-deck-prompt";

export type DeckKind = "pupil" | "staff" | "assembly";

export function deckKindOf(v: unknown): DeckKind {
  return v === "staff" || v === "assembly" ? v : "pupil";
}

/** The tool_settings slug whose switch gates this deck. */
export function deckToolSlug(kind: DeckKind): "slideshow" | "cpd-slideshow" | "assembly-planner" {
  return kind === "staff" ? "cpd-slideshow" : kind === "assembly" ? "assembly-planner" : "slideshow";
}

/** The tool_runs slug the deck is saved under. An assembly's own history
 *  holds its script, so its deck is saved as a slideshow. */
export function deckRunSlug(kind: DeckKind): "slideshow" | "cpd-slideshow" {
  return kind === "staff" ? "cpd-slideshow" : "slideshow";
}

/** How many slides the model writes: content slides plus activities. A
 *  pupil deck's is unchanged (activity pairs, two slides each); a staff deck
 *  adds one or two discussion tasks, an assembly one questions slide. */
export function deckBudget<T extends { deckKind?: unknown; slideCount?: number }>(body: T): { content: number; activities: number; total: number } {
  const kind = deckKindOf(body.deckKind);
  if (kind === "pupil") {
    const content = Math.max(1, Math.min(15, body.slideCount ?? 8));
    const activities = activityPairsForContentCount(content) * 2;
    return { content, activities, total: content + activities };
  }
  return staffBudget(kind, body.slideCount);
}

/** A slide's speaker notes for PowerPoint, or nothing when blank. */
export function slideNotesText(s: { notes?: string }): string | undefined {
  const t = s.notes?.trim();
  return t ? t : undefined;
}
