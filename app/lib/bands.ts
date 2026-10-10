// Differentiated versions: one output per attainment band, kept together.
//
// A tool that splits by band (Worksheet, Comprehension, Homework, Model text)
// makes one generation per band the teacher picked. The versions travel as one
// string, in the same `tool_runs.output` column a single output uses, so the
// save, the autosave and `?run=` restore need no second code path:
//
//   {"kind":"jooma-bands","version":1,"bands":[{"band":"WBS","output":"..."}]}
//
// Each `output` is exactly what that tool would store on its own: a serialised
// sheet for the designed tools, markdown for the text ones.
//
// `pending` and `error` exist only while the versions stream in. They tell the
// tabs which band is still writing and which one failed; serializeBandSet keeps
// them, saveableBandSet drops them along with any band that failed.

import { DIFFERENTIATION_BANDS, DIFFERENTIATION_VALUES, type DifferentiationBand } from "@/app/lib/differentiation";
import { cleanMathText } from "@/app/lib/math-text";
import { isSheetOutput } from "@/app/lib/sheets/normalize";

export const BAND_SET_KIND = "jooma-bands";
const BAND_SET_VERSION = 1;

export interface BandVersion {
  band: DifferentiationBand;
  output: string;
  /** Still streaming. Transient. */
  pending?: boolean;
  /** Why this band failed. Transient. */
  error?: string;
}

export interface BandSet {
  kind: typeof BAND_SET_KIND;
  version: number;
  bands: BandVersion[];
}

/** True when a stored output holds band versions. Serialised with `kind`
 *  first, so a prefix check is enough, as with isSheetOutput. */
export function isBandSetOutput(output: string | null | undefined): boolean {
  return typeof output === "string" && output.trimStart().startsWith(`{"kind":"${BAND_SET_KIND}"`);
}

/** In canonical band order, whatever order they were added in. */
function sorted(bands: BandVersion[]): BandVersion[] {
  return [...bands].sort(
    (a, b) => DIFFERENTIATION_VALUES.indexOf(a.band) - DIFFERENTIATION_VALUES.indexOf(b.band),
  );
}

/** A stored band set, or null when the output is not one or will not parse. */
export function parseBandSet(output: string | null | undefined): BandSet | null {
  if (!isBandSetOutput(output)) return null;
  try {
    const raw = JSON.parse(output as string) as BandSet;
    if (raw?.kind !== BAND_SET_KIND || !Array.isArray(raw.bands)) return null;
    const bands = raw.bands.filter(
      (b): b is BandVersion =>
        !!b && typeof b.output === "string" && (DIFFERENTIATION_VALUES as readonly string[]).includes(b.band),
    );
    if (bands.length === 0) return null;
    return { kind: BAND_SET_KIND, version: raw.version ?? BAND_SET_VERSION, bands: sorted(bands) };
  } catch {
    return null;
  }
}

export function serializeBandSet(set: Pick<BandSet, "bands">): string {
  // `kind` first: isBandSetOutput depends on it.
  return JSON.stringify({ kind: BAND_SET_KIND, version: BAND_SET_VERSION, bands: sorted(set.bands) });
}

/** A fresh set with one empty, pending slot per band. */
export function emptyBandSet(bands: readonly DifferentiationBand[]): BandSet {
  return {
    kind: BAND_SET_KIND,
    version: BAND_SET_VERSION,
    bands: sorted(bands.map((band) => ({ band, output: "", pending: true }))),
  };
}

/** The set with one band changed. The others are left exactly as they were. */
export function withBand(set: BandSet, band: DifferentiationBand, patch: Partial<Omit<BandVersion, "band">>): BandSet {
  return { ...set, bands: set.bands.map((b) => (b.band === band ? { ...b, ...patch } : b)) };
}

/**
 * What gets saved: the bands that finished, without the streaming flags, and
 * markdown cleaned of leaked LaTeX the way a single output is (ResultPanel).
 * A sheet is never cleaned as a whole: its strings were cleaned one by one when
 * it was normalised. Null when no band has anything to save.
 */
export function saveableBandSet(output: string): string | null {
  const set = parseBandSet(output);
  if (!set) return null;
  const bands = set.bands
    .filter((b) => !b.error && b.output.trim() !== "")
    .map(({ band, output: o }) => ({ band, output: isSheetOutput(o) ? o : cleanMathText(o) }));
  return bands.length ? serializeBandSet({ bands }) : null;
}

/**
 * The band on screen: the one asked for when the set has it, else the first.
 * Null for an output that is not a band set.
 */
export function activeBand(output: string | null | undefined, band: string | null | undefined): DifferentiationBand | null {
  const set = parseBandSet(output);
  if (!set) return null;
  return set.bands.find((b) => b.band === band)?.band ?? set.bands[0].band;
}

/** The output of the band on screen, or the output itself when it is not a band set. */
export function bandOutput(output: string, band: string | null | undefined): string {
  const set = parseBandSet(output);
  if (!set) return output;
  const active = activeBand(output, band);
  return set.bands.find((b) => b.band === active)?.output ?? "";
}

/** Write `next` into the band on screen, or replace the output when it is not a band set. */
export function replaceBandOutput(output: string, band: string | null | undefined, next: string): string {
  const set = parseBandSet(output);
  if (!set) return next;
  const active = activeBand(output, band)!;
  return serializeBandSet(withBand(set, active, { output: next }));
}

/**
 * The one output a single-document reader should show: the first band of a
 * band set, or the output unchanged. For the places that render a saved run
 * without tabs (Library download, a colleague's share, the showcase).
 */
export function primaryOutput(output: string): string;
export function primaryOutput(output: string | null | undefined): string | null | undefined;
export function primaryOutput(output: string | null | undefined): string | null | undefined {
  const set = parseBandSet(output);
  return set ? set.bands[0].output : output;
}

/** "WBS · Working Below Standard", for a tab. */
export function bandTitle(band: DifferentiationBand): { label: string; detail: string } {
  const b = DIFFERENTIATION_BANDS.find((x) => x.value === band)!;
  return { label: b.label, detail: b.detail };
}
