// ── How a generated deck is assembled from the slideshow stream ──────────────
//
// /api/generate-slideshow (and /api/try/slideshow, which runs the same
// pipeline for signed out visitors) streams the deck as server sent events:
// a content slide at a time, images later, and the audio and video slides built
// here from their payloads. This module is the one place those events turn
// into slides.
//
// It used to live inline in Editor.tsx. It moved out when the guest preview on
// /create needed to build the very same deck: a guest's deck is claimed into
// their account later and opened in the editor, so any difference in how the
// two assembled it would show up as a deck that changed on sign in.
//
// Every function returns a new array and never mutates its input, so callers
// can use them directly inside a React state updater.
import type {
  AudioObject,
  ShapeObject,
  SlideJSON,
  TextObject,
  VideoObject,
} from "@/app/lib/presentations";
import { SLIDE_W, SLIDE_H } from "@/app/components/editor/constants";
import { getTheme, DEFAULT_THEME_ID, getThemeArt, DEFAULT_ART_STYLE, type ArtStyleId } from "@/app/lib/slideshowThemes";

export interface DeckSlide extends SlideJSON {
  id: string;
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Canvas-based text measurement used to estimate how many wrapped lines a
// TextObject spans at a given width. Greedy word-wrap matches what the
// browser does for CSS `word-wrap: break-word; white-space: pre-wrap`.
// Returns 1 outside a browser, which only affects the video slide layout.
let _measureCanvas: HTMLCanvasElement | null = null;
export function measureTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: string,
  fontStyle: "normal" | "italic",
  fontFamily: string,
): number {
  if (typeof document === "undefined") return 1;
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  if (!ctx) return 1;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  const paragraphs = text.split("\n");
  let total = 0;
  for (const p of paragraphs) {
    if (!p) { total += 1; continue; }
    // Greedy line break: keep packing words until the next would overflow.
    const words = p.split(/(\s+)/); // keep whitespace tokens
    let line = "";
    let lineCount = 0;
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        lineCount += 1;
        line = w.trimStart();
      } else {
        line = test;
      }
    }
    if (line.length > 0) lineCount += 1;
    total += Math.max(1, lineCount);
  }
  return Math.max(1, total);
}

function emptySlide(background = "#ffffff"): DeckSlide {
  return { id: newId("s"), shapes: [], texts: [], images: [], background };
}

/** Pad with empty placeholders so `index` exists. Each event carries its
 *  FINAL array index (audio/answer/video are reserved at fixed mid-deck
 *  positions and content streams around them). */
function padTo(prev: DeckSlide[], index: number): DeckSlide[] {
  const next = prev.slice();
  while (next.length <= index) next.push(emptySlide());
  return next;
}

// ── Payloads, as the server sends them ──────────────────────────────────────

export type GalleryImage = { prompt: string; style?: string; dataUrl: string };

export interface SlidePayload {
  index: number;
  total: number;
  contentTotal?: number;
  slide: SlideJSON;
  title?: string;
  galleryImage?: GalleryImage;
}

export interface SlideImagePayload {
  index: number;
  slide: SlideJSON;
  galleryImage?: GalleryImage;
}

export interface VideoPayload {
  index: number;
  video: {
    videoId: string; title: string; channel: string; description: string;
    slideHeading?: string; slideSubtitle?: string;
  };
  slideBg?: string;
  titleColor?: string;
  mutedColor?: string;
  accent?: string;
  headingColor?: string;
  headingFont?: string;
  bodyFont?: string;
}

export interface AudioPlaceholderPayload {
  index: number;
  slideBg?: string;
  slideTextColor?: string;
  panelBg?: string;
  panelInk?: string;
  playBg?: string;
  playInk?: string;
  headingFont?: string;
}

export interface VideoPlaceholderPayload {
  index: number;
  slideBg?: string;
  titleColor?: string;
  mutedColor?: string;
  accent?: string;
  headingFont?: string;
}

export interface AudioAnswerPlaceholderPayload {
  index: number;
  slideBg?: string;
  slideTextColor?: string;
  headingFont?: string;
}

export interface AudioPayload {
  index: number;
  audio: {
    src: string; title: string; description: string;
    transcript?: string; questions: string[]; answers?: string[];
    panelBg?: string; panelInk?: string;
    playBg?: string; playInk?: string;
    headingFont?: string;
    bodyFont?: string;
    slideBg?: string;
    slideTextColor?: string;
    headingColor?: string;
  };
}

export interface AudioAnswersPayload {
  index: number;
  title: string;
  questions: string[];
  answers: string[];
  slideBg?: string;
  slideTextColor?: string;
  accent?: string;
  headingColor?: string;
  checkBadgeBg?: string;
  checkBadgeInk?: string;
  headingFont?: string;
  bodyFont?: string;
}

// ── The reducers ────────────────────────────────────────────────────────────

/**
 * Reveal a content slide at its index.
 *
 * `arrived` is the image-bearing render of the same slide if its image event
 * beat the text out of the reveal queue. Preferring it is what stops a late
 * reveal wiping a finished image back to a pending placeholder, which is how
 * decks used to get persisted with empty images.
 */
export function revealSlide(prev: DeckSlide[], p: SlidePayload, arrived?: SlideJSON): DeckSlide[] {
  const next = padTo(prev, p.index);
  // The existing placeholder's id (if any, from the meta seed or a previous
  // padding pass) is preserved so the tray's pop-in only fires once per slot.
  const placeholderId = next[p.index]?.id ?? newId("s");
  const src = arrived ?? p.slide;
  next[p.index] = {
    id: placeholderId,
    shapes: src.shapes ?? p.slide.shapes ?? [],
    texts: src.texts ?? p.slide.texts ?? [],
    images: src.images ?? p.slide.images ?? [],
    audios: p.slide.audios ?? [],
    videos: p.slide.videos ?? [],
    callouts: src.callouts ?? p.slide.callouts ?? [],
    badges: src.badges ?? p.slide.badges ?? [],
    blockquotes: src.blockquotes ?? p.slide.blockquotes ?? [],
    activities: src.activities ?? p.slide.activities ?? [],
    background: src.background ?? p.slide.background ?? "#ffffff",
    backgroundImage: src.backgroundImage ?? p.slide.backgroundImage,
    backgroundImageWidth: src.backgroundImageWidth ?? p.slide.backgroundImageWidth,
    backgroundImageHeight: src.backgroundImageHeight ?? p.slide.backgroundImageHeight,
    backgroundOffsetX: src.backgroundOffsetX ?? p.slide.backgroundOffsetX,
    backgroundOffsetY: src.backgroundOffsetY ?? p.slide.backgroundOffsetY,
    backgroundScale: src.backgroundScale ?? p.slide.backgroundScale,
    backgroundImagePending: arrived ? src.backgroundImagePending : p.slide.backgroundImagePending,
    backgroundArt: src.backgroundArt ?? p.slide.backgroundArt,
    backgroundArtScrim: src.backgroundArtScrim ?? p.slide.backgroundArtScrim,
    skeleton: p.slide.skeleton,
    themeId: p.slide.themeId,
  };
  return next;
}

/** Merge a finished image render into the slide already at `index`. A slide
 *  that has not been revealed yet is left alone; revealSlide picks the image
 *  up from `arrived` when it gets there. */
export function mergeSlideImage(prev: DeckSlide[], p: SlideImagePayload): DeckSlide[] {
  const target = prev[p.index];
  if (!target) return prev;
  const next = prev.slice();
  // Preserve the slide id (so React's key + animations stay stable) and merge
  // in the new image data.
  next[p.index] = {
    id: target.id,
    shapes: p.slide.shapes ?? target.shapes,
    texts: p.slide.texts ?? target.texts,
    images: p.slide.images ?? target.images,
    audios: target.audios,
    videos: target.videos,
    // Re-rendered slide carries fresh callouts/badges/etc with any image data
    // merged into ActivityObject.image. Prefer the new slide's arrays, fall
    // back to the target's.
    callouts: p.slide.callouts ?? target.callouts,
    badges: p.slide.badges ?? target.badges,
    blockquotes: p.slide.blockquotes ?? target.blockquotes,
    activities: p.slide.activities ?? target.activities,
    background: p.slide.background ?? target.background,
    backgroundImage: p.slide.backgroundImage,
    backgroundImageWidth: p.slide.backgroundImageWidth,
    backgroundImageHeight: p.slide.backgroundImageHeight,
    backgroundOffsetX: p.slide.backgroundOffsetX,
    backgroundOffsetY: p.slide.backgroundOffsetY,
    backgroundScale: p.slide.backgroundScale,
    backgroundImagePending: p.slide.backgroundImagePending,
    backgroundArt: p.slide.backgroundArt ?? target.backgroundArt,
    backgroundArtScrim: p.slide.backgroundArtScrim ?? target.backgroundArtScrim,
    // Keep skeleton + themeId carried by the previous slide so image arrival
    // doesn't strip the re-theming metadata.
    skeleton: target.skeleton,
    themeId: target.themeId,
  };
  return next;
}

/** The YouTube slide, laid out so a long title pushes the player down rather
 *  than overlapping it. */
export function placeVideo(prev: DeckSlide[], p: VideoPayload): DeckSlide[] {
  // Title styled like every other paper-* slide: theme heading colour, normal
  // title-case, 40pt.
  const titleColor = p.headingColor ?? p.titleColor ?? "#1a1a1a";
  const subtitleColor = p.mutedColor ?? "#1a1a1a";
  const headingFont = p.headingFont ?? "'Bricolage Grotesque', sans-serif";
  const bodyFont = p.bodyFont ?? "'Inter', sans-serif";
  const heading = p.video.slideHeading ?? p.video.title ?? "Watch this together";
  const subtitle = p.video.slideSubtitle ?? "Let's watch this together to deepen our understanding.";

  // Measure each text block at its width so wrapped headings (long YouTube
  // titles) push the subtitle + video below them instead of overlapping.
  const blockWidth = SLIDE_W - 160;
  const titleFontSize = 40;
  const titleLH = 1.15;
  const subtitleFontSize = 22;
  const subtitleLH = 1.3;
  const titleLines = measureTextLines(heading, blockWidth, titleFontSize, "800", "normal", headingFont);
  const titleH = titleFontSize * titleLH * titleLines;
  const subtitleLines = measureTextLines(subtitle, blockWidth, subtitleFontSize, "500", "normal", bodyFont);
  const subtitleH = subtitleFontSize * subtitleLH * subtitleLines;

  const titleY = 80;
  const subtitleGap = 14;
  const subtitleY = titleY + titleH + subtitleGap;
  const videoGap = 28;
  const vidTop = Math.round(subtitleY + subtitleH + videoGap);

  const titleText: TextObject = {
    id: newId("t"),
    x: 80, y: titleY, width: blockWidth,
    text: heading,
    fontSize: titleFontSize, fontWeight: "800",
    fontStyle: "normal", underline: false,
    fontFamily: headingFont,
    color: titleColor,
    textAlign: "left",
    lineHeight: titleLH,
  };
  const subtitleText: TextObject = {
    id: newId("t"),
    x: 80, y: Math.round(subtitleY), width: blockWidth,
    text: subtitle,
    fontSize: subtitleFontSize, fontWeight: "500",
    fontStyle: "normal", underline: false,
    fontFamily: bodyFont,
    color: subtitleColor,
    textAlign: "left",
    lineHeight: subtitleLH,
  };
  // 16:9 player, sized to fill what's left below the text block, centred
  // horizontally with comfortable side margins.
  const sideMargin = 160;
  const maxW = SLIDE_W - sideMargin * 2;
  const maxH = Math.max(120, SLIDE_H - vidTop - 40);
  let vidW = maxW;
  let vidH = Math.round(vidW * 9 / 16);
  if (vidH > maxH) {
    vidH = maxH;
    vidW = Math.round(vidH * 16 / 9);
  }
  const vidX = Math.round((SLIDE_W - vidW) / 2);
  const newVid: VideoObject = {
    id: newId("v"),
    source: "youtube",
    src: p.video.videoId,
    title: p.video.title,
    x: vidX,
    y: vidTop,
    width: vidW,
    height: vidH,
    cornerRadius: 3,
  };
  // Preserve the slot id (reserved by video-placeholder) so the tray pop-in
  // animation doesn't re-fire on the swap.
  const placeholderId = prev[p.index]?.id ?? newId("s");
  const next = padTo(prev, p.index);
  next[p.index] = {
    id: placeholderId,
    shapes: [], images: [], audios: [],
    texts: [titleText, subtitleText],
    videos: [newVid],
    background: p.slideBg ?? "#1a1a1a",
  };
  return next;
}

/** Reserve the audio slot with a pending shimmer until the real audio lands. */
export function placeAudioPlaceholder(prev: DeckSlide[], p: AudioPlaceholderPayload): DeckSlide[] {
  const playerW = SLIDE_W - 160;
  const playerH = 80;
  const playerY = 210;
  const pendingAudio: AudioObject = {
    id: newId("a"),
    x: 80, y: playerY,
    width: playerW, height: playerH,
    src: "",
    title: "",
    description: "",
    questions: [],
    panelBg: p.panelBg,
    panelInk: p.panelInk,
    playBg: p.playBg,
    playInk: p.playInk,
    headingFont: p.headingFont,
    isPending: true,
  };
  const next = padTo(prev, p.index);
  next[p.index] = {
    id: newId("s"),
    shapes: [], images: [],
    texts: [],
    audios: [pendingAudio],
    background: p.slideBg ?? "#0f172a",
  };
  return next;
}

/** Reserve the video slot with a pending player. */
export function placeVideoPlaceholder(prev: DeckSlide[], p: VideoPlaceholderPayload): DeckSlide[] {
  const sideMargin = 160;
  const vidW = SLIDE_W - sideMargin * 2;
  const vidH = Math.round(vidW * 9 / 16);
  const vidX = Math.round((SLIDE_W - vidW) / 2);
  const pendingVideo: VideoObject = {
    id: newId("v"),
    source: "youtube",
    src: "",
    x: vidX,
    y: 210,
    width: vidW,
    height: vidH,
    cornerRadius: 3,
    isPending: true,
  };
  const next = padTo(prev, p.index);
  next[p.index] = {
    id: newId("s"),
    shapes: [], images: [], audios: [],
    texts: [],
    videos: [pendingVideo],
    background: p.slideBg ?? "#1a1a1a",
  };
  return next;
}

/** Reserve the answer slot: a blank until the audio route returns answers. */
export function placeAudioAnswerPlaceholder(
  prev: DeckSlide[],
  p: AudioAnswerPlaceholderPayload,
): DeckSlide[] {
  const next = padTo(prev, p.index);
  next[p.index] = {
    id: newId("s"),
    shapes: [], images: [], audios: [], videos: [],
    texts: [
      {
        id: newId("t"),
        x: 80, y: 80, width: SLIDE_W - 160,
        text: "Answers loading…",
        fontSize: 36,
        fontWeight: "800",
        fontStyle: "normal",
        underline: false,
        fontFamily: p.headingFont ?? "'Bricolage Grotesque', sans-serif",
        color: p.slideTextColor ?? "#1a1a1a",
        textAlign: "left",
      },
    ],
    background: p.slideBg ?? "#ffffff",
  };
  return next;
}

/** The audio activity slide: heading, description, player and questions, as
 *  four separate elements so each can be edited on its own. */
export function placeAudio(prev: DeckSlide[], p: AudioPayload): DeckSlide[] {
  // Slide texts use slideTextColor (palette.text) so they read against the
  // natural theme bg. Panel internals (player bar) still use panelInk because
  // they sit on the accent panel.
  const titleColor = p.audio.headingColor ?? p.audio.slideTextColor ?? "#1a1a2e";
  const bodyColor = p.audio.slideTextColor ?? "#1a1a2e";
  const headingFont = p.audio.headingFont ?? "'Bricolage Grotesque', sans-serif";
  const bodyFont = p.audio.bodyFont ?? "'Inter', sans-serif";

  const titleText: TextObject = {
    id: newId("t"),
    x: 80, y: 80, width: SLIDE_W - 160,
    text: p.audio.title || "Audio Activity",
    fontSize: 44, fontWeight: "800",
    fontStyle: "normal", underline: false,
    fontFamily: headingFont,
    color: titleColor,
    textAlign: "left",
  };
  const descText: TextObject = {
    id: newId("t"),
    x: 80, y: 150, width: SLIDE_W - 160,
    text: p.audio.description || "Listen to the audio and answer the questions.",
    fontSize: 22, fontWeight: "500",
    fontStyle: "normal", underline: false,
    fontFamily: bodyFont,
    color: bodyColor,
    textAlign: "left",
  };

  const playerW = SLIDE_W - 160;
  const playerH = 80;
  const playerY = 210;
  const newAudio: AudioObject = {
    id: newId("a"),
    x: 80, y: playerY,
    width: playerW, height: playerH,
    src: p.audio.src,
    title: p.audio.title,
    description: p.audio.description,
    questions: p.audio.questions ?? [],
    transcript: p.audio.transcript,
    panelBg: p.audio.panelBg,
    panelInk: p.audio.panelInk,
    playBg: p.audio.playBg,
    playInk: p.audio.playInk,
    headingFont: p.audio.headingFont,
  };

  // Numbered comprehension list, one text element with listType so the
  // teacher gets the toolbar's bullet/number controls.
  const questionsText: TextObject | null = (p.audio.questions?.length ?? 0) > 0 ? {
    id: newId("t"),
    x: 80, y: playerY + playerH + 40,
    width: SLIDE_W - 160,
    text: (p.audio.questions ?? []).join("\n"),
    fontSize: 22, fontWeight: "500",
    fontStyle: "normal", underline: false,
    fontFamily: bodyFont,
    color: bodyColor,
    textAlign: "left",
    listType: "number",
  } : null;

  // Preserve the slot id (reserved by audio-placeholder) so the tray's pop-in
  // animation only fires once.
  const placeholderId = prev[p.index]?.id ?? newId("s");
  const next = padTo(prev, p.index);
  next[p.index] = {
    id: placeholderId,
    shapes: [], images: [],
    texts: questionsText ? [titleText, descText, questionsText] : [titleText, descText],
    audios: [newAudio],
    background: p.audio.slideBg ?? "#0f172a",
  };
  return next;
}

/** The answers to the audio activity, as one editable Q and A list. */
export function placeAudioAnswers(prev: DeckSlide[], p: AudioAnswersPayload): DeckSlide[] {
  const titleColor = p.headingColor ?? p.slideTextColor ?? "#1a1a1a";
  const bodyColor = p.slideTextColor ?? "#1a1a1a";
  const headingFont = p.headingFont ?? "'Bricolage Grotesque', sans-serif";
  const bodyFont = p.bodyFont ?? "'Inter', sans-serif";
  const titleText: TextObject = {
    id: newId("t"),
    x: 80, y: 80, width: SLIDE_W - 240,
    text: p.title || "Audio activity — answers",
    fontSize: 44, fontWeight: "800",
    fontStyle: "normal", underline: false,
    fontFamily: headingFont,
    color: titleColor,
    textAlign: "left",
  };
  const pairs = (p.questions ?? []).map((q, i) => {
    const a = (p.answers ?? [])[i] ?? "";
    return `${i + 1}. ${q}\n   → ${a}`;
  }).join("\n\n");
  const answersText: TextObject = {
    id: newId("t"),
    x: 80, y: 170, width: SLIDE_W - 160,
    text: pairs || "Answers unavailable.",
    fontSize: 20, fontWeight: "500",
    fontStyle: "normal", underline: false,
    fontFamily: bodyFont,
    color: bodyColor,
    textAlign: "left",
  };
  // Green check badge in the top-right, the same visual cue the
  // activity-ordering-answer slide uses.
  const badgeSize = 56;
  const badgeX = SLIDE_W - 60 - badgeSize;
  const badgeY = 60;
  const checkBadge: ShapeObject = {
    id: newId("sh"),
    type: "rect",
    x: badgeX, y: badgeY, width: badgeSize, height: badgeSize,
    fill: p.checkBadgeBg ?? "#2e9d54",
    stroke: "transparent",
    strokeWidth: 0,
    opacity: 1,
    cornerRadius: 10,
    shadow: true,
  };
  const checkGlyph: TextObject = {
    id: newId("t"),
    x: badgeX, y: badgeY + (badgeSize - 36) / 2,
    width: badgeSize,
    text: "✓",
    fontSize: 36, fontWeight: "900",
    fontStyle: "normal", underline: false,
    fontFamily: headingFont,
    color: p.checkBadgeInk ?? "#ffffff",
    textAlign: "center",
  };
  const placeholderId = prev[p.index]?.id ?? newId("s");
  const next = padTo(prev, p.index);
  next[p.index] = {
    id: placeholderId,
    shapes: [checkBadge], images: [], audios: [], videos: [],
    texts: [titleText, answersText, checkGlyph],
    background: p.slideBg ?? "#ffffff",
  };
  return next;
}

/** The art style the deck was generated in, recorded on slide 0. */
export function deckArtStyle(slides: SlideJSON[]): ArtStyleId {
  return (slides[0]?.artStyleId as ArtStyleId) ?? DEFAULT_ART_STYLE;
}

/**
 * The end of a run. Every slide gets the deck's themed background art (the
 * audio and video slides are built here, not on the server, and would
 * otherwise miss it), and any media slot still pending, such as an audio
 * activity whose generation failed, drops back to an empty frame instead of
 * shimmering forever.
 */
export function finishDeck(prev: DeckSlide[]): DeckSlide[] {
  const genTheme = getTheme(prev[0]?.themeId ?? DEFAULT_THEME_ID);
  const genArt = getThemeArt(genTheme, deckArtStyle(prev));
  return prev.map((s) => ({
    ...s,
    images: (s.images ?? []).map((i) => (i.isPending && !i.src ? { ...i, isPending: false } : i)),
    audios: (s.audios ?? []).map((a) => (a.isPending && !a.src ? { ...a, isPending: false } : a)),
    videos: (s.videos ?? []).map((v) => (v.isPending && !v.src ? { ...v, isPending: false } : v)),
    backgroundImagePending: s.backgroundImagePending && !s.backgroundImage ? false : s.backgroundImagePending,
    backgroundArt: s.backgroundArt ?? genArt?.src,
    backgroundArtScrim: s.backgroundArtScrim ?? genArt?.scrim,
  }));
}

/** The first placeholder a deck shows once the server has said how long it
 *  will be. */
export function seedDeck(): DeckSlide[] {
  return [emptySlide()];
}

/**
 * Fold one stream event into the slides. Events that do not change slides
 * (meta, status, count-correction, error) return `prev` unchanged; the caller
 * handles those for its own progress UI. `slide` reveals immediately here;
 * the editor staggers reveals through its own queue and calls revealSlide.
 */
export function applyDeckEvent(
  prev: DeckSlide[],
  event: string,
  payload: unknown,
  arrivedImages?: Map<number, SlideJSON>,
): DeckSlide[] {
  switch (event) {
    case "slide": {
      const p = payload as SlidePayload;
      return revealSlide(prev, p, arrivedImages?.get(p.index));
    }
    case "slide-image": {
      const p = payload as SlideImagePayload;
      arrivedImages?.set(p.index, p.slide);
      return mergeSlideImage(prev, p);
    }
    case "video":
      return placeVideo(prev, payload as VideoPayload);
    case "audio-placeholder":
      return placeAudioPlaceholder(prev, payload as AudioPlaceholderPayload);
    case "video-placeholder":
      return placeVideoPlaceholder(prev, payload as VideoPlaceholderPayload);
    case "audio-answer-placeholder":
      return placeAudioAnswerPlaceholder(prev, payload as AudioAnswerPlaceholderPayload);
    case "audio":
      return placeAudio(prev, payload as AudioPayload);
    case "audio-answers":
      return placeAudioAnswers(prev, payload as AudioAnswersPayload);
    case "complete":
      return finishDeck(prev);
    default:
      return prev;
  }
}

/** Split an SSE buffer into complete `{event, data}` frames, returning the
 *  unconsumed tail. Shared by the editor and the guest preview. */
export function readSseFrames(buffer: string): {
  frames: { event: string; payload: unknown }[];
  rest: string;
} {
  const frames: { event: string; payload: unknown }[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    if (!raw.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    try {
      frames.push({ event, payload: JSON.parse(data) });
    } catch {
      // A keep-alive comment frame or a partial write. Skipped, as before.
    }
  }
  return { frames, rest };
}
