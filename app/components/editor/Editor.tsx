"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import EditorTopBar from "./EditorTopBar";
import ContextualToolbar from "./ContextualToolbar";
import Sidebar from "./Sidebar";
import SlideTray, { type SlideEntry } from "./SlideTray";
import type { CanvasHandle, FabricSelection } from "./Canvas";
import { updatePresentation, type Presentation, type SlideJSON } from "@/app/lib/presentations";

const Canvas = dynamic(() => import("./Canvas"), { ssr: false });

interface SlideState {
  id: string;
  json: SlideJSON;
  thumbnail: string | null;
}

const BLANK_SLIDE: SlideJSON = { background: "#ffffff", objects: [], version: "7.0.0" };

const newSlideId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface Props {
  presentation: Presentation;
}

export default function Editor({ presentation }: Props) {
  const canvasRef = useRef<CanvasHandle>(null);

  const [title, setTitle] = useState(presentation.title);
  const [slides, setSlides] = useState<SlideState[]>(() =>
    (presentation.slides?.length ? presentation.slides : [BLANK_SLIDE]).map((s) => ({
      id: newSlideId(),
      json: s,
      thumbnail: null,
    })),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [selection, setSelection] = useState<FabricSelection>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const slidesRef = useRef(slides);
  const activeIndexRef = useRef(activeIndex);
  const titleRef = useRef(title);
  const canvasReady = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => { slidesRef.current = slides; }, [slides]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { titleRef.current = title; }, [title]);

  // ── Persistence ────────────────────────────────────────────────────────────

  const persist = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveStatus("saving");
    try {
      // Snapshot the live canvas into the active slide before saving
      if (canvasRef.current && canvasReady.current) {
        const json = canvasRef.current.toJSON() as SlideJSON;
        const idx = activeIndexRef.current;
        slidesRef.current = slidesRef.current.map((s, i) => (i === idx ? { ...s, json } : s));
        setSlides(slidesRef.current);
      }
      await updatePresentation(presentation.id, {
        title: titleRef.current,
        slides: slidesRef.current.map((s) => s.json),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
    }
  }, [presentation.id]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { persist(); }, 1000);
  }, [persist]);

  // Save on unload
  useEffect(() => {
    const handler = () => { if (dirtyRef.current) persist(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [persist]);

  // ── Thumbnail capture ──────────────────────────────────────────────────────

  const captureThumbnail = useCallback((index: number) => {
    const dataUrl = canvasRef.current?.toDataURL(0.25);
    if (!dataUrl) return;
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, thumbnail: dataUrl } : s)));
  }, []);

  // ── Canvas events ──────────────────────────────────────────────────────────

  const handleCanvasReady = useCallback(() => {
    canvasReady.current = true;
    canvasRef.current?.loadJSON(slidesRef.current[activeIndexRef.current].json).then(() => {
      captureThumbnail(activeIndexRef.current);
    });
  }, [captureThumbnail]);

  const handleCanvasChange = useCallback(() => {
    if (!canvasReady.current) return;
    // Snapshot the current canvas into the active slide
    const json = canvasRef.current?.toJSON() as SlideJSON;
    if (!json) return;
    const idx = activeIndexRef.current;
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, json } : s)));
    // Update thumbnail (lightweight)
    captureThumbnail(idx);
    scheduleSave();
  }, [captureThumbnail, scheduleSave]);

  // ── Slide management ──────────────────────────────────────────────────────

  const switchSlide = useCallback(async (newIndex: number) => {
    if (newIndex === activeIndexRef.current) return;
    // Save current slide JSON before switching
    if (canvasRef.current && canvasReady.current) {
      const json = canvasRef.current.toJSON() as SlideJSON;
      const idx = activeIndexRef.current;
      slidesRef.current = slidesRef.current.map((s, i) => (i === idx ? { ...s, json } : s));
      setSlides(slidesRef.current);
      captureThumbnail(idx);
    }
    setActiveIndex(newIndex);
    setSelection(null);
    await canvasRef.current?.loadJSON(slidesRef.current[newIndex].json);
    captureThumbnail(newIndex);
  }, [captureThumbnail]);

  const addSlide = useCallback(async () => {
    // Save current
    if (canvasRef.current && canvasReady.current) {
      const json = canvasRef.current.toJSON() as SlideJSON;
      const idx = activeIndexRef.current;
      slidesRef.current = slidesRef.current.map((s, i) => (i === idx ? { ...s, json } : s));
    }
    const newSlide: SlideState = { id: newSlideId(), json: BLANK_SLIDE, thumbnail: null };
    const next = [...slidesRef.current, newSlide];
    slidesRef.current = next;
    setSlides(next);
    const newIdx = next.length - 1;
    setActiveIndex(newIdx);
    setSelection(null);
    await canvasRef.current?.loadJSON(BLANK_SLIDE);
    captureThumbnail(newIdx);
    scheduleSave();
  }, [captureThumbnail, scheduleSave]);

  const deleteSlide = useCallback(async (index: number) => {
    if (slidesRef.current.length <= 1) return;
    const next = slidesRef.current.filter((_, i) => i !== index);
    slidesRef.current = next;
    setSlides(next);
    const newActive = Math.min(activeIndexRef.current, next.length - 1);
    setActiveIndex(newActive);
    setSelection(null);
    await canvasRef.current?.loadJSON(next[newActive].json);
    scheduleSave();
  }, [scheduleSave]);

  // ── Title ──────────────────────────────────────────────────────────────────

  const handleTitleChange = (v: string) => {
    setTitle(v);
    scheduleSave();
  };

  // ── Export PPTX ────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // Persist current slide first
      if (canvasRef.current && canvasReady.current) {
        const json = canvasRef.current.toJSON() as SlideJSON;
        const idx = activeIndexRef.current;
        slidesRef.current = slidesRef.current.map((s, i) => (i === idx ? { ...s, json } : s));
      }

      const pptxgenMod = await import("pptxgenjs");
      const PptxGenJS = pptxgenMod.default;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";

      const originalIndex = activeIndexRef.current;
      for (let i = 0; i < slidesRef.current.length; i++) {
        await canvasRef.current?.loadJSON(slidesRef.current[i].json);
        await new Promise((r) => requestAnimationFrame(r));
        const dataUrl = canvasRef.current?.toDataURL(2) ?? "";
        const slide = pptx.addSlide();
        if (dataUrl) slide.addImage({ data: dataUrl, x: 0, y: 0, w: "100%", h: "100%" });
      }
      // Restore the slide the user was on
      await canvasRef.current?.loadJSON(slidesRef.current[originalIndex].json);

      await pptx.writeFile({ fileName: `${titleRef.current || "presentation"}.pptx` });
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const slideEntries: SlideEntry[] = slides.map((s) => ({ id: s.id, thumbnail: s.thumbnail }));

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#F1EFE3" }}>
      <EditorTopBar
        title={title}
        onTitleChange={handleTitleChange}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onExport={handleExport}
        isExporting={isExporting}
        saveStatus={saveStatus}
      />
      <ContextualToolbar
        selection={selection}
        onUpdate={(props) => canvasRef.current?.updateSelected(props)}
        onBringForward={() => canvasRef.current?.bringForward()}
        onSendBackward={() => canvasRef.current?.sendBackward()}
        onDelete={() => canvasRef.current?.deleteSelected()}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          onAddShape={(type) => canvasRef.current?.addShape(type)}
          onAddText={(preset) => canvasRef.current?.addText(preset)}
          onAddImage={(url) => canvasRef.current?.addImage(url)}
        />
        <Canvas
          ref={canvasRef}
          onSelectionChange={setSelection}
          onChange={handleCanvasChange}
          onReady={handleCanvasReady}
        />
      </div>
      <SlideTray
        slides={slideEntries}
        activeIndex={activeIndex}
        onSelect={switchSlide}
        onAdd={addSlide}
        onDelete={deleteSlide}
      />
    </div>
  );
}
