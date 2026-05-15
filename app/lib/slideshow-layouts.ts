// Layout renderer — turns each AI-produced SlideSpec into a SlideJSON that the
// editor can open and edit. Each layout positions its text/shape/image elements
// against the 1280×720 slide canvas defined by SLIDE_W/SLIDE_H.

import type { SlideJSON, TextObject, ShapeObject, ImageObject } from "./presentations";
import type { SlideshowTheme } from "./slideshowThemes";

const SLIDE_W = 1280;
const SLIDE_H = 720;

export type SlideLayout =
  | "title-cover"
  | "title-bullets"
  | "title-body"
  | "image-left"
  | "image-right"
  | "image-full"
  | "two-column"
  | "quote"
  | "section-header";

export type ColorScheme = "light" | "dark" | "accent";

export interface SlideSpec {
  layout: SlideLayout;
  colorScheme: ColorScheme;
  accentColor: string;     // hex for accent shapes and highlights, e.g. "#7c3aed"
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageQuery?: string;
  imageDataUrl?: string;   // injected server-side after Pixabay fetch
  imageWidth?: number;     // natural dims, if known
  imageHeight?: number;
  attribution?: string;    // for quote layout
  twoColLeftTitle?: string;
  twoColLeftBody?: string;
  twoColRightTitle?: string;
  twoColRightBody?: string;
}

// ── Theme palette per color scheme ─────────────────────────────────────────
interface Theme {
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

function themeFor(scheme: ColorScheme, accent: string, base?: SlideshowTheme): Theme {
  // If a user-picked theme is provided, use its palette as the foundation.
  // The per-slide colorScheme then chooses between bg/dark/accent variants.
  if (base) {
    switch (scheme) {
      case "dark":
        return {
          bg: base.palette.text, // dark = use text color as bg, invert
          text: base.palette.background,
          muted: "rgba(255,255,255,0.7)",
          accent: base.palette.accent,
        };
      case "accent":
        return {
          bg: base.palette.accent,
          text: base.palette.overlayText,
          muted: "rgba(255,255,255,0.85)",
          accent: base.palette.overlayText,
        };
      case "light":
      default:
        return {
          bg: base.palette.background,
          text: base.palette.text,
          muted: base.palette.muted,
          accent: base.palette.accent,
        };
    }
  }
  // No theme — original behaviour with neutral defaults + AI's accentColor.
  switch (scheme) {
    case "dark":
      return { bg: "#1a1a2e", text: "#ffffff", muted: "#cbd5e1", accent };
    case "accent":
      return { bg: accent, text: "#ffffff", muted: "rgba(255,255,255,0.85)", accent: "#ffffff" };
    case "light":
    default:
      return { bg: "#ffffff", text: "#1a1a2e", muted: "#475569", accent };
  }
}

// ── id helpers ─────────────────────────────────────────────────────────────
let counter = 0;
function nid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

// ── text builders ──────────────────────────────────────────────────────────
// Per-render theme override for fonts/colors; threaded by makeText helper.
let activeTheme: SlideshowTheme | undefined;

function makeText(
  text: string,
  x: number, y: number, width: number,
  fontSize: number, fontWeight: string, color: string,
  align: "left" | "center" | "right" = "left",
  fontFamily?: string,
): TextObject {
  // Heuristic: titles use the heading font (bold weight); everything else uses body.
  const resolvedFont = fontFamily ?? (
    activeTheme
      ? (parseInt(fontWeight) >= 600 ? activeTheme.fonts.heading : activeTheme.fonts.body)
      : "'Inter', sans-serif"
  );
  return {
    id: nid("t"),
    x, y, width,
    text,
    fontSize,
    fontWeight,
    fontStyle: "normal",
    underline: false,
    fontFamily: resolvedFont,
    color,
    textAlign: align,
  };
}

function makeAccentBar(color: string, x: number, y: number, width: number, height: number): ShapeObject {
  return {
    id: nid("sh"),
    type: "rect",
    x, y, width, height,
    fill: color,
    stroke: "transparent",
    strokeWidth: 0,
    opacity: 1,
    cornerRadius: 4,
  };
}

function makeImage(
  src: string, x: number, y: number, width: number, height: number,
  naturalW?: number, naturalH?: number,
): ImageObject {
  return {
    id: nid("im"),
    x, y, width, height,
    src,
    opacity: 1,
    naturalWidth: naturalW,
    naturalHeight: naturalH,
  };
}

// ── layout renderers ──────────────────────────────────────────────────────

function renderTitleCover(spec: SlideSpec, t: Theme): SlideJSON {
  // Title shrinks as it gets longer so it doesn't wrap onto the subtitle.
  const len = spec.title.length;
  const titleSize = len > 40 ? 56 : len > 25 ? 64 : 76;
  const charsPerLine = Math.max(8, Math.floor(1080 / (titleSize * 0.55)));
  const titleLines = Math.max(1, Math.ceil(len / charsPerLine));
  const titleHeight = titleLines * titleSize * 1.2;
  const titleY = 220;
  const subtitleY = titleY + titleHeight + 28;

  // When the AI provides a cover image, render it as a full-bleed background
  // with a dark scrim so light text reads on top.
  const hasCoverImage = !!spec.imageDataUrl;
  const textColor = hasCoverImage ? "#ffffff" : t.text;
  const mutedColor = hasCoverImage ? "rgba(255,255,255,0.85)" : t.muted;
  const accent = hasCoverImage ? "#ffffff" : t.accent;

  const shapes: ShapeObject[] = [];
  if (hasCoverImage) {
    // 50% black scrim covering the whole slide, sitting beneath the text.
    shapes.push({
      id: nid("sh"),
      type: "rect",
      x: 0, y: 0, width: SLIDE_W, height: SLIDE_H,
      fill: "#000000",
      stroke: "transparent",
      strokeWidth: 0,
      opacity: 0.5,
    });
  } else {
    // No image → decorate the slide with large soft accent circles so it doesn't
    // look like an empty colored rectangle. Two off-canvas circles at opposite
    // corners give a clean editorial feel.
    shapes.push({
      id: nid("sh"), type: "ellipse",
      x: -180, y: -180, width: 480, height: 480,
      fill: accent, stroke: "transparent", strokeWidth: 0, opacity: 0.18,
    });
    shapes.push({
      id: nid("sh"), type: "ellipse",
      x: SLIDE_W - 320, y: SLIDE_H - 320, width: 600, height: 600,
      fill: accent, stroke: "transparent", strokeWidth: 0, opacity: 0.12,
    });
    shapes.push({
      id: nid("sh"), type: "ellipse",
      x: SLIDE_W - 140, y: 80, width: 80, height: 80,
      fill: accent, stroke: "transparent", strokeWidth: 0, opacity: 0.4,
    });
  }
  shapes.push(makeAccentBar(accent, 100, titleY - 36, 120, 6));

  return {
    shapes,
    texts: [
      makeText(spec.title, 100, titleY, 1080, titleSize, "700", textColor, "left"),
      ...(spec.subtitle ? [makeText(spec.subtitle, 100, subtitleY, 1080, 26, "400", mutedColor, "left")] : []),
    ],
    images: [],
    background: t.bg,
    ...(hasCoverImage
      ? {
          backgroundImage: spec.imageDataUrl,
          backgroundImageWidth: spec.imageWidth,
          backgroundImageHeight: spec.imageHeight,
          backgroundOffsetX: 0,
          backgroundOffsetY: 0,
          backgroundScale: 1,
        }
      : {}),
  };
}

function renderSectionHeader(spec: SlideSpec, t: Theme): SlideJSON {
  const len = spec.title.length;
  const titleSize = len > 35 ? 52 : len > 22 ? 60 : 68;
  const charsPerLine = Math.max(8, Math.floor(1080 / (titleSize * 0.55)));
  const titleLines = Math.max(1, Math.ceil(len / charsPerLine));
  const titleHeight = titleLines * titleSize * 1.2;
  const titleY = 280;
  const subtitleY = titleY + titleHeight + 24;
  return {
    shapes: [],
    texts: [
      makeText(spec.title, 100, titleY, 1080, titleSize, "700", t.text, "center"),
      ...(spec.subtitle ? [makeText(spec.subtitle, 100, subtitleY, 1080, 22, "400", t.muted, "center")] : []),
    ],
    images: [],
    background: t.bg,
  };
}

function renderTitleBullets(spec: SlideSpec, t: Theme): SlideJSON {
  const bullets = (spec.bullets ?? []).slice(0, 5);
  const startY = 200;
  const lineSpacing = 80;
  return {
    shapes: [makeAccentBar(t.accent, 100, 130, 60, 4)],
    texts: [
      makeText(spec.title, 100, 60, 1080, 48, "700", t.text, "left"),
      ...bullets.map((b, i) =>
        makeText(`•   ${b}`, 100, startY + i * lineSpacing, 1080, 28, "400", t.text, "left"),
      ),
    ],
    images: [],
    background: t.bg,
  };
}

function renderTitleBody(spec: SlideSpec, t: Theme): SlideJSON {
  return {
    shapes: [makeAccentBar(t.accent, 100, 130, 60, 4)],
    texts: [
      makeText(spec.title, 100, 60, 1080, 48, "700", t.text, "left"),
      ...(spec.body ? [makeText(spec.body, 100, 200, 1080, 24, "400", t.text, "left")] : []),
    ],
    images: [],
    background: t.bg,
  };
}

function renderImageSide(spec: SlideSpec, t: Theme, side: "left" | "right"): SlideJSON {
  const imageOnLeft = side === "left";
  const imageX = imageOnLeft ? 60 : SLIDE_W / 2 + 20;
  const textX = imageOnLeft ? SLIDE_W / 2 + 40 : 80;
  const textWidth = SLIDE_W / 2 - 100;
  const imgWidth = SLIDE_W / 2 - 80;
  const imgHeight = SLIDE_H - 120;
  const imgY = 60;

  // The image rect spans the full slot and the photo is cropped (cover-fit)
  // to fill it. Setting frame: "none" with cornerRadius=0 is what triggers the
  // cover branch in the renderer; we use a tiny radius to enable it cleanly.
  const images: ImageObject[] = spec.imageDataUrl
    ? [{
        ...makeImage(spec.imageDataUrl, imageX, imgY, imgWidth, imgHeight, spec.imageWidth, spec.imageHeight),
        frame: "rounded",
        cornerRadius: 0,
      }]
    : [];

  const texts: TextObject[] = [
    makeText(spec.title, textX, 140, textWidth, 40, "700", t.text, "left"),
    ...(spec.body ? [makeText(spec.body, textX, 240, textWidth, 22, "400", t.text, "left")] : []),
  ];

  if ((spec.bullets ?? []).length > 0) {
    let y = (spec.body ? 380 : 240);
    for (const b of (spec.bullets ?? []).slice(0, 4)) {
      texts.push(makeText(`•   ${b}`, textX, y, textWidth, 22, "400", t.text, "left"));
      y += 60;
    }
  }

  return {
    shapes: [makeAccentBar(t.accent, textX, 80, 50, 4)],
    texts,
    images,
    background: t.bg,
  };
}

function renderImageFull(spec: SlideSpec, t: Theme): SlideJSON {
  // Full-bleed image as background; title overlay with a dark scrim.
  return {
    shapes: [
      // Scrim overlay for legibility — semi-transparent dark rect
      {
        id: nid("sh"),
        type: "rect",
        x: 0, y: SLIDE_H - 280, width: SLIDE_W, height: 280,
        fill: "#000000",
        stroke: "transparent",
        strokeWidth: 0,
        opacity: 0.55,
      },
      makeAccentBar(spec.accentColor, 100, SLIDE_H - 220, 60, 4),
    ],
    texts: [
      makeText(spec.title, 100, SLIDE_H - 180, 1080, 56, "700", "#ffffff", "left"),
      ...(spec.subtitle ? [makeText(spec.subtitle, 100, SLIDE_H - 90, 1080, 22, "400", "rgba(255,255,255,0.85)", "left")] : []),
    ],
    images: [],
    background: t.bg,
    backgroundImage: spec.imageDataUrl,
    backgroundImageWidth: spec.imageWidth,
    backgroundImageHeight: spec.imageHeight,
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1,
  };
}

function renderTwoColumn(spec: SlideSpec, t: Theme): SlideJSON {
  const colW = SLIDE_W / 2 - 120;
  const colYTitle = 200;
  const colYBody = 280;
  return {
    shapes: [
      makeAccentBar(t.accent, 100, 130, 60, 4),
      // vertical divider in muted color
      {
        id: nid("sh"),
        type: "rect",
        x: SLIDE_W / 2 - 1, y: 180,
        width: 2, height: SLIDE_H - 240,
        fill: t.muted,
        stroke: "transparent",
        strokeWidth: 0,
        opacity: 0.35,
      },
    ],
    texts: [
      makeText(spec.title, 100, 60, 1080, 40, "700", t.text, "left"),
      makeText(spec.twoColLeftTitle ?? "", 100, colYTitle, colW, 28, "700", t.accent, "left"),
      makeText(spec.twoColLeftBody ?? "", 100, colYBody, colW, 20, "400", t.text, "left"),
      makeText(spec.twoColRightTitle ?? "", SLIDE_W / 2 + 40, colYTitle, colW, 28, "700", t.accent, "left"),
      makeText(spec.twoColRightBody ?? "", SLIDE_W / 2 + 40, colYBody, colW, 20, "400", t.text, "left"),
    ],
    images: [],
    background: t.bg,
  };
}

function renderQuote(spec: SlideSpec, t: Theme): SlideJSON {
  return {
    shapes: [
      // Big opening quote mark as an accent shape (ellipse with text inside isn't ideal — use sized text)
    ],
    texts: [
      makeText("“", SLIDE_W / 2 - 200, 80, 400, 160, "700", t.accent, "center", "'Playfair Display', serif"),
      makeText(spec.title, 140, 240, SLIDE_W - 280, 40, "400", t.text, "center", "'Playfair Display', serif"),
      ...(spec.attribution ? [makeText(`— ${spec.attribution}`, 140, SLIDE_H - 160, SLIDE_W - 280, 22, "600", t.muted, "center")] : []),
    ],
    images: [],
    background: t.bg,
  };
}

// ── Public renderer ────────────────────────────────────────────────────────

export function renderSlide(spec: SlideSpec, baseTheme?: SlideshowTheme): SlideJSON {
  // Use the user-picked theme's accent if available, otherwise the AI-chosen one.
  const accent = baseTheme?.palette.accent || spec.accentColor || "#7c3aed";
  // The theme's natural palette already encodes its look — for Dark theme that
  // means a dark background and light text on "light" (default) slides. Just
  // pass the AI's scheme through; themeFor handles the variation for "dark"
  // (inverted contrast slide) and "accent" (accent bg) sprinkled in for emphasis.
  const t = themeFor(spec.colorScheme, accent, baseTheme);
  activeTheme = baseTheme;
  try {
    return renderForLayout(spec, t);
  } finally {
    activeTheme = undefined;
  }
}

function renderForLayout(spec: SlideSpec, t: Theme): SlideJSON {
  // If the AI sent a bullet/body slide with a fetched image, promote it to an
  // image-side layout so the slide doesn't look half-empty. Alternate side based
  // on title length parity so consecutive promoted slides don't all match.
  if (spec.imageDataUrl && (spec.layout === "title-bullets" || spec.layout === "title-body")) {
    const side: "left" | "right" = spec.title.length % 2 === 0 ? "right" : "left";
    return renderImageSide(spec, t, side);
  }
  switch (spec.layout) {
    case "title-cover": return renderTitleCover(spec, t);
    case "section-header": return renderSectionHeader(spec, t);
    case "title-bullets": return renderTitleBullets(spec, t);
    case "title-body": return renderTitleBody(spec, t);
    case "image-left": return renderImageSide(spec, t, "left");
    case "image-right": return renderImageSide(spec, t, "right");
    case "image-full": return renderImageFull(spec, t);
    case "two-column": return renderTwoColumn(spec, t);
    case "quote": return renderQuote(spec, t);
    default: return renderTitleBody(spec, t);
  }
}
