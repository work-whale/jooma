"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import EditorTopBar from "./EditorTopBar";
import ContextualToolbar, { type EditorSelection } from "./ContextualToolbar";
import Sidebar from "./Sidebar";
import SlideTray, { type SlideEntry } from "./SlideTray";
import TextLayer from "./TextLayer";
import ShapeLayer from "./ShapeLayer";
import ImageLayer from "./ImageLayer";
import AudioLayer from "./AudioLayer";
import VideoLayer from "./VideoLayer";
import ZoomControls from "./ZoomControls";
import FontPanel from "./FontPanel";
import ContextMenu, { type ContextMenuState } from "./ContextMenu";
import RegenerateImageDialog from "./RegenerateImageDialog";
import EditAudioPanel, { type ActivityType } from "./EditAudioPanel";
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
} from "@/app/lib/presentations";
import { saveGeneratedImage } from "@/app/lib/generatedImages";

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
  includeAudio?: boolean;
  imageSource?: "auto" | "ai" | "web";
  imageStyle?: "storybook" | "illustration" | "photographic" | "painted" | "line-drawing" | "comic-book";
}

interface Props {
  presentation: Presentation;
  generationParams?: GenerationParams;
}

const HISTORY_MAX = 50;

export default function Editor({ presentation, generationParams }: Props) {
  const [title, setTitle] = useState(presentation.title);
  const [slides, setSlides] = useState<SlideState[]>(() => {
    const src = presentation.slides?.length ? presentation.slides : [BLANK_SLIDE];
    return src.map((s) => ({
      id: newId("s"),
      shapes: s.shapes ?? [],
      texts: s.texts ?? [],
      images: s.images ?? [],
      audios: s.audios ?? [],
      videos: s.videos ?? [],
      background: s.background ?? "#ffffff",
      backgroundImage: s.backgroundImage,
      backgroundImageWidth: s.backgroundImageWidth,
      backgroundImageHeight: s.backgroundImageHeight,
      backgroundOffsetX: s.backgroundOffsetX,
      backgroundOffsetY: s.backgroundOffsetY,
      backgroundScale: s.backgroundScale,
    }));
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  // Audio id whose "Edit audio" side panel is currently open (null when closed).
  const [editingAudioId, setEditingAudioId] = useState<string | null>(null);
  const [slideSelected, setSlideSelected] = useState(false);
  const [adjustingBackground, setAdjustingBackground] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [zoom, setZoom] = useState(1);
  const [fontPanelOpen, setFontPanelOpen] = useState(false);
  const [dragGuides, setDragGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Image id currently being regenerated via the AI dialog (null when closed).
  const [regenerateTargetId, setRegenerateTargetId] = useState<string | null>(null);
  const [editingInnerImageId, setEditingInnerImageId] = useState<string | null>(null);
  const [dropLoading, setDropLoading] = useState<{ x: number; y: number } | null>(null);
  const [generating, setGenerating] = useState<{ current: number; total: number; title?: string; slideTitles?: string[] } | null>(
    generationParams ? { current: 0, total: generationParams.slideCount ?? 0 } : null,
  );
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
    if (id) { setSelectedShapeId(null); setSelectedImageId(null); setSelectedAudioId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleShapeSelect = useCallback((id: string | null) => {
    setSelectedShapeId(id);
    if (id) { setSelectedTextId(null); setSelectedImageId(null); setSelectedAudioId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleImageSelect = useCallback((id: string | null) => {
    setSelectedImageId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSelectedAudioId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleAudioSelect = useCallback((id: string | null) => {
    setSelectedAudioId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSelectedImageId(null); setSelectedVideoId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

  const handleVideoSelect = useCallback((id: string | null) => {
    setSelectedVideoId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSelectedImageId(null); setSelectedAudioId(null); setSlideSelected(false); setMultiSelection([]); }
  }, []);

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
    setSlideSelected(false);
    setMultiSelection([]);
  }, []);

  // Bbox helper — text has no stored height, so estimate from font-size × lines.
  const textBbox = (t: TextObject) => {
    const lines = (t.text.match(/\n/g)?.length ?? 0) + 1;
    return { x: t.x, y: t.y, w: t.width, h: Math.max(t.fontSize * 1.4 * lines, t.fontSize * 1.4) };
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
        background: s.background,
        backgroundImage: s.backgroundImage,
        backgroundImageWidth: s.backgroundImageWidth,
        backgroundImageHeight: s.backgroundImageHeight,
        backgroundOffsetX: s.backgroundOffsetX,
        backgroundOffsetY: s.backgroundOffsetY,
        backgroundScale: s.backgroundScale,
      }));
      await updatePresentation(presentation.id, {
        title: titleRef.current,
        slides: payload,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (err) {
      // Supabase error objects have non-enumerable fields — pluck them out
      // explicitly so we actually see what failed.
      const e = err as { message?: string; code?: string; details?: string; hint?: string };
      console.error("Save failed:", {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
        raw: err,
      });
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

  const deleteSelectedImage = useCallback(() => {
    if (!selectedImageId) return;
    mutateActiveSlide((s) => ({ ...s, images: s.images.filter((x) => x.id !== selectedImageId) }));
    setSelectedImageId(null);
  }, [selectedImageId, mutateActiveSlide]);

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
  }, [selectedTextId, selectedShapeId, selectedImageId, adjustingBackground, multiSelection, deleteMultiSelection, deleteSelectedText, deleteSelectedShape, deleteSelectedImage, removeBackgroundImage, undo, redo, duplicateSelection, nudgeSelection, clearSelection, generating, updateText, updateShape, updateImage]);

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
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
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
              if (typeof p.total === "number" && p.total > 0) {
                // Seed just ONE placeholder for slot 0 so the tray starts small.
                // Each `slide` event below will replace the current placeholder
                // and append a fresh one for the next slot, so the tray "grows"
                // one card at a time with the CSS pop-in animation.
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
            } else if (eventName === "slide") {
              const p = payload as {
                index: number;
                total: number;
                slide: SlideJSON;
                title?: string;
                galleryImage?: { prompt: string; style?: string; dataUrl: string };
              };
              // Persist AI-generated slide images into the cross-project gallery
              // so they can be searched and re-used on other slideshows. Web
              // (Pixabay) images are skipped server-side.
              if (p.galleryImage) {
                saveGeneratedImage(p.galleryImage)
                  .then(() => setGalleryRefreshTrigger((n) => n + 1))
                  .catch((err) => console.warn("Gallery save failed:", err));
              }
              setSlides((prev) => {
                const next = prev.slice();
                const placeholderId = prev[p.index]?.id ?? newId("s");
                const replaced: SlideState = {
                  id: placeholderId,           // preserve id so React keeps the DOM node + animates
                  shapes: p.slide.shapes ?? [],
                  texts: p.slide.texts ?? [],
                  images: p.slide.images ?? [],
                  background: p.slide.background ?? "#ffffff",
                  backgroundImage: p.slide.backgroundImage,
                  backgroundImageWidth: p.slide.backgroundImageWidth,
                  backgroundImageHeight: p.slide.backgroundImageHeight,
                  backgroundOffsetX: p.slide.backgroundOffsetX,
                  backgroundOffsetY: p.slide.backgroundOffsetY,
                  backgroundScale: p.slide.backgroundScale,
                  backgroundImagePending: p.slide.backgroundImagePending,
                };
                if (p.index < next.length) next[p.index] = replaced;
                else next.push(replaced);
                // Grow the deck progressively: as soon as we have a real slide
                // for slot N and the deck has fewer than `total` cards, append
                // one fresh placeholder so the user sees slide N+1's loader
                // pop in. CSS animation on the slide-tray thumbs handles the
                // visual reveal.
                if (next.length < p.total && p.index + 1 >= next.length) {
                  next.push({
                    id: newId("s"),
                    shapes: [],
                    texts: [],
                    images: [],
                    background: "#ffffff",
                  });
                }
                slidesRef.current = next;
                return next;
              });
              setActiveIndex(p.index);
              // Advance the "currently generating" pointer to the next slide.
              setGenerating((prev) => ({
                current: Math.min(p.index + 1, p.total),
                total: p.total,
                title: p.title,
                slideTitles: prev?.slideTitles,
              }));
              scheduleSave();
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
                  background: p.slide.background ?? target.background,
                  backgroundImage: p.slide.backgroundImage,
                  backgroundImageWidth: p.slide.backgroundImageWidth,
                  backgroundImageHeight: p.slide.backgroundImageHeight,
                  backgroundOffsetX: p.slide.backgroundOffsetX,
                  backgroundOffsetY: p.slide.backgroundOffsetY,
                  backgroundScale: p.slide.backgroundScale,
                  backgroundImagePending: p.slide.backgroundImagePending,
                };
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "video") {
              const p = payload as {
                targetIndex: number;
                video: { videoId: string; title: string; channel: string; description: string };
                slideBg?: string;
                titleColor?: string;
                mutedColor?: string;
                accent?: string;
                headingFont?: string;
              };
              setSlides((prev) => {
                // Dedicated slide for the YouTube video: big title + channel +
                // the iframe sitting beneath them. Insert after `targetIndex`
                // so it doesn't overlap an existing content slide.
                const titleColor = p.titleColor ?? "#1a1a1a";
                const mutedColor = p.mutedColor ?? "#5b6478";
                const headingFont = p.headingFont ?? "'Bricolage Grotesque', sans-serif";

                const titleText: TextObject = {
                  id: newId("t"),
                  x: 80, y: 60, width: SLIDE_W - 160,
                  text: p.video.title,
                  fontSize: 44, fontWeight: "800",
                  fontStyle: "normal", underline: false,
                  fontFamily: headingFont,
                  color: titleColor,
                  textAlign: "left",
                };
                const channelText: TextObject = {
                  id: newId("t"),
                  x: 80, y: 130, width: SLIDE_W - 160,
                  text: `Watch on YouTube · ${p.video.channel}`,
                  fontSize: 18, fontWeight: "500",
                  fontStyle: "normal", underline: false,
                  fontFamily: "'Inter', sans-serif",
                  color: mutedColor,
                  textAlign: "left",
                };
                // 16:9 video player taking most of the slide width.
                const vidW = SLIDE_W - 160;
                const vidH = Math.round(vidW * 9 / 16);
                const newVid: VideoObject = {
                  id: newId("v"),
                  source: "youtube",
                  src: p.video.videoId,
                  title: p.video.title,
                  x: 80,
                  y: 180,
                  width: vidW,
                  height: Math.min(vidH, SLIDE_H - 220),
                };
                const newSlide: SlideState = {
                  id: newId("s"),
                  shapes: [], images: [], audios: [],
                  texts: [titleText, channelText],
                  videos: [newVid],
                  background: p.slideBg ?? "#ffffff",
                };
                const insertAt = Math.max(0, Math.min(p.targetIndex + 1, prev.length));
                const next = [...prev.slice(0, insertAt), newSlide, ...prev.slice(insertAt)];
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "audio") {
              const p = payload as {
                targetIndex: number;
                audio: {
                  src: string; title: string; description: string;
                  transcript?: string; questions: string[];
                  panelBg?: string; panelInk?: string;
                  playBg?: string; playInk?: string;
                  headingFont?: string;
                  slideBg?: string;
                };
              };
              setSlides((prev) => {
                // The audio activity gets a dedicated slide. We lay out four
                // discrete elements so the teacher can edit any of them
                // independently: a title heading, a description, the audio
                // player bar, and a numbered questions list.
                const titleColor = p.audio.panelInk ?? "#FFE8C8";
                const headingFont = p.audio.headingFont ?? "'Bricolage Grotesque', sans-serif";

                const titleText: TextObject = {
                  id: newId("t"),
                  x: 80, y: 60, width: SLIDE_W - 160,
                  text: (p.audio.title || "Audio Activity").toUpperCase(),
                  fontSize: 56, fontWeight: "800",
                  fontStyle: "normal", underline: false,
                  fontFamily: headingFont,
                  color: titleColor,
                  textAlign: "left",
                };
                const descText: TextObject = {
                  id: newId("t"),
                  x: 80, y: 144, width: SLIDE_W - 160,
                  text: p.audio.description || "Listen to the audio and answer the questions.",
                  fontSize: 22, fontWeight: "500",
                  fontStyle: "normal", underline: false,
                  fontFamily: "'Inter', sans-serif",
                  color: titleColor,
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
                  fontFamily: "'Inter', sans-serif",
                  color: titleColor,
                  textAlign: "left",
                  listType: "number",
                } : null;

                const newSlide: SlideState = {
                  id: newId("s"),
                  shapes: [], images: [],
                  texts: questionsText ? [titleText, descText, questionsText] : [titleText, descText],
                  audios: [newAudio],
                  background: p.audio.slideBg ?? "#0f172a",
                };
                const insertAt = Math.max(0, Math.min(p.targetIndex + 1, prev.length));
                const next = [...prev.slice(0, insertAt), newSlide, ...prev.slice(insertAt)];
                slidesRef.current = next;
                return next;
              });
              scheduleSave();
            } else if (eventName === "complete") {
              setGenerating(null);
            } else if (eventName === "error") {
              const p = payload as { message?: string };
              console.error("Stream error:", p.message);
              setGenerating(null);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Generation stream failed", err);
          setGenerating(null);
        }
      }
    })();

    return () => {
      cancelled = true;
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
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#F1EFE3" }}>
      <EditorTopBar
        title={title}
        onTitleChange={handleTitleChange}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        isExporting={isExporting}
        saveStatus={saveStatus}
        disableHistory={!!generating}
      />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar
          onAddShape={addShape}
          onAddText={addText}
          onAddImage={addImage}
          onAddFrame={addFrame}
          onAddVideo={addVideo}
          galleryRefreshTrigger={galleryRefreshTrigger}
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
                                if (t) {
                                  const lines = (t.text.match(/\n/g)?.length ?? 0) + 1;
                                  b = { x: t.x, y: t.y, w: t.width, h: Math.max(t.fontSize * 1.4 * lines, t.fontSize * 1.4) };
                                }
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
              />
            </div>
          </div>
          <ZoomControls zoom={zoom} onChange={setZoom} onFit={handleFit} />

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
                  {generating.title ? `Generated: ${generating.title}` : "Designing your deck…"}
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

      {regenerateTargetId && (
        <RegenerateImageDialog
          onClose={() => setRegenerateTargetId(null)}
          onGenerated={({ dataUrl, prompt, style }) => {
            updateImage(regenerateTargetId, { src: dataUrl });
            saveGeneratedImage({ prompt, style, dataUrl })
              .then(() => setGalleryRefreshTrigger((n) => n + 1))
              .catch((err) => console.warn("Gallery save failed:", err));
          }}
        />
      )}

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
    </div>
  );
}
