"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import EditorTopBar from "./EditorTopBar";
import ContextualToolbar, { type EditorSelection } from "./ContextualToolbar";
import Sidebar, { type ActivityKind, type ActivityConfig } from "./Sidebar";
import SlideTray, { type SlideEntry } from "./SlideTray";
import TextLayer from "./TextLayer";
import ShapeLayer from "./ShapeLayer";
import ImageLayer from "./ImageLayer";
import AudioLayer from "./AudioLayer";
import VideoLayer from "./VideoLayer";
import CalloutLayer from "./CalloutLayer";
import BadgeLayer from "./BadgeLayer";
import BlockquoteLayer from "./BlockquoteLayer";
import ActivityLayer from "./ActivityLayer";
import ZoomControls from "./ZoomControls";
import FontPanel from "./FontPanel";
import VideoRegenerateModal from "./VideoRegenerateModal";
import ContextMenu, { type ContextMenuState } from "./ContextMenu";
import RegenerateImageDialog from "./RegenerateImageDialog";
import EditAudioPanel, { type ActivityType } from "./EditAudioPanel";
import SlideshowLoadingAnimation from "./SlideshowLoadingAnimation";
import PresentationViewer from "./PresentationViewer";
import type { FrameShape } from "./frames";
import { SLIDE_W, SLIDE_H } from "./constants";
import {
  BLANK_SLIDE,
  updatePresentation,
  type Presentation,
  type SlideJSON,
  type TextObject,
  type ShapeObject,
  type ShapeType,
  type ImageObject,
  type AudioObject,
  type VideoObject,
  type CalloutObject,
  type BadgeObject,
  type BlockquoteObject,
  type ActivityObject,
} from "@/app/lib/presentations";
import { saveGeneratedImage } from "@/app/lib/generatedImages";
import { getTheme, DEFAULT_THEME_ID } from "@/app/lib/slideshowThemes";
import { rerenderSlideWithTheme } from "@/app/lib/slideshow-layouts";

interface SlideState extends SlideJSON {
  id: string;
}

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface GenerationParams {
  topic: string;
  year?: string;
  readingLevel?: string;
  slideCount?: number;
  additionalInstructions?: string;
  includeObjectives?: boolean;
  includeVocab?: boolean;
  vocabulary?: string[];
  includeAudio?: boolean;
  imageSource?: "auto" | "ai" | "web";
  imageStyle?: "storybook" | "illustration" | "photographic" | "painted" | "line-drawing" | "comic-book";
}

/** Firms up a matting result's alpha channel. The background-removal model
 *  often returns interior foreground pixels at 60-85% alpha (a faded, washed-
 *  out look). A simple alpha gain (×1.6, clamped) snaps those near-opaque
 *  pixels to fully opaque while leaving genuinely-soft low-alpha pixels (hair
 *  wisps, fuzzy edges) feathered. Monotonic + continuous so no edge artefacts.
 */
async function hardenAlpha(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const GAIN = 1.6;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] === 0 || d[i] === 255) continue; // already fully transparent/opaque
      d[i] = Math.min(255, Math.round(d[i] * GAIN));
    }
    ctx.putImageData(img, 0, 0);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? blob), "image/png"),
    );
  } catch {
    // If anything goes wrong (no canvas, decode failure), fall back to the
    // un-processed cutout rather than failing the whole operation.
    return blob;
  }
}

interface Props {
  presentation: Presentation;
  generationParams?: GenerationParams;
}

const HISTORY_MAX = 50;

// Canvas-based text measurement used to estimate how many wrapped lines a
// TextObject spans at a given width. Greedy word-wrap matches what the
// browser does for CSS `word-wrap: break-word; white-space: pre-wrap`.
let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextLines(
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

export default function Editor({ presentation, generationParams }: Props) {
  const [title, setTitle] = useState(presentation.title);
  const [slides, setSlides] = useState<SlideState[]>(() => {
    const src = presentation.slides?.length ? presentation.slides : [BLANK_SLIDE];
    // Scrub any `isPending: true` flags off media that never got a `src` —
    // those are stuck shimmers from a generation run that didn't finish
    // before the row was saved. Clearing the flag drops them back to a
    // normal empty frame the user can fill or regenerate manually.
    return src.map((s) => ({
      id: newId("s"),
      shapes: s.shapes ?? [],
      texts: s.texts ?? [],
      images: (s.images ?? []).map((i) =>
        i.isPending && !i.src ? { ...i, isPending: false } : i,
      ),
      audios: (s.audios ?? []).map((a) =>
        a.isPending && !a.src ? { ...a, isPending: false } : a,
      ),
      videos: (s.videos ?? []).map((v) =>
        v.isPending && !v.src ? { ...v, isPending: false } : v,
      ),
      callouts: s.callouts ?? [],
      badges: s.badges ?? [],
      blockquotes: s.blockquotes ?? [],
      activities: s.activities ?? [],
      background: s.background ?? "#ffffff",
      backgroundImage: s.backgroundImage,
      backgroundImageWidth: s.backgroundImageWidth,
      backgroundImageHeight: s.backgroundImageHeight,
      backgroundOffsetX: s.backgroundOffsetX,
      backgroundOffsetY: s.backgroundOffsetY,
      backgroundScale: s.backgroundScale,
      backgroundImagePending: s.backgroundImagePending && !s.backgroundImage ? false : s.backgroundImagePending,
      // Carry the AI skeleton + deck-level themeId through page reloads.
      // Without these, theme-switching becomes a no-op for AI-generated
      // slides (rerenderSlideWithTheme requires a skeleton to rebuild from)
      // and the next save would persist them as missing.
      skeleton: s.skeleton,
      themeId: s.themeId,
    }));
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  // Selection state for the new primitive types — mirror the pattern above.
  const [selectedCalloutId, setSelectedCalloutId] = useState<string | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [selectedBlockquoteId, setSelectedBlockquoteId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  // Audio id whose "Edit audio" side panel is currently open (null when closed).
  const [editingAudioId, setEditingAudioId] = useState<string | null>(null);
  const [slideSelected, setSlideSelected] = useState(false);
  const [adjustingBackground, setAdjustingBackground] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [zoom, setZoom] = useState(1);
  const [fontPanelOpen, setFontPanelOpen] = useState(false);
  // Imperative open request for the Sidebar (canvas "Swap image" → Pictures).
  const [sidebarOpenSignal, setSidebarOpenSignal] = useState<{ tab: "pictures"; subTab?: "stock" | "upload" | "ai"; nonce: number } | undefined>(undefined);
  // When the user clicks "Swap image" on a selected image, we record its id
  // here. The next image picked from the Pictures sidebar replaces this image's
  // src instead of adding a new element. Cleared after one use or on deselect.
  const swapTargetRef = useRef<string | null>(null);
  const [dragGuides, setDragGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Image id currently being regenerated via the AI dialog (null when closed).
  const [regenerateTargetId, setRegenerateTargetId] = useState<string | null>(null);
  const [editingInnerImageId, setEditingInnerImageId] = useState<string | null>(null);
  const [dropLoading, setDropLoading] = useState<{ x: number; y: number } | null>(null);
  const [generating, setGenerating] = useState<{ current: number; total: number; title?: string; slideTitles?: string[]; statusMessage?: string } | null>(
    generationParams ? { current: 0, total: generationParams.slideCount ?? 0 } : null,
  );
  // True from the moment generationParams arrives until the first SSE "meta" event,
  // meaning OpenAI has responded. During this window a full-screen overlay is shown
  // so the user never sees a blank slide + spinner during the AI wait.
  const [preMeta, setPreMeta] = useState(!!generationParams);
  // Bumped each time we persist a new AI image to the cross-project gallery
  // (Supabase `generated_images`). Triggers a refetch in the Sidebar.
  const [galleryRefreshTrigger, setGalleryRefreshTrigger] = useState(0);

  // Marquee (rubber-band) multi-selection state. While the user is dragging
  // an empty area of the slide, `marquee` holds the rect in slide-local coords;
  // on mouse-up we compute hit-tests and stash the result in `multiSelection`.
  type MultiSelectionItem =
    | { kind: "text"; id: string }
    | { kind: "shape"; id: string }
    | { kind: "image"; id: string };
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [multiSelection, setMultiSelection] = useState<MultiSelectionItem[]>([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const slideWrapperRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef(slides);
  const activeIndexRef = useRef(activeIndex);
  const titleRef = useRef(title);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // ── Undo/Redo history (snapshots of slides JSON) ──────────────────────────
  const history = useRef<string[]>([JSON.stringify(slides)]);
  const historyIndex = useRef(0);
  const suppressHistory = useRef(false);
  // Separate from the save debounce (1s). A shorter timer here means undo
  // captures changes more granularly — e.g. a quick sequence of three drags
  // produces three undo steps instead of one big coalesced step.
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { slidesRef.current = slides; }, [slides]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { titleRef.current = title; }, [title]);

  const pushHistory = useCallback((newSlides: SlideState[]) => {
    if (suppressHistory.current) return;
    const json = JSON.stringify(newSlides);
    if (history.current[historyIndex.current] === json) return;
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(json);
    if (history.current.length > HISTORY_MAX) history.current.shift();
    else historyIndex.current++;
  }, []);

  // Flush any pending history-debounce so the user's most recent change is
  // captured BEFORE we step back through history. Without this, undo could
  // jump over the latest edit.
  const flushPendingHistory = useCallback(() => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
      pushHistory(slidesRef.current);
    }
  }, [pushHistory]);

  const undo = useCallback(() => {
    flushPendingHistory();
    if (historyIndex.current <= 0) return;
    historyIndex.current--;
    const restored = JSON.parse(history.current[historyIndex.current]) as SlideState[];
    suppressHistory.current = true;
    setSlides(restored);
    slidesRef.current = restored;
    queueMicrotask(() => { suppressHistory.current = false; });
    scheduleSave();
  }, [flushPendingHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const redo = useCallback(() => {
    flushPendingHistory();
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current++;
    const restored = JSON.parse(history.current[historyIndex.current]) as SlideState[];
    suppressHistory.current = true;
    setSlides(restored);
    slidesRef.current = restored;
    queueMicrotask(() => { suppressHistory.current = false; });
    scheduleSave();
  }, [flushPendingHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection coordination ────────────────────────────────────────────────

  const handleTextSelect = useCallback((id: string | null) => {
    setSelectedTextId(id);
    if (id) { setSelectedShapeId(null); setSelectedImageId(null); setSelectedAudioId(null); setSelectedVideoId(null); setSelectedCalloutId(null); setSelectedBadgeId(null); setSelectedBlockquoteId(null); setSelectedActivityId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleShapeSelect = useCallback((id: string | null) => {
    setSelectedShapeId(id);
    if (id) { setSelectedTextId(null); setSelectedImageId(null); setSelectedAudioId(null); setSelectedVideoId(null); setSelectedCalloutId(null); setSelectedBadgeId(null); setSelectedBlockquoteId(null); setSelectedActivityId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleImageSelect = useCallback((id: string | null) => {
    setSelectedImageId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSelectedAudioId(null); setSelectedVideoId(null); setSelectedCalloutId(null); setSelectedBadgeId(null); setSelectedBlockquoteId(null); setSelectedActivityId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleAudioSelect = useCallback((id: string | null) => {
    setSelectedAudioId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSelectedImageId(null); setSelectedVideoId(null); setSelectedCalloutId(null); setSelectedBadgeId(null); setSelectedBlockquoteId(null); setSelectedActivityId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleVideoSelect = useCallback((id: string | null) => {
    setSelectedVideoId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSelectedImageId(null); setSelectedAudioId(null); setSelectedCalloutId(null); setSelectedBadgeId(null); setSelectedBlockquoteId(null); setSelectedActivityId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  // Helper that clears all single-element selections except the one passed in.
  // The new-primitive select handlers below use it to avoid the same five-line
  // wall of `setSelected*(null)` calls.
  const clearOtherSelections = useCallback((except: "callout" | "badge" | "blockquote" | "activity") => {
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSelectedAudioId(null);
    setSelectedVideoId(null);
    if (except !== "callout")    setSelectedCalloutId(null);
    if (except !== "badge")      setSelectedBadgeId(null);
    if (except !== "blockquote") setSelectedBlockquoteId(null);
    if (except !== "activity")   setSelectedActivityId(null);
    setSlideSelected(false);
    setMultiSelection([]);
  }, []);

  const handleCalloutSelect = useCallback((id: string | null) => {
    setSelectedCalloutId(id);
    if (id) clearOtherSelections("callout");
  }, [clearOtherSelections]);

  const handleBadgeSelect = useCallback((id: string | null) => {
    setSelectedBadgeId(id);
    if (id) clearOtherSelections("badge");
  }, [clearOtherSelections]);

  const handleBlockquoteSelect = useCallback((id: string | null) => {
    setSelectedBlockquoteId(id);
    if (id) clearOtherSelections("blockquote");
  }, [clearOtherSelections]);

  const handleActivitySelect = useCallback((id: string | null) => {
    setSelectedActivityId(id);
    if (id) clearOtherSelections("activity");
  }, [clearOtherSelections]);

  const selection: EditorSelection = useMemo(() => {
    const slide = slides[activeIndex];
    if (!slide) return null;
    if (selectedTextId) {
      const t = slide.texts.find((x) => x.id === selectedTextId);
      return t ? { kind: "text", text: t } : null;
    }
    if (selectedShapeId) {
      const sh = slide.shapes.find((x) => x.id === selectedShapeId);
      return sh ? { kind: "shape", shape: sh } : null;
    }
    if (selectedImageId) {
      const im = slide.images.find((x) => x.id === selectedImageId);
      return im ? { kind: "image", image: im } : null;
    }
    if (selectedVideoId) {
      const v = (slide.videos ?? []).find((x) => x.id === selectedVideoId);
      return v ? { kind: "video", video: v } : null;
    }
    if (slideSelected) return { kind: "slide", slide };
    return null;
  }, [selectedTextId, selectedShapeId, selectedImageId, selectedVideoId, slideSelected, slides, activeIndex]);

  const clearSelection = useCallback(() => {
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSelectedAudioId(null);
    setSelectedVideoId(null);
    setSelectedCalloutId(null);
    setSelectedBadgeId(null);
    setSelectedBlockquoteId(null);
    setSelectedActivityId(null);
    setSlideSelected(false);
    setMultiSelection([]);
  }, []);

  // Bbox helper — text has no stored height by default, so estimate from font
  // metrics + word-wrap at the element's width. If the user has explicitly
  // resized the text box vertically (t.height set), the bbox respects that as
  // a floor: max(content height, explicit height).
  const textBbox = (t: TextObject) => {
    const lh = t.lineHeight ?? 1.2;
    const lineCount = measureTextLines(t.text, t.width, t.fontSize, t.fontWeight, t.fontStyle, t.fontFamily);
    const contentH = Math.max(t.fontSize * lh * lineCount, t.fontSize * lh);
    const h = t.height ? Math.max(contentH, t.height) : contentH;
    return { x: t.x, y: t.y, w: t.width, h };
  };

  // Point hit-test in slide-local coords. Returns the topmost element at the
  // point, respecting z-order: text > shapes > images, and within each layer
  // later entries render on top.
  const hitTestPoint = useCallback((x: number, y: number): MultiSelectionItem | null => {
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide) return null;
    const inside = (b: { x: number; y: number; w: number; h: number }) =>
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    for (let i = slide.texts.length - 1; i >= 0; i--) {
      const t = slide.texts[i];
      if (!t.locked && inside(textBbox(t))) return { kind: "text", id: t.id };
    }
    for (let i = slide.shapes.length - 1; i >= 0; i--) {
      const s = slide.shapes[i];
      if (!s.locked && inside({ x: s.x, y: s.y, w: s.width, h: s.height })) return { kind: "shape", id: s.id };
    }
    for (let i = slide.images.length - 1; i >= 0; i--) {
      const im = slide.images[i];
      if (!im.locked && inside({ x: im.x, y: im.y, w: im.width, h: im.height })) return { kind: "image", id: im.id };
    }
    return null;
  }, []);

  // Compute hit-test once the user releases the marquee drag. Any text, shape
  // or image whose bbox intersects the marquee rect joins the multi-selection.
  // When `additive` (shift drag), hits are merged with the existing selection;
  // otherwise they replace it.
  const finishMarquee = useCallback((rect: { x: number; y: number; w: number; h: number }, additive: boolean) => {
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide || rect.w < 2 || rect.h < 2) {
      if (!additive) setMultiSelection([]);
      return;
    }
    const intersects = (b: { x: number; y: number; w: number; h: number }) =>
      !(rect.x + rect.w < b.x || b.x + b.w < rect.x || rect.y + rect.h < b.y || b.y + b.h < rect.y);

    const hits: MultiSelectionItem[] = [];
    for (const im of slide.images) {
      if (im.locked) continue;
      if (intersects({ x: im.x, y: im.y, w: im.width, h: im.height })) hits.push({ kind: "image", id: im.id });
    }
    for (const sh of slide.shapes) {
      if (sh.locked) continue;
      if (intersects({ x: sh.x, y: sh.y, w: sh.width, h: sh.height })) hits.push({ kind: "shape", id: sh.id });
    }
    for (const t of slide.texts) {
      if (t.locked) continue;
      if (intersects(textBbox(t))) hits.push({ kind: "text", id: t.id });
    }
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSlideSelected(false);
    setMultiSelection((prev) => {
      if (!additive) return hits;
      const key = (m: MultiSelectionItem) => `${m.kind}:${m.id}`;
      const seen = new Set(prev.map(key));
      const merged = prev.slice();
      for (const h of hits) if (!seen.has(key(h))) { seen.add(key(h)); merged.push(h); }
      return merged;
    });
  }, []);

  // Shift+click on an element toggles its membership in the multi-selection.
  // Plus: if the click is on top of an existing single-selection (text/shape/image
  // id), we promote that to a multi-selection of [previousSingle, clicked].
  const toggleMultiSelectionAt = useCallback((x: number, y: number) => {
    const hit = hitTestPoint(x, y);
    if (!hit) return;
    const key = (m: MultiSelectionItem) => `${m.kind}:${m.id}`;
    const k = key(hit);
    setMultiSelection((prev) => {
      // Seed from any single selection that's about to be lost.
      const seed: MultiSelectionItem[] = prev.length > 0
        ? prev.slice()
        : selectedTextId ? [{ kind: "text", id: selectedTextId }]
        : selectedShapeId ? [{ kind: "shape", id: selectedShapeId }]
        : selectedImageId ? [{ kind: "image", id: selectedImageId }]
        : [];
      const idx = seed.findIndex((m) => key(m) === k);
      if (idx >= 0) {
        const next = seed.slice();
        next.splice(idx, 1);
        return next;
      }
      return [...seed, hit];
    });
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSlideSelected(false);
  }, [hitTestPoint, selectedTextId, selectedShapeId, selectedImageId]);

  const startMarqueeDrag = (e: React.MouseEvent | MouseEvent) => {
    if (adjustingBackground) return;
    if (!slideWrapperRef.current) return;
    if (e.button !== 0) return;

    const rect = slideWrapperRef.current.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / zoom;
    const startY = (e.clientY - rect.top) / zoom;
    let moved = false;
    const shiftStart = e.shiftKey;

    const onMove = (ev: MouseEvent) => {
      const cx = (ev.clientX - rect.left) / zoom;
      const cy = (ev.clientY - rect.top) / zoom;
      const dx = cx - startX;
      const dy = cy - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      const x = Math.max(0, Math.min(startX, cx));
      const y = Math.max(0, Math.min(startY, cy));
      const w = Math.min(SLIDE_W - x, Math.abs(dx));
      const h = Math.min(SLIDE_H - y, Math.abs(dy));
      setMarquee({ x, y, w, h });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) {
        // Finalize via setState callback so we read the latest committed rect
        // even if React batched the last move into the same frame as the up.
        setMarquee((cur) => {
          if (cur) finishMarquee(cur, shiftStart);
          return null;
        });
      } else if (shiftStart) {
        // Shift+click without movement: toggle the element under the cursor.
        // If it landed on empty space, do nothing (preserve current selection).
        const upRect = slideWrapperRef.current?.getBoundingClientRect();
        if (upRect) {
          const ux = (ev.clientX - upRect.left) / zoom;
          const uy = (ev.clientY - upRect.top) / zoom;
          toggleMultiSelectionAt(ux, uy);
        }
        setMarquee(null);
      } else {
        // Plain click on empty area → clear selection like before.
        setSelectedTextId(null);
        setSelectedShapeId(null);
        setSelectedImageId(null);
        setMultiSelection([]);
        setSlideSelected(true);
        setMarquee(null);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSlideMouseDown = (e: React.MouseEvent) => {
    // Plain mousedown on the slide background: start the marquee. Clicks on
    // child elements (images, shapes, text) bubble up here only after the
    // child's own handler has fired, so plain clicks on elements still select
    // them normally. Shift+drag from anywhere is intercepted in capture-phase
    // below (see onMouseDownCapture) so it works even over elements.
    if (e.target !== slideWrapperRef.current) return;
    startMarqueeDrag(e);
  };

  const handleSlideMouseDownCapture = (e: React.MouseEvent) => {
    // Shift held → force marquee mode regardless of what was clicked.
    // We capture before child handlers run and stop propagation so the
    // image/shape/text underneath isn't selected.
    if (!e.shiftKey) return;
    if (e.button !== 0) return;
    if (adjustingBackground) return;
    e.stopPropagation();
    e.preventDefault();
    startMarqueeDrag(e);
  };

  const handleSlideDoubleClick = (e: React.MouseEvent) => {
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide?.backgroundImage) return;
    if (e.target !== slideWrapperRef.current) return;
    setAdjustingBackground(true);
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSlideSelected(false);
  };

  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const openBackgroundFilePicker = useCallback(() => {
    bgFileInputRef.current?.click();
  }, []);

  // ── Drag-and-drop from sidebar onto the slide canvas ────────────────────
  // Frames intercept their own drops via stopPropagation; anything that bubbles
  // up here creates a brand-new image at the drop point.
  const handleSlideDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-jooma-image")) return;
    e.preventDefault();
  };

  const handleSlideDrop = async (e: React.DragEvent) => {
    const url = e.dataTransfer.getData("application/x-jooma-image");
    if (!url) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = slideWrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Slide is scaled by `zoom`. Convert client coords → slide-local coords.
    const cx = (e.clientX - rect.left) / zoom;
    const cy = (e.clientY - rect.top) / zoom;

    // Show a spinner at the drop point while we fetch + decode the asset.
    setDropLoading({ x: cx, y: cy });
    try {
      const dataUrl = url.startsWith("data:")
        ? url
        : await (async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Fetch failed");
            const blob = await res.blob();
            if (blob.type.includes("svg")) {
              const text = await blob.text();
              const utf8 = unescape(encodeURIComponent(text));
              return `data:image/svg+xml;base64,${btoa(utf8)}`;
            }
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error("Read failed"));
              reader.readAsDataURL(blob);
            });
          })();
      addImage(dataUrl, { x: cx, y: cy });
    } catch (err) {
      console.warn("Drop failed", err);
    } finally {
      setDropLoading(null);
    }
  };

  const handleSlideContextMenu = (e: React.MouseEvent) => {
    // Only open slide context menu if the user right-clicked the empty slide background.
    if (e.target !== slideWrapperRef.current) return;
    e.preventDefault();
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide) return;
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSlideSelected(true);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      kind: "slide",
      locked: false,
      hasBackgroundImage: !!slide.backgroundImage,
      canDeleteSlide: slidesRef.current.length > 1,
    });
  };

  // Compute the rendered background-image dimensions (cover * user scale), the max pan
  // bounds, AND the clamped offsets. Every consumer uses these clamped values so a stale
  // out-of-range offset can never leave empty space inside the slide.
  const bgMetrics = useCallback((slide: SlideState) => {
    const userScale = Math.max(1, slide.backgroundScale ?? 1);
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    let scaledW: number, scaledH: number, coverScale: number;
    if (!slide.backgroundImageWidth || !slide.backgroundImageHeight) {
      coverScale = 1;
      scaledW = SLIDE_W * userScale;
      scaledH = SLIDE_H * userScale;
    } else {
      coverScale = Math.max(
        SLIDE_W / slide.backgroundImageWidth,
        SLIDE_H / slide.backgroundImageHeight,
      );
      scaledW = slide.backgroundImageWidth * coverScale * userScale;
      scaledH = slide.backgroundImageHeight * coverScale * userScale;
    }
    const maxX = Math.max(0, (scaledW - SLIDE_W) / 2);
    const maxY = Math.max(0, (scaledH - SLIDE_H) / 2);
    return {
      coverScale,
      finalScale: coverScale * userScale,
      scaledW,
      scaledH,
      maxX,
      maxY,
      offsetX: clamp(slide.backgroundOffsetX ?? 0, maxX),
      offsetY: clamp(slide.backgroundOffsetY ?? 0, maxY),
    };
  }, []);

  const clampNum = (v: number, m: number) => Math.max(-m, Math.min(m, v));

  const handleAdjustDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const slide = slidesRef.current[activeIndexRef.current];
    const { maxX, maxY, offsetX: origX, offsetY: origY } = bgMetrics(slide);

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      updateSlide({
        backgroundOffsetX: clampNum(origX + dx, maxX),
        backgroundOffsetY: clampNum(origY + dy, maxY),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Corner resize: distance-from-slide-center sets the scale. Drag away from center = bigger;
  // drag toward center = smaller (clamped at cover). Aspect is preserved automatically because
  // backgroundScale is a single uniform multiplier applied to both dimensions in bgMetrics.
  const handleScaleDragStart = (_pos: "nw" | "ne" | "sw" | "se") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const slide = slidesRef.current[activeIndexRef.current];
    const origScale = Math.max(1, slide.backgroundScale ?? 1);

    const slideRect = slideWrapperRef.current?.getBoundingClientRect();
    if (!slideRect) return;
    const centerX = slideRect.left + slideRect.width / 2;
    const centerY = slideRect.top + slideRect.height / 2;
    const startDist = Math.hypot(startX - centerX, startY - centerY);
    if (startDist === 0) return;

    const slideMetrics = bgMetrics(slide);
    const origOffX = slideMetrics.offsetX;
    const origOffY = slideMetrics.offsetY;
    const move = (ev: MouseEvent) => {
      const currentDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
      const newScale = Math.max(1, Math.min(5, origScale * (currentDist / startDist)));
      const tempSlide: SlideState = { ...slide, backgroundScale: newScale };
      const { maxX, maxY } = bgMetrics(tempSlide);
      updateSlide({
        backgroundScale: newScale,
        backgroundOffsetX: clampNum(origOffX, maxX),
        backgroundOffsetY: clampNum(origOffY, maxY),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Esc cancels, Enter applies — both exit adjust mode.
  useEffect(() => {
    if (!adjustingBackground) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        setAdjustingBackground(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [adjustingBackground]);

  // Same for inner-image frame editing
  useEffect(() => {
    if (!editingInnerImageId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        setEditingInnerImageId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingInnerImageId]);

  // Exit inner-edit when the image is deselected
  useEffect(() => {
    if (editingInnerImageId && selectedImageId !== editingInnerImageId) {
      setEditingInnerImageId(null);
    }
  }, [editingInnerImageId, selectedImageId]);

  const exitInnerEdit = useCallback(() => setEditingInnerImageId(null), []);

  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (slideWrapperRef.current && !slideWrapperRef.current.contains(e.target as Node)) {
      clearSelection();
      setAdjustingBackground(false);
    }
  };

  // ── Persistence ────────────────────────────────────────────────────────────

  const persist = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    // History snapshots are now pushed by `scheduleHistoryPush` (300 ms debounce)
    // so the user gets finer-grained undo steps instead of one big chunk per save.
    setSaveStatus("saving");
    try {
      const payload: SlideJSON[] = slidesRef.current.map((s) => ({
        shapes: s.shapes,
        texts: s.texts,
        images: s.images,
        audios: s.audios ?? [],
        videos: s.videos ?? [],
        callouts: s.callouts ?? [],
        badges: s.badges ?? [],
        blockquotes: s.blockquotes ?? [],
        activities: s.activities ?? [],
        background: s.background,
        backgroundImage: s.backgroundImage,
        backgroundImageWidth: s.backgroundImageWidth,
        backgroundImageHeight: s.backgroundImageHeight,
        backgroundOffsetX: s.backgroundOffsetX,
        backgroundOffsetY: s.backgroundOffsetY,
        backgroundScale: s.backgroundScale,
        // Persist the AI skeleton + deck-level themeId so theme switching
        // works after the page is reloaded.
        skeleton: s.skeleton,
        themeId: s.themeId,
      }));
      // While we still inline base64 image data in slides, a save can be many
      // MB. Log the payload size so it's obvious when Postgres' statement
      // timeout is being tripped by sheer volume rather than logic errors.
      if (typeof console !== "undefined" && process.env.NODE_ENV === "development") {
        const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
        if (bytes > 1_000_000) {
          console.warn(`[persist] Large slides payload: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
        }
      }
      await updatePresentation(presentation.id, {
        title: titleRef.current,
        slides: payload,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (err: unknown) {
      // Logging an error object via console.error sometimes prints `{}` in
      // Next.js's overlay because Supabase/PostgREST errors have non-enumerable
      // fields. Stringify with `Object.getOwnPropertyNames` so every property
      // (including non-enumerable ones) shows up. Also log the original error
      // separately so it appears in the browser DevTools console with its
      // native formatting.
      console.error("Save failed (raw):", err);
      try {
        const ownProps = err && typeof err === "object"
          ? JSON.stringify(err, Object.getOwnPropertyNames(err as object))
          : String(err);
        console.error("Save failed (fields):", ownProps);
      } catch {
        console.error("Save failed (couldn't stringify):", String(err));
      }
      setSaveStatus("error");
    }
  }, [presentation.id]);

  // Debounced history snapshot. Short enough (300 ms) that a quick sequence of
  // distinct edits (e.g. drag → click → recolor) gets three undo steps, but
  // long enough that a continuous gesture (drag mousemove at 60fps, slider
  // ticks, keystrokes) coalesces into one step.
  const scheduleHistoryPush = useCallback(() => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      pushHistory(slidesRef.current);
    }, 300);
  }, [pushHistory]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(), 1000);
    // History push runs on a separate, shorter timer so the user can step
    // through individual changes with Ctrl+Z instead of getting them all
    // coalesced into the 1-second save batch.
    scheduleHistoryPush();
  }, [persist, scheduleHistoryPush]);

  useEffect(() => {
    const handler = () => { if (dirtyRef.current) persist(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [persist]);

  // ── Slide mutation helper ──────────────────────────────────────────────────

  const mutateActiveSlide = useCallback((fn: (slide: SlideState) => SlideState) => {
    setSlides((prev) => {
      const next = prev.map((s, i) => i === activeIndexRef.current ? fn(s) : s);
      slidesRef.current = next;
      return next;
    });
    // History is now pushed inside `persist` (debounced), not on every keystroke —
    // JSON.stringify of slides containing base64 image data is too expensive to run
    // on every mousemove / color-picker tick.
    scheduleSave();
  }, [scheduleSave]);

  const deleteMultiSelection = useCallback(() => {
    if (multiSelection.length === 0) return;
    const textIds = new Set(multiSelection.filter((m) => m.kind === "text").map((m) => m.id));
    const shapeIds = new Set(multiSelection.filter((m) => m.kind === "shape").map((m) => m.id));
    const imageIds = new Set(multiSelection.filter((m) => m.kind === "image").map((m) => m.id));
    mutateActiveSlide((s) => ({
      ...s,
      texts: s.texts.filter((t) => !textIds.has(t.id)),
      shapes: s.shapes.filter((sh) => !shapeIds.has(sh.id)),
      images: s.images.filter((im) => !imageIds.has(im.id)),
    }));
    setMultiSelection([]);
  }, [multiSelection, mutateActiveSlide]);

  // Drag a multi-selection as a group. Mousedown on any selected element calls
  // this; we snapshot each item's original position, then apply the same dx/dy
  // to all of them on every mousemove so they move in lockstep.
  const startGroupDrag = useCallback((e: React.MouseEvent) => {
    if (multiSelection.length === 0) return;
    e.stopPropagation();
    e.preventDefault();
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide) return;

    type Origin = { kind: "text" | "shape" | "image"; id: string; x0: number; y0: number };
    const origins: Origin[] = [];
    for (const m of multiSelection) {
      if (m.kind === "image") {
        const im = slide.images.find((x) => x.id === m.id);
        if (im && !im.locked) origins.push({ kind: "image", id: im.id, x0: im.x, y0: im.y });
      } else if (m.kind === "shape") {
        const sh = slide.shapes.find((x) => x.id === m.id);
        if (sh && !sh.locked) origins.push({ kind: "shape", id: sh.id, x0: sh.x, y0: sh.y });
      } else if (m.kind === "text") {
        const t = slide.texts.find((x) => x.id === m.id);
        if (t && !t.locked) origins.push({ kind: "text", id: t.id, x0: t.x, y0: t.y });
      }
    }
    if (origins.length === 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!moved && Math.hypot(dx, dy) < 1) return;
      moved = true;
      const textMap = new Map(origins.filter((o) => o.kind === "text").map((o) => [o.id, o]));
      const shapeMap = new Map(origins.filter((o) => o.kind === "shape").map((o) => [o.id, o]));
      const imageMap = new Map(origins.filter((o) => o.kind === "image").map((o) => [o.id, o]));
      mutateActiveSlide((s) => ({
        ...s,
        texts: s.texts.map((t) => {
          const o = textMap.get(t.id);
          return o ? { ...t, x: o.x0 + dx, y: o.y0 + dy } : t;
        }),
        shapes: s.shapes.map((sh) => {
          const o = shapeMap.get(sh.id);
          return o ? { ...sh, x: o.x0 + dx, y: o.y0 + dy } : sh;
        }),
        images: s.images.map((im) => {
          const o = imageMap.get(im.id);
          return o ? { ...im, x: o.x0 + dx, y: o.y0 + dy } : im;
        }),
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) scheduleSave();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [multiSelection, zoom, mutateActiveSlide, scheduleSave]);

  // Quick lookups for element renderers — true if the given element id is part
  // of the active multi-selection (so its mousedown should route to the group
  // drag instead of the single-element drag).
  const isInMultiSelection = useCallback((kind: "text" | "shape" | "image", id: string) => {
    return multiSelection.some((m) => m.kind === kind && m.id === id);
  }, [multiSelection]);

  // Alt+mousedown on an element: spawn a duplicate at the exact same position,
  // select the duplicate, and start dragging it. The original stays put. Matches
  // standard editor behaviour (Figma/Sketch/Canva). Held shift/multi-selection
  // checks have already run by the time this is called.
  const startCloneAndDrag = useCallback((kind: "text" | "shape" | "image", id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide) return;

    let origX = 0, origY = 0;
    let cloneId = "";
    if (kind === "text") {
      const orig = slide.texts.find((x) => x.id === id);
      if (!orig) return;
      const copy: TextObject = { ...orig, id: newId("t") };
      cloneId = copy.id; origX = orig.x; origY = orig.y;
      mutateActiveSlide((s) => ({ ...s, texts: [...s.texts, copy] }));
      handleTextSelect(copy.id);
    } else if (kind === "shape") {
      const orig = slide.shapes.find((x) => x.id === id);
      if (!orig) return;
      const copy: ShapeObject = { ...orig, id: newId("sh") };
      cloneId = copy.id; origX = orig.x; origY = orig.y;
      mutateActiveSlide((s) => ({ ...s, shapes: [...s.shapes, copy] }));
      handleShapeSelect(copy.id);
    } else if (kind === "image") {
      const orig = slide.images.find((x) => x.id === id);
      if (!orig) return;
      const copy: ImageObject = { ...orig, id: newId("im") };
      cloneId = copy.id; origX = orig.x; origY = orig.y;
      mutateActiveSlide((s) => ({ ...s, images: [...s.images, copy] }));
      handleImageSelect(copy.id);
    }
    if (!cloneId) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!moved && Math.hypot(dx, dy) < 1) return;
      moved = true;
      mutateActiveSlide((s) => {
        if (kind === "text") {
          return { ...s, texts: s.texts.map((t) => t.id === cloneId ? { ...t, x: origX + dx, y: origY + dy } : t) };
        }
        if (kind === "shape") {
          return { ...s, shapes: s.shapes.map((sh) => sh.id === cloneId ? { ...sh, x: origX + dx, y: origY + dy } : sh) };
        }
        return { ...s, images: s.images.map((im) => im.id === cloneId ? { ...im, x: origX + dx, y: origY + dy } : im) };
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) scheduleSave();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [zoom, mutateActiveSlide, handleTextSelect, handleShapeSelect, handleImageSelect, scheduleSave]);

  // ── Slide-level updates ───────────────────────────────────────────────────

  const updateSlide = useCallback((patch: Partial<SlideJSON>) => {
    mutateActiveSlide((s) => ({ ...s, ...patch }));
  }, [mutateActiveSlide]);

  // Auto-measure: if the current slide has a backgroundImage but no stored natural
  // dimensions (e.g. data persisted before width/height was added), load them so
  // bgMetrics can compute proper aspect-preserving cover sizing.
  const activeBgImg = slides[activeIndex]?.backgroundImage;
  const activeBgW = slides[activeIndex]?.backgroundImageWidth;
  const activeBgH = slides[activeIndex]?.backgroundImageHeight;
  useEffect(() => {
    if (!activeBgImg || (activeBgW && activeBgH)) return;
    const img = new window.Image();
    img.onload = () => {
      mutateActiveSlide((s) => {
        // Compute new pan bounds at the now-known natural dimensions and
        // clamp any existing offsets so the image still covers the slide.
        const userScale = Math.max(1, s.backgroundScale ?? 1);
        const coverScale = Math.max(
          SLIDE_W / img.naturalWidth,
          SLIDE_H / img.naturalHeight,
        );
        const scaledW = img.naturalWidth * coverScale * userScale;
        const scaledH = img.naturalHeight * coverScale * userScale;
        const maxX = Math.max(0, (scaledW - SLIDE_W) / 2);
        const maxY = Math.max(0, (scaledH - SLIDE_H) / 2);
        const cx = Math.max(-maxX, Math.min(maxX, s.backgroundOffsetX ?? 0));
        const cy = Math.max(-maxY, Math.min(maxY, s.backgroundOffsetY ?? 0));
        return {
          ...s,
          backgroundImageWidth: img.naturalWidth,
          backgroundImageHeight: img.naturalHeight,
          backgroundOffsetX: cx,
          backgroundOffsetY: cy,
        };
      });
    };
    img.src = activeBgImg;
  }, [activeBgImg, activeBgW, activeBgH, mutateActiveSlide]);

  // ── Text actions ───────────────────────────────────────────────────────────

  const addText = useCallback((preset: "heading" | "subheading" | "body", fontFamily?: string) => {
    const presets = {
      heading: { fontSize: 72, fontWeight: "700", text: "Heading" },
      subheading: { fontSize: 48, fontWeight: "600", text: "Subheading" },
      body: { fontSize: 24, fontWeight: "400", text: "Body text" },
    } as const;
    const p = presets[preset];
    const newText: TextObject = {
      id: newId("t"),
      x: SLIDE_W / 2 - 200,
      y: SLIDE_H / 2 - p.fontSize / 2,
      width: 400,
      text: p.text,
      fontSize: p.fontSize,
      fontWeight: p.fontWeight,
      fontStyle: "normal",
      underline: false,
      fontFamily: fontFamily ?? "Inter, sans-serif",
      color: "#1a1a2e",
      textAlign: "left",
    };
    mutateActiveSlide((s) => ({ ...s, texts: [...s.texts, newText] }));
    handleTextSelect(newText.id);
  }, [mutateActiveSlide, handleTextSelect]);

  const updateText = useCallback((id: string, patch: Partial<TextObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      texts: s.texts.map((t) => t.id === id ? { ...t, ...patch } : t),
    }));
  }, [mutateActiveSlide]);

  const deleteSelectedText = useCallback(() => {
    if (!selectedTextId) return;
    mutateActiveSlide((s) => ({ ...s, texts: s.texts.filter((t) => t.id !== selectedTextId) }));
    setSelectedTextId(null);
  }, [selectedTextId, mutateActiveSlide]);

  // ── Shape actions ─────────────────────────────────────────────────────────

  const addShape = useCallback((type: ShapeType) => {
    const presets: Record<ShapeType, { width: number; height: number }> = {
      rect:     { width: 300, height: 180 },
      ellipse:  { width: 240, height: 240 },
      triangle: { width: 240, height: 240 },
      line:     { width: 400, height: 4 },
      arrow:    { width: 400, height: 32 },
      star:     { width: 240, height: 240 },
      hexagon:  { width: 240, height: 220 },
      pentagon: { width: 240, height: 240 },
      octagon:  { width: 240, height: 240 },
      diamond:  { width: 240, height: 240 },
      heart:    { width: 240, height: 220 },
      cloud:    { width: 320, height: 220 },
      speech:   { width: 320, height: 240 },
      plus:     { width: 220, height: 220 },
      bolt:     { width: 180, height: 260 },
    };
    const { width: w, height: h } = presets[type];
    const isLineLike = type === "line" || type === "arrow";
    const newShape: ShapeObject = {
      id: newId("sh"),
      type,
      x: SLIDE_W / 2 - w / 2,
      y: SLIDE_H / 2 - h / 2,
      width: w, height: h,
      fill: isLineLike ? "transparent" : "#7c3aed",
      stroke: isLineLike ? "#1a1a2e" : "transparent",
      strokeWidth: isLineLike ? 4 : 0,
      opacity: 1,
      cornerRadius: type === "rect" ? 0 : undefined,
    };
    mutateActiveSlide((s) => ({ ...s, shapes: [...s.shapes, newShape] }));
    handleShapeSelect(newShape.id);
  }, [mutateActiveSlide, handleShapeSelect]);

  const updateShape = useCallback((id: string, patch: Partial<ShapeObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      shapes: s.shapes.map((x) => x.id === id ? { ...x, ...patch } : x),
    }));
  }, [mutateActiveSlide]);

  const deleteSelectedShape = useCallback(() => {
    if (!selectedShapeId) return;
    mutateActiveSlide((s) => ({ ...s, shapes: s.shapes.filter((x) => x.id !== selectedShapeId) }));
    setSelectedShapeId(null);
  }, [selectedShapeId, mutateActiveSlide]);

  // ── Image actions ─────────────────────────────────────────────────────────

  const addImage = useCallback((src: string, centerAt?: { x: number; y: number }) => {
    const img = new window.Image();
    img.onload = () => {
      const naturalW = img.naturalWidth || 400;
      const naturalH = img.naturalHeight || 300;
      // SVGs (Iconify icons, uploaded svgs) typically report tiny intrinsic sizes
      // (e.g. 24×24). Treat them as icons: place at a comfortable default size and
      // preserve aspect ratio. Raster images use the original "scale to fit" path.
      const isSvg = src.startsWith("data:image/svg+xml") || src.startsWith("data:image/svg");
      let w: number, h: number;
      if (isSvg) {
        const ICON_SIZE = 220;
        const ratio = naturalW / naturalH;
        if (ratio >= 1) { w = ICON_SIZE; h = ICON_SIZE / ratio; }
        else { h = ICON_SIZE; w = ICON_SIZE * ratio; }
      } else {
        const maxW = SLIDE_W * 0.6;
        const maxH = SLIDE_H * 0.6;
        const s = Math.min(maxW / naturalW, maxH / naturalH, 1);
        w = naturalW * s;
        h = naturalH * s;
      }
      const cx = centerAt?.x ?? SLIDE_W / 2;
      const cy = centerAt?.y ?? SLIDE_H / 2;
      const newImage: ImageObject = {
        id: newId("im"),
        x: cx - w / 2,
        y: cy - h / 2,
        width: w, height: h,
        src,
        opacity: 1,
      };
      mutateActiveSlide((s2) => ({ ...s2, images: [...s2.images, newImage] }));
      handleImageSelect(newImage.id);
    };
    img.src = src;
  }, [mutateActiveSlide, handleImageSelect]);

  const addFrame = useCallback((frame: FrameShape) => {
    const SIZE = 280;
    const newImage: ImageObject = {
      id: newId("im"),
      x: SLIDE_W / 2 - SIZE / 2,
      y: SLIDE_H / 2 - SIZE / 2,
      width: SIZE,
      height: SIZE,
      src: "",
      opacity: 1,
      frame,
    };
    mutateActiveSlide((s) => ({ ...s, images: [...s.images, newImage] }));
    handleImageSelect(newImage.id);
  }, [mutateActiveSlide, handleImageSelect]);

  const updateImage = useCallback((id: string, patch: Partial<ImageObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      images: s.images.map((x) => x.id === id ? { ...x, ...patch } : x),
    }));
  }, [mutateActiveSlide]);

  // Canvas "Swap image" → record the target image and open the Pictures tab.
  const handleSwapImage = useCallback(() => {
    if (!selectedImageId) return;
    swapTargetRef.current = selectedImageId;
    setSidebarOpenSignal({ tab: "pictures", subTab: "stock", nonce: Date.now() });
  }, [selectedImageId]);

  // Replace a target image's src in place, loading the new bytes first so we
  // can reset pan/scale and store natural dims (mirrors the old file-swap).
  const swapImageSrc = useCallback((targetId: string, src: string) => {
    const img = new window.Image();
    img.onload = () => {
      updateImage(targetId, {
        src,
        naturalWidth: img.naturalWidth || undefined,
        naturalHeight: img.naturalHeight || undefined,
        innerOffsetX: 0,
        innerOffsetY: 0,
        innerScale: 1,
      });
      scheduleSave();
    };
    img.src = src;
  }, [updateImage, scheduleSave]);

  // Sidebar image picks route through here. If a swap is pending (and the
  // target still exists on the active slide), replace it; otherwise add a new
  // image as before.
  const handleSidebarAddImage = useCallback((src: string) => {
    const targetId = swapTargetRef.current;
    if (targetId) {
      swapTargetRef.current = null;
      const exists = slidesRef.current[activeIndex]?.images?.some((im) => im.id === targetId);
      if (exists) {
        swapImageSrc(targetId, src);
        return;
      }
    }
    addImage(src);
  }, [activeIndex, swapImageSrc, addImage]);

  // Clear a pending swap if the user deselects the image first.
  useEffect(() => {
    if (!selectedImageId) swapTargetRef.current = null;
  }, [selectedImageId]);

  const deleteSelectedImage = useCallback(() => {
    if (!selectedImageId) return;
    mutateActiveSlide((s) => ({ ...s, images: s.images.filter((x) => x.id !== selectedImageId) }));
    setSelectedImageId(null);
  }, [selectedImageId, mutateActiveSlide]);

  const handleRemoveBg = useCallback(async () => {
    if (!selectedImageId || removingBg) return;
    const slide = slidesRef.current[activeIndexRef.current];
    const image = slide?.images.find((i) => i.id === selectedImageId);
    if (!image?.src) return;
    setRemovingBg(true);
    try {
      // Client-side matting via @imgly/background-removal — a U2Net/ISNet
      // ONNX model running in WASM. Free, no API cost or rate limits, and it
      // returns a true pixel cutout (not a generative re-paint like the old
      // gpt-image-1 edit, which could subtly alter the subject). Dynamically
      // imported so it stays out of the main editor bundle.
      //
      // `model: "isnet"` is the FULL-precision model (~80 MB, cached after
      // first use). The default `isnet_fp16` is quantised and leaves bright
      // foreground regions (white pages, pale skin) semi-transparent — exactly
      // the "faded" look the user hit. Full precision is markedly cleaner.
      const { removeBackground } = await import("@imgly/background-removal");
      const rawBlob = await removeBackground(image.src, {
        model: "isnet",
        output: { format: "image/png" },
      });
      // Even the full model can leave interior fill a touch translucent. Apply
      // an alpha gain that pushes near-opaque pixels to fully opaque while
      // preserving the genuinely soft edges (hair, fur) at low alpha.
      const blob = await hardenAlpha(rawBlob);
      // Persist the transparent PNG to Storage so the slide JSON keeps a small
      // URL instead of a multi-MB base64 string.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const res = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filenameHint: "rembg" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Remove background: upload failed:", err);
        // Fall back to inlining the data URL so the cutout still applies even
        // if Storage is unavailable.
        updateImage(selectedImageId, { src: dataUrl });
        return;
      }
      const { src: newSrc } = await res.json();
      if (newSrc) updateImage(selectedImageId, { src: newSrc });
    } catch (err) {
      console.error("Remove background error:", err);
    } finally {
      setRemovingBg(false);
    }
  }, [selectedImageId, removingBg, updateImage]);

  const updateAudio = useCallback((id: string, patch: Partial<AudioObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      audios: (s.audios ?? []).map((a) => a.id === id ? { ...a, ...patch } : a),
    }));
  }, [mutateActiveSlide]);

  const deleteSelectedAudio = useCallback(() => {
    if (!selectedAudioId) return;
    mutateActiveSlide((s) => ({ ...s, audios: (s.audios ?? []).filter((a) => a.id !== selectedAudioId) }));
    setSelectedAudioId(null);
  }, [selectedAudioId, mutateActiveSlide]);

  const updateVideo = useCallback((id: string, patch: Partial<VideoObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      videos: (s.videos ?? []).map((v) => v.id === id ? { ...v, ...patch } : v),
    }));
  }, [mutateActiveSlide]);

  const deleteSelectedVideo = useCallback(() => {
    if (!selectedVideoId) return;
    mutateActiveSlide((s) => ({ ...s, videos: (s.videos ?? []).filter((v) => v.id !== selectedVideoId) }));
    setSelectedVideoId(null);
  }, [selectedVideoId, mutateActiveSlide]);

  const updateCallout = useCallback((id: string, patch: Partial<CalloutObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      callouts: (s.callouts ?? []).map((c) => c.id === id ? { ...c, ...patch } : c),
    }));
  }, [mutateActiveSlide]);
  const deleteSelectedCallout = useCallback(() => {
    if (!selectedCalloutId) return;
    mutateActiveSlide((s) => ({ ...s, callouts: (s.callouts ?? []).filter((c) => c.id !== selectedCalloutId) }));
    setSelectedCalloutId(null);
  }, [selectedCalloutId, mutateActiveSlide]);

  const updateBadge = useCallback((id: string, patch: Partial<BadgeObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      badges: (s.badges ?? []).map((b) => b.id === id ? { ...b, ...patch } : b),
    }));
  }, [mutateActiveSlide]);
  const deleteSelectedBadge = useCallback(() => {
    if (!selectedBadgeId) return;
    mutateActiveSlide((s) => ({ ...s, badges: (s.badges ?? []).filter((b) => b.id !== selectedBadgeId) }));
    setSelectedBadgeId(null);
  }, [selectedBadgeId, mutateActiveSlide]);

  const updateBlockquote = useCallback((id: string, patch: Partial<BlockquoteObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      blockquotes: (s.blockquotes ?? []).map((q) => q.id === id ? { ...q, ...patch } : q),
    }));
  }, [mutateActiveSlide]);
  const deleteSelectedBlockquote = useCallback(() => {
    if (!selectedBlockquoteId) return;
    mutateActiveSlide((s) => ({ ...s, blockquotes: (s.blockquotes ?? []).filter((q) => q.id !== selectedBlockquoteId) }));
    setSelectedBlockquoteId(null);
  }, [selectedBlockquoteId, mutateActiveSlide]);

  const updateActivity = useCallback((id: string, patch: Partial<ActivityObject>) => {
    mutateActiveSlide((s) => ({
      ...s,
      activities: (s.activities ?? []).map((a) => a.id === id ? { ...a, ...patch } : a),
    }));
  }, [mutateActiveSlide]);
  const deleteSelectedActivity = useCallback(() => {
    if (!selectedActivityId) return;
    mutateActiveSlide((s) => ({ ...s, activities: (s.activities ?? []).filter((a) => a.id !== selectedActivityId) }));
    setSelectedActivityId(null);
  }, [selectedActivityId, mutateActiveSlide]);

  // "Edit video" right-side panel — owns its own URL-paste form, AI search
  // form, and result-pick UX. The Editor only holds open/close state and
  // apply callbacks that swap the chosen video into the selected slide.
  const [editVideoPanelOpen, setEditVideoPanelOpen] = useState(false);
  const applyVideoId = useCallback((videoId: string) => {
    if (!selectedVideoId) return;
    updateVideo(selectedVideoId, { source: "youtube", src: videoId });
  }, [selectedVideoId, updateVideo]);
  const applyVideoCandidate = useCallback((v: {
    videoId: string; title: string; channel?: string; description?: string;
  }) => {
    if (!selectedVideoId) return;
    updateVideo(selectedVideoId, { source: "youtube", src: v.videoId, title: v.title });
  }, [selectedVideoId, updateVideo]);

  const addVideo = useCallback((source: "youtube" | "upload", src: string, title?: string) => {
    // Default placement: centered, 640x360 (16:9). User can drag/resize after.
    const w = 640, h = 360;
    const newVid: VideoObject = {
      id: newId("v"),
      source,
      src,
      title,
      x: (SLIDE_W - w) / 2,
      y: (SLIDE_H - h) / 2,
      width: w,
      height: h,
    };
    mutateActiveSlide((s) => ({ ...s, videos: [...(s.videos ?? []), newVid] }));
    handleVideoSelect(newVid.id);
  }, [mutateActiveSlide, handleVideoSelect]);

  const removeInnerImage = useCallback(() => {
    if (!editingInnerImageId) return;
    updateImage(editingInnerImageId, {
      src: "",
      innerOffsetX: undefined,
      innerOffsetY: undefined,
      innerScale: undefined,
      naturalWidth: undefined,
      naturalHeight: undefined,
    });
    setEditingInnerImageId(null);
  }, [editingInnerImageId, updateImage]);

  // ── Z-order ───────────────────────────────────────────────────────────────
  // Reorders within the object's own array (texts/shapes/images). Note: cross-type
  // Global z-order reorder. Every element (text, shape, image, audio) carries
  // an optional `z` field. We compute the union of z's across the slide so
  // "Bring to front" actually moves the element above siblings in OTHER kinds
  // too (e.g. a shape above the text on top of it).
  const reorderSelection = useCallback((op: "front" | "back" | "forward" | "backward") => {
    mutateActiveSlide((s) => {
      // Effective z = stored z OR a baseline that mirrors the historical layer
      // order (images bottom, shapes, texts, audios on top). On the FIRST
      // reorder for a slide we persist these baseline values onto every
      // element so all of them participate in explicit zIndex ordering
      // (otherwise siblings with no stored z fall through to CSS auto = 0 and
      // the reordered element ends up in the wrong stacking position).
      const effective = (kind: "image" | "shape" | "text" | "audio", z: number | undefined, idx: number) => {
        if (typeof z === "number") return z;
        const base = kind === "image" ? 0 : kind === "shape" ? 1000 : kind === "text" ? 2000 : 3000;
        return base + idx;
      };
      const all: { kind: "image" | "shape" | "text" | "audio"; id: string; z: number }[] = [
        ...s.images.map((x, i) => ({ kind: "image" as const, id: x.id, z: effective("image", x.z, i) })),
        ...s.shapes.map((x, i) => ({ kind: "shape" as const, id: x.id, z: effective("shape", x.z, i) })),
        ...s.texts.map((x, i) => ({ kind: "text" as const, id: x.id, z: effective("text", x.z, i) })),
        ...(s.audios ?? []).map((x, i) => ({ kind: "audio" as const, id: x.id, z: effective("audio", x.z, i) })),
      ];
      const targetId = selectedTextId ?? selectedShapeId ?? selectedImageId ?? selectedAudioId;
      if (!targetId) return s;
      const target = all.find((e) => e.id === targetId);
      if (!target) return s;
      const others = all.filter((e) => e.id !== targetId);
      const sorted = others.slice().sort((a, b) => a.z - b.z);
      let newZ: number;
      if (op === "front") {
        newZ = (sorted[sorted.length - 1]?.z ?? target.z) + 1;
      } else if (op === "back") {
        newZ = (sorted[0]?.z ?? target.z) - 1;
      } else if (op === "forward") {
        const above = sorted.find((e) => e.z > target.z);
        if (!above) return s;
        newZ = above.z + 1;
      } else { // backward
        const belowList = sorted.filter((e) => e.z < target.z);
        const below = belowList[belowList.length - 1];
        if (!below) return s;
        newZ = below.z - 1;
      }
      // Build a lookup of each element's NEW z (target gets newZ; everyone
      // else keeps their effective z so the relative ordering survives).
      const zById = new Map<string, number>();
      for (const e of all) zById.set(e.id, e.id === targetId ? newZ : e.z);
      return {
        ...s,
        texts: s.texts.map((x) => ({ ...x, z: zById.get(x.id) ?? x.z })),
        shapes: s.shapes.map((x) => ({ ...x, z: zById.get(x.id) ?? x.z })),
        images: s.images.map((x) => ({ ...x, z: zById.get(x.id) ?? x.z })),
        audios: (s.audios ?? []).map((x) => ({ ...x, z: zById.get(x.id) ?? x.z })),
      };
    });
  }, [selectedTextId, selectedShapeId, selectedImageId, selectedAudioId, mutateActiveSlide]);

  // ── Duplicate ─────────────────────────────────────────────────────────────
  const duplicateSelection = useCallback(() => {
    const OFFSET = 20;
    if (selectedTextId) {
      const orig = slidesRef.current[activeIndexRef.current]?.texts.find((t) => t.id === selectedTextId);
      if (!orig) return;
      const copy: TextObject = { ...orig, id: newId("t"), x: orig.x + OFFSET, y: orig.y + OFFSET };
      mutateActiveSlide((s) => ({ ...s, texts: [...s.texts, copy] }));
      handleTextSelect(copy.id);
    } else if (selectedShapeId) {
      const orig = slidesRef.current[activeIndexRef.current]?.shapes.find((sh) => sh.id === selectedShapeId);
      if (!orig) return;
      const copy: ShapeObject = { ...orig, id: newId("sh"), x: orig.x + OFFSET, y: orig.y + OFFSET };
      mutateActiveSlide((s) => ({ ...s, shapes: [...s.shapes, copy] }));
      handleShapeSelect(copy.id);
    } else if (selectedImageId) {
      const orig = slidesRef.current[activeIndexRef.current]?.images.find((im) => im.id === selectedImageId);
      if (!orig) return;
      const copy: ImageObject = { ...orig, id: newId("im"), x: orig.x + OFFSET, y: orig.y + OFFSET };
      mutateActiveSlide((s) => ({ ...s, images: [...s.images, copy] }));
      handleImageSelect(copy.id);
    }
  }, [selectedTextId, selectedShapeId, selectedImageId, mutateActiveSlide, handleTextSelect, handleShapeSelect, handleImageSelect]);

  // ── Smart alignment snap during drag ──────────────────────────────────────
  // Snaps the proposed (x, y) of an element so its left/centerX/right or top/centerY/bottom
  // lines up with the slide edges/center or another element's edges/center, when within
  // SNAP_THRESHOLD slide-pixels. Updates the visible guide overlay state as a side effect.
  const SNAP_THRESHOLD = 5;
  const snapPosition = useCallback((
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): { x: number; y: number } => {
    const slide = slidesRef.current[activeIndexRef.current];
    if (!slide) return { x, y };

    const xTargets: number[] = [0, SLIDE_W / 2, SLIDE_W];
    const yTargets: number[] = [0, SLIDE_H / 2, SLIDE_H];

    const addBoundsX = (ox: number, ow: number) => {
      xTargets.push(ox, ox + ow / 2, ox + ow);
    };
    const addBoundsY = (oy: number, oh: number) => {
      yTargets.push(oy, oy + oh / 2, oy + oh);
    };

    for (const sh of slide.shapes) {
      if (sh.id === id || (sh.rotation ?? 0) !== 0) continue;
      addBoundsX(sh.x, sh.width);
      addBoundsY(sh.y, sh.height);
    }
    for (const im of slide.images) {
      if (im.id === id || (im.rotation ?? 0) !== 0) continue;
      addBoundsX(im.x, im.width);
      addBoundsY(im.y, im.height);
    }
    for (const t of slide.texts) {
      if (t.id === id || (t.rotation ?? 0) !== 0) continue;
      addBoundsX(t.x, t.width);
      addBoundsY(t.y, t.fontSize * 1.2);
    }

    const myXs: [string, number][] = [
      ["left", x],
      ["center", x + w / 2],
      ["right", x + w],
    ];
    const myYs: [string, number][] = [
      ["top", y],
      ["middle", y + h / 2],
      ["bottom", y + h],
    ];

    let bestDx = { d: Infinity, line: 0, myEdge: "" };
    for (const target of xTargets) {
      for (const [edge, value] of myXs) {
        const d = Math.abs(target - value);
        if (d < SNAP_THRESHOLD && d < bestDx.d) bestDx = { d, line: target, myEdge: edge };
      }
    }
    let bestDy = { d: Infinity, line: 0, myEdge: "" };
    for (const target of yTargets) {
      for (const [edge, value] of myYs) {
        const d = Math.abs(target - value);
        if (d < SNAP_THRESHOLD && d < bestDy.d) bestDy = { d, line: target, myEdge: edge };
      }
    }

    let newX = x, newY = y;
    const guideV: number[] = [];
    const guideH: number[] = [];
    if (bestDx.myEdge) {
      if (bestDx.myEdge === "left") newX = bestDx.line;
      else if (bestDx.myEdge === "center") newX = bestDx.line - w / 2;
      else if (bestDx.myEdge === "right") newX = bestDx.line - w;
      guideV.push(bestDx.line);
    }
    if (bestDy.myEdge) {
      if (bestDy.myEdge === "top") newY = bestDy.line;
      else if (bestDy.myEdge === "middle") newY = bestDy.line - h / 2;
      else if (bestDy.myEdge === "bottom") newY = bestDy.line - h;
      guideH.push(bestDy.line);
    }
    setDragGuides({ v: guideV, h: guideH });
    return { x: newX, y: newY };
  }, []);

  const clearDragGuides = useCallback(() => {
    setDragGuides({ v: [], h: [] });
  }, []);

  // ── Context menu handlers ─────────────────────────────────────────────────
  const openShapeContextMenu = useCallback((id: string, clientX: number, clientY: number) => {
    const sh = slidesRef.current[activeIndexRef.current]?.shapes.find((x) => x.id === id);
    if (!sh) return;
    setContextMenu({
      x: clientX,
      y: clientY,
      kind: "shape",
      locked: !!sh.locked,
      flipX: !!sh.flipX,
      flipY: !!sh.flipY,
      shadow: !!sh.shadow,
    });
  }, []);
  const openTextContextMenu = useCallback((id: string, clientX: number, clientY: number) => {
    const t = slidesRef.current[activeIndexRef.current]?.texts.find((x) => x.id === id);
    if (!t) return;
    setContextMenu({
      x: clientX,
      y: clientY,
      kind: "text",
      locked: !!t.locked,
    });
  }, []);
  const openImageContextMenu = useCallback((id: string, clientX: number, clientY: number) => {
    const im = slidesRef.current[activeIndexRef.current]?.images.find((x) => x.id === id);
    if (!im) return;
    setContextMenu({
      x: clientX,
      y: clientY,
      kind: "image",
      locked: !!im.locked,
      flipX: !!im.flipX,
      flipY: !!im.flipY,
      shadow: !!im.shadow,
    });
  }, []);

  // ── Nudge with arrow keys ─────────────────────────────────────────────────
  const nudgeSelection = useCallback((dx: number, dy: number) => {
    if (selectedTextId) {
      mutateActiveSlide((s) => ({
        ...s,
        texts: s.texts.map((t) => t.id === selectedTextId ? { ...t, x: t.x + dx, y: t.y + dy } : t),
      }));
    } else if (selectedShapeId) {
      mutateActiveSlide((s) => ({
        ...s,
        shapes: s.shapes.map((sh) => sh.id === selectedShapeId ? { ...sh, x: sh.x + dx, y: sh.y + dy } : sh),
      }));
    } else if (selectedImageId) {
      mutateActiveSlide((s) => ({
        ...s,
        images: s.images.map((im) => im.id === selectedImageId ? { ...im, x: im.x + dx, y: im.y + dy } : im),
      }));
    }
  }, [selectedTextId, selectedShapeId, selectedImageId, mutateActiveSlide]);

  const removeBackgroundImage = useCallback(() => {
    updateSlide({
      backgroundImage: undefined,
      backgroundImageWidth: undefined,
      backgroundImageHeight: undefined,
      backgroundOffsetX: undefined,
      backgroundOffsetY: undefined,
      backgroundScale: undefined,
    });
    setAdjustingBackground(false);
  }, [updateSlide]);

  const handleBackgroundFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const img = new window.Image();
      img.onload = () => {
        updateSlide({
          backgroundImage: dataUrl,
          backgroundImageWidth: img.naturalWidth,
          backgroundImageHeight: img.naturalHeight,
          backgroundOffsetX: 0,
          backgroundOffsetY: 0,
          backgroundScale: 1,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [updateSlide]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // While presenting, the PresentationViewer owns the keyboard (arrows,
      // space, Escape). The editor must stay out of the way — otherwise its
      // own arrow-key navigation/nudge handlers fire on the same window event
      // and fight the viewer.
      if (presenting) return;
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inField) return;
      const hasSelection = selectedTextId || selectedShapeId || selectedImageId;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (adjustingBackground) removeBackgroundImage();
        else if (multiSelection.length > 0) deleteMultiSelection();
        else if (selectedTextId) deleteSelectedText();
        else if (selectedShapeId) deleteSelectedShape();
        else if (selectedImageId) deleteSelectedImage();
        else if (selectedAudioId) deleteSelectedAudio();
        else if (selectedVideoId) deleteSelectedVideo();
      }
      // Cmd/Ctrl + Z / Shift+Z — disabled during AI generation so a stray undo
      // doesn't wipe out slides that just streamed in.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (generating) return;
        if (e.shiftKey) redo();
        else undo();
      }
      // Cmd/Ctrl + D — duplicate selection
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (hasSelection) {
          e.preventDefault();
          duplicateSelection();
        }
      }
      // Cmd/Ctrl + L — toggle lock on the currently selected element.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        if (selectedTextId) {
          const t = slidesRef.current[activeIndexRef.current]?.texts.find((x) => x.id === selectedTextId);
          if (t) { e.preventDefault(); updateText(selectedTextId, { locked: !t.locked }); }
        } else if (selectedShapeId) {
          const sh = slidesRef.current[activeIndexRef.current]?.shapes.find((x) => x.id === selectedShapeId);
          if (sh) { e.preventDefault(); updateShape(selectedShapeId, { locked: !sh.locked }); }
        } else if (selectedImageId) {
          const im = slidesRef.current[activeIndexRef.current]?.images.find((x) => x.id === selectedImageId);
          if (im) { e.preventDefault(); updateImage(selectedImageId, { locked: !im.locked }); }
        }
      }
      // Arrow keys — context-dependent:
      // - When an element is selected: nudge it (1px / 10px with Shift).
      // - Otherwise: ←/→ navigate prev/next slide.
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (hasSelection) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          nudgeSelection(dx, dy);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const total = slidesRef.current.length;
          if (total <= 1) return;
          const cur = activeIndexRef.current;
          const nextIndex = e.key === "ArrowLeft"
            ? (cur - 1 + total) % total
            : (cur + 1) % total;
          if (nextIndex === cur) return;
          setActiveIndex(nextIndex);
          clearSelection();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [presenting, selectedTextId, selectedShapeId, selectedImageId, adjustingBackground, multiSelection, deleteMultiSelection, deleteSelectedText, deleteSelectedShape, deleteSelectedImage, removeBackgroundImage, undo, redo, duplicateSelection, nudgeSelection, clearSelection, generating, updateText, updateShape, updateImage]);

  // ── Slide management ──────────────────────────────────────────────────────

  const switchSlide = useCallback((newIndex: number) => {
    if (newIndex === activeIndexRef.current) return;
    setActiveIndex(newIndex);
    clearSelection();
  }, [clearSelection]);

  const addSlide = useCallback(() => {
    const newSlide: SlideState = {
      id: newId("s"),
      shapes: [], texts: [], images: [],
      background: "#ffffff",
    };
    setSlides((prev) => {
      const next = [...prev, newSlide];
      slidesRef.current = next;
      return next;
    });
    setActiveIndex(slidesRef.current.length - 1); // newly added is last
    clearSelection();
    scheduleSave();
  }, [scheduleSave, clearSelection]);

  // AI-generated activity slide. Calls /api/generate-activity with the kind +
  // teacher-supplied config (topic, level) and inserts the resulting slide
  // after the active one. Layout is a speech-bubble "thought card" with an
  // image on the left and the AI-written body on the right — the same
  // aesthetic as the question-activity layout the deck generator emits.
  const addActivitySlide = useCallback(async (kind: ActivityKind, config: ActivityConfig) => {
    const r = await fetch("/api/generate-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        topic: config.topic,
        level: config.level,
        deckTitle: title,
        slideTitles: slidesRef.current
          .map((s) => s.texts?.[0]?.text)
          .filter((t): t is string => !!t)
          .slice(0, 8),
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || err.message || "Activity generation failed");
    }
    const data = await r.json() as {
      kind: ActivityKind;
      title: string;
      body: string;
      imageQuery: string;
      items: string[];
      answers: string[];
      options: { question: string; choices: string[]; correctIndex: number }[];
    };

    const theme = getTheme(slides[0]?.themeId ?? DEFAULT_THEME_ID);
    const palette = theme.palette;
    const stroke = palette.speechBubbleStroke ?? "#1a1a1a";

    // Build the slide. Title + thought-bubble shape + body text inside the
    // bubble. If the API returned items / options, fold them into the body
    // (one element so the teacher can edit + reorder as a normal text block).
    const composedBody = (() => {
      if (data.options?.length) {
        return data.options.map((q, i) =>
          `${i + 1}. ${q.question}\n   A) ${q.choices[0] ?? ""}\n   B) ${q.choices[1] ?? ""}\n   C) ${q.choices[2] ?? ""}\n   D) ${q.choices[3] ?? ""}`,
        ).join("\n\n");
      }
      if (data.items?.length) {
        // For vocab-match / fill-blanks / which-true / true-false etc., the
        // items go below the body prompt.
        const itemsBlock = data.items.map((it, i) => `${i + 1}. ${it}`).join("\n");
        return data.body ? `${data.body}\n\n${itemsBlock}` : itemsBlock;
      }
      return data.body;
    })();

    const titleY = 80;
    const bubbleX = 60;
    const bubbleY = 160;
    const bubbleW = SLIDE_W - 120;
    const bubbleH = SLIDE_H - bubbleY - 60;
    const bubbleBodyH = bubbleH * 0.78;
    const innerPad = 60;
    const innerX = bubbleX + innerPad;
    const innerW = bubbleW - innerPad * 2;
    const innerY = bubbleY + innerPad;
    const innerH = bubbleBodyH - innerPad * 2;

    const newSlide: SlideState = {
      id: newId("s"),
      shapes: [
        // Speech-bubble "thought card" — matches the activity-question layout.
        {
          id: newId("sh"),
          type: "speech",
          x: bubbleX, y: bubbleY, width: bubbleW, height: bubbleH,
          fill: "#ffffff",
          stroke,
          strokeWidth: 3,
          opacity: 1,
        },
      ],
      texts: [
        {
          id: newId("t"),
          x: 80, y: titleY, width: SLIDE_W - 160,
          text: data.title || "Activity",
          fontSize: 40, fontWeight: "800",
          fontStyle: "normal", underline: false,
          fontFamily: theme.fonts.heading,
          color: palette.headingColor ?? palette.accent,
          textAlign: "left",
        },
        // Body text — sits to the RIGHT of the (optional) image, vertically
        // centred within the bubble's body area.
        {
          id: newId("t"),
          x: data.imageQuery ? innerX + 240 + 36 : innerX,
          y: innerY,
          width: data.imageQuery ? innerW - 240 - 36 : innerW,
          text: composedBody,
          fontSize: 22, fontWeight: "400",
          fontStyle: "normal", underline: false,
          fontFamily: theme.fonts.body,
          color: palette.text,
          textAlign: "left",
          lineHeight: 1.4,
        },
      ],
      images: [],
      background: palette.background,
    };

    const insertAt = activeIndexRef.current + 1;
    setSlides((prev) => {
      const next = [...prev.slice(0, insertAt), newSlide, ...prev.slice(insertAt)];
      slidesRef.current = next;
      return next;
    });
    setActiveIndex(insertAt);
    clearSelection();
    scheduleSave();

    // Fetch the image in the background (if requested). When it arrives we
    // splice an ImageObject into the slide we just inserted.
    if (data.imageQuery) {
      void (async () => {
        try {
          const imgRes = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: data.imageQuery,
              style: "illustration",
              // The activity bubble image is a 240×240 square inside the
              // thought card — request square so the AI doesn't generate a
              // wide landscape that cover-crops most of itself away.
              orientation: "square",
            }),
          });
          if (!imgRes.ok) return;
          const { dataUrl } = await imgRes.json();
          if (!dataUrl) return;
          // Decode dimensions then attach. Use a square 240×240 inside the
          // bubble on the left.
          const img = new window.Image();
          img.onload = () => {
            const imageSize = 240;
            const imageX = innerX;
            const imageY = innerY + Math.max(0, (innerH - imageSize) / 2);
            const targetId = newSlide.id;
            setSlides((prev) => {
              const idx = prev.findIndex((s) => s.id === targetId);
              if (idx < 0) return prev;
              const newImage: ImageObject = {
                id: newId("im"),
                x: imageX, y: imageY, width: imageSize, height: imageSize,
                src: dataUrl, opacity: 1,
                naturalWidth: img.naturalWidth || undefined,
                naturalHeight: img.naturalHeight || undefined,
                frame: "rounded", cornerRadius: 12,
              };
              const next = prev.slice();
              next[idx] = { ...next[idx], images: [...(next[idx].images ?? []), newImage] };
              slidesRef.current = next;
              return next;
            });
            scheduleSave();
          };
          img.src = dataUrl;
        } catch {
          // Image fetch failures are non-fatal — the slide still has the body.
        }
      })();
    }
  }, [title, slides, scheduleSave, clearSelection]);

  const deleteSlide = useCallback((index: number) => {
    if (slidesRef.current.length <= 1) return;
    setSlides((prev) => {
      const next = prev.filter((_, i) => i !== index);
      slidesRef.current = next;
      return next;
    });
    const newActive = Math.min(activeIndexRef.current, slidesRef.current.length - 1);
    setActiveIndex(newActive);
    clearSelection();
    scheduleSave();
  }, [scheduleSave, clearSelection]);

  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setSlides((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      slidesRef.current = next;
      return next;
    });
    // Keep the moved slide as the active one so the user can see where it ended up.
    setActiveIndex((curActive) => {
      if (curActive === fromIndex) return toIndex;
      // If we moved a slide past curActive, indexes shift around curActive.
      if (fromIndex < curActive && toIndex >= curActive) return curActive - 1;
      if (fromIndex > curActive && toIndex <= curActive) return curActive + 1;
      return curActive;
    });
    scheduleSave();
  }, [scheduleSave]);

  const duplicateSlide = useCallback((index: number) => {
    const src = slidesRef.current[index];
    if (!src) return;
    // Deep-clone via JSON so nested arrays/objects are independent; assign new ids.
    const clone: SlideState = JSON.parse(JSON.stringify(src));
    clone.id = newId("s");
    clone.shapes = clone.shapes.map((sh) => ({ ...sh, id: newId("sh") }));
    clone.texts = clone.texts.map((t) => ({ ...t, id: newId("t") }));
    clone.images = clone.images.map((im) => ({ ...im, id: newId("im") }));
    setSlides((prev) => {
      const next = [...prev.slice(0, index + 1), clone, ...prev.slice(index + 1)];
      slidesRef.current = next;
      return next;
    });
    setActiveIndex(index + 1);
    clearSelection();
    scheduleSave();
  }, [scheduleSave, clearSelection]);

  // ── Title ──────────────────────────────────────────────────────────────────

  const handleTitleChange = (v: string) => {
    setTitle(v);
    scheduleSave();
  };

  // ── Theme switching ────────────────────────────────────────────────────────
  // Re-renders every slide that carries a `skeleton` (i.e. AI-generated slides)
  // under the new theme, preserving images and audio/video objects. Edits the
  // user has made to text content, positions, or colors WILL be overwritten —
  // that's the trade-off for true "skin" behaviour. Dedicated audio/video
  // placeholder slides are left alone since they don't have a re-renderable
  // skeleton.
  const handleThemeChange = useCallback((nextThemeId: string) => {
    const theme = getTheme(nextThemeId);
    setSlides((prev) => {
      const next = prev.map((s, i) => {
        // Audio activity slide: re-colour bg, panel, and any slide-level
        // texts so it follows the new theme.
        if ((s.audios?.length ?? 0) > 0) {
          const slideTextColor = theme.palette.text;
          return {
            ...s,
            background: theme.palette.background,
            texts: s.texts.map((t) => ({ ...t, color: slideTextColor })),
            audios: (s.audios ?? []).map((a) => ({
              ...a,
              panelBg: theme.palette.accent,
              panelInk: theme.palette.overlayText,
              playBg: theme.palette.background,
              playInk: theme.palette.text,
              headingFont: theme.fonts.heading,
            })),
            themeId: i === 0 ? nextThemeId : s.themeId,
          };
        }
        // YouTube video slide: re-colour bg + slide-level texts. The first
        // text element (heading) uses the accent for emphasis; the rest
        // (subtitle) use muted.
        if ((s.videos?.length ?? 0) > 0) {
          return {
            ...s,
            background: theme.palette.background,
            texts: s.texts.map((t, ti) => ({
              ...t,
              color: ti === 0 ? theme.palette.accent : theme.palette.muted,
              fontFamily: ti === 0 ? theme.fonts.heading : t.fontFamily,
            })),
            themeId: i === 0 ? nextThemeId : s.themeId,
          };
        }
        if (!s.skeleton) {
          // No skeleton (manual slide, audio/video, or pre-skeleton-fix deck):
          // we can't fully rebuild from scratch, but we can still sweep every
          // text element and swap its font family to the new theme's
          // heading/body font based on weight. Colours stay because users
          // might have customised them — but font swap is the visible part
          // of a theme change so we always do it.
          const newTexts = s.texts.map((t) => {
            const isHeading = parseInt(t.fontWeight, 10) >= 600;
            return {
              ...t,
              fontFamily: isHeading ? theme.fonts.heading : theme.fonts.body,
            };
          });
          return {
            ...s,
            texts: newTexts,
            themeId: i === 0 ? nextThemeId : s.themeId,
          };
        }
        // AI content slide: re-render from skeleton, preserve id.
        const rebuilt = rerenderSlideWithTheme(s, theme);
        return {
          ...rebuilt,
          id: s.id,
          themeId: i === 0 ? nextThemeId : rebuilt.themeId,
        } as SlideState;
      });
      if (next[0]) next[0] = { ...next[0], themeId: nextThemeId };
      slidesRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  // ── Zoom ───────────────────────────────────────────────────────────────────

  const handleFit = useCallback(() => {
    const v = viewportRef.current;
    if (!v) return;
    const pad = 64;
    const z = Math.min((v.clientWidth - pad) / SLIDE_W, (v.clientHeight - pad) / SLIDE_H);
    setZoom(Math.max(0.1, Math.min(z, 4)));
  }, []);

  useEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = v.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = mx + v.scrollLeft;
      const cy = my + v.scrollTop;
      const clampedDelta = Math.max(-50, Math.min(50, e.deltaY));
      setZoom((oldZoom) => {
        const newZoom = Math.max(0.1, Math.min(oldZoom * (1 - clampedDelta * 0.005), 4));
        if (newZoom === oldZoom) return oldZoom;
        const factor = newZoom / oldZoom;
        requestAnimationFrame(() => {
          v.scrollLeft = cx * factor - mx;
          v.scrollTop = cy * factor - my;
        });
        return newZoom;
      });
    };
    v.addEventListener("wheel", handleWheel, { passive: false });
    return () => v.removeEventListener("wheel", handleWheel);
  }, []);

  // ── Export PPTX ────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const pptxgenMod = await import("pptxgenjs");
      const PptxGenJS = pptxgenMod.default;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      const PPTX_W = 13.333;
      const PPTX_H = 7.5;
      const toIn = (px: number, dim: "w" | "h") => (px / (dim === "w" ? SLIDE_W : SLIDE_H)) * (dim === "w" ? PPTX_W : PPTX_H);
      const noHash = (c: string) => c.replace("#", "");

      for (const s of slidesRef.current) {
        const slide = pptx.addSlide();
        if (s.backgroundImage) {
          slide.background = s.backgroundImage.startsWith("data:")
            ? { data: s.backgroundImage }
            : { path: s.backgroundImage };
        } else if (s.background && s.background !== "#ffffff") {
          slide.background = { color: noHash(s.background) };
        }

        // Images first (background layer)
        for (const im of s.images) {
          // pptxgenjs rotate is in degrees (0-360)
          const rot = ((im.rotation ?? 0) % 360 + 360) % 360;
          slide.addImage({
            data: im.src.startsWith("data:") ? im.src : undefined,
            path: !im.src.startsWith("data:") ? im.src : undefined,
            x: toIn(im.x, "w"),
            y: toIn(im.y, "h"),
            w: toIn(im.width, "w"),
            h: toIn(im.height, "h"),
            transparency: Math.round((1 - im.opacity) * 100),
            rotate: rot || undefined,
            flipH: im.flipX || undefined,
            flipV: im.flipY || undefined,
            shadow: im.shadow ? { type: "outer", color: "000000", blur: 8, offset: 4, angle: 45, opacity: 0.4 } : undefined,
          });
        }

        // Shapes
        for (const sh of s.shapes) {
          const rot = ((sh.rotation ?? 0) % 360 + 360) % 360;
          const shapeType =
            sh.type === "rect"
              ? sh.cornerRadius && sh.cornerRadius > 0 ? "roundRect" : "rect"
              : sh.type === "ellipse"
              ? "ellipse"
              : sh.type === "triangle"
              ? "triangle"
              : sh.type === "star"
              ? "star5"
              : sh.type === "hexagon"
              ? "hexagon"
              : sh.type === "arrow"
              ? "rightArrow"
              : "line";
          const isLineLike = sh.type === "line";
          slide.addShape(shapeType, {
            x: toIn(sh.x, "w"),
            y: toIn(sh.y, "h"),
            w: toIn(sh.width, "w"),
            h: toIn(sh.height, "h"),
            fill: isLineLike ? undefined : { color: noHash(sh.fill), transparency: Math.round((1 - sh.opacity) * 100) },
            line: sh.strokeWidth > 0
              ? { color: noHash(sh.stroke), width: sh.strokeWidth / 1.333 }
              : isLineLike
              ? { color: noHash(sh.stroke) || "000000", width: (sh.strokeWidth || 4) / 1.333 }
              : { type: "none" },
            rectRadius: sh.type === "rect" && sh.cornerRadius
              ? Math.min(0.5, sh.cornerRadius / Math.min(sh.width, sh.height))
              : undefined,
            rotate: rot || undefined,
            flipH: sh.flipX || undefined,
            flipV: sh.flipY || undefined,
            shadow: sh.shadow ? { type: "outer", color: "000000", blur: 8, offset: 4, angle: 45, opacity: 0.4 } : undefined,
          });
        }

        // Texts on top
        for (const t of s.texts) {
          const rot = ((t.rotation ?? 0) % 360 + 360) % 360;
          slide.addText(t.text, {
            x: toIn(t.x, "w"),
            y: toIn(t.y, "h"),
            w: toIn(t.width, "w"),
            h: toIn(t.fontSize * 1.4 + 8, "h"),
            fontSize: Math.round((t.fontSize / 1.333) * 10) / 10,
            fontFace: t.fontFamily.split(",")[0].trim().replace(/['"]/g, ""),
            color: noHash(t.color),
            bold: parseInt(t.fontWeight) >= 600 || t.fontWeight === "bold",
            italic: t.fontStyle === "italic",
            underline: t.underline ? { style: "sng" } : undefined,
            align: t.textAlign,
            valign: "top",
            margin: 0,
            rotate: rot || undefined,
          });
        }
      }
      await pptx.writeFile({ fileName: `${titleRef.current || "presentation"}.pptx` });
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ── AI generation streaming (initial deck only) ────────────────────────────
  // When generationParams is passed in (handed off from the Generate modal via
  // sessionStorage on /tools/slideshow), open an SSE stream and append slides
  // as they arrive. The first slide replaces the initial blank deck.
  useEffect(() => {
    if (!generationParams) return;
    let cancelled = false;
    const controller = new AbortController();

    // Reveal queue — buffers incoming "slide" SSE events and surfaces them one
    // at a time with a 500 ms stagger. Without this, OpenAI's structured-output
    // response arrives in a single burst and all slides would appear simultaneously.
    type SlidePayloadType = {
      index: number; total: number; contentTotal?: number;
      slide: SlideJSON; title?: string;
      galleryImage?: { prompt: string; style?: string; dataUrl: string };
    };
    const reveal = {
      queue: [] as SlidePayloadType[],
      timer: null as ReturnType<typeof setTimeout> | null,
    };

    function processRevealItem() {
      const p = reveal.queue.shift();
      if (!p || cancelled) { reveal.timer = null; return; }
      if (p.galleryImage) {
        saveGeneratedImage(p.galleryImage)
          .then(() => setGalleryRefreshTrigger((n) => n + 1))
          .catch((err) => console.warn("Gallery save failed:", err));
      }
      setSlides((prev) => {
        // Pad-to-index model. Each slide event carries its FINAL array index
        // (audio/answer/video are reserved at fixed mid-deck positions and
        // content streams around them). Pad with empty placeholders up to
        // p.index, then set the slot. The existing placeholder's id (if any
        // — from meta seed or a previous padding pass) is preserved so the
        // tray's pop-in animation only fires the first time the slot appears.
        const next = prev.slice();
        while (next.length <= p.index) {
          next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
        }
        const placeholderId = next[p.index]?.id ?? newId("s");
        const replaced: SlideState = {
          id: placeholderId,
          shapes: p.slide.shapes ?? [],
          texts: p.slide.texts ?? [],
          images: p.slide.images ?? [],
          audios: p.slide.audios ?? [],
          videos: p.slide.videos ?? [],
          callouts: p.slide.callouts ?? [],
          badges: p.slide.badges ?? [],
          blockquotes: p.slide.blockquotes ?? [],
          activities: p.slide.activities ?? [],
          background: p.slide.background ?? "#ffffff",
          backgroundImage: p.slide.backgroundImage,
          backgroundImageWidth: p.slide.backgroundImageWidth,
          backgroundImageHeight: p.slide.backgroundImageHeight,
          backgroundOffsetX: p.slide.backgroundOffsetX,
          backgroundOffsetY: p.slide.backgroundOffsetY,
          backgroundScale: p.slide.backgroundScale,
          backgroundImagePending: p.slide.backgroundImagePending,
          skeleton: p.slide.skeleton,
          themeId: p.slide.themeId,
        };
        next[p.index] = replaced;
        slidesRef.current = next;
        return next;
      });
      setActiveIndex(p.index);
      setGenerating((prev) => ({
        current: Math.min(p.index + 1, p.total),
        total: p.total,
        title: p.title,
        slideTitles: prev?.slideTitles,
        statusMessage: undefined,
      }));
      scheduleSave();
      if (reveal.queue.length > 0) {
        // Tight stagger — the server is now streaming slides at OpenAI's
        // natural cadence (~1-3s/slide), so additional artificial delay is
        // pure waiting. 80ms keeps the "pop-in" animation perceptible.
        reveal.timer = setTimeout(processRevealItem, 80);
      } else {
        reveal.timer = null;
      }
    }

    function enqueueSlide(p: SlidePayloadType) {
      reveal.queue.push(p);
      if (!reveal.timer) {
        reveal.timer = setTimeout(processRevealItem, 30);
      }
    }

    (async () => {
      try {
        const r = await fetch("/api/generate-slideshow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generationParams),
          signal: controller.signal,
        });
        if (!r.ok || !r.body) throw new Error("Generation failed");
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let first = true;
        // [stream-debug] mark when the response headers arrived; each chunk log
        // below is relative to this. If chunks all arrive in one burst near the
        // end, the stream is being buffered before it reaches the browser.
        const tResp = Date.now();
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) console.log(`[stream-debug] +${Date.now() - tResp}ms chunk bytes=${value.length}`);
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (!raw.trim()) continue;
            let eventName = "message";
            let dataLine = "";
            for (const line of raw.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
            }
            let payload: unknown = {};
            try { payload = JSON.parse(dataLine); } catch { continue; }

            if (eventName === "meta") {
              const p = payload as { title?: string; total?: number; slideTitles?: string[] };
              if (p.title) setTitle(p.title);
              setPreMeta(false);
              // ONLY seed the placeholder on the FIRST meta event of a stream.
              // Subsequent metas would wipe in-flight slides — race-prone with
              // the reveal queue and the cause of "deck shrinks to 1-3 slides"
              // when the AI emitted a different count than budgeted. The
              // server now sends `count-correction` instead for that case.
              if (first && typeof p.total === "number" && p.total > 0) {
                const firstPlaceholder: SlideState = {
                  id: newId("s"),
                  shapes: [],
                  texts: [],
                  images: [],
                  background: "#ffffff",
                };
                setSlides([firstPlaceholder]);
                slidesRef.current = [firstPlaceholder];
                setActiveIndex(0);
                setGenerating({ current: 0, total: p.total, slideTitles: p.slideTitles });
                first = false;
              }
            } else if (eventName === "count-correction") {
              // Post-stream adjustment of the progress UI when the AI emitted
              // more/fewer slides than budgeted. Updates only `generating`;
              // never touches the slides array.
              const p = payload as { total?: number; slideTitles?: string[] };
              if (typeof p.total === "number" && p.total > 0) {
                setGenerating((prev) => ({
                  current: prev?.current ?? 0,
                  total: p.total ?? 0,
                  title: prev?.title,
                  slideTitles: p.slideTitles ?? prev?.slideTitles,
                }));
              }
            } else if (eventName === "status") {
              const p = payload as { message?: string };
              if (p.message) {
                setGenerating((prev) => prev ? { ...prev, statusMessage: p.message } : prev);
              }
            } else if (eventName === "slide") {
              // Push into the reveal queue so slides appear one at a time with
              // a 500 ms stagger (processRevealItem handles setSlides, etc.).
              enqueueSlide(payload as SlidePayloadType);
            } else if (eventName === "slide-image") {
              const p = payload as {
                index: number;
                slide: SlideJSON;
                galleryImage?: { prompt: string; style?: string; dataUrl: string };
              };
              if (p.galleryImage) {
                saveGeneratedImage(p.galleryImage)
                  .then(() => setGalleryRefreshTrigger((n) => n + 1))
                  .catch((err) => console.warn("Gallery save failed:", err));
              }
              setSlides((prev) => {
                const next = prev.slice();
                const target = next[p.index];
                if (!target) return prev;
                // Preserve the slide id (so React's key + animations stay
                // stable) and merge in the new image data.
                next[p.index] = {
                  id: target.id,
                  shapes: p.slide.shapes ?? target.shapes,
                  texts: p.slide.texts ?? target.texts,
                  images: p.slide.images ?? target.images,
                  audios: target.audios,
                  videos: target.videos,
                  // Re-rendered slide carries fresh callouts/badges/etc with
                  // any image data merged into ActivityObject.image. Prefer
                  // the new slide's arrays, fall back to the target's.
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
                  // Keep skeleton + themeId carried by the previous slide so
                  // image arrival doesn't strip the re-theming metadata.
                  skeleton: target.skeleton,
                  themeId: target.themeId,
                };
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "video") {
              const p = payload as {
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
              };
              setSlides((prev) => {
                // Title styled like every other paper-* slide: theme heading
                // colour, normal title-case, 40pt — no more giant uppercase
                // "WATCH: ..." block that sticks out from the rest of the deck.
                const titleColor = p.headingColor ?? p.titleColor ?? "#1a1a1a";
                const subtitleColor = p.mutedColor ?? "#1a1a1a";
                const headingFont = p.headingFont ?? "'Bricolage Grotesque', sans-serif";
                const bodyFont = p.bodyFont ?? "'Inter', sans-serif";
                const heading = p.video.slideHeading ?? p.video.title ?? "Watch this together";
                const subtitle = p.video.slideSubtitle ?? "Let's watch this together to deepen our understanding.";

                // Measure each text block at its width so wrapped headings
                // (long YouTube titles) push the subtitle + video below them
                // instead of overlapping. Mirrors the canvas measurement used
                // by textBbox / hit-testing.
                const blockWidth = SLIDE_W - 160;
                const titleFontSize = 40;
                const titleLH = 1.15;
                const subtitleFontSize = 22;
                const subtitleLH = 1.3;
                const titleLines = measureTextLines(
                  heading, blockWidth, titleFontSize, "800", "normal", headingFont,
                );
                const titleH = titleFontSize * titleLH * titleLines;
                const subtitleLines = measureTextLines(
                  subtitle, blockWidth, subtitleFontSize, "500", "normal", bodyFont,
                );
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
                // 16:9 player. Sized to fill what's left below the text block,
                // centered horizontally with comfortable side margins.
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
                // Preserve the slot id (reserved by video-placeholder) so the
                // tray pop-in animation doesn't re-fire on the swap.
                const placeholderId = prev[p.index]?.id ?? newId("s");
                const realSlide: SlideState = {
                  id: placeholderId,
                  shapes: [], images: [], audios: [],
                  texts: [titleText, subtitleText],
                  videos: [newVid],
                  background: p.slideBg ?? "#1a1a1a",
                };
                const next = prev.slice();
                while (next.length <= p.index) {
                  next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
                }
                next[p.index] = realSlide;
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "audio-placeholder") {
              const p = payload as {
                index: number;
                slideBg?: string;
                slideTextColor?: string;
                panelBg?: string;
                panelInk?: string;
                playBg?: string;
                playInk?: string;
                headingFont?: string;
              };
              setSlides((prev) => {
                // Pad-to-index: reserve this slot now with a pending audio
                // shimmer. The real audio data fills it via the "audio" event.
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
                const placeholderSlide: SlideState = {
                  id: newId("s"),
                  shapes: [], images: [],
                  texts: [],
                  audios: [pendingAudio],
                  background: p.slideBg ?? "#0f172a",
                };
                const next = prev.slice();
                while (next.length <= p.index) {
                  next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
                }
                next[p.index] = placeholderSlide;
                slidesRef.current = next;
                return next;
              });
            } else if (eventName === "video-placeholder") {
              const p = payload as {
                index: number;
                slideBg?: string;
                titleColor?: string;
                mutedColor?: string;
                accent?: string;
                headingFont?: string;
              };
              setSlides((prev) => {
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
                const placeholderSlide: SlideState = {
                  id: newId("s"),
                  shapes: [], images: [], audios: [],
                  texts: [],
                  videos: [pendingVideo],
                  background: p.slideBg ?? "#1a1a1a",
                };
                const next = prev.slice();
                while (next.length <= p.index) {
                  next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
                }
                next[p.index] = placeholderSlide;
                slidesRef.current = next;
                return next;
              });
            } else if (eventName === "audio-answer-placeholder") {
              const p = payload as {
                index: number;
                slideBg?: string;
                slideTextColor?: string;
                headingFont?: string;
              };
              setSlides((prev) => {
                // Reserve the answer slot — a blank shimmer until the audio
                // API returns the model answers.
                const placeholderSlide: SlideState = {
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
                const next = prev.slice();
                while (next.length <= p.index) {
                  next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
                }
                next[p.index] = placeholderSlide;
                slidesRef.current = next;
                return next;
              });
            } else if (eventName === "audio") {
              const p = payload as {
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
              };
              setSlides((prev) => {
                // The audio activity gets a dedicated slide. We lay out four
                // discrete elements so the teacher can edit any of them
                // independently: a title heading, a description, the audio
                // player bar, and a numbered questions list.
                // Slide texts use slideTextColor (palette.text) so they read
                // against the natural theme bg. Panel internals (player bar)
                // still use panelInk because they sit on the accent panel.
                const titleColor = p.audio.headingColor ?? p.audio.slideTextColor ?? "#1a1a2e";
                const bodyColor = p.audio.slideTextColor ?? "#1a1a2e";
                const headingFont = p.audio.headingFont ?? "'Bricolage Grotesque', sans-serif";
                const bodyFont = p.audio.bodyFont ?? "'Inter', sans-serif";

                // Title styled like every other paper-* slide: theme heading
                // colour, normal title-case, 44pt — no more giant 56pt black
                // uppercase that sticks out from the rest of the deck.
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

                // Numbered comprehension list — one text element with listType
                // so the teacher gets the toolbar's bullet/number controls.
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

                // Preserve the slot id (reserved by audio-placeholder) so the
                // tray's pop-in animation only fires once.
                const placeholderId = prev[p.index]?.id ?? newId("s");
                const realSlide: SlideState = {
                  id: placeholderId,
                  shapes: [], images: [],
                  texts: questionsText ? [titleText, descText, questionsText] : [titleText, descText],
                  audios: [newAudio],
                  background: p.audio.slideBg ?? "#0f172a",
                };
                const next = prev.slice();
                while (next.length <= p.index) {
                  next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
                }
                next[p.index] = realSlide;
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "audio-answers") {
              const p = payload as {
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
              };
              setSlides((prev) => {
                // Build a "Q: ... / A: ..." paired list. We render each as one
                // long text element so the teacher can edit any line and the
                // toolbar's lists work naturally.
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
                // Green ✓ badge in the top-right — same visual cue the
                // activity-ordering-answer slide uses, so the deck reads
                // consistently as "this is an answers slide".
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
                const realSlide: SlideState = {
                  id: placeholderId,
                  shapes: [checkBadge], images: [], audios: [], videos: [],
                  texts: [titleText, answersText, checkGlyph],
                  background: p.slideBg ?? "#ffffff",
                };
                const next = prev.slice();
                while (next.length <= p.index) {
                  next.push({ id: newId("s"), shapes: [], texts: [], images: [], background: "#ffffff" });
                }
                next[p.index] = realSlide;
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "complete") {
              setGenerating(null);
              setPreMeta(false);
            } else if (eventName === "error") {
              const p = payload as { message?: string };
              console.error("Stream error:", p.message);
              setGenerating(null);
              setPreMeta(false);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Generation stream failed", err);
          setGenerating(null);
          setPreMeta(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (reveal.timer) clearTimeout(reveal.timer);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationParams]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const currentSlide = slides[activeIndex];

  // Memoize the bg-image CSS url(...) string — re-creating a megabyte-sized data URL
  // template literal on every render is one of the costs of rapid color picker drags.
  const slideBgCssUrl = useMemo(
    () => currentSlide?.backgroundImage && !adjustingBackground
      ? `url(${currentSlide.backgroundImage})`
      : undefined,
    [currentSlide?.backgroundImage, adjustingBackground],
  );

  // Memoize the bgMetrics result so we don't recompute it twice in the slide-wrapper style.
  const currentBg = useMemo(
    () => (currentSlide ? bgMetrics(currentSlide) : null),
    [currentSlide, bgMetrics],
  );
  const slideEntries: SlideEntry[] = slides.map((s) => ({ id: s.id, slide: s }));

  return (
    <div className="relative flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#F1EFE3" }}>
      {/* Full-screen overlay shown while waiting for OpenAI to respond (pre-meta phase).
          Covers the whole editor so the user sees an engaging animation rather than
          a blank slide + spinner during the 10-20 second AI wait. */}
      {preMeta && (
        <div
          className="absolute inset-0 z-200 flex flex-col items-center justify-center pointer-events-none"
          style={{ backgroundColor: "#F1EFE3" }}
        >
          <SlideshowLoadingAnimation label="Planning your deck…" />
          <p className="text-xs text-gray-400 mt-3">This usually takes about 15 seconds</p>
        </div>
      )}
      <EditorTopBar
        title={title}
        onTitleChange={handleTitleChange}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        onPresent={() => setPresenting(true)}
        isExporting={isExporting}
        saveStatus={saveStatus}
        disableHistory={!!generating}
        themeId={slides[0]?.themeId ?? DEFAULT_THEME_ID}
        onThemeChange={handleThemeChange}
      />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar
          onAddShape={addShape}
          onAddText={addText}
          onAddImage={handleSidebarAddImage}
          onAddFrame={addFrame}
          onAddVideo={addVideo}
          onAddActivity={addActivitySlide}
          galleryRefreshTrigger={galleryRefreshTrigger}
          openSignal={sidebarOpenSignal}
          onAddAudioActivity={(audio) => {
            // Same layout the AI wizard uses — separate text elements + thin
            // player bar — on a brand-new slide inserted right after the
            // current one. Uses neutral defaults since no theme is in scope.
            const titleText: TextObject = {
              id: newId("t"),
              x: 80, y: 60, width: SLIDE_W - 160,
              text: (audio.title || "Audio Activity").toUpperCase(),
              fontSize: 56, fontWeight: "800",
              fontStyle: "normal", underline: false,
              fontFamily: "'Bricolage Grotesque', sans-serif",
              color: "#FFE8C8",
              textAlign: "left",
            };
            const descText: TextObject = {
              id: newId("t"),
              x: 80, y: 144, width: SLIDE_W - 160,
              text: audio.description || "Listen to the audio and answer the questions.",
              fontSize: 22, fontWeight: "500",
              fontStyle: "normal", underline: false,
              fontFamily: "'Inter', sans-serif",
              color: "#FFE8C8",
              textAlign: "left",
            };
            const playerY = 210;
            const newAudio: AudioObject = {
              id: newId("a"),
              x: 80, y: playerY,
              width: SLIDE_W - 160, height: 80,
              src: audio.src,
              title: audio.title,
              description: audio.description,
              questions: audio.questions ?? [],
              transcript: audio.transcript,
            };
            const questionsText: TextObject | null = (audio.questions?.length ?? 0) > 0 ? {
              id: newId("t"),
              x: 80, y: playerY + 80 + 40,
              width: SLIDE_W - 160,
              text: audio.questions.join("\n"),
              fontSize: 22, fontWeight: "500",
              fontStyle: "normal", underline: false,
              fontFamily: "'Inter', sans-serif",
              color: "#FFE8C8",
              textAlign: "left",
              listType: "number",
            } : null;
            const newSlide: SlideState = {
              id: newId("s"),
              shapes: [], images: [],
              texts: questionsText ? [titleText, descText, questionsText] : [titleText, descText],
              audios: [newAudio],
              background: "#0f172a",
            };
            setSlides((prev) => {
              const insertAt = Math.max(0, Math.min(activeIndexRef.current + 1, prev.length));
              const next = [...prev.slice(0, insertAt), newSlide, ...prev.slice(insertAt)];
              slidesRef.current = next;
              setActiveIndex(insertAt);
              return next;
            });
            scheduleSave();
          }}
        />
        {fontPanelOpen && selection?.kind === "text" && (
          <FontPanel
            current={selection.text.fontFamily}
            onSelect={(f) => selectedTextId && updateText(selectedTextId, { fontFamily: f })}
            onClose={() => setFontPanelOpen(false)}
          />
        )}
        <div className="flex-1 min-h-0 min-w-0 relative bg-gray-300">
          <div
            ref={viewportRef}
            className="absolute inset-0 overflow-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
            onMouseDown={handleViewportMouseDown}
          >
            <div className="min-h-full min-w-full flex items-center justify-center px-8 pt-8 pb-36">
              <div className="shrink-0" style={{ width: SLIDE_W * zoom, height: SLIDE_H * zoom }}>
                <div
                  ref={slideWrapperRef}
                  onMouseDownCapture={handleSlideMouseDownCapture}
                  onMouseDown={handleSlideMouseDown}
                  onDoubleClick={handleSlideDoubleClick}
                  onContextMenu={handleSlideContextMenu}
                  onDragOver={handleSlideDragOver}
                  onDrop={handleSlideDrop}
                  className="relative shadow-2xl"
                  style={{
                    width: SLIDE_W,
                    height: SLIDE_H,
                    backgroundColor: currentSlide?.background ?? "#ffffff",
                    // While adjusting, we render the bg as a positioned <img> so it can extend
                    // beyond the slide bounds. Otherwise use the CSS background-image fast path.
                    backgroundImage: slideBgCssUrl,
                    backgroundSize: currentSlide?.backgroundImage && currentBg
                      ? `${currentBg.scaledW}px ${currentBg.scaledH}px`
                      : "cover",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: currentSlide?.backgroundImage && currentBg
                      ? `calc(50% + ${currentBg.offsetX}px) calc(50% + ${currentBg.offsetY}px)`
                      : "center",
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    outline: adjustingBackground
                      ? "3px dashed #7c3aed"
                      : slideSelected
                      ? "2px solid #7c3aed"
                      : "none",
                    outlineOffset: 2,
                    // Clip content to the slide so elements positioned past the
                    // edges don't bleed into the surrounding workspace. Stay
                    // visible while panning the background image (that flow
                    // intentionally renders the bg extending beyond the slide).
                    overflow: adjustingBackground ? "visible" : "hidden",
                  }}
                >
                  {/* Background-image shimmer while the AI is still fetching
                      a title-cover / image-full hero photo. Beneath every element. */}
                  {currentSlide?.backgroundImagePending && !currentSlide.backgroundImage && (
                    <div className="absolute inset-0 jooma-shimmer pointer-events-none" style={{ zIndex: 0 }} />
                  )}
                  {currentSlide && currentBg && (() => {
                    const bg = currentBg;
                    const imgLeft = (SLIDE_W - bg.scaledW) / 2 + bg.offsetX;
                    const imgTop = (SLIDE_H - bg.scaledH) / 2 + bg.offsetY;
                    return (
                      <>
                        {/* While adjusting: render the bg image at full extending size + dark mask
                            outside the slide bounds, so the user sees the cropped-out part. */}
                        {adjustingBackground && currentSlide.backgroundImage && (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={currentSlide.backgroundImage}
                              alt=""
                              draggable={false}
                              style={{
                                position: "absolute",
                                left: imgLeft,
                                top: imgTop,
                                width: bg.scaledW,
                                height: bg.scaledH,
                                // Tailwind preflight applies `max-width: 100%; height: auto`
                                // to <img>. Override so the bg image can extend beyond the slide
                                // when scaled up via the corner handles.
                                maxWidth: "none",
                                maxHeight: "none",
                                pointerEvents: "none",
                                userSelect: "none",
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
                                pointerEvents: "none",
                              }}
                            />
                          </>
                        )}

                        <ImageLayer
                          images={currentSlide.images}
                          selectedId={selectedImageId}
                          zoom={zoom}
                          onSelect={handleImageSelect}
                          onUpdate={updateImage}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                          onContextMenu={openImageContextMenu}
                          editingInnerImageId={editingInnerImageId}
                          onEnterEditInner={setEditingInnerImageId}
                          onExitEditInner={exitInnerEdit}
                          onRemoveInnerImage={removeInnerImage}
                          isInMultiSelection={(id) => isInMultiSelection("image", id)}
                          onGroupDragStart={startGroupDrag}
                          onCloneAndDrag={(id, e) => startCloneAndDrag("image", id, e)}
                        />
                        <ShapeLayer
                          shapes={currentSlide.shapes}
                          selectedId={selectedShapeId}
                          zoom={zoom}
                          onSelect={handleShapeSelect}
                          onUpdate={updateShape}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                          onContextMenu={openShapeContextMenu}
                          isInMultiSelection={(id) => isInMultiSelection("shape", id)}
                          onGroupDragStart={startGroupDrag}
                          onCloneAndDrag={(id, e) => startCloneAndDrag("shape", id, e)}
                        />
                        <TextLayer
                          texts={currentSlide.texts}
                          selectedId={selectedTextId}
                          zoom={zoom}
                          onSelect={handleTextSelect}
                          onUpdate={updateText}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                          onContextMenu={openTextContextMenu}
                          isInMultiSelection={(id) => isInMultiSelection("text", id)}
                          onGroupDragStart={startGroupDrag}
                          onCloneAndDrag={(id, e) => startCloneAndDrag("text", id, e)}
                        />
                        <AudioLayer
                          audios={currentSlide.audios ?? []}
                          selectedId={selectedAudioId}
                          zoom={zoom}
                          onSelect={handleAudioSelect}
                          onUpdate={updateAudio}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                          onEdit={setEditingAudioId}
                        />
                        <VideoLayer
                          videos={currentSlide.videos ?? []}
                          selectedId={selectedVideoId}
                          zoom={zoom}
                          onSelect={handleVideoSelect}
                          onUpdate={updateVideo}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                        />
                        <CalloutLayer
                          callouts={currentSlide.callouts ?? []}
                          selectedId={selectedCalloutId}
                          zoom={zoom}
                          theme={getTheme(slides[0]?.themeId ?? DEFAULT_THEME_ID)}
                          onSelect={handleCalloutSelect}
                          onUpdate={updateCallout}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                        />
                        <BadgeLayer
                          badges={currentSlide.badges ?? []}
                          selectedId={selectedBadgeId}
                          zoom={zoom}
                          theme={getTheme(slides[0]?.themeId ?? DEFAULT_THEME_ID)}
                          onSelect={handleBadgeSelect}
                          onUpdate={updateBadge}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                        />
                        <BlockquoteLayer
                          blockquotes={currentSlide.blockquotes ?? []}
                          selectedId={selectedBlockquoteId}
                          zoom={zoom}
                          theme={getTheme(slides[0]?.themeId ?? DEFAULT_THEME_ID)}
                          onSelect={handleBlockquoteSelect}
                          onUpdate={updateBlockquote}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                        />
                        <ActivityLayer
                          activities={currentSlide.activities ?? []}
                          selectedId={selectedActivityId}
                          zoom={zoom}
                          theme={getTheme(slides[0]?.themeId ?? DEFAULT_THEME_ID)}
                          onSelect={handleActivitySelect}
                          onUpdate={updateActivity}
                          onCommit={scheduleSave}
                          onSnap={snapPosition}
                          onDragEnd={clearDragGuides}
                        />

                        {/* Alignment guides while dragging */}
                        {(dragGuides.v.length > 0 || dragGuides.h.length > 0) && (
                          <svg
                            className="absolute inset-0 pointer-events-none"
                            width={SLIDE_W}
                            height={SLIDE_H}
                            style={{ overflow: "visible", zIndex: 50 }}
                          >
                            {dragGuides.v.map((vx, i) => (
                              <line key={`v${i}`} x1={vx} y1={0} x2={vx} y2={SLIDE_H} stroke="#ec4899" strokeWidth={1} />
                            ))}
                            {dragGuides.h.map((hy, i) => (
                              <line key={`h${i}`} x1={0} y1={hy} x2={SLIDE_W} y2={hy} stroke="#ec4899" strokeWidth={1} />
                            ))}
                          </svg>
                        )}

                        {/* Marquee + multi-selection outlines */}
                        {(marquee || multiSelection.length > 0) && (
                          <svg
                            className="absolute inset-0 pointer-events-none"
                            width={SLIDE_W}
                            height={SLIDE_H}
                            style={{ overflow: "visible", zIndex: 60 }}
                          >
                            {multiSelection.map((m) => {
                              let b: { x: number; y: number; w: number; h: number } | null = null;
                              if (m.kind === "image") {
                                const im = currentSlide.images.find((x) => x.id === m.id);
                                if (im) b = { x: im.x, y: im.y, w: im.width, h: im.height };
                              } else if (m.kind === "shape") {
                                const sh = currentSlide.shapes.find((x) => x.id === m.id);
                                if (sh) b = { x: sh.x, y: sh.y, w: sh.width, h: sh.height };
                              } else if (m.kind === "text") {
                                const t = currentSlide.texts.find((x) => x.id === m.id);
                                if (t) b = textBbox(t);
                              }
                              if (!b) return null;
                              return (
                                <rect
                                  key={`${m.kind}-${m.id}`}
                                  x={b.x - 2}
                                  y={b.y - 2}
                                  width={b.w + 4}
                                  height={b.h + 4}
                                  fill="none"
                                  stroke="#7c3aed"
                                  strokeWidth={2 / zoom}
                                  rx={2}
                                />
                              );
                            })}
                            {marquee && (
                              <rect
                                x={marquee.x}
                                y={marquee.y}
                                width={marquee.w}
                                height={marquee.h}
                                fill="rgba(124, 58, 237, 0.08)"
                                stroke="#7c3aed"
                                strokeWidth={1 / zoom}
                                strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                              />
                            )}
                          </svg>
                        )}

                        {/* Drop-loading spinner at the drop point while we fetch the asset */}
                        {dropLoading && (
                          <div
                            className="absolute pointer-events-none flex items-center justify-center rounded-2xl bg-white/90 border border-violet-300 shadow-lg"
                            style={{
                              left: dropLoading.x - 60,
                              top: dropLoading.y - 60,
                              width: 120,
                              height: 120,
                              zIndex: 51,
                            }}
                          >
                            <div className="w-10 h-10 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                          </div>
                        )}

                        {/* AI generation placeholder overlay — shows on slides that are
                            still pending or actively being generated. Slides past the
                            current one are static; the active one shimmers + spins.
                            Uses opacity transition so the overlay fades out smoothly
                            when its slide's real content arrives. */}
                        {generating && (
                          <div
                            className="absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-500"
                            style={{
                              zIndex: 60,
                              backgroundColor: "rgba(255, 255, 255, 0.92)",
                              opacity: activeIndex >= generating.current ? 1 : 0,
                            }}
                          >
                            {activeIndex === generating.current && (
                              <div className="absolute inset-0 jooma-shimmer" />
                            )}
                            <div className="relative flex flex-col items-center gap-4">
                              <div className="w-14 h-14 rounded-full bg-white shadow-md border flex items-center justify-center" style={{ borderColor: "#DAD8D0" }}>
                                <div
                                  className="w-7 h-7 rounded-full border-4 animate-spin"
                                  style={{ borderColor: "#FFCC33", borderTopColor: "transparent" }}
                                />
                              </div>
                              {(() => {
                                // Only show text once we know the slide titles (post-meta).
                                // Before that the spinner stands alone so the user isn't
                                // told "designing slide 1..." while we're still planning
                                // the deck. Fades in via key+opacity transition.
                                const isCurrent = activeIndex === generating.current;
                                const slideTitle = generating.slideTitles?.[activeIndex]?.trim();
                                const label = !slideTitle
                                  ? null
                                  : isCurrent
                                  ? `Designing ${slideTitle}…`
                                  : `${slideTitle} · waiting`;
                                return (
                                  <p
                                    key={label ?? "empty"}
                                    className={`text-sm font-semibold text-gray-700 text-center px-6 max-w-md transition-opacity duration-500 ${label ? "opacity-100" : "opacity-0"}`}
                                    style={{ minHeight: "1.25rem" }}
                                  >
                                    {label ?? ""}
                                  </p>
                                );
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Adjust-mode UI on top: drag overlay covering the entire visible image,
                            rule-of-thirds grid on the slide bounds, corner handles at image corners. */}
                        {adjustingBackground && (
                          <>
                            {/* Drag-capture overlay covering full image extent */}
                            <div
                              style={{
                                position: "absolute",
                                left: imgLeft,
                                top: imgTop,
                                width: bg.scaledW,
                                height: bg.scaledH,
                                cursor: "move",
                                pointerEvents: "auto",
                              }}
                              onMouseDown={handleAdjustDragStart}
                            />
                            {/* Rule-of-thirds grid inside slide bounds */}
                            <div className="absolute inset-0 pointer-events-none">
                              <div className="absolute top-0 bottom-0" style={{ left: "33.333%", width: 1, background: "rgba(255,255,255,0.6)" }} />
                              <div className="absolute top-0 bottom-0" style={{ left: "66.666%", width: 1, background: "rgba(255,255,255,0.6)" }} />
                              <div className="absolute left-0 right-0" style={{ top: "33.333%", height: 1, background: "rgba(255,255,255,0.6)" }} />
                              <div className="absolute left-0 right-0" style={{ top: "66.666%", height: 1, background: "rgba(255,255,255,0.6)" }} />
                            </div>
                            {/* Corner handles at the IMAGE corners (extend beyond slide as image grows) */}
                            {(["nw", "ne", "sw", "se"] as const).map((pos) => {
                              const cursor = pos === "nw" || pos === "se" ? "nwse-resize" : "nesw-resize";
                              const left = pos.includes("e") ? imgLeft + bg.scaledW : imgLeft;
                              const top = pos.includes("s") ? imgTop + bg.scaledH : imgTop;
                              return (
                                <div
                                  key={pos}
                                  onMouseDown={handleScaleDragStart(pos)}
                                  style={{
                                    position: "absolute",
                                    left,
                                    top,
                                    width: 14,
                                    height: 14,
                                    background: "#ffffff",
                                    border: "2px solid #7c3aed",
                                    borderRadius: 3,
                                    cursor,
                                    pointerEvents: "auto",
                                    transform: "translate(-50%, -50%)",
                                    zIndex: 2,
                                  }}
                                />
                              );
                            })}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
          {/* Floating contextual toolbar (or adjust-mode banner) */}
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none px-4">
            <div className="pointer-events-auto max-w-full">
              {adjustingBackground ? (
                <div className="inline-flex items-center gap-3 px-4 py-2 bg-violet-600 text-white rounded-2xl shadow-lg text-sm">
                  <span className="font-medium">Drag to reposition</span>
                  <span className="opacity-60">·</span>
                  <span className="text-xs opacity-80">Drag corners to resize</span>
                  <span className="opacity-60">·</span>
                  <button
                    onClick={removeBackgroundImage}
                    className="text-xs font-semibold uppercase tracking-wide bg-white/15 hover:bg-red-500/80 px-2.5 py-1 rounded-md flex items-center gap-1"
                    title="Remove background image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                  <button
                    onClick={() => setAdjustingBackground(false)}
                    className="text-xs font-semibold uppercase tracking-wide bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-md"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <ContextualToolbar
                  selection={selection}
                  onUpdateText={(patch) => selectedTextId && updateText(selectedTextId, patch)}
                  onUpdateShape={(patch) => selectedShapeId && updateShape(selectedShapeId, patch)}
                  onUpdateImage={(patch) => selectedImageId && updateImage(selectedImageId, patch)}
                  onUpdateVideo={(patch) => selectedVideoId && updateVideo(selectedVideoId, patch)}
                  onUpdateSlide={updateSlide}
                  onDelete={() => {
                    if (selectedTextId) deleteSelectedText();
                    else if (selectedShapeId) deleteSelectedShape();
                    else if (selectedImageId) deleteSelectedImage();
                    else if (selectedVideoId) deleteSelectedVideo();
                  }}
                  onToggleLock={() => {
                    if (selection?.kind === "text" && selectedTextId) updateText(selectedTextId, { locked: !selection.text.locked });
                    else if (selection?.kind === "shape" && selectedShapeId) updateShape(selectedShapeId, { locked: !selection.shape.locked });
                    else if (selection?.kind === "image" && selectedImageId) updateImage(selectedImageId, { locked: !selection.image.locked });
                    else if (selection?.kind === "video" && selectedVideoId) updateVideo(selectedVideoId, { locked: !selection.video.locked });
                  }}
                  onOpenFontPanel={() => setFontPanelOpen(true)}
                  onOpenEditVideo={selectedVideoId ? () => setEditVideoPanelOpen(true) : undefined}
                  onRemoveBg={selectedImageId ? handleRemoveBg : undefined}
                  removingBg={removingBg}
                  onSwapImage={selectedImageId ? handleSwapImage : undefined}
                />
              )}
            </div>
          </div>
          {/* Floating slide tray */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none px-4">
            <div className="pointer-events-auto max-w-full">
              <SlideTray
                slides={slideEntries}
                activeIndex={activeIndex}
                onSelect={switchSlide}
                onAdd={addSlide}
                onDelete={deleteSlide}
                onReorder={reorderSlides}
                generatingIndex={generating?.current}
                themeId={slides[0]?.themeId ?? DEFAULT_THEME_ID}
              />
            </div>
          </div>
          <ZoomControls
            zoom={zoom}
            onChange={setZoom}
            onFit={handleFit}
            slideIndex={activeIndex}
            slideCount={slides.length}
          />

          {/* AI generation banner — visible while the SSE stream is producing slides */}
          {generating && (
            <div className="absolute top-2 right-4 z-50 pointer-events-none">
              <div
                className="inline-flex items-center gap-3 rounded-2xl border shadow-lg px-4 py-2 text-sm pointer-events-auto"
                style={{ backgroundColor: "#1a1a1a", color: "#fff", borderColor: "#1a1a1a" }}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: "#FFCC33" }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: "#FFCC33" }} />
                </span>
                <span className="font-medium">
                  {generating.statusMessage
                    ? generating.statusMessage
                    : generating.title
                    ? `Generated: ${generating.title}`
                    : "Designing your deck…"}
                </span>
                {generating.total > 0 && (
                  <span className="font-mono text-xs opacity-70">
                    {generating.current}/{generating.total}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Right-side "Edit video" panel — URL paste + AI search. Lives as a
            flex sibling so the canvas auto-shrinks when the panel is open. */}
        <VideoRegenerateModal
          open={editVideoPanelOpen}
          onClose={() => setEditVideoPanelOpen(false)}
          context={{
            deckTitle: titleRef.current?.trim() || "Lesson",
            slideTitles: slidesRef.current
              .flatMap((s) => s.texts.map((t) => t.text))
              .filter((t) => !!t?.trim())
              .slice(0, 8),
          }}
          defaults={{ length: "medium" }}
          onApplyVideoId={applyVideoId}
          onApply={applyVideoCandidate}
        />
      </div>

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onDuplicate={contextMenu.kind !== "slide" ? duplicateSelection : undefined}
          onReorder={contextMenu.kind !== "slide" ? reorderSelection : undefined}
          onToggleFlipX={
            contextMenu.kind === "shape"
              ? () => selectedShapeId && updateShape(selectedShapeId, { flipX: !contextMenu.flipX })
              : contextMenu.kind === "image"
              ? () => selectedImageId && updateImage(selectedImageId, { flipX: !contextMenu.flipX })
              : undefined
          }
          onToggleFlipY={
            contextMenu.kind === "shape"
              ? () => selectedShapeId && updateShape(selectedShapeId, { flipY: !contextMenu.flipY })
              : contextMenu.kind === "image"
              ? () => selectedImageId && updateImage(selectedImageId, { flipY: !contextMenu.flipY })
              : undefined
          }
          onToggleShadow={
            contextMenu.kind === "shape"
              ? () => selectedShapeId && updateShape(selectedShapeId, { shadow: !contextMenu.shadow })
              : contextMenu.kind === "image"
              ? () => selectedImageId && updateImage(selectedImageId, { shadow: !contextMenu.shadow })
              : undefined
          }
          onToggleLock={
            contextMenu.kind === "slide"
              ? undefined
              : () => {
                  if (contextMenu.kind === "text" && selectedTextId) updateText(selectedTextId, { locked: !contextMenu.locked });
                  else if (contextMenu.kind === "shape" && selectedShapeId) updateShape(selectedShapeId, { locked: !contextMenu.locked });
                  else if (contextMenu.kind === "image" && selectedImageId) updateImage(selectedImageId, { locked: !contextMenu.locked });
                }
          }
          onDelete={
            contextMenu.kind === "slide"
              ? undefined
              : () => {
                  if (contextMenu.kind === "text") deleteSelectedText();
                  else if (contextMenu.kind === "shape") deleteSelectedShape();
                  else if (contextMenu.kind === "image") deleteSelectedImage();
                }
          }
          onAddSlide={contextMenu.kind === "slide" ? addSlide : undefined}
          onDuplicateSlide={contextMenu.kind === "slide" ? () => duplicateSlide(activeIndexRef.current) : undefined}
          onDeleteSlide={contextMenu.kind === "slide" ? () => deleteSlide(activeIndexRef.current) : undefined}
          onChangeBackgroundImage={contextMenu.kind === "slide" ? openBackgroundFilePicker : undefined}
          onRemoveBackgroundImage={contextMenu.kind === "slide" ? removeBackgroundImage : undefined}
          onRegenerate={contextMenu.kind === "image" && selectedImageId ? () => setRegenerateTargetId(selectedImageId) : undefined}
          onClose={() => setContextMenu(null)}
        />
      )}

      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleBackgroundFile(file);
          e.target.value = "";
        }}
      />

      {regenerateTargetId && (() => {
        // Look up the slide frame the new image will replace so the AI gets
        // generated at the same aspect ratio — no more landscape images
        // squeezed into a near-square slide frame.
        const slide = slidesRef.current[activeIndexRef.current];
        const target = slide?.images.find((im) => im.id === regenerateTargetId);
        return (
          <RegenerateImageDialog
            frameWidth={target?.width}
            frameHeight={target?.height}
            onClose={() => setRegenerateTargetId(null)}
            onGenerated={({ dataUrl, prompt, style }) => {
              updateImage(regenerateTargetId, { src: dataUrl });
              saveGeneratedImage({ prompt, style, dataUrl })
                .then(() => setGalleryRefreshTrigger((n) => n + 1))
                .catch((err) => console.warn("Gallery save failed:", err));
            }}
          />
        );
      })()}

      {editingAudioId && (() => {
        // Find the audio + the slide it lives on so we can update both the
        // AudioObject's questions and the numbered text element next to it.
        const slide = slidesRef.current[activeIndexRef.current];
        const audio = slide?.audios?.find((a) => a.id === editingAudioId);
        if (!audio) return null;
        return (
          <EditAudioPanel
            onClose={() => setEditingAudioId(null)}
            onSubmit={async ({ activityType, additionalInstructions }) => {
              const res = await fetch("/api/generate-audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  topic: audio.title || "audio activity",
                  activityType,
                  additionalInstructions,
                  questionsOnly: true,
                  existingTranscript: audio.transcript ?? "",
                }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || "Failed");
              }
              const data: { title: string; description: string; questions: string[] } = await res.json();

              // Update the audio object's stored fields.
              updateAudio(editingAudioId, {
                title: data.title,
                description: data.description,
                questions: data.questions,
              });

              // Refresh the on-slide question text (the one with listType:"number").
              mutateActiveSlide((s) => ({
                ...s,
                texts: s.texts.map((t) => t.listType === "number"
                  ? { ...t, text: data.questions.join("\n") }
                  : t),
              }));
            }}
          />
        );
      })()}

      {presenting && slides.length > 0 && (
        <PresentationViewer
          slides={slides}
          startIndex={activeIndex}
          themeId={slides[0]?.themeId ?? DEFAULT_THEME_ID}
          onClose={() => setPresenting(false)}
        />
      )}
    </div>
  );
}
