/**
 * Plain maths for teacher documents.
 *
 * The models write maths in LaTeX unless told not to, and sometimes when told
 * not to: `\( x^2 + 3x + 2 = 0 \)`, `\( \frac{1}{3} \)`, `6 \times 7`. Nothing
 * in Jooma typesets TeX, so teachers saw the raw markup: backslashes and
 * brackets that read as stray slashes, and a `\frac` that looked like a
 * division the question never had. Staging held exactly those examples on a
 * Year 10 worksheet.
 *
 * This rewrites it as the symbols a printed worksheet uses (× ÷ ² ³ √ ≤) and is
 * applied wherever generated text is shown or exported. It is deliberately
 * conservative outside maths: in running text only known commands and caret
 * powers are rewritten, so an ordinary backslash elsewhere is left alone.
 */

const SYMBOLS: Record<string, string> = {
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", equiv: "≡", sim: "~", propto: "∝",
  pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ",
  lambda: "λ", mu: "µ", sigma: "σ", Sigma: "Σ", omega: "ω", Omega: "Ω", phi: "φ",
  infty: "∞", degree: "°", circ: "°", angle: "∠", triangle: "△", perp: "⊥", parallel: "∥",
  rightarrow: "→", to: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔",
  ldots: "…", dots: "…", cdots: "⋯", therefore: "∴", because: "∵",
  in: "∈", cup: "∪", cap: "∩", subset: "⊂", percent: "%",
};

/** Commands that are unmistakably maths, so they are rewritten even outside a
 *  delimited segment. Greek letters and arrows are left out on purpose: a bare
 *  `\to` in running text is far more likely to be something else. */
const RUNNING_TEXT_COMMANDS = new Set([
  "times", "div", "cdot", "pm", "le", "leq", "ge", "geq", "ne", "neq",
  "approx", "infty", "degree",
]);

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ", s: "ₛ", t: "ₜ",
};

function mapAll(text: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of text) {
    const mapped = table[ch];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}

function superscript(text: string): string {
  const t = text.trim();
  if (t === "\\circ" || t === "o" || t === "∘") return "°";
  return mapAll(t, SUPERSCRIPT) ?? `^${t.length > 1 ? `(${t})` : t}`;
}

function subscript(text: string): string {
  const t = text.trim();
  return mapAll(t, SUBSCRIPT) ?? `_${t.length > 1 ? `(${t})` : t}`;
}

/** Wraps a fraction part in brackets when it is more than a single term, so
 *  `\frac{x + 1}{2}` reads `(x + 1)/2` rather than the wrong `x + 1/2`. */
function fracPart(part: string): string {
  const p = part.trim();
  return /^[\w.²³′]+$/u.test(p) ? p : `(${p})`;
}

function rootOf(part: string): string {
  const p = part.trim();
  return /^[\w.]+$/.test(p) ? p : `(${p})`;
}

/** The text-producing commands whose argument is kept and whose name is not. */
const WRAPPERS = /\\(?:text|textrm|textbf|textit|mathrm|mathbf|mathit|mathsf|operatorname|boldsymbol|mbox|displaystyle)\s*\{([^{}]*)\}/g;

/** Rewrite one maths segment: everything here is maths, so grouping braces go
 *  and any command we do not recognise is dropped rather than shown. */
function cleanSegment(segment: string): string {
  let s = segment;

  s = s.replace(/\\left\s*\\?([()[\]|{}.])/g, (_, d: string) => (d === "." ? "" : d));
  s = s.replace(/\\right\s*\\?([()[\]|{}.])/g, (_, d: string) => (d === "." ? "" : d));
  s = s.replace(/\\displaystyle/g, "");

  for (let i = 0; i < 4; i++) s = s.replace(WRAPPERS, "$1");

  // Degrees before powers, or `^\circ` would become a superscript of `circ`.
  s = s.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°");

  s = s.replace(/\\sqrt\s*\[\s*(\d)\s*\]\s*\{([^{}]*)\}/g, (_, n: string, x: string) =>
    `${n === "3" ? "∛" : n === "4" ? "∜" : `${superscript(n)}√`}${rootOf(x)}`);

  // Innermost first: a fraction with no braces inside its arguments, repeated
  // so nested fractions unwind from the inside out.
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${fracPart(a)}/${fracPart(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, x: string) => `√${rootOf(x)}`);
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\\[dt]?frac\s*(\d)\s*(\d)/g, "$1/$2");
  s = s.replace(/\\sqrt\s*(\w)/g, "√$1");

  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_, x: string) => superscript(x));
  s = s.replace(/\^\s*([-−]?\d+|[A-Za-z])/g, (_, x: string) => superscript(x));
  s = s.replace(/_\s*\{([^{}]*)\}/g, (_, x: string) => subscript(x));
  s = s.replace(/_\s*(\d+|[A-Za-z])/g, (_, x: string) => subscript(x));

  s = s.replace(/\\(?:quad|qquad)\b/g, " ");
  s = s.replace(/\\[,;: ]/g, " ");
  s = s.replace(/\\!/g, "");
  s = s.replace(/\\([%$&#_{}])/g, "$1");
  s = s.replace(/\\\\/g, " ");

  s = s.replace(/\\([a-zA-Z]+)/g, (_, name: string) => SYMBOLS[name] ?? "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/(?<=[\d)])\s*(?<!\*)\*(?!\*)\s*(?=[\d(])/g, " × ");

  return s.replace(/[ \t]{2,}/g, " ").trim();
}

/** True when the inside of `\[ ... \]` is maths rather than an escaped pair of
 *  square brackets. Tiptap's markdown writes `[2 marks]` back out as
 *  `\[2 marks\]`, and stripping those as display maths would lose the brackets. */
function looksLikeMaths(inner: string): boolean {
  return /\\[a-zA-Z]+|[\^_=]|\d\s*[-+*/×÷]\s*\d/.test(inner) && !/^\s*\d+\s*marks?\s*$/i.test(inner);
}

export function cleanMathText(text: string): string {
  if (!text || (!text.includes("\\") && !text.includes("^") && !text.includes("$") && !text.includes("*"))) {
    return text;
  }
  let s = text;

  // Delimited segments. Display maths first, so `$$` is not read as two `$`.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner: string) => cleanSegment(inner));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (whole, inner: string) =>
    looksLikeMaths(inner) ? cleanSegment(inner) : `[${inner}]`);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner: string) => cleanSegment(inner));
  // Single dollars only when the inside is plainly maths (a command or a
  // power), so "$5 and $10" is left exactly as written. Not underscores: an
  // answer blank between two prices is not a subscript.
  s = s.replace(/\$(?=\S)([^$\n]*?(?:\\[a-zA-Z]+|\^)[^$\n]*?)(?<=\S)\$/g, (_, inner: string) => cleanSegment(inner));

  // Delimiters left over from a cut-off stream or an unpaired escape.
  s = s.replace(/\\[()]/g, "");
  s = s.replace(/\\([[\]])/g, "$1");

  // Bare commands in running text, outside any delimiters. Only the ones that
  // can only be maths, plus fractions and roots with explicit arguments.
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${fracPart(cleanSegment(a))}/${fracPart(cleanSegment(b))}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, x: string) => `√${rootOf(cleanSegment(x))}`);
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°");
  s = s.replace(/\\([a-zA-Z]+)\b/g, (whole, name: string) =>
    RUNNING_TEXT_COMMANDS.has(name) ? SYMBOLS[name] : whole);
  s = s.replace(/\\%/g, "%");

  // Caret powers in running text: cm^2, x^3, 10^{-2}.
  s = s.replace(/(?<=[A-Za-z0-9)\]])\^\{([^{}\s]+)\}/g, (_, x: string) => superscript(x));
  s = s.replace(/(?<=[A-Za-z0-9)\]])\^([-−]?\d+)/g, (_, x: string) => superscript(x));

  // An escaped or bare single asterisk between numbers is multiplication. Left
  // as `*` it either shows a backslash or turns the digits between two of them
  // italic, which is how "3*4*5" lost its 4.
  s = s.replace(/(?<=\d)\s*\\\*\s*(?=\d)/g, " × ");
  s = s.replace(/(?<=\d) ?(?<![*\\])\*(?!\*) ?(?=\d)/g, " × ");

  return s;
}
