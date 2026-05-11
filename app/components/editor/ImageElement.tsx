"use client";

import { memo, useRef } from "react";
import { RotateCw } from "lucide-react";
import type { ImageObject } from "@/app/lib/presentations";
import { getFrameStyle } from "./frames";

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

function ImageElement({ image, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rotation = image.rotation ?? 0;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (image.locked) return;
    e.stopPropagation();
    if (!selected) onSelect(image.id);
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
    const lockAspect = pos.length === 2;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      // Project to local frame
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      let w = origW, h = origH;
      let cxLocal = 0, cyLocal = 0;

      if (lockAspect) {
        const useX = Math.abs(localDx) > Math.abs(localDy);
        const signX = pos.includes("e") ? 1 : pos.includes("w") ? -1 : 0;
        const signY = pos.includes("s") ? 1 : pos.includes("n") ? -1 : 0;
        const deltaW = useX ? signX * localDx : signY * localDy * aspect;
        w = Math.max(MIN_SIZE, origW + deltaW);
        h = w / aspect;
        if (pos.includes("e")) cxLocal = (w - origW) / 2;
        if (pos.includes("w")) cxLocal = -(w - origW) / 2;
        if (pos.includes("s")) cyLocal = (h - origH) / 2;
        if (pos.includes("n")) cyLocal = -(h - origH) / 2;
      } else {
        if (pos.includes("e")) { w = Math.max(MIN_SIZE, origW + localDx); cxLocal = (w - origW) / 2; }
        if (pos.includes("w")) { w = Math.max(MIN_SIZE, origW - localDx); cxLocal = -(w - origW) / 2; }
        if (pos.includes("s")) { h = Math.max(MIN_SIZE, origH + localDy); cyLocal = (h - origH) / 2; }
        if (pos.includes("n")) { h = Math.max(MIN_SIZE, origH - localDy); cyLocal = -(h - origH) / 2; }
      }

      const dCxScreen = cxLocal * cos - cyLocal * sin;
      const dCyScreen = cxLocal * sin + cyLocal * cos;
      const newCX = origCX + dCxScreen;
      const newCY = origCY + dCyScreen;
      onUpdate(image.id, { x: newCX - w / 2, y: newCY - h / 2, width: w, height: h });
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
        cursor: image.locked ? "default" : selected ? "move" : "pointer",
        pointerEvents: "auto",
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        filter: image.shadow ? "drop-shadow(0 6px 12px rgba(0,0,0,0.25))" : undefined,
      }}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(image.id);
        onContextMenu(image.id, e.clientX, e.clientY);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: image.frame && image.frame !== "none" ? "cover" : "fill",
          userSelect: "none",
          transform: `scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})`,
          transformOrigin: "center center",
          ...getFrameStyle(image.frame),
        }}
      />
      {selected && (
        <>
          <div
            style={{
              position: "absolute",
              inset: -2,
              border: "2px solid #7c3aed",
              pointerEvents: "none",
            }}
          />
          {!image.locked && HANDLES.map((pos) => {
            const horiz = pos.includes("w") ? 0 : pos.includes("e") ? image.width : image.width / 2;
            const vert = pos.includes("n") ? 0 : pos.includes("s") ? image.height : image.height / 2;
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
          {!image.locked && (
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
      )}
    </div>
  );
}

export default memo(ImageElement);
