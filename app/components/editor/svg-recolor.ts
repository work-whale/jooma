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
