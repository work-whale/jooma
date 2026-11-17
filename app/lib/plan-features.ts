/*
 * Features by plan (Jooma 4.5 spec Step 1, owner's red notes).
 *
 *   Pictures  generated pictures on Pro, Max and the trial. Free and Standard
 *             get library photos: a request for generated pictures is turned
 *             into library photos on the SERVER, so the deck is still made.
 *   Mark      "Made with Jooma" on Free and trial exports, decided at export
 *             time from the plan in force then.
 *   Refines   Free has 10 a week, back on Sunday. Refining never spends
 *             resources, on any plan.
 *
 * Pure, reading only plan-config.
 */

import { exportMarkFor, picturesAllowed, refinesPerWeek, type AccountPlan } from "@/app/lib/plan-config";

export type PictureMode = "generated" | "library" | "none";

export function pictureMode(plan: AccountPlan, requested: PictureMode): PictureMode {
  if (requested === "generated" && !picturesAllowed(plan)) return "library";
  return requested;
}

export const EXPORT_MARK_TEXT = "Made with Jooma";

/** The footer line for an export made now, or null for a clean one. */
export function exportMark(plan: AccountPlan): string | null {
  return exportMarkFor(plan) ? EXPORT_MARK_TEXT : null;
}

/** Jo editing a resource and the older refine route: Free's weekly refines. */
export const REFINE_PATHS: ReadonlySet<string> = new Set(["/api/modify", "/api/jo"]);

/** P7's line appears with this many refines left. */
const REFINE_LINE_AT = 2;

export type RefineCheck =
  | { ok: true; left: number | null; line: string | null }
  | { ok: false; left: 0; prompt: "P7"; message: string };

export function refineCheck(plan: AccountPlan, usedThisWeek: number): RefineCheck {
  const cap = refinesPerWeek(plan);
  if (cap === null) return { ok: true, left: null, line: null };
  const used = Number.isFinite(usedThisWeek) && usedThisWeek > 0 ? Math.floor(usedThisWeek) : 0;
  const left = Math.max(0, cap - used);
  if (left === 0) {
    return {
      ok: false,
      left: 0,
      prompt: "P7",
      message: "That's this week's 10 refines. They come back on Sunday. Pro refines as often as you like.",
    };
  }
  const line = left <= REFINE_LINE_AT ? `${left} ${left === 1 ? "refine" : "refines"} left this week.` : null;
  return { ok: true, left, line };
}

export type DeckImageSource = "auto" | "ai" | "web";

/**
 * A deck request's picture options, as the SERVER will run them. On Free and
 * Standard any generated share ("ai", or "auto"'s mix) becomes all library
 * photos ("web", 10 of every 10), so the deck is still made. `forced` says the
 * request was changed, for the P5 note.
 */
export function deckImageOptions(
  plan: AccountPlan,
  req: { imageSource?: DeckImageSource; imageMixWeb?: number },
): { imageSource: DeckImageSource; imageMixWeb: number; forced: boolean } {
  const source = req.imageSource ?? "auto";
  const mix = req.imageMixWeb ?? 8;
  if (picturesAllowed(plan)) return { imageSource: source, imageMixWeb: mix, forced: false };
  const alreadyLibrary = source === "web" || (source === "auto" && mix >= 10);
  return { imageSource: "web", imageMixWeb: 10, forced: !alreadyLibrary };
}
