"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { RotateCw, ImagePlus, Trash2 } from "lucide-react";
import type { ImageObject } from "@/app/lib/presentations";
import { getFrameStyle, getFrameCornerPx } from "./frames";

interface Props {
  image: ImageObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ImageObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  editingInner?: boolean;
  onEnterEditInner?: (id: string) => void;
  onExitEditInner?: () => void;
  onRemoveInnerImage?: () => void;
  /** True if this image is part of the active multi-selection. */
  inMultiSelection?: boolean;
  /** Called instead of the normal single-element drag when inMultiSelection is true. */
  onGroupDragStart?: (e: React.MouseEvent) => void;
  /** Called on Alt+mousedown to spawn a duplicate and drag it. */
  onCloneAndDrag?: (e: React.MouseEvent) => void;
}

const MIN_SIZE = 12;

type HandlePos =
  | "nw" | "n" | "ne"
  | "w"        | "e"
  | "sw" | "s" | "se";

const HANDLES: HandlePos[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

const cursorFor: Record<HandlePos, string> = {
  nw: "nwse-resize",
  n:  "ns-resize",
  ne: "nesw-resize",
  w:  "ew-resize",
  e:  "ew-resize",
  sw: "nesw-resize",
  s:  "ns-resize",
  se: "nwse-resize",
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch failed");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(blob);
  });
}

function ImageElement({ image, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu, editingInner = false, onEnterEditInner, onExitEditInner, onRemoveInnerImage, inMultiSelection = false, onGroupDragStart, onCloneAndDrag }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const rotation = image.rotation ?? 0;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const isFrame = !!image.frame && image.frame !== "none";
  const isEmptyFrame = isFrame && !image.src;

  // Auto-measure naturals when the photo first arrives (or older saves missed them).
  useEffect(() => {
    if (!image.src || isEmptyFrame) return;
    if (image.naturalWidth && image.naturalHeight) return;
    const img = new window.Image();
    img.onload = () => {
      onUpdate(image.id, { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    };
    img.src = image.src;
  }, [image.src, image.naturalWidth, image.naturalHeight, image.id, isEmptyFrame, onUpdate]);

  // Inner-photo metrics — mirrors the slide-background editor's bgMetrics.
  const inner = useMemo(() => {
    const nW = image.naturalWidth ?? image.width;
    const nH = image.naturalHeight ?? image.height;
    const userScale = Math.max(1, image.innerScale ?? 1);
    const coverScale = Math.max(image.width / nW, image.height / nH);
    const finalScale = coverScale * userScale;
    const scaledW = nW * finalScale;
    const scaledH = nH * finalScale;
    const maxX = Math.max(0, (scaledW - image.width) / 2);
    const maxY = Math.max(0, (scaledH - image.height) / 2);
    const offsetX = clamp(image.innerOffsetX ?? 0, -maxX, maxX);
    const offsetY = clamp(image.innerOffsetY ?? 0, -maxY, maxY);
    return { coverScale, userScale, finalScale, scaledW, scaledH, maxX, maxY, offsetX, offsetY };
  }, [image.naturalWidth, image.naturalHeight, image.width, image.height, image.innerScale, image.innerOffsetX, image.innerOffsetY]);

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (editingInner) return;
    // Alt+mousedown: spawn a duplicate at the same position and drag it.
    // Original stays put. Standard editor behaviour.
    if (e.altKey && onCloneAndDrag && !image.locked) {
      onCloneAndDrag(e);
      return;
    }
    // If part of an active multi-selection, route to the group drag instead.
    // This preserves the multi-selection and moves every selected item with
    // the same dx/dy — without it, mousedown would trigger onSelect → clear
    // the multi-selection.
    if (inMultiSelection && onGroupDragStart && !e.shiftKey) {
      onGroupDragStart(e);
      return;
    }
    e.stopPropagation();
    if (!selected) onSelect(image.id);
    // Locked: select only — the user needs to be able to pick the element
    // to see the toolbar and click Unlock. Drag/resize stay disabled.
    if (image.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = image.x;
    const origY = image.y;
    let moved = false;

    const canSnap = onSnap && (image.rotation ?? 0) === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const snapped = onSnap(image.id, nx, ny, image.width, image.height);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(image.id, { x: nx, y: ny });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onDragEnd?.();
      if (moved) onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleHandleMouseDown = (pos: HandlePos) => (e: React.MouseEvent) => {
    if (image.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = image.x;
    const origY = image.y;
    const origW = image.width;
    const origH = image.height;
    const origCX = origX + origW / 2;
    const origCY = origY + origH / 2;
    const aspect = origW / origH;
    const lockAspect = pos.length === 2 && !isEmptyFrame;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      // Alt held → resize symmetrically: keep the centre fixed and extend the
      // opposite edge by the same amount. Achieved by doubling the size delta
      // and zeroing the centre offset (so the centre doesn't shift).
      const fromCenter = ev.altKey;
      const k = fromCenter ? 2 : 1;
      let w = origW, h = origH;
      let cxLocal = 0, cyLocal = 0;

      if (lockAspect) {
        const useX = Math.abs(localDx) > Math.abs(localDy);
        const signX = pos.includes("e") ? 1 : pos.includes("w") ? -1 : 0;
        const signY = pos.includes("s") ? 1 : pos.includes("n") ? -1 : 0;
        const deltaW = useX ? signX * localDx : signY * localDy * aspect;
        w = Math.max(MIN_SIZE, origW + k * deltaW);
        h = w / aspect;
        if (!fromCenter) {
          if (pos.includes("e")) cxLocal = (w - origW) / 2;
          if (pos.includes("w")) cxLocal = -(w - origW) / 2;
          if (pos.includes("s")) cyLocal = (h - origH) / 2;
          if (pos.includes("n")) cyLocal = -(h - origH) / 2;
        }
      } else {
        if (pos.includes("e")) { w = Math.max(MIN_SIZE, origW + k * localDx); cxLocal = fromCenter ? 0 : (w - origW) / 2; }
        if (pos.includes("w")) { w = Math.max(MIN_SIZE, origW - k * localDx); cxLocal = fromCenter ? 0 : -(w - origW) / 2; }
        if (pos.includes("s")) { h = Math.max(MIN_SIZE, origH + k * localDy); cyLocal = fromCenter ? 0 : (h - origH) / 2; }
        if (pos.includes("n")) { h = Math.max(MIN_SIZE, origH - k * localDy); cyLocal = fromCenter ? 0 : -(h - origH) / 2; }
      }

      const dCxScreen = cxLocal * cos - cyLocal * sin;
      const dCyScreen = cxLocal * sin + cyLocal * cos;
      onUpdate(image.id, { x: origCX + dCxScreen - w / 2, y: origCY + dCyScreen - h / 2, width: w, height: h });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleRotateMouseDown = (e: React.MouseEvent) => {
    if (image.locked) return;
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const origRotation = image.rotation ?? 0;

    const move = (ev: MouseEvent) => {
      const currentAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      let newRot = origRotation + deltaDeg;
      if (ev.shiftKey) newRot = Math.round(newRot / 15) * 15;
      newRot = ((newRot % 360) + 360) % 360;
      onUpdate(image.id, { rotation: newRot });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ── Drop-into-frame ────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    if (!isFrame) return;
    if (!e.dataTransfer.types.includes("application/x-jooma-image")) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    if (!isFrame) return;
    const url = e.dataTransfer.getData("application/x-jooma-image");
    if (!url) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    try {
      const dataUrl = await urlToDataUrl(url);
      const img = new window.Image();
      img.onload = () => {
        onUpdate(image.id, {
          src: dataUrl,
          innerOffsetX: 0,
          innerOffsetY: 0,
          innerScale: 1,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
        onCommit();
      };
      img.src = dataUrl;
    } catch (err) {
      console.error("Failed to drop into frame", err);
    }
  };

  // ── Pan inner image (edit mode) ────────────────────────────────────────────
  const handleInnerPanStart = (e: React.MouseEvent) => {
    if (!editingInner) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = inner.offsetX;
    const origY = inner.offsetY;
    const { maxX, maxY } = inner;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      onUpdate(image.id, {
        innerOffsetX: clamp(origX + dx, -maxX, maxX),
        innerOffsetY: clamp(origY + dy, -maxY, maxY),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ── Scale via corner handles (edit mode) ───────────────────────────────────
  // Distance-from-frame-center sets the scale, same approach as the slide bg editor.
  const handleInnerScaleStart = (e: React.MouseEvent) => {
    if (!editingInner) return;
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (startDist === 0) return;
    const origScale = inner.userScale;
    const origOx = inner.offsetX;
    const origOy = inner.offsetY;
    const nW = image.naturalWidth ?? image.width;
    const nH = image.naturalHeight ?? image.height;
    const coverScale = inner.coverScale;

    const move = (ev: MouseEvent) => {
      const currentDist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      const newScale = clamp(origScale * (currentDist / startDist), 1, 5);
      const scaledW = nW * coverScale * newScale;
      const scaledH = nH * coverScale * newScale;
      const maxX = Math.max(0, (scaledW - image.width) / 2);
      const maxY = Math.max(0, (scaledH - image.height) / 2);
      onUpdate(image.id, {
        innerScale: newScale,
        innerOffsetX: clamp(origOx, -maxX, maxX),
        innerOffsetY: clamp(origOy, -maxY, maxY),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const frameStyle = getFrameStyle(image.frame, image.cornerRadius);
  const imgLeft = (image.width - inner.scaledW) / 2 + inner.offsetX;
  const imgTop = (image.height - inner.scaledH) / 2 + inner.offsetY;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: image.x,
        top: image.y,
        width: image.width,
        height: image.height,
        opacity: image.opacity,
        cursor: image.locked ? "default" : editingInner ? "default" : selected ? "move" : "pointer",
        pointerEvents: "auto",
        zIndex: image.z,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        filter: image.shadow ? "drop-shadow(0 6px 12px rgba(0,0,0,0.25))" : undefined,
      }}
      onMouseDown={handleBodyMouseDown}
      onDoubleClick={(e) => {
        if (image.locked || !isFrame || !image.src) return;
        e.stopPropagation();
        if (!selected) onSelect(image.id);
        onEnterEditInner?.(image.id);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(image.id);
        onContextMenu(image.id, e.clientX, e.clientY);
      }}
    >
      {image.isPending && !image.src ? (
        // Shimmer placeholder while the AI is fetching the image. Same shape
        // as the final image (frame-clipped) so layout doesn't jump on swap.
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#e7e5e0",
            position: "relative",
            overflow: "hidden",
            ...frameStyle,
          }}
        >
          <div className="absolute inset-0 jooma-shimmer" />
        </div>
      ) : isEmptyFrame ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: dragOver ? "#ddd6fe" : "#e7e5e0",
            border: `2px dashed ${dragOver ? "#7c3aed" : "#9ca3af"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 6,
            color: "#6b7280",
            fontSize: 11,
            ...frameStyle,
          }}
        >
          <ImagePlus className="w-7 h-7" strokeWidth={1.5} />
          <span>Drop image</span>
        </div>
      ) : !editingInner ? (
        // Normal display: clipped to frame, with optional stroke (inside/outside/center).
        (() => {
          const sw = image.strokeWidth ?? 0;
          const sc = image.strokeColor ?? "#1a1a2e";
          const sa = image.strokeAlign ?? "inside";
          const outsidePart = sw > 0 ? (sa === "outside" ? sw : sa === "center" ? sw / 2 : 0) : 0;
          const insetW = sw > 0 ? (sa === "inside" ? sw : sa === "center" ? sw / 2 : 0) : 0;
          const innerCornerPx = getFrameCornerPx(image.frame, image.cornerRadius);
          // For borderRadius-based frames, draw the outside stroke as a
          // box-shadow on a transparent wrapper that matches the rounded
          // shape. Box-shadow paints OUTSIDE the rounded edge only, so it
          // can't bleed through any transparent pixels in the image (which
          // would happen if we used a solid outer rectangle behind the image).
          // Falls back to a separate outer-ring div for clip-path frames
          // (circle, hexagon, etc.) where box-shadow can't follow the shape.
          const usesBorderRadius = innerCornerPx !== null;
          return (
            <>
              {outsidePart > 0 && usesBorderRadius && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: `${innerCornerPx}px`,
                    boxShadow: `0 0 0 ${outsidePart}px ${sc}`,
                    pointerEvents: "none",
                  }}
                />
              )}
              {outsidePart > 0 && !usesBorderRadius && (
                <div
                  style={{
                    position: "absolute",
                    left: -outsidePart,
                    top: -outsidePart,
                    right: -outsidePart,
                    bottom: -outsidePart,
                    background: sc,
                    ...frameStyle,
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* Frame clip with image */}
              <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...frameStyle }}>
                {image.src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.src}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: imgLeft,
                      top: imgTop,
                      width: inner.scaledW,
                      height: inner.scaledH,
                      maxWidth: "none",
                      maxHeight: "none",
                      display: "block",
                      userSelect: "none",
                      transform: `scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})`,
                      transformOrigin: "center center",
                    }}
                  />
                )}
                {insetW > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: usesBorderRadius ? `${innerCornerPx}px` : undefined,
                      boxShadow: `inset 0 0 0 ${insetW}px ${sc}`,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </>
          );
        })()
      ) : (
        // Edit-inner mode: image extends beyond frame, dark mask covers outside,
        // drag overlay covers full image extent, corner handles at image corners,
        // rule-of-thirds grid inside frame.
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: imgLeft,
              top: imgTop,
              width: inner.scaledW,
              height: inner.scaledH,
              maxWidth: "none",
              maxHeight: "none",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
          {/* Dark mask outside the frame's bounding box */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
              pointerEvents: "none",
            }}
          />
          {/* Rule-of-thirds grid inside frame */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 bottom-0" style={{ left: "33.333%", width: 1, background: "rgba(255,255,255,0.6)" }} />
            <div className="absolute top-0 bottom-0" style={{ left: "66.666%", width: 1, background: "rgba(255,255,255,0.6)" }} />
            <div className="absolute left-0 right-0" style={{ top: "33.333%", height: 1, background: "rgba(255,255,255,0.6)" }} />
            <div className="absolute left-0 right-0" style={{ top: "66.666%", height: 1, background: "rgba(255,255,255,0.6)" }} />
          </div>
          {/* Drag overlay covering the full image extent */}
          <div
            onMouseDown={handleInnerPanStart}
            style={{
              position: "absolute",
              left: imgLeft,
              top: imgTop,
              width: inner.scaledW,
              height: inner.scaledH,
              cursor: "move",
              pointerEvents: "auto",
            }}
          />
          {/* Corner handles at the IMAGE corners */}
          {(["nw", "ne", "sw", "se"] as const).map((pos) => {
            const cursor = pos === "nw" || pos === "se" ? "nwse-resize" : "nesw-resize";
            const left = pos.includes("e") ? imgLeft + inner.scaledW : imgLeft;
            const top = pos.includes("s") ? imgTop + inner.scaledH : imgTop;
            return (
              <div
                key={pos}
                onMouseDown={handleInnerScaleStart}
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

      {editingInner && (
        <div
          className="absolute left-1/2 -top-12 bg-violet-600 text-white text-xs px-2 py-1.5 rounded-md shadow-md whitespace-nowrap flex items-center gap-1.5"
          style={{ transform: "translate(-50%, 0)", zIndex: 3 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveInnerImage?.(); }}
            className="text-[10px] font-semibold uppercase tracking-wide bg-white/15 hover:bg-red-500/80 px-2 py-0.5 rounded flex items-center gap-1"
            title="Remove photo"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onExitEditInner?.(); }}
            className="text-[10px] font-semibold uppercase tracking-wide bg-white/15 hover:bg-white/25 px-2 py-0.5 rounded"
          >
            Done
          </button>
        </div>
      )}

      {selected && (() => {
        // Selection outline hugs the visible picture, not the bounding rect:
        // a rounded image gets a rounded outline. Outline is offset 2px outward,
        // so its radius must be inner-radius + offset to stay concentric.
        const innerCornerPx = getFrameCornerPx(image.frame, image.cornerRadius);
        const OFFSET = 2;
        const outlineRadius = innerCornerPx !== null ? innerCornerPx + OFFSET : 0;
        return (
        <>
          <div
            style={{
              position: "absolute",
              inset: -OFFSET,
              border: `2px ${editingInner ? "dashed" : "solid"} #7c3aed`,
              borderRadius: outlineRadius || undefined,
              pointerEvents: "none",
            }}
          />
          {!image.locked && !editingInner && HANDLES.map((pos) => {
            // Corner handles sit on the rounded corner's 45° point so the
            // selection ring stays flush with the visible picture. Edge
            // handles stay on the straight edges (no adjustment).
            const isCorner = pos.length === 2;
            const cornerOffset = isCorner ? (innerCornerPx ?? 0) * (1 - 1 / Math.SQRT2) : 0;
            const horiz = pos.includes("w")
              ? cornerOffset
              : pos.includes("e")
              ? image.width - cornerOffset
              : image.width / 2;
            const vert = pos.includes("n")
              ? cornerOffset
              : pos.includes("s")
              ? image.height - cornerOffset
              : image.height / 2;
            return (
              <div
                key={pos}
                style={{
                  position: "absolute",
                  left: horiz,
                  top: vert,
                  width: 10,
                  height: 10,
                  background: "#ffffff",
                  border: "1.5px solid #7c3aed",
                  borderRadius: 2,
                  cursor: cursorFor[pos],
                  pointerEvents: "auto",
                  transform: "translate(-50%, -50%)",
                }}
                onMouseDown={handleHandleMouseDown(pos)}
              />
            );
          })}
          {!image.locked && !editingInner && (
            <div
              onMouseDown={handleRotateMouseDown}
              title="Rotate (hold Shift to snap)"
              style={{
                position: "absolute",
                left: image.width / 2,
                top: -28,
                width: 22,
                height: 22,
                background: "#ffffff",
                border: "1.5px solid #7c3aed",
                borderRadius: "50%",
                cursor: "grab",
                pointerEvents: "auto",
                transform: "translate(-50%, -50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7c3aed",
              }}
            >
              <RotateCw className="w-3 h-3" />
            </div>
          )}
        </>
        );
      })()}
    </div>
  );
}

export default memo(ImageElement);
