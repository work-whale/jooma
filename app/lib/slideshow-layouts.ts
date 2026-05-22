// Layout renderer — turns each AI-produced SlideSpec into a SlideJSON that the
// editor can open and edit. Each layout positions its text/shape/image elements
// against the 1280×720 slide canvas defined by SLIDE_W/SLIDE_H.

import type {
  SlideJSON,
  TextObject,
  ShapeObject,
  ImageObject,
  CalloutObject,
  BadgeObject,
  BlockquoteObject,
  ActivityObject,
} from "./presentations";
import type { SlideshowTheme } from "./slideshowThemes";

const SLIDE_W = 1280;
const SLIDE_H = 720;

export type SlideLayout =
  // Legacy layouts — kept for back-compat with decks already in the DB.
  | "title-cover"
  | "title-bullets"
  | "title-body"
  | "image-left"
  | "image-right"
  | "image-full"
  | "two-column"
  | "quote"
  | "section-header"
  | "big-stat"
  | "three-column"
  | "comparison-grid"
  | "timeline"
  // New competitor-style layouts. The AI emits these going forward; the
  // renderers below produce cream-paper-card slides with callouts, badges,
  // blockquotes, and activity primitives that match the competitor output.
  | "title-hero"
  | "paper-image-right"
  | "paper-two-images"
  | "paper-image-left"
  | "paper-image-right-badge"
  | "paper-banner-image-top"
  | "paper-quote"
  | "activity-ordering"
  | "activity-ordering-answer"
  | "activity-question"
  | "activity-question-answer";

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
  /** Set when the AI hasn't fetched the image yet — renderer puts a shimmer
   * placeholder in the image frame instead of skipping the image element. */
  imagePending?: boolean;
  attribution?: string;    // for quote layout
  twoColLeftTitle?: string;
  twoColLeftBody?: string;
  twoColRightTitle?: string;
  twoColRightBody?: string;
  // big-stat: one giant headline number + caption
  statValue?: string;      // e.g. "73%"
  statCaption?: string;    // e.g. "of UK pupils prefer visual aids"
  // three-column: three short titled blurbs
  col1Title?: string; col1Body?: string;
  col2Title?: string; col2Body?: string;
  col3Title?: string; col3Body?: string;
  // comparison-grid: 2x2 with quadrant labels
  quadrants?: { title: string; body: string }[];
  // timeline: chronological list of events
  timelineItems?: { date: string; title: string; body?: string }[];
  // ── New competitor-style fields ────────────────────────────────────────
  /** Italic sub-headline placed under the slide title — a question or a
   *  punchy declarative with a bold key term, e.g. "What keeps us from
   *  drifting away?". */
  subHook?: string;
  /** A "Key point" / "Remember" / "Fun fact" tinted card. Set all four fields
   *  together; leave empty to skip. `calloutBody` supports **bold** markers. */
  calloutVariant?: "key" | "remember" | "fun" | "";
  calloutLabel?: string;
  calloutBody?: string;
  /** Sub-genre pill (e.g. STAR DYNAMICS). Empty string = no badge. */
  badgeText?: string;
  /** Closing-slide italic blockquote. Empty string = no blockquote. */
  blockquoteText?: string;
  blockquoteAttribution?: string;
  /** Activity slide content. `activityKind` selects the renderer:
   *  - "order" + ordering layouts → 4 items the student must order.
   *    `activityItems` is the random presentation order; `activityCorrectOrder`
   *    is the indices into `activityItems` that put them in correct order.
   *  - "question" + question layouts → speech bubble + image + question. The
   *    answer slide carries the "you might have said" `activityItems`. */
  activityKind?: "order" | "question" | "";
  activityItems?: string[];
  activityCorrectOrder?: number[];
  activityImageQuery?: string;
  /** Image bytes for activity question slides. Populated server-side by the
   *  same image-fetch pipeline as `imageDataUrl`. */
  activityImageDataUrl?: string;
  activityImageWidth?: number;
  activityImageHeight?: number;
  /** Secondary image for `paper-two-images` layout (left cell uses imageQuery,
   *  right cell uses secondaryImageQuery). */
  secondaryImageQuery?: string;
  secondaryImageDataUrl?: string;
  secondaryImageWidth?: number;
  secondaryImageHeight?: number;
  /** Lead-in line above a bullet list, e.g. "Two forces are in constant
   *  battle:". Renders just above the bullets in body weight. */
  bulletsLeadIn?: string;
}

// ── Theme palette per color scheme ─────────────────────────────────────────
interface Theme {
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

function themeFor(_scheme: ColorScheme, accent: string, base?: SlideshowTheme): Theme {
  // Every slide uses the theme's natural palette — no per-slide bg variation.
  // The colorScheme parameter is kept on SlideSpec for backwards compatibility
  // with existing decks but is intentionally ignored here.
  if (base) {
    return {
      bg: base.palette.background,
      text: base.palette.text,
      muted: base.palette.muted,
      accent: base.palette.accent,
    };
  }
  // No theme provided — neutral defaults + the AI's accent.
  return { bg: "#ffffff", text: "#1a1a2e", muted: "#475569", accent };
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
      : spec.imagePending
      ? { backgroundImagePending: true }
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
  // When `imagePending` is set we still create the image element so the slide
  // reserves space and renders a shimmer overlay — the real src arrives later.
  const images: ImageObject[] = spec.imageDataUrl
    ? [{
        ...makeImage(spec.imageDataUrl, imageX, imgY, imgWidth, imgHeight, spec.imageWidth, spec.imageHeight),
        frame: "rounded",
        cornerRadius: 0,
      }]
    : spec.imagePending
    ? [{
        ...makeImage("", imageX, imgY, imgWidth, imgHeight),
        frame: "rounded",
        cornerRadius: 0,
        isPending: true,
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
    ...(spec.imageDataUrl ? {
      backgroundImage: spec.imageDataUrl,
      backgroundImageWidth: spec.imageWidth,
      backgroundImageHeight: spec.imageHeight,
      backgroundOffsetX: 0,
      backgroundOffsetY: 0,
      backgroundScale: 1,
    } : spec.imagePending ? { backgroundImagePending: true } : {}),
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

function renderBigStat(spec: SlideSpec, t: Theme): SlideJSON {
  // One huge headline figure (e.g. "73%") with a short caption underneath.
  // Falls back to spec.subtitle / spec.body when stat fields are missing.
  const value = spec.statValue || spec.subtitle || "—";
  const caption = spec.statCaption || spec.body || spec.title;
  return {
    shapes: [makeAccentBar(t.accent, SLIDE_W / 2 - 60, 130, 120, 6)],
    texts: [
      makeText(spec.title, 100, 60, SLIDE_W - 200, 28, "600", t.muted, "center"),
      makeText(value, 100, 220, SLIDE_W - 200, 200, "800", t.accent, "center"),
      makeText(caption, 200, 480, SLIDE_W - 400, 32, "400", t.text, "center"),
    ],
    images: [],
    background: t.bg,
  };
}

function renderThreeColumn(spec: SlideSpec, t: Theme): SlideJSON {
  const colW = (SLIDE_W - 240) / 3;
  const gap = 30;
  const colX = (i: number) => 100 + i * (colW + gap);
  const titles = [spec.col1Title, spec.col2Title, spec.col3Title];
  const bodies = [spec.col1Body, spec.col2Body, spec.col3Body];
  const shapes = titles
    .filter((_, i) => titles[i] || bodies[i])
    .map((_, i) => ({
      id: nid("sh"),
      type: "rect" as const,
      x: colX(i), y: 200, width: colW, height: SLIDE_H - 280,
      fill: "transparent",
      stroke: t.accent,
      strokeWidth: 3,
      opacity: 1,
      cornerRadius: 12,
    }));
  const texts = [
    makeAccentText(spec.title, 100, 60, SLIDE_W - 200, 44, "700", t.text, "left"),
    ...titles.flatMap((title, i) => {
      const out: TextObject[] = [];
      if (title) out.push(makeText(title, colX(i) + 20, 230, colW - 40, 26, "700", t.accent, "left"));
      const body = bodies[i];
      if (body) out.push(makeText(body, colX(i) + 20, 280, colW - 40, 18, "400", t.text, "left"));
      return out;
    }),
  ];
  return { shapes: [makeAccentBar(t.accent, 100, 130, 80, 4), ...shapes], texts, images: [], background: t.bg };
}
function makeAccentText(text: string, x: number, y: number, w: number, size: number, weight: string, color: string, align: "left" | "center" | "right") {
  return makeText(text, x, y, w, size, weight, color, align);
}

function renderComparisonGrid(spec: SlideSpec, t: Theme): SlideJSON {
  // 2x2 grid of titled blurbs. Falls back gracefully if fewer than 4 supplied.
  const items = (spec.quadrants && spec.quadrants.length > 0)
    ? spec.quadrants.slice(0, 4)
    : [
        { title: spec.twoColLeftTitle ?? "", body: spec.twoColLeftBody ?? "" },
        { title: spec.twoColRightTitle ?? "", body: spec.twoColRightBody ?? "" },
      ];
  const cellW = (SLIDE_W - 240) / 2;
  const cellH = (SLIDE_H - 280) / 2;
  const gap = 30;
  const startY = 180;
  const cellX = (i: number) => 100 + (i % 2) * (cellW + gap);
  const cellY = (i: number) => startY + Math.floor(i / 2) * (cellH + gap);
  const shapes = items.map((_, i) => ({
    id: nid("sh"),
    type: "rect" as const,
    x: cellX(i), y: cellY(i), width: cellW, height: cellH,
    fill: i % 3 === 0 ? t.accent : "transparent",
    stroke: t.accent,
    strokeWidth: 2,
    opacity: i % 3 === 0 ? 0.08 : 1,
    cornerRadius: 12,
  }));
  const texts = [
    makeText(spec.title, 100, 60, SLIDE_W - 200, 40, "700", t.text, "left"),
    ...items.flatMap((q, i) => {
      const out: TextObject[] = [];
      if (q.title) out.push(makeText(q.title, cellX(i) + 24, cellY(i) + 20, cellW - 48, 22, "700", t.accent, "left"));
      if (q.body) out.push(makeText(q.body, cellX(i) + 24, cellY(i) + 60, cellW - 48, 18, "400", t.text, "left"));
      return out;
    }),
  ];
  return { shapes: [makeAccentBar(t.accent, 100, 130, 80, 4), ...shapes], texts, images: [], background: t.bg };
}

function renderTimeline(spec: SlideSpec, t: Theme): SlideJSON {
  const items = (spec.timelineItems ?? []).slice(0, 5);
  const fallback = (spec.bullets ?? []).map((b) => ({ date: "", title: b, body: "" }));
  const events = items.length > 0 ? items : fallback;
  const n = Math.max(1, events.length);
  const usableW = SLIDE_W - 200;
  const step = usableW / Math.max(1, n - 1 || 1);
  const lineY = 380;
  const dotR = 14;

  const shapes: ShapeObject[] = [
    makeAccentBar(t.accent, 100, 130, 80, 4),
    // Horizontal line
    {
      id: nid("sh"), type: "rect",
      x: 100, y: lineY - 1, width: usableW, height: 2,
      fill: t.accent, stroke: "transparent", strokeWidth: 0, opacity: 0.5,
    },
    // Dots
    ...events.map((_, i) => ({
      id: nid("sh"), type: "ellipse" as const,
      x: 100 + (n === 1 ? usableW / 2 : i * step) - dotR,
      y: lineY - dotR,
      width: dotR * 2, height: dotR * 2,
      fill: t.accent, stroke: "transparent", strokeWidth: 0, opacity: 1,
    })),
  ];
  const texts = [
    makeText(spec.title, 100, 60, SLIDE_W - 200, 40, "700", t.text, "left"),
    ...events.flatMap((e, i) => {
      const cx = 100 + (n === 1 ? usableW / 2 : i * step);
      const colW = Math.min(220, n > 1 ? step - 20 : 320);
      const out: TextObject[] = [];
      if (e.date) out.push(makeText(e.date, cx - colW / 2, lineY - 90, colW, 18, "700", t.accent, "center"));
      out.push(makeText(e.title, cx - colW / 2, lineY - 60, colW, 18, "700", t.text, "center"));
      if (e.body) out.push(makeText(e.body, cx - colW / 2, lineY + 30, colW, 14, "400", t.muted, "center"));
      return out;
    }),
  ];
  return { shapes, texts, images: [], background: t.bg };
}

// ── Server-safe text measurement ─────────────────────────────────────────
// Layouts need to stack elements below their neighbours dynamically (e.g.
// subhook below the wrapped title). The editor canvas has a canvas-based
// `measureTextLines` in Editor.tsx, but that's client-side only and not
// importable here. This is a cheap char-count estimator — good enough for
// layout positioning, where being off by half a line just shifts content by
// ~13 px and still looks fine.
function estimateTextLines(text: string | undefined, widthPx: number, fontSizePx: number): number {
  if (!text) return 0;
  // Empirical average glyph width across body/heading fonts ≈ 0.55 × fontSize.
  const charWidth = fontSizePx * 0.55;
  const charsPerLine = Math.max(1, Math.floor(widthPx / charWidth));
  let total = 0;
  for (const p of text.split("\n")) {
    if (!p) { total += 1; continue; }
    total += Math.max(1, Math.ceil(p.length / charsPerLine));
  }
  return total;
}

/** Vertical pixels a text block of this content/width/fontSize occupies. */
function textHeight(
  text: string | undefined,
  widthPx: number,
  fontSizePx: number,
  lineHeight = 1.2,
): number {
  return estimateTextLines(text, widthPx, fontSizePx) * fontSizePx * lineHeight;
}

// ── Helpers for the new competitor-style primitives ──────────────────────

function makeCallout(
  variant: CalloutObject["variant"],
  label: string,
  body: string,
  x: number, y: number, width: number,
): CalloutObject {
  return { id: nid("co"), x, y, width, variant, label, body };
}

function makeBadge(text: string, x: number, y: number): BadgeObject {
  return { id: nid("bd"), x, y, text };
}

function makeBlockquote(
  text: string, attribution: string,
  x: number, y: number, width: number,
): BlockquoteObject {
  return { id: nid("bq"), x, y, width, text, attribution: attribution || undefined };
}

function makeActivity(
  kind: ActivityObject["kind"],
  answerMode: boolean,
  items: string[],
  x: number, y: number, width: number, height: number,
  questionText?: string,
  imageSrc?: string,
  imageNW?: number, imageNH?: number,
  answerItems?: string[],
): ActivityObject {
  return {
    id: nid("ac"),
    x, y, width, height,
    kind,
    items,
    questionText,
    image: imageSrc ? { src: imageSrc, naturalWidth: imageNW, naturalHeight: imageNH } : undefined,
    answerMode,
    answerItems,
  };
}

/** Cream paper card filling the slide minus a 40px margin. Themes provide
 *  `paperBg` and `paperShadow`; default themes (no paperBg) fall back to a
 *  faint accent overlay which still gives a visible card edge.
 *
 *  `z: -1` is critical — the editor's stacking helper (Editor.tsx
 *  `effective()`) assigns shapes a base z-index of 1000+idx when their `z`
 *  is undefined, which puts the paper card ABOVE images (base 0+idx) and
 *  hides every image on a paper-* layout. Negative explicit z forces it
 *  below the image layer so the photos show through. */
function makePaperBackdrop(theme: SlideshowTheme | undefined): ShapeObject {
  const bg = theme?.palette.paperBg ?? "#ffffff";
  return {
    id: nid("paper"),
    type: "rect",
    x: 20, y: 20, width: SLIDE_W - 40, height: SLIDE_H - 40,
    fill: bg,
    stroke: "transparent",
    strokeWidth: 0,
    opacity: 1,
    cornerRadius: 24,
    z: -1,
  };
}

/** Picks a default callout label per variant if the AI didn't supply one. */
function defaultCalloutLabel(variant: CalloutObject["variant"]): string {
  if (variant === "remember") return "Remember";
  if (variant === "fun") return "Fun fact";
  return "Key point";
}

function calloutVariantColors(variant: CalloutObject["variant"], theme: SlideshowTheme | undefined) {
  const p = theme?.palette;
  switch (variant) {
    case "remember":
      return { bg: p?.calloutBgRemember ?? "#e2eef9", ink: p?.calloutInkRemember ?? "#1a1a1a" };
    case "fun":
      return { bg: p?.calloutBgFun ?? "#ece1f3", ink: p?.calloutInkFun ?? "#1a1a1a" };
    case "key":
    default:
      return { bg: p?.calloutBgKey ?? "#fcecc7", ink: p?.calloutInkKey ?? "#1a1a1a" };
  }
}
function calloutVariantEmoji(variant: CalloutObject["variant"]): string {
  if (variant === "remember") return "🧠";
  if (variant === "fun") return "🦉";
  return "🔑";
}

/** Splits a callout into its constituent design parts (rounded background
 *  Shape + emoji+label TextObject + body TextObject) so the teacher can
 *  drag/recolour/edit each independently. Returns null when the spec
 *  doesn't ask for a callout. The y-coordinate is the TOP of the rect. */
function splitCalloutFromSpec(
  spec: SlideSpec,
  x: number, y: number, width: number,
  bodyFontSize: number = 18,
): { shapes: ShapeObject[]; texts: TextObject[]; height: number } | null {
  const v = spec.calloutVariant;
  if (!v || (v !== "key" && v !== "remember" && v !== "fun")) return null;
  const body = spec.calloutBody?.trim();
  if (!body) return null;
  const label = spec.calloutLabel?.trim() || defaultCalloutLabel(v);
  const colors = calloutVariantColors(v, activeTheme);
  const emoji = calloutVariantEmoji(v);

  // Padding around the inner content.
  const padding = 18;
  const emojiCol = 36;        // width reserved for the emoji on the left
  const innerW = width - padding * 2;
  const bodyTextW = innerW - emojiCol - 8;

  const labelFontSize = 20;
  const labelLH = labelFontSize * 1.2;
  const bodyLH = bodyFontSize * 1.2;
  const bodyTextH = textHeight(body, bodyTextW, bodyFontSize);
  // Total card height: padding + label row + small gap + body + padding.
  const height = padding + labelLH + 4 + bodyTextH + padding;

  return {
    shapes: [{
      id: nid("cobg"),
      type: "rect",
      x, y, width, height,
      fill: colors.bg,
      stroke: "transparent",
      strokeWidth: 0,
      opacity: 1,
      cornerRadius: 16,
    }],
    texts: [
      // Emoji on its own — kept separate so the user can swap it for a
      // different glyph without touching the label text.
      makeText(emoji, x + padding, y + padding, emojiCol, 24, "400", colors.ink, "left"),
      // Bold label next to the emoji.
      makeText(label, x + padding + emojiCol + 8, y + padding + 2, innerW - emojiCol - 8, labelFontSize, "700", colors.ink, "left"),
      // Body wraps below — kept aligned with the label column for clean reading.
      makeText(body, x + padding + emojiCol + 8, y + padding + labelLH + 4, bodyTextW, bodyFontSize, "400", colors.ink, "left"),
    ],
    height,
  };
  // bodyLH retained for future tuning of the body line-height.
  void bodyLH;
}

/** Builds an image object for a positioned photo on the new layouts. Mirrors
 *  the imagePending shimmer pattern from renderImageSide. */
function paperImage(
  spec: SlideSpec,
  x: number, y: number, width: number, height: number,
): ImageObject[] {
  if (spec.imageDataUrl) {
    return [{
      ...makeImage(spec.imageDataUrl, x, y, width, height, spec.imageWidth, spec.imageHeight),
      frame: "rounded",
      cornerRadius: 16,
    }];
  }
  if (spec.imagePending) {
    return [{
      ...makeImage("", x, y, width, height),
      frame: "rounded",
      cornerRadius: 16,
      isPending: true,
    }];
  }
  return [];
}

function paperSecondaryImage(
  spec: SlideSpec,
  x: number, y: number, width: number, height: number,
): ImageObject[] {
  if (spec.secondaryImageDataUrl) {
    return [{
      ...makeImage(spec.secondaryImageDataUrl, x, y, width, height, spec.secondaryImageWidth, spec.secondaryImageHeight),
      frame: "rounded",
      cornerRadius: 16,
    }];
  }
  return [];
}

// ── New competitor-style layout renderers ───────────────────────────────

// ── Layout constants for dynamic stacking ──────────────────────────────
// `GAP_*` values are the visual spacing between consecutive text elements.
// They're chosen to look natural at our standard font sizes (22pt body,
// 44pt heading) — tweak with care, they affect every paper layout.
const GAP_TITLE_TO_HOOK = 18;
const GAP_HOOK_TO_BODY  = 14;
const GAP_BODY_TO_REST  = 24;
const GAP_BULLET_LINE   = 6;   // extra gap on top of one line's height

function renderTitleHero(spec: SlideSpec, t: Theme): SlideJSON {
  // Image-square-left + title/subtitle-right, on the cream paper card. Not
  // full-bleed; matches the competitor's slide 1 (Solar System).
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const titleSize = 64;
  const titleW = 540;
  const titleH = textHeight(spec.title, titleW, titleSize);
  // Vertically centre the title block on the slide so 1-line and 3-line
  // titles both look balanced. The card is 680px tall (offset 20) — centre
  // is y ≈ 360.
  const subtitleH = textHeight(spec.subtitle ?? "", titleW, 24);
  const blockH = titleH + (spec.subtitle ? GAP_TITLE_TO_HOOK + subtitleH : 0);
  const titleY = Math.max(80, Math.round((SLIDE_H - blockH) / 2));
  const subtitleY = titleY + titleH + GAP_TITLE_TO_HOOK;
  return {
    shapes: [makePaperBackdrop(activeTheme)],
    texts: [
      makeText(spec.title, 680, titleY, titleW, titleSize, "800", headingColor, "left"),
      ...(spec.subtitle ? [makeText(spec.subtitle, 680, subtitleY, titleW, 24, "400", t.muted, "left")] : []),
    ],
    images: paperImage(spec, 80, 80, 540, 540),
    background: t.bg,
  };
}

function renderPaperImageRight(spec: SlideSpec, t: Theme): SlideJSON {
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const colW = 560;
  const titleY = 80;
  const titleH = textHeight(spec.title, colW, 44);
  const subHookY = titleY + titleH + GAP_TITLE_TO_HOOK;
  const subHookH = spec.subHook ? textHeight(spec.subHook, colW, 22) : 0;
  const bodyY = (spec.subHook ? subHookY + subHookH + GAP_HOOK_TO_BODY : titleY + titleH + GAP_TITLE_TO_HOOK);
  const bodyH = spec.body ? textHeight(spec.body, colW, 22) : 0;
  // Callout sits directly below the body. No upper clamp: if the body is
  // long, the callout drops further down — far better than overlapping the
  // body text. Prompt-level guard keeps body short enough to leave room.
  const calloutY = bodyY + bodyH + GAP_BODY_TO_REST;
  const calloutParts = splitCalloutFromSpec(spec, 80, calloutY, colW);
  return {
    shapes: [makePaperBackdrop(activeTheme), ...(calloutParts?.shapes ?? [])],
    texts: [
      makeText(spec.title, 80, titleY, colW, 44, "800", headingColor, "left"),
      ...(spec.subHook ? [makeText(spec.subHook, 80, subHookY, colW, 22, "700", t.text, "left")] : []),
      ...(spec.body ? [makeText(spec.body, 80, bodyY, colW, 22, "400", t.text, "left")] : []),
      ...(calloutParts?.texts ?? []),
    ],
    images: paperImage(spec, 680, 80, 540, 560),
    background: t.bg,
  };
}

function renderPaperImageLeft(spec: SlideSpec, t: Theme): SlideJSON {
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const colX = 660;
  const colW = 540;
  const titleY = 80;
  const titleH = textHeight(spec.title, colW, 44);
  const subHookY = titleY + titleH + GAP_TITLE_TO_HOOK;
  const subHookH = spec.subHook ? textHeight(spec.subHook, colW, 22) : 0;
  const bodyY = spec.subHook ? subHookY + subHookH + GAP_HOOK_TO_BODY : titleY + titleH + GAP_TITLE_TO_HOOK;
  const bodyH = spec.body ? textHeight(spec.body, colW, 22) : 0;
  const bullets = (spec.bullets ?? []).slice(0, 4);
  const bulletsStartY = bodyY + bodyH + (spec.body ? GAP_BODY_TO_REST : 0);
  const bulletsEndY = bulletsStartY + bullets.length * 50;
  // Callout falls directly under bullets — let it slide off the card if the
  // body+bullets push it too far; better than overlap.
  const calloutY = bulletsEndY + 16;
  const calloutParts = splitCalloutFromSpec(spec, colX, calloutY, colW);
  return {
    shapes: [makePaperBackdrop(activeTheme), ...(calloutParts?.shapes ?? [])],
    texts: [
      makeText(spec.title, colX, titleY, colW, 44, "800", headingColor, "left"),
      ...(spec.subHook ? [makeText(spec.subHook, colX, subHookY, colW, 22, "700", t.text, "left")] : []),
      ...(spec.body ? [makeText(spec.body, colX, bodyY, colW, 22, "400", t.text, "left")] : []),
      ...bullets.map((b, i) =>
        makeText(`•   ${b}`, colX, bulletsStartY + i * 50, colW, 20, "400", t.text, "left"),
      ),
      ...(calloutParts?.texts ?? []),
    ],
    images: paperImage(spec, 60, 80, 560, 560),
    background: t.bg,
  };
}

function renderPaperTwoImages(spec: SlideSpec, t: Theme): SlideJSON {
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const fullW = SLIDE_W - 160;
  const leftX = 80;
  const rightX = 680;
  const cellW = 520;
  // Title + optional intro paragraph at top, two cells (image + label) below.
  const titleY = 80;
  const titleH = textHeight(spec.title, fullW, 40);
  const introY = titleY + titleH + GAP_TITLE_TO_HOOK;
  const introH = spec.body ? textHeight(spec.body, fullW, 22) : 0;
  const imgY = introY + introH + (spec.body ? GAP_BODY_TO_REST : 0);
  const imgH = Math.max(220, Math.min(300, SLIDE_H - imgY - 130)); // reserve ~130px for the cell-label paragraph
  const labelY = imgY + imgH + 18;
  return {
    shapes: [makePaperBackdrop(activeTheme)],
    texts: [
      makeText(spec.title, leftX, titleY, fullW, 40, "800", headingColor, "left"),
      ...(spec.body ? [makeText(spec.body, leftX, introY, fullW, 22, "400", t.text, "left")] : []),
      ...(spec.twoColLeftBody  ? [makeText(spec.twoColLeftBody,  leftX,  labelY, cellW, 20, "400", t.text, "left")] : []),
      ...(spec.twoColRightBody ? [makeText(spec.twoColRightBody, rightX, labelY, cellW, 20, "400", t.text, "left")] : []),
    ],
    images: [
      ...paperImage(spec, leftX, imgY, cellW, imgH),
      ...paperSecondaryImage(spec, rightX, imgY, cellW, imgH),
    ],
    background: t.bg,
  };
}

function renderPaperImageRightBadge(spec: SlideSpec, t: Theme): SlideJSON {
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const colW = 560;
  const badgeText = spec.badgeText?.trim();
  const bullets = (spec.bullets ?? []).slice(0, 4);
  const titleY = 80;
  const titleH = textHeight(spec.title, colW, 44);
  // Badge sits right under the title (uppercase pill).
  const badgeY = titleY + titleH + GAP_TITLE_TO_HOOK;
  const badgeH = badgeText ? 36 : 0;
  const bodyY = badgeY + badgeH + (badgeText ? 18 : 0);
  const bodyH = spec.body ? textHeight(spec.body, colW, 22) : 0;
  const leadInY = bodyY + bodyH + GAP_BODY_TO_REST;
  const leadInH = (spec.bulletsLeadIn && bullets.length > 0) ? textHeight(spec.bulletsLeadIn, colW, 22) : 0;
  const bulletsStartY = leadInY + leadInH + (spec.bulletsLeadIn && bullets.length > 0 ? 12 : 0);
  return {
    shapes: [makePaperBackdrop(activeTheme)],
    texts: [
      makeText(spec.title, 80, titleY, colW, 44, "800", headingColor, "left"),
      ...(spec.body ? [makeText(spec.body, 80, bodyY, colW, 22, "400", t.text, "left")] : []),
      ...(spec.bulletsLeadIn && bullets.length > 0
        ? [makeText(spec.bulletsLeadIn, 80, leadInY, colW, 22, "400", t.text, "left")]
        : []),
      ...bullets.map((b, i) =>
        makeText(`•   ${b}`, 80, bulletsStartY + i * 44, colW, 22, "400", t.text, "left"),
      ),
    ],
    images: paperImage(spec, 680, 80, 540, 560),
    background: t.bg,
    ...(badgeText ? { badges: [makeBadge(badgeText, 80, badgeY)] } : {}),
  };
}

function renderPaperBannerImageTop(spec: SlideSpec, t: Theme): SlideJSON {
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const fullW = SLIDE_W - 160;
  const bannerY = 60;
  const bannerH = 240;
  const titleY = bannerY + bannerH + 30;
  const titleH = textHeight(spec.title, fullW, 40);
  const bodyY = titleY + titleH + GAP_TITLE_TO_HOOK;
  const bodyH = spec.body ? textHeight(spec.body, fullW, 22) : 0;
  const bullets = (spec.bullets ?? []).slice(0, 4);
  const bulletsStartY = bodyY + bodyH + (spec.body ? GAP_BODY_TO_REST : 0);
  const numberedListText = bullets.length > 0 ? bullets.join("\n") : "";
  return {
    shapes: [makePaperBackdrop(activeTheme)],
    texts: [
      makeText(spec.title, 80, titleY, fullW, 40, "800", headingColor, "left"),
      ...(spec.body ? [makeText(spec.body, 80, bodyY, fullW, 22, "400", t.text, "left")] : []),
      ...(numberedListText
        ? [{
            ...makeText(numberedListText, 80, bulletsStartY, fullW, 22, "400", t.text, "left"),
            listType: "number" as const,
          }]
        : []),
    ],
    images: paperImage(spec, 60, bannerY, SLIDE_W - 120, bannerH),
    background: t.bg,
  };
}

function renderPaperQuote(spec: SlideSpec, t: Theme): SlideJSON {
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const colW = 560;
  const titleY = 80;
  const titleH = textHeight(spec.title, colW, 44);
  const subHookY = titleY + titleH + GAP_TITLE_TO_HOOK;
  const subHookH = spec.subHook ? textHeight(spec.subHook, colW, 22) : 0;
  const bodyY = spec.subHook ? subHookY + subHookH + GAP_HOOK_TO_BODY : titleY + titleH + GAP_TITLE_TO_HOOK;
  const bodyH = spec.body ? textHeight(spec.body, colW, 22) : 0;
  const quoteText = spec.blockquoteText?.trim();
  const quoteAttrib = spec.blockquoteAttribution?.trim() ?? "";
  const quoteY = Math.min(600, Math.max(460, bodyY + bodyH + GAP_BODY_TO_REST));
  const quotes: BlockquoteObject[] = quoteText
    ? [makeBlockquote(quoteText, quoteAttrib, 80, quoteY, colW)]
    : [];
  return {
    shapes: [makePaperBackdrop(activeTheme)],
    texts: [
      makeText(spec.title, 80, titleY, colW, 44, "800", headingColor, "left"),
      ...(spec.subHook ? [makeText(spec.subHook, 80, subHookY, colW, 22, "700", t.text, "left")] : []),
      ...(spec.body ? [makeText(spec.body, 80, bodyY, colW, 22, "400", t.text, "left")] : []),
    ],
    images: paperImage(spec, 680, 80, 540, 560),
    background: t.bg,
    ...(quotes.length > 0 ? { blockquotes: quotes } : {}),
  };
}

function renderActivityOrdering(spec: SlideSpec, t: Theme, answerMode: boolean): SlideJSON {
  // Emit each card as its OWN ShapeObject + TextObject pair so the teacher
  // can independently move, recolour, or rephrase any card after generation.
  // The legacy composite ActivityObject locked the four cards together.
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const cardBg = activeTheme?.palette.activityCardBg ?? "#e7eef7";
  const cardInk = activeTheme?.palette.activityCardInk ?? t.text;
  const checkBg = activeTheme?.palette.checkBadgeBg ?? "#2e9d54";
  const checkInk = activeTheme?.palette.checkBadgeInk ?? "#ffffff";

  const rawItems = spec.activityItems ?? [];
  // On the answer slide, sort the items into the correct order using the
  // index list the AI provided. Question slide keeps the random presentation
  // order from `activityItems`.
  const items = answerMode
    ? (spec.activityCorrectOrder ?? rawItems.map((_, i) => i))
        .map((i) => rawItems[i])
        .filter((v): v is string => typeof v === "string")
    : rawItems;

  // Layout: 4 cards stacked vertically. Reserve a 64px column on the right
  // for the "1." / "2." / "3." / "4." numbers on the answer slide.
  const cardsLeft = 80;
  const numberCol = answerMode ? 80 : 0;
  const cardsWidth = SLIDE_W - 160 - numberCol;
  const cardsTop = 200;
  const cardsBottom = SLIDE_H - 60;
  const gap = 14;
  const cardCount = Math.max(1, items.length || 4);
  const cardHeight = Math.max(50, (cardsBottom - cardsTop - gap * (cardCount - 1)) / cardCount);

  const shapes: ShapeObject[] = [makePaperBackdrop(activeTheme)];
  const texts: TextObject[] = [
    makeText(spec.title, 80, 80, 800, 44, "800", headingColor, "left"),
    ...(!answerMode
      ? [makeText("Answers on the next slide…", 880, 92, 320, 20, "600", t.muted, "right")]
      : []),
    ...(spec.body ? [makeText(spec.body, 80, 150, SLIDE_W - 160, 22, "400", t.text, "left")] : []),
  ];

  for (let i = 0; i < items.length; i++) {
    const y = cardsTop + i * (cardHeight + gap);
    // Card background — light-blue rounded rect with a hairline border.
    shapes.push({
      id: nid("card"),
      type: "rect",
      x: cardsLeft, y, width: cardsWidth, height: cardHeight,
      fill: cardBg,
      stroke: "rgba(0,0,0,0.18)",
      strokeWidth: 1.5,
      opacity: 1,
      cornerRadius: 12,
    });
    // Card label — bold, centred. The text is its own selectable element so
    // the teacher can edit "Mars" → "Phobos" or whatever they like.
    const labelW = cardsWidth - 48;
    const labelFont = 22;
    const labelH = labelFont * 1.2;
    texts.push(makeText(
      items[i],
      cardsLeft + 24,
      y + (cardHeight - labelH) / 2,
      labelW,
      labelFont,
      "700",
      cardInk,
      "center",
    ));
    // Answer slide: "1.", "2.", ... in the right-hand column next to each card.
    if (answerMode) {
      const numberFont = 28;
      const numberH = numberFont * 1.2;
      texts.push(makeText(
        `${i + 1}.`,
        cardsLeft + cardsWidth + 16,
        y + (cardHeight - numberH) / 2,
        numberCol - 16,
        numberFont,
        "800",
        t.text,
        "center",
      ));
    }
  }

  // Answer slide: small green "check" badge in the top-right of the cards
  // region — a coloured rect with a tick character. Two independent elements
  // (shape + text) so each is still draggable/editable.
  if (answerMode && items.length > 0) {
    const badgeW = 44;
    const badgeH = 44;
    const badgeX = cardsLeft + cardsWidth + numberCol - badgeW - 4;
    const badgeY = cardsTop - badgeH + 8;
    shapes.push({
      id: nid("check"),
      type: "rect",
      x: badgeX, y: badgeY, width: badgeW, height: badgeH,
      fill: checkBg,
      stroke: "transparent",
      strokeWidth: 0,
      opacity: 1,
      cornerRadius: 10,
      shadow: true,
    });
    texts.push(makeText(
      "✓",
      badgeX,
      badgeY + (badgeH - 28) / 2,
      badgeW,
      28,
      "900",
      checkInk,
      "center",
    ));
  }

  return {
    shapes,
    texts,
    images: [],
    background: t.bg,
  };
}

function renderActivityQuestion(spec: SlideSpec, t: Theme, answerMode: boolean): SlideJSON {
  // Emit the speech bubble, photo, and question text as THREE SEPARATE
  // editor elements (Shape + Image + Text) so the teacher can drag/resize
  // each independently after generation. The old composite ActivityObject
  // locked them together.
  const headingColor = activeTheme?.palette.headingColor ?? t.accent;
  const stroke = activeTheme?.palette.speechBubbleStroke ?? "#1a1a1a";
  const imageSrc = spec.activityImageDataUrl ?? spec.imageDataUrl;
  const imageNW  = spec.activityImageWidth   ?? spec.imageWidth;
  const imageNH  = spec.activityImageHeight  ?? spec.imageHeight;

  // Layout zones
  const titleY = 80;
  const titleH = textHeight(spec.title, SLIDE_W - 160, 40);
  const bubbleX = 60;
  const bubbleY = titleY + titleH + 24;
  const bubbleW = SLIDE_W - 120;
  const bubbleH = SLIDE_H - bubbleY - 60;

  // The built-in "speech" ShapeType is a rounded rect with a tail at the
  // bottom-left. Its body occupies the top 78% of its bounding box (the
  // remaining 22% is the tail) — keep this in mind when sizing inner content.
  const bubbleBodyH = bubbleH * 0.78;
  const innerPad = 60;
  const innerX = bubbleX + innerPad;
  const innerW = bubbleW - innerPad * 2;
  const innerY = bubbleY + innerPad;
  const innerH = bubbleBodyH - innerPad * 2;

  const bubbleShape: ShapeObject = {
    id: nid("bubble"),
    type: "speech",
    x: bubbleX, y: bubbleY, width: bubbleW, height: bubbleH,
    fill: "#ffffff",
    stroke,
    strokeWidth: 3,
    opacity: 1,
  };

  const shapes: ShapeObject[] = [makePaperBackdrop(activeTheme), bubbleShape];
  const texts: TextObject[] = [
    makeText(spec.title, 80, titleY, SLIDE_W - 160, 40, "800", headingColor, "left"),
  ];
  const images: ImageObject[] = [];

  if (answerMode) {
    // "You might have said…" + bullet list of plausible responses, centred.
    const items = spec.activityItems ?? [];
    const headingY = innerY + 16;
    const bulletsStartY = headingY + 44;
    texts.push(
      makeText("You might have said…", innerX, headingY, innerW, 24, "800", t.text, "center"),
      ...items.map((item, i) =>
        makeText(item, innerX, bulletsStartY + i * 32, innerW, 20, "400", t.text, "center"),
      ),
    );
  } else {
    // Image on the LEFT inside the bubble + question text on the RIGHT.
    const imageSize = Math.min(260, innerH);
    const imageY = innerY + (innerH - imageSize) / 2;
    const textX = innerX + imageSize + 36;
    const textW = innerW - (imageSize + 36);
    const questionText = spec.body || spec.subHook || "Add a question…";
    const qH = textHeight(questionText, textW, 22);
    const questionY = innerY + Math.max(0, (innerH - qH) / 2);

    if (imageSrc) {
      images.push({
        id: nid("im"),
        x: innerX, y: imageY, width: imageSize, height: imageSize,
        src: imageSrc, opacity: 1,
        naturalWidth: imageNW, naturalHeight: imageNH,
        frame: "rounded", cornerRadius: 12,
      });
    }
    texts.push(makeText(questionText, textX, questionY, textW, 22, "400", t.text, "left"));
  }

  return {
    shapes,
    texts,
    images,
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
    const slide = renderForLayout(spec, t);
    return applyThemeDecorations(slide, spec, baseTheme);
  } finally {
    activeTheme = undefined;
  }
}

// Subtle bubble decorations that sit in the corners of every slide for a
// given theme. Currently only the Light theme uses them — its signature look.
// Other themes return [] (clean / minimal). Decorations are prepended to the
// slide's shapes array so they paint BEHIND any content the layout produced.
function applyThemeDecorations(
  slide: SlideJSON,
  spec: SlideSpec,
  theme: SlideshowTheme | undefined,
): SlideJSON {
  if (!theme) return slide;
  const decorations = getThemeDecorations(theme, spec, slide);
  if (decorations.length === 0) return slide;
  return { ...slide, shapes: [...decorations, ...slide.shapes] };
}

function getThemeDecorations(
  theme: SlideshowTheme,
  spec: SlideSpec,
  slide: SlideJSON,
): ShapeObject[] {
  // Skip if the slide has a full-bleed bg image — decorations would be
  // invisible behind it AND clash with the dark scrim.
  if (slide.backgroundImage) return [];
  // The title-cover renderer already places its own larger bubble cluster.
  // Skip to avoid stacking two sets of shapes.
  if (spec.layout === "title-cover") return [];
  switch (theme.id) {
    case "light":
      return [
        // Top-left small bubble — sits in the corner, barely visible.
        {
          id: nid("dec"), type: "ellipse",
          x: -80, y: -80, width: 200, height: 200,
          fill: theme.palette.accent,
          stroke: "transparent", strokeWidth: 0,
          opacity: 0.08,
        },
        // Bottom-right larger bubble — anchors the slide visually without
        // clashing with content.
        {
          id: nid("dec"), type: "ellipse",
          x: SLIDE_W - 220, y: SLIDE_H - 220, width: 340, height: 340,
          fill: theme.palette.accent,
          stroke: "transparent", strokeWidth: 0,
          opacity: 0.07,
        },
      ];
    default:
      return [];
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
    case "big-stat": return renderBigStat(spec, t);
    case "three-column": return renderThreeColumn(spec, t);
    case "comparison-grid": return renderComparisonGrid(spec, t);
    case "timeline": return renderTimeline(spec, t);
    // ── New competitor-style layouts ────────────────────────────────────
    case "title-hero": return renderTitleHero(spec, t);
    case "paper-image-right": return renderPaperImageRight(spec, t);
    case "paper-image-left": return renderPaperImageLeft(spec, t);
    case "paper-two-images": return renderPaperTwoImages(spec, t);
    case "paper-image-right-badge": return renderPaperImageRightBadge(spec, t);
    case "paper-banner-image-top": return renderPaperBannerImageTop(spec, t);
    case "paper-quote": return renderPaperQuote(spec, t);
    case "activity-ordering": return renderActivityOrdering(spec, t, false);
    case "activity-ordering-answer": return renderActivityOrdering(spec, t, true);
    case "activity-question": return renderActivityQuestion(spec, t, false);
    case "activity-question-answer": return renderActivityQuestion(spec, t, true);
    default: return renderTitleBody(spec, t);
  }
}

// ── Re-theme an existing slide ───────────────────────────────────────────
// Given a saved SlideJSON that carries a `skeleton` (set at generation time),
// rebuild it under a different theme. The existing image src is preserved so
// we don't have to re-fetch from Pixabay / regenerate AI images. Slides
// without a skeleton (audio/video/user-created) are returned untouched so
// theme switching doesn't blow them away.
export function rerenderSlideWithTheme(
  slide: SlideJSON,
  theme: SlideshowTheme,
): SlideJSON {
  if (!slide.skeleton) return slide;
  // The slide's photo can live in one of two places:
  //   - slide.backgroundImage — title-cover and image-full layouts use this
  //     as a full-bleed slide background.
  //   - slide.images[0]       — image-left / image-right / bullets-with-image
  //     layouts place it as a positioned ImageObject.
  // Check both so neither kind of photo is lost during a theme switch.
  const existingImage = slide.images?.[0];
  const existingImageSrc = slide.backgroundImage || existingImage?.src;
  const existingW = slide.backgroundImageWidth ?? existingImage?.naturalWidth;
  const existingH = slide.backgroundImageHeight ?? existingImage?.naturalHeight;
  // Activity question slides keep their image inside the ActivityObject. Pluck
  // it out so a re-render doesn't drop it.
  const existingActivity = slide.activities?.[0];
  const existingActivityImage = existingActivity?.image;
  // Secondary image for paper-two-images lives at slide.images[1] in the new
  // renderers — preserve so a re-theme keeps both photos.
  const existingSecondaryImage = slide.images?.[1];
  const spec: SlideSpec = {
    ...(slide.skeleton as SlideSpec),
    accentColor: theme.palette.accent,
    imageDataUrl: existingImageSrc || undefined,
    imageWidth: existingW,
    imageHeight: existingH,
    imagePending: false,
    activityImageDataUrl: existingActivityImage?.src || undefined,
    activityImageWidth: existingActivityImage?.naturalWidth,
    activityImageHeight: existingActivityImage?.naturalHeight,
    secondaryImageDataUrl: existingSecondaryImage?.src || undefined,
    secondaryImageWidth: existingSecondaryImage?.naturalWidth,
    secondaryImageHeight: existingSecondaryImage?.naturalHeight,
  };
  const rebuilt = renderSlide(spec, theme);
  // Preserve audios/videos and the deck-level themeId (the caller will update
  // it after the rerender); skeleton is re-attached so future re-themes work.
  rebuilt.audios = slide.audios;
  rebuilt.videos = slide.videos;
  rebuilt.skeleton = slide.skeleton;
  if (slide.themeId !== undefined) rebuilt.themeId = slide.themeId;
  return rebuilt;
}
