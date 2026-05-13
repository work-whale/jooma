// Recolor a single-color SVG (e.g. an Iconify icon) by swapping `fill=`/`stroke=`
// attributes and inline-style `fill:`/`stroke:` declarations. Leaves `none`,
// `transparent`, and gradient/pattern refs (`url(...)`) untouched.

export function isSvgDataUrl(src: string): boolean {
  return src.startsWith("data:image/svg+xml");
}

function decodeSvgDataUrl(src: string): string | null {
  if (!isSvgDataUrl(src)) return null;
  const commaIdx = src.indexOf(",");
  if (commaIdx === -1) return null;
  const header = src.slice(0, commaIdx);
  const body = src.slice(commaIdx + 1);
  try {
    if (header.includes(";base64")) {
      return decodeURIComponent(escape(atob(body)));
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

function encodeSvgDataUrl(svgText: string): string {
  const utf8 = unescape(encodeURIComponent(svgText));
  return `data:image/svg+xml;base64,${btoa(utf8)}`;
}

export function recolorSvgSrc(src: string, color: string): string | null {
  const svg = decodeSvgDataUrl(src);
  if (!svg) return null;
  const recolored = svg
    .replace(/fill="(?!none|transparent|url\()[^"]*"/g, `fill="${color}"`)
    .replace(/stroke="(?!none|transparent|url\()[^"]*"/g, `stroke="${color}"`)
    .replace(/fill:\s*(?!none|transparent|url\()[^;"']+/gi, `fill:${color}`)
    .replace(/stroke:\s*(?!none|transparent|url\()[^;"']+/gi, `stroke:${color}`);
  return encodeSvgDataUrl(recolored);
}

// Normalise color tokens to lower-case hex (#abc → #aabbcc; rgb(…) left as-is).
function normalize(c: string): string {
  const lc = c.toLowerCase().trim();
  // Expand 3-digit hex to 6-digit
  if (/^#([0-9a-f]{3})$/.test(lc)) {
    return `#${lc[1]}${lc[1]}${lc[2]}${lc[2]}${lc[3]}${lc[3]}`;
  }
  return lc;
}

/**
 * Extract every distinct color used in the SVG (fill / stroke as attribute or inline
 * style). Returns lowercase hex strings (or rgb(...) literals). Excludes `none`,
 * `transparent`, `currentColor`, and gradient refs.
 */
export function extractSvgColors(src: string): string[] {
  const svg = decodeSvgDataUrl(src);
  if (!svg) return [];
  const found = new Set<string>();

  const skip = new Set(["none", "transparent", "currentcolor", "inherit"]);
  const isUrl = (v: string) => v.startsWith("url(");

  // fill="..." / stroke="..."
  for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/gi)) {
    const v = m[1].trim();
    if (skip.has(v.toLowerCase()) || isUrl(v)) continue;
    found.add(normalize(v));
  }
  // style="fill: ...; stroke: ..."
  for (const m of svg.matchAll(/(?:fill|stroke):\s*([^;"'\s]+)/gi)) {
    const v = m[1].trim();
    if (skip.has(v.toLowerCase()) || isUrl(v)) continue;
    found.add(normalize(v));
  }
  return Array.from(found);
}

/**
 * Swap a single color in the SVG for a new one (every occurrence as fill or stroke,
 * attribute or inline-style). Leaves other colors untouched so multi-color graphics
 * can be edited one channel at a time.
 */
export function swapSvgColor(src: string, fromColor: string, toColor: string): string | null {
  const svg = decodeSvgDataUrl(src);
  if (!svg) return null;
  const from = normalize(fromColor);
  // Build a case-insensitive matcher that also catches the short-hex form of the same color.
  const short = /^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/i.exec(from);
  const shortHex = short ? `#${short[1]}${short[2]}${short[3]}` : null;
  const variants = shortHex ? [from, shortHex] : [from];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = variants.map(escape).join("|");
  const attrRe = new RegExp(`((?:fill|stroke)=")(${pattern})(")`, "gi");
  const styleRe = new RegExp(`((?:fill|stroke):\\s*)(${pattern})(?=[;"'\\s])`, "gi");
  const recolored = svg
    .replace(attrRe, `$1${toColor}$3`)
    .replace(styleRe, `$1${toColor}`);
  return encodeSvgDataUrl(recolored);
}
