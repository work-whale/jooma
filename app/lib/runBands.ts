// One generation per band, all at once, from one press of Generate.
//
// Each band is its own request to the tool's usual route, carrying `band` and
// `bandIndex`, so it is gated, charged and streamed exactly like a single
// generation. They run side by side rather than one after another, so four
// versions take about as long as one. Every chunk from any of them is written
// into that band's slot of one band set (app/lib/bands.ts), and the whole set
// goes to `onUpdate` as the form's `result`.

import type { DifferentiationBand } from "@/app/lib/differentiation";
import { emptyBandSet, serializeBandSet, withBand } from "@/app/lib/bands";

interface RunBandsOptions {
  bands: DifferentiationBand[];
  /** Send one band's request. `index` is its place in `bands`. */
  start: (band: DifferentiationBand, index: number) => Promise<Response>;
  /** Read one band's stream, reporting its output so far, and resolve with the
   *  finished output (null or empty when nothing usable came back). */
  read: (res: Response, onOutput: (output: string) => void) => Promise<string | null>;
  onUpdate: (serialized: string) => void;
}

/**
 * Resolves once every band has finished or failed. A band that fails on its
 * own is marked in its tab and the rest carry on. Throws only when every band
 * failed, with the first failure's message, so the form shows it the way it
 * shows a single failed generation.
 */
export async function runBands({ bands, start, read, onUpdate }: RunBandsOptions): Promise<void> {
  let set = emptyBandSet(bands);
  const publish = () => onUpdate(serializeBandSet(set));
  publish();

  const failures: string[] = [];

  await Promise.all(
    bands.map(async (band, index) => {
      try {
        const res = await start(band, index);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Generation failed");
        }
        const finished = await read(res, (output) => {
          set = withBand(set, band, { output });
          publish();
        });
        if (!finished?.trim()) throw new Error("This version came back empty. Please try again.");
        set = withBand(set, band, { output: finished, pending: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        failures.push(message);
        set = withBand(set, band, { pending: false, error: message });
      }
      publish();
    }),
  );

  if (failures.length === bands.length) throw new Error(failures[0]);
}

/**
 * Read a markdown stream, reporting the text so far. `map` tidies each chunk
 * on the way in (the text tools swap a stray © for "(c)").
 */
export async function readTextStream(
  res: Response,
  onText: (text: string) => void,
  map: (chunk: string) => string = (c) => c,
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += map(decoder.decode(value, { stream: true }));
    onText(text);
  }
  return text;
}
