// Jo's reply, cut into sentences as it streams in, so the first one can be
// read aloud while the rest is still being written.

/** Words whose full stop does not end a sentence. "etc." and "no." are left
 *  out: they end one far more often than they sit inside one. */
const ABBREVIATION = /\b(?:e\.g|i\.e|mr|mrs|ms|dr|vs|st|approx|fig)$/i;

/**
 * The finished sentences in `text` after position `from`, and where they end.
 * A sentence counts as finished once a space follows its full stop, so "3." is
 * never taken for the end of "3.5". `final` is for a reply that has stopped
 * streaming: whatever is left is spoken, finished or not.
 */
export function nextSentences(text: string, from: number, final = false): { sentences: string[]; upTo: number } {
  const start = Math.min(from, text.length);
  const sentences: string[] = [];
  let upTo = start;
  const end = /[.!?]+["')\]]*(?=\s)/g;
  end.lastIndex = start;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const stop = m.index + m[0].length;
    const before = text.slice(upTo, m.index);
    if (m[0][0] === "." && ABBREVIATION.test(before)) continue;
    const sentence = text.slice(upTo, stop).trim();
    if (sentence) sentences.push(sentence);
    upTo = stop;
  }
  if (final) {
    const rest = text.slice(upTo).trim();
    if (rest) sentences.push(rest);
    upTo = text.length;
  }
  return { sentences, upTo };
}
