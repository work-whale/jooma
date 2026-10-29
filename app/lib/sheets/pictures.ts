// The finders that fill a sheet's pictures in the browser: one request per
// picture for a signed in teacher, one for the whole sheet for a guest. The
// filling itself is in picture-fill.ts.

import { parseBandSet } from "@/app/lib/bands";
import { saveGeneratedImage } from "@/app/lib/generatedImages";
import { fillBandSetPictures, fillSheetPictures, markFinding, needsPicture, placePicture, type FoundPicture, type PictureFinder } from "./picture-fill";
import { parseSheet, serializeSheet, sheetImages } from "./normalize";
import type { SheetPictures } from "./picture-options";
import type { SheetTool } from "./types";

/**
 * The signed in finder: one request per picture to /api/sheet-picture. An AI
 * picture also goes into the teacher's AI gallery, as a slideshow's do, so it
 * can be used again in a deck.
 */
export function sheetPictureFinder(opts: { tool: SheetTool; pictures: SheetPictures; title: () => string }): PictureFinder {
  return async (image, signal) => {
    const res = await fetch("/api/sheet-picture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ query: image.query, source: opts.pictures.source, style: opts.pictures.style, tool: opts.tool, title: opts.title() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FoundPicture & { style?: string; model?: string };
    if (!data?.src) return null;
    if (data.source === "ai") {
      saveGeneratedImage({
        prompt: image.query,
        style: data.style,
        dataUrl: data.src,
        source: opts.tool,
        slideTitle: opts.title(),
        width: data.width,
        height: data.height,
        model: data.model,
      }).catch(() => {});
    }
    return { src: data.src, width: data.width, height: data.height, source: data.source };
  };
}

/**
 * A guest's pictures: found on the server, web only, and written into the
 * stored free try so the sheet they claim has them too. Resolves with the
 * finished sheet, or the sheet with its frames left empty when that fails.
 */
export async function fillGuestPictures(
  serialized: string,
  trialId: string | null,
  onSheet: (serialized: string) => void,
): Promise<string> {
  const start = parseSheet(serialized);
  if (!start || !sheetImages(start).some(needsPicture)) return serialized;
  onSheet(serializeSheet(markFinding(start)));
  const giveUp = () => {
    const doc = sheetImages(start).reduce((d, img) => (needsPicture(img) ? placePicture(d, img.id, null) : d), start);
    const out = serializeSheet(doc);
    onSheet(out);
    return out;
  };
  if (!trialId) return giveUp();
  try {
    const res = await fetch("/api/try/sheet-pictures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trialId }),
    });
    const data = (await res.json().catch(() => ({}))) as { sheet?: string };
    if (!res.ok || !data.sheet || !parseSheet(data.sheet)) return giveUp();
    onSheet(data.sheet);
    return data.sheet;
  } catch {
    return giveUp();
  }
}

/**
 * After a generation: find the pictures on whatever came back, a single sheet
 * or a differentiated set, signed in or as a guest. Resolves with the output
 * to keep, which is `output` unchanged when no pictures were asked for.
 */
export async function fillGeneratedPictures(opts: {
  tool: SheetTool;
  pictures: SheetPictures | null;
  output: string;
  /** Set on a free try: the stored run the pictures are written into. */
  guest?: { trialId: string | null };
  onUpdate: (serialized: string) => void;
}): Promise<string> {
  const { tool, pictures, output, guest, onUpdate } = opts;
  if (!pictures) return output;
  if (guest) return fillGuestPictures(output, guest.trialId, onUpdate);
  const set = parseBandSet(output);
  const first = parseSheet(set ? set.bands.find((b) => !b.error)?.output : output);
  const find = sheetPictureFinder({ tool, pictures, title: () => first?.title ?? "" });
  if (set) return fillBandSetPictures(output, find, onUpdate);
  return (await fillSheetPictures(output, find, onUpdate)).serialized;
}
