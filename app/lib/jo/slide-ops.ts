// Jo's edits to a slide deck, as pure functions over the editor's slides.
//
// An AI slide is never edited box by box when its words change: its layout
// (the `skeleton`, a SlideSpec) is patched and the slide is rebuilt in the
// deck's theme, the same way a theme switch rebuilds it. So Jo's slides look
// like generated ones, keep their pictures, and keep Jo's words through a
// later theme switch. A slide with no skeleton (a hand made one) has its text
// boxes edited directly.
//
// Ops come from a model, so nothing is trusted: an unknown id, a field the
// layout does not have, or a layout Jo may not add makes the op a no-op.

import { cleanMathText } from "@/app/lib/math-text";
import { renderSlide, rerenderSlideWithTheme, type SlideSpec } from "@/app/lib/slideshow-layouts";
import { DEFAULT_ART_STYLE, DEFAULT_THEME_ID, PICKER_THEMES, getTheme, type ArtStyleId } from "@/app/lib/slideshowThemes";
import { newId, type DeckSlide } from "@/app/lib/deck-events";
import { rethemeDeck } from "@/app/lib/deck-theme";
import { ADDABLE_LAYOUTS, SLIDE_TEXT_KEYS, type SlideField, type SlideOp, type SlideTextKey } from "./types";

/** Where an op lands: a slide, and a text box on it when there is one. */
export interface SlideFocus {
  slideId: string;
  textId?: string;
}

export type SlideKind = "content" | "activity" | "audio" | "video" | "plain";

const clean = (v: string): string => cleanMathText(v).replace(/©/g, "(c)").trim();

export function slideKind(s: DeckSlide): SlideKind {
  if ((s.audios?.length ?? 0) > 0) return "audio";
  if ((s.videos?.length ?? 0) > 0) return "video";
  const layout = (s.skeleton as SlideSpec | undefined)?.layout;
  if (layout?.startsWith("activity-") || (s.activities?.length ?? 0) > 0) return "activity";
  return s.skeleton ? "content" : "plain";
}

export function deckThemeId(slides: DeckSlide[]): string {
  return slides[0]?.themeId ?? DEFAULT_THEME_ID;
}

function skeletonFields(spec: SlideSpec): Partial<Record<SlideTextKey, string>> {
  const out: Partial<Record<SlideTextKey, string>> = {};
  for (const key of SLIDE_TEXT_KEYS) {
    const v = (spec as unknown as Record<string, unknown>)[key];
    if (key === "bullets") {
      if (Array.isArray(v) && v.length) out.bullets = v.filter((x) => typeof x === "string").join("\n");
    } else if (typeof v === "string" && v.trim()) {
      out[key] = v;
    }
  }
  return out;
}

/**
 * A compact copy of the deck for the model: every slide's id and words, and
 * what kind of slide it is. No positions, no colours and never image bytes.
 */
export function deckSnapshot(slides: DeckSlide[]) {
  return {
    themeId: deckThemeId(slides),
    themes: PICKER_THEMES.map((t) => ({ id: t.id, name: t.name })),
    slides: slides.map((s, i) => {
      const kind = slideKind(s);
      const spec = s.skeleton as SlideSpec | undefined;
      return {
        id: s.id,
        number: i + 1,
        kind,
        ...(spec ? { layout: spec.layout, fields: skeletonFields(spec), picture: spec.imageQuery ?? "" } : {}),
        // Text boxes only where there is no layout to rebuild from.
        ...(kind === "plain" || kind === "video" ? { texts: s.texts.map((t) => ({ id: t.id, text: t.text })) } : {}),
      };
    }),
  };
}

/** The fields an op may set, cleaned. Unknown keys are dropped. */
function patchFrom(fields: SlideField[]): Partial<SlideSpec> | null {
  const patch: Record<string, unknown> = {};
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f || typeof f.value !== "string" || !(SLIDE_TEXT_KEYS as readonly string[]).includes(f.key)) continue;
    if (f.key === "bullets") {
      patch.bullets = f.value.split("\n").map(clean).filter(Boolean);
    } else if (f.key === "calloutVariant") {
      const v = f.value.trim().toLowerCase();
      if (["key", "remember", "fun", ""].includes(v)) patch.calloutVariant = v;
    } else {
      patch[f.key] = clean(f.value);
    }
  }
  return Object.keys(patch).length ? (patch as Partial<SlideSpec>) : null;
}

/** A spec as stored on the slide: no image bytes, no accent (the theme's). */
function toSkeleton(spec: SlideSpec): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...spec };
  for (const k of ["imageDataUrl", "imageWidth", "imageHeight", "imagePending", "accentColor"]) delete rest[k];
  return rest;
}

/** The deck level fields slide 0 carries, put back on whichever slide is first. */
function keepDeckHead(next: DeckSlide[], before: DeckSlide[]): DeckSlide[] {
  if (!next.length || !before.length) return next;
  const head = before[0];
  return next.map((s, i) => {
    if (i === 0) return { ...s, themeId: head.themeId, artStyleId: head.artStyleId };
    if (s.id !== head.id) return s;
    const rest = { ...s };
    delete rest.themeId;
    delete rest.artStyleId;
    return rest;
  });
}

/** Rebuild an AI slide from a new skeleton, keeping what is its own. */
function rebuild(s: DeckSlide, skeleton: Record<string, unknown>, themeId: string, artStyle: ArtStyleId): DeckSlide {
  const rebuilt = rerenderSlideWithTheme({ ...s, skeleton }, getTheme(themeId), artStyle);
  return {
    ...rebuilt,
    id: s.id,
    skeleton,
    themeId: s.themeId,
    artStyleId: s.artStyleId,
    backgroundArt: s.backgroundArt,
    backgroundArtScrim: s.backgroundArtScrim,
  } as DeckSlide;
}

/** Where an op points before it is applied, so a delete can show what goes. */
export function slideOpFocus(slides: DeckSlide[], op: SlideOp): SlideFocus | null {
  const has = (id: string) => slides.some((s) => s.id === id);
  switch (op.op) {
    case "setSlideText":
      return has(op.slideId) ? { slideId: op.slideId, textId: op.textId } : null;
    case "rewriteSlide":
    case "deleteSlide":
    case "moveSlide":
      return has(op.slideId) ? { slideId: op.slideId } : null;
    case "addSlide":
      return op.afterSlideId && has(op.afterSlideId) ? { slideId: op.afterSlideId } : null;
    case "setTheme":
      return slides[0] ? { slideId: slides[0].id } : null;
  }
}

export interface AppliedSlideOp {
  slides: DeckSlide[];
  focus: SlideFocus | null;
}

/** One op applied, or null when it does not fit this deck. */
export function applySlideOp(slides: DeckSlide[], op: SlideOp, artStyle: ArtStyleId): AppliedSlideOp | null {
  const index = (id: string) => slides.findIndex((s) => s.id === id);
  const themeId = deckThemeId(slides);

  switch (op.op) {
    case "setSlideText": {
      const i = index(op.slideId);
      if (i === -1 || !slides[i].texts.some((t) => t.id === op.textId)) return null;
      const text = clean(op.text);
      if (!text) return null;
      const next = slides.map((s, j) => (j === i ? { ...s, texts: s.texts.map((t) => (t.id === op.textId ? { ...t, text } : t)) } : s));
      return { slides: next, focus: { slideId: op.slideId, textId: op.textId } };
    }
    case "rewriteSlide": {
      const i = index(op.slideId);
      if (i === -1 || slideKind(slides[i]) !== "content") return null;
      const patch = patchFrom(op.fields);
      if (!patch) return null;
      const skeleton = { ...(slides[i].skeleton as Record<string, unknown>), ...patch };
      if (typeof skeleton.title === "string" && !skeleton.title.trim()) return null;
      const next = slides.map((s, j) => (j === i ? rebuild(s, skeleton, themeId, artStyle) : s));
      return { slides: next, focus: { slideId: op.slideId } };
    }
    case "addSlide": {
      if (!(ADDABLE_LAYOUTS as readonly string[]).includes(op.layout)) return null;
      const patch = patchFrom(op.fields) ?? {};
      if (!patch.title) return null;
      const theme = getTheme(themeId);
      const query = clean(op.imageQuery ?? "");
      const spec: SlideSpec = {
        layout: op.layout,
        colorScheme: "light",
        accentColor: theme.palette.accent,
        title: "",
        ...patch,
        ...(query ? { imageQuery: query, imagePending: true } : {}),
      } as SlideSpec;
      const slide = {
        ...renderSlide(spec, theme, artStyle),
        id: newId("s"),
        skeleton: toSkeleton(spec),
        backgroundArt: slides[0]?.backgroundArt,
        backgroundArtScrim: slides[0]?.backgroundArtScrim,
      } as DeckSlide;
      delete slide.themeId;
      delete slide.artStyleId;
      let at = slides.length;
      if (op.afterSlideId === "") at = 0;
      else if (index(op.afterSlideId) !== -1) at = index(op.afterSlideId) + 1;
      const next = keepDeckHead([...slides.slice(0, at), slide, ...slides.slice(at)], slides);
      return { slides: next, focus: { slideId: slide.id } };
    }
    case "deleteSlide": {
      const i = index(op.slideId);
      if (i === -1 || slides.length <= 1) return null;
      const next = keepDeckHead(slides.filter((_, j) => j !== i), slides);
      return { slides: next, focus: null };
    }
    case "moveSlide": {
      const i = index(op.slideId);
      if (i === -1) return null;
      const moving = slides[i];
      const rest = slides.filter((_, j) => j !== i);
      let at = 0;
      if (op.afterSlideId) {
        const after = rest.findIndex((s) => s.id === op.afterSlideId);
        if (after === -1) return null;
        at = after + 1;
      }
      const next = keepDeckHead([...rest.slice(0, at), moving, ...rest.slice(at)], slides);
      return { slides: next, focus: { slideId: op.slideId } };
    }
    case "setTheme": {
      if (!PICKER_THEMES.some((t) => t.id === op.themeId) || op.themeId === themeId) return null;
      // A new theme always takes the watercolor art, as the picker does.
      const next = rethemeDeck(slides, op.themeId, DEFAULT_ART_STYLE);
      return { slides: next, focus: next[0] ? { slideId: next[0].id } : null };
    }
  }
}

/**
 * An added slide's picture, once found. The slide is rebuilt from its own
 * skeleton with the picture in place of the shimmer, as the generator does
 * when an image arrives after the slide.
 */
export function fillSlidePicture(
  slides: DeckSlide[],
  slideId: string,
  picture: { src: string; width: number; height: number },
  artStyle: ArtStyleId,
): DeckSlide[] {
  const themeId = deckThemeId(slides);
  const theme = getTheme(themeId);
  return slides.map((s) => {
    if (s.id !== slideId || !s.skeleton) return s;
    const spec = {
      ...(s.skeleton as SlideSpec),
      accentColor: theme.palette.accent,
      imageDataUrl: picture.src,
      imageWidth: picture.width,
      imageHeight: picture.height,
      imagePending: false,
    } as SlideSpec;
    return {
      ...renderSlide(spec, theme, artStyle),
      id: s.id,
      skeleton: s.skeleton,
      themeId: s.themeId,
      artStyleId: s.artStyleId,
      backgroundArt: s.backgroundArt,
      backgroundArtScrim: s.backgroundArtScrim,
    } as DeckSlide;
  });
}

/** Slides an op left waiting for a picture: an added slide with a query. */
export function pendingPicture(s: DeckSlide): string | null {
  const spec = s.skeleton as SlideSpec | undefined;
  if (!spec?.imageQuery) return null;
  const waiting = (s.images ?? []).some((i) => i.isPending) || (s.backgroundImagePending && !s.backgroundImage);
  return waiting ? spec.imageQuery : null;
}

/** True when an op is one this file knows, with the fields it needs. */
export function isSlideOp(v: unknown): v is SlideOp {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const s = (k: string) => typeof o[k] === "string";
  if (!s("label")) return false;
  switch (o.op) {
    case "setSlideText": return s("slideId") && s("textId") && s("text");
    case "rewriteSlide": return s("slideId") && Array.isArray(o.fields);
    case "addSlide": return s("afterSlideId") && s("layout") && Array.isArray(o.fields) && s("imageQuery");
    case "deleteSlide": return s("slideId");
    case "moveSlide": return s("slideId") && s("afterSlideId");
    case "setTheme": return s("themeId");
    default: return false;
  }
}
