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
import ZoomControls from "./ZoomControls";
import FontPanel from "./FontPanel";
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
} from "@/app/lib/presentations";

interface SlideState extends SlideJSON {
  id: string;
}

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface Props {
  presentation: Presentation;
}

const HISTORY_MAX = 50;

export default function Editor({ presentation }: Props) {
  const [title, setTitle] = useState(presentation.title);
  const [slides, setSlides] = useState<SlideState[]>(() => {
    const src = presentation.slides?.length ? presentation.slides : [BLANK_SLIDE];
    return src.map((s) => ({
      id: newId("s"),
      shapes: s.shapes ?? [],
      texts: s.texts ?? [],
      images: s.images ?? [],
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
  const [slideSelected, setSlideSelected] = useState(false);
  const [adjustingBackground, setAdjustingBackground] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [zoom, setZoom] = useState(1);
  const [fontPanelOpen, setFontPanelOpen] = useState(false);

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

  const undo = useCallback(() => {
    if (historyIndex.current <= 0) return;
    historyIndex.current--;
    const restored = JSON.parse(history.current[historyIndex.current]) as SlideState[];
    suppressHistory.current = true;
    setSlides(restored);
    slidesRef.current = restored;
    queueMicrotask(() => { suppressHistory.current = false; });
    scheduleSave();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const redo = useCallback(() => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current++;
    const restored = JSON.parse(history.current[historyIndex.current]) as SlideState[];
    suppressHistory.current = true;
    setSlides(restored);
    slidesRef.current = restored;
    queueMicrotask(() => { suppressHistory.current = false; });
    scheduleSave();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection coordination ────────────────────────────────────────────────

  const handleTextSelect = useCallback((id: string | null) => {
    setSelectedTextId(id);
    if (id) { setSelectedShapeId(null); setSelectedImageId(null); setSlideSelected(false); }
  }, []);

  const handleShapeSelect = useCallback((id: string | null) => {
    setSelectedShapeId(id);
    if (id) { setSelectedTextId(null); setSelectedImageId(null); setSlideSelected(false); }
  }, []);

  const handleImageSelect = useCallback((id: string | null) => {
    setSelectedImageId(id);
    if (id) { setSelectedTextId(null); setSelectedShapeId(null); setSlideSelected(false); }
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
    if (slideSelected) return { kind: "slide", slide };
    return null;
  }, [selectedTextId, selectedShapeId, selectedImageId, slideSelected, slides, activeIndex]);

  const clearSelection = useCallback(() => {
    setSelectedTextId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    setSlideSelected(false);
  }, []);

  const handleSlideMouseDown = (e: React.MouseEvent) => {
    // Only when the user clicked the slide background itself, not an element on it.
    if (e.target === slideWrapperRef.current) {
      setSelectedTextId(null);
      setSelectedShapeId(null);
      setSelectedImageId(null);
      setSlideSelected(true);
    }
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
    // Push history at save time — one entry per "session" of related changes (the 1s debounce
    // groups rapid mousemoves and color-picker ticks into one undo step).
    pushHistory(slidesRef.current);
    setSaveStatus("saving");
    try {
      const payload: SlideJSON[] = slidesRef.current.map((s) => ({
        shapes: s.shapes,
        texts: s.texts,
        images: s.images,
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
      console.error("Save failed:", err);
      setSaveStatus("error");
    }
  }, [presentation.id, pushHistory]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(), 1000);
  }, [persist]);

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

  const addText = useCallback((preset: "heading" | "subheading" | "body") => {
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
      fontFamily: "Inter, sans-serif",
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
    };
    const { width: w, height: h } = presets[type];
    const newShape: ShapeObject = {
      id: newId("sh"),
      type,
      x: SLIDE_W / 2 - w / 2,
      y: SLIDE_H / 2 - h / 2,
      width: w, height: h,
      fill: type === "line" ? "transparent" : "#7c3aed",
      stroke: type === "line" ? "#1a1a2e" : "transparent",
      strokeWidth: type === "line" ? 4 : 0,
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

  const addImage = useCallback((src: string) => {
    const img = new window.Image();
    img.onload = () => {
      const naturalW = img.naturalWidth || 400;
      const naturalH = img.naturalHeight || 300;
      const maxW = SLIDE_W * 0.6;
      const maxH = SLIDE_H * 0.6;
      const s = Math.min(maxW / naturalW, maxH / naturalH, 1);
      const w = naturalW * s;
      const h = naturalH * s;
      const newImage: ImageObject = {
        id: newId("im"),
        x: SLIDE_W / 2 - w / 2,
        y: SLIDE_H / 2 - h / 2,
        width: w, height: h,
        src,
        opacity: 1,
      };
      mutateActiveSlide((s2) => ({ ...s2, images: [...s2.images, newImage] }));
      handleImageSelect(newImage.id);
    };
    img.src = src;
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

  // Keyboard delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (adjustingBackground) removeBackgroundImage();
        else if (selectedTextId) deleteSelectedText();
        else if (selectedShapeId) deleteSelectedShape();
        else if (selectedImageId) deleteSelectedImage();
      }
      // Cmd/Ctrl + Z / Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedTextId, selectedShapeId, selectedImageId, adjustingBackground, deleteSelectedText, deleteSelectedShape, deleteSelectedImage, removeBackgroundImage, undo, redo]);

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
          slide.addImage({
            data: im.src.startsWith("data:") ? im.src : undefined,
            path: !im.src.startsWith("data:") ? im.src : undefined,
            x: toIn(im.x, "w"),
            y: toIn(im.y, "h"),
            w: toIn(im.width, "w"),
            h: toIn(im.height, "h"),
            transparency: Math.round((1 - im.opacity) * 100),
          });
        }

        // Shapes
        for (const sh of s.shapes) {
          const shapeType =
            sh.type === "rect"
              ? sh.cornerRadius && sh.cornerRadius > 0 ? "roundRect" : "rect"
              : sh.type === "ellipse"
              ? "ellipse"
              : sh.type === "triangle"
              ? "triangle"
              : "line";
          slide.addShape(shapeType, {
            x: toIn(sh.x, "w"),
            y: toIn(sh.y, "h"),
            w: toIn(sh.width, "w"),
            h: toIn(sh.height, "h"),
            fill: sh.type === "line" ? undefined : { color: noHash(sh.fill), transparency: Math.round((1 - sh.opacity) * 100) },
            line: sh.strokeWidth > 0
              ? { color: noHash(sh.stroke), width: sh.strokeWidth / 1.333 }
              : sh.type === "line"
              ? { color: noHash(sh.stroke) || "000000", width: (sh.strokeWidth || 4) / 1.333 }
              : { type: "none" },
            rectRadius: sh.type === "rect" && sh.cornerRadius
              ? Math.min(0.5, sh.cornerRadius / Math.min(sh.width, sh.height))
              : undefined,
          });
        }

        // Texts on top
        for (const t of s.texts) {
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
      />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar
          onAddShape={addShape}
          onAddText={addText}
          onAddImage={addImage}
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
                  onMouseDown={handleSlideMouseDown}
                  onDoubleClick={handleSlideDoubleClick}
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
                        />
                        <ShapeLayer
                          shapes={currentSlide.shapes}
                          selectedId={selectedShapeId}
                          zoom={zoom}
                          onSelect={handleShapeSelect}
                          onUpdate={updateShape}
                          onCommit={scheduleSave}
                        />
                        <TextLayer
                          texts={currentSlide.texts}
                          selectedId={selectedTextId}
                          zoom={zoom}
                          onSelect={handleTextSelect}
                          onUpdate={updateText}
                          onCommit={scheduleSave}
                        />

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
                  onUpdateSlide={updateSlide}
                  onDelete={() => {
                    if (selectedTextId) deleteSelectedText();
                    else if (selectedShapeId) deleteSelectedShape();
                    else if (selectedImageId) deleteSelectedImage();
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
              />
            </div>
          </div>
          <ZoomControls zoom={zoom} onChange={setZoom} onFit={handleFit} />
        </div>
      </div>
    </div>
  );
}
