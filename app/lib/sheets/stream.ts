/**
 * Parse JSON that is still arriving.
 *
 * A sheet streams as one JSON object, and the page shows its blocks as they
 * land rather than a spinner for the whole generation. This returns the
 * largest prefix of `text` that is valid JSON once its open strings, arrays
 * and objects are closed, or null before anything usable has arrived.
 *
 * A key with no value yet is dropped rather than guessed at. A string value
 * that is mid-way through is kept, cut where the stream is, so a passage
 * appears as it is written.
 */
export function parsePartialJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* still arriving */
  }

  type Frame = { kind: "obj" | "arr"; expect: "key" | "colon" | "value" | "comma" };
  const stack: Frame[] = [];
  let inString = false;
  let escape = false;
  let stringIsKey = false;
  let stringStart = -1;
  let tokenStart = -1;
  let best: string | null = null;

  const closers = () =>
    stack
      .slice()
      .reverse()
      .map((f) => (f.kind === "obj" ? "}" : "]"))
      .join("");
  const valueDone = (end: number) => {
    const top = stack[stack.length - 1];
    if (top) top.expect = "comma";
    best = text.slice(0, end) + closers();
  };
  const endToken = (end: number) => {
    if (tokenStart === -1) return;
    tokenStart = -1;
    valueDone(end);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') {
        inString = false;
        const top = stack[stack.length - 1];
        if (stringIsKey && top) top.expect = "colon";
        else valueDone(i + 1);
      }
      continue;
    }
    if (tokenStart !== -1 && /[\s,}\]]/.test(ch)) endToken(i);
    const top = stack[stack.length - 1];
    switch (ch) {
      case '"':
        inString = true;
        stringIsKey = !!top && top.kind === "obj" && top.expect === "key";
        stringStart = i;
        break;
      case "{":
      case "[":
        stack.push({ kind: ch === "{" ? "obj" : "arr", expect: ch === "{" ? "key" : "value" });
        best = text.slice(0, i + 1) + closers();
        break;
      case "}":
      case "]":
        stack.pop();
        valueDone(i + 1);
        break;
      case ",":
        if (top) top.expect = top.kind === "obj" ? "key" : "value";
        break;
      case ":":
        if (top) top.expect = "value";
        break;
      default:
        if (tokenStart === -1 && /[-0-9tfn]/.test(ch)) tokenStart = i;
    }
  }

  // A value string cut mid-way: close it where the stream stopped.
  if (inString && !stringIsKey && stringStart !== -1) {
    let body = text.slice(0, text.length);
    // Never end on half an escape sequence.
    body = body.replace(/\\u[0-9a-fA-F]{0,3}$/, "").replace(/\\$/, "");
    const candidate = `${body}"${closers()}`;
    try {
      return JSON.parse(candidate);
    } catch {
      /* fall back to the last complete value */
    }
  }

  if (best === null) return null;
  try {
    return JSON.parse(best);
  } catch {
    return null;
  }
}
