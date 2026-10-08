// Reading a sheet as it streams, in the browser.
//
// The routes stream the model's JSON as plain text. The form hands each update
// to the result panel as a serialised, normalised SheetDoc, so the panel only
// ever sees a valid sheet: an empty one at first, then more of it as blocks
// arrive. Throttled, because each update re-paginates the page.

import { normalizeDraft, serializeSheet } from "./normalize";
import { parsePartialJson } from "./stream";
import { finishSheet, sheetContext, type SheetRequestInfo } from "./context";
import type { SheetTool } from "./types";

const EVERY_MS = 150;

/**
 * Feed a streaming response into `onSheet`, and resolve with the finished,
 * serialised sheet, or null when the stream held nothing usable.
 */
export async function readSheetStream(
  res: Response,
  tool: SheetTool,
  info: SheetRequestInfo,
  onSheet: (serialized: string) => void,
): Promise<string | null> {
  const ctx = sheetContext(tool, info);
  onSheet(serializeSheet(normalizeDraft({}, ctx)));

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let last = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    const now = Date.now();
    if (now - last >= EVERY_MS) {
      last = now;
      const draft = parsePartialJson(full);
      if (draft) onSheet(serializeSheet(normalizeDraft(draft, ctx)));
    }
  }
  full += decoder.decode();
  const finished = finishSheet(tool, full, info);
  if (finished) onSheet(finished);
  return finished;
}
