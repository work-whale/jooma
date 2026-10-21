// What the microphone heard, as one line of text.
//
// The Web Speech API reports a list of results, and browsers disagree on what
// the list holds. Desktop Chrome gives separate pieces ("Hello my", "name is").
// Chrome on Android gives growing copies of the same phrase ("Hello", "Hello
// my", "Hello my name"), and fires the event again for each one. Joining the
// list, then adding that to the draft on every event, wrote "Hello Hello my
// Hello my name" into the box.

/** The phrase the result list describes, with the growing copies folded away. */
export function mergeTranscripts(parts: string[]): string {
  let heard = "";
  for (const raw of parts) {
    const part = raw.replace(/\s+/g, " ").trim();
    if (!part) continue;
    const a = heard.toLowerCase();
    const b = part.toLowerCase();
    if (!heard || b.startsWith(a)) heard = part;
    else if (a.startsWith(b)) continue;
    else heard = `${heard} ${part}`;
  }
  return heard;
}

/** The draft with dictation added after whatever was typed first. */
export function withDictation(typed: string, heard: string): string {
  const before = typed.trimEnd();
  if (!heard) return typed;
  return before ? `${before} ${heard}` : heard;
}
