// Filling a generated sheet's pictures. Pure apart from the finder it is
// handed (pictures.ts has the real ones), so it can be tested without a network.
//
// The model writes each picture as what to look for (an image block's `query`
// and `alt`); where it comes from is found once the text has finished, by one
// request per picture to /api/sheet-picture. The form stays busy until they
// land, so the run's first save already holds them, and the page shows a
// placeholder in each frame meanwhile.
//
// A differentiated set finds pictures for its first version only. The others
// are the same topic, so they reuse them by position rather than paying again
// for the same AI pictures: the second picture on the WTS sheet is the second
// one found for WBS.

import { parseBandSet, serializeBandSet, withBand } from "@/app/lib/bands";
import { parseSheet, serializeSheet, sheetImages } from "./normalize";
import type { ImageBlock, ImageSource, SheetDoc } from "./types";

export interface FoundPicture {
  src: string;
  width: number;
  height: number;
  source: ImageSource;
}

export type PictureFinder = (image: ImageBlock, signal: AbortSignal) => Promise<FoundPicture | null>;

/** Long enough for an AI picture at the configured quality; a web one takes
 *  a second or two. */
const PICTURE_TIMEOUT_MS = 60_000;

function mapImages(doc: SheetDoc, fn: (img: ImageBlock, index: number) => ImageBlock): SheetDoc {
  let n = 0;
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.type === "image" ? fn(b, n++) : b)),
    })),
  };
}

/** A picture that still needs finding: no picture yet, but something to look for. */
export function needsPicture(img: ImageBlock): boolean {
  return !img.src && !!img.query.trim();
}

/** Puts a found picture into the block with `id`, or marks it not found. */
export function placePicture(doc: SheetDoc, id: string, found: FoundPicture | null): SheetDoc {
  return mapImages(doc, (img) => {
    if (img.id !== id) return img;
    const { finding: _, ...rest } = img;
    void _;
    return found ? { ...rest, src: found.src, width: found.width, height: found.height, source: found.source } : rest;
  });
}

/** Marks every picture still to find as being searched for. */
export function markFinding(doc: SheetDoc): SheetDoc {
  return mapImages(doc, (img) => (needsPicture(img) ? { ...img, finding: true } : img));
}

/**
 * Another version's pictures, by position: the n-th picture still to find
 * takes `found[n]`. Positions with nothing found are left for their own search.
 */
export function sharePictures(doc: SheetDoc, found: (FoundPicture | null)[]): SheetDoc {
  return mapImages(doc, (img, n) => {
    const pick = found[n];
    if (!pick || !needsPicture(img)) return img;
    const { finding: _, ...rest } = img;
    void _;
    return { ...rest, src: pick.src, width: pick.width, height: pick.height, source: pick.source };
  });
}

/**
 * Finds every missing picture on a serialised sheet, side by side, reporting
 * the sheet after each one lands. Resolves with the finished sheet and what
 * was found, in picture order (null where nothing was).
 */
export async function fillSheetPictures(
  serialized: string,
  find: PictureFinder,
  onSheet: (serialized: string) => void,
): Promise<{ serialized: string; found: (FoundPicture | null)[] }> {
  const start = parseSheet(serialized);
  if (!start) return { serialized, found: [] };
  const images = sheetImages(start);
  if (!images.some(needsPicture)) return { serialized, found: images.map(() => null) };

  let doc = markFinding(start);
  onSheet(serializeSheet(doc));
  const found = await Promise.all(
    images.map(async (img): Promise<FoundPicture | null> => {
      if (!needsPicture(img)) return img.src ? { src: img.src, width: img.width ?? 0, height: img.height ?? 0, source: img.source ?? "web" } : null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PICTURE_TIMEOUT_MS);
      let pick: FoundPicture | null = null;
      try {
        pick = await find(img, controller.signal);
      } catch {
        pick = null;
      } finally {
        clearTimeout(timer);
      }
      doc = placePicture(doc, img.id, pick);
      onSheet(serializeSheet(doc));
      return pick;
    }),
  );
  return { serialized: serializeSheet(doc), found };
}

/**
 * The same for a differentiated set: the first version that came back finds
 * its pictures, and the rest reuse them by position, finding only what is
 * left over. Resolves with the finished set.
 */
export async function fillBandSetPictures(
  serializedSet: string,
  find: PictureFinder,
  onUpdate: (serialized: string) => void,
): Promise<string> {
  let set = parseBandSet(serializedSet);
  if (!set) return serializedSet;
  const lead = set.bands.find((b) => !b.error && parseSheet(b.output));
  if (!lead) return serializedSet;

  const publish = () => onUpdate(serializeBandSet(set!));
  const { found } = await fillSheetPictures(lead.output, find, (output) => {
    set = withBand(set!, lead.band, { output });
    publish();
  });

  await Promise.all(
    set.bands
      .filter((b) => b.band !== lead.band && !b.error)
      .map(async (b) => {
        const doc = parseSheet(b.output);
        if (!doc) return;
        const shared = serializeSheet(sharePictures(doc, found));
        set = withBand(set!, b.band, { output: shared });
        publish();
        await fillSheetPictures(shared, find, (output) => {
          set = withBand(set!, b.band, { output });
          publish();
        });
      }),
  );
  return serializeBandSet(set);
}
