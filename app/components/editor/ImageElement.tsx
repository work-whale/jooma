"use client";

import { memo } from "react";
import type { ImageObject } from "@/app/lib/presentations";

interface Props {
  image: ImageObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ImageObject>) => void;
  onCommit: () => void;
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

function ImageElement({ image, selected, zoom, onSelect, onUpdate, onCommit }: Props) {
  const handleBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) onSelect(image.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = image.x;
    const origY = image.y;
    let moved = false;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      onUpdate(image.id, { x: origX + dx, y: origY + dy });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (moved) onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleHandleMouseDown = (pos: HandlePos) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = image.x;
    const origY = image.y;
    const origW = image.width;
    const origH = image.height;
    const aspect = origW / origH;
    // Shift-key locks aspect ratio. For images, default to locking aspect ratio for corner handles.
    const lockAspect = pos.length === 2; // corner handle

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let x = origX, y = origY, w = origW, h = origH;

      if (lockAspect) {
        // Use the dominant axis to drive the resize, preserve aspect
        const useX = Math.abs(dx) > Math.abs(dy);
        const signX = pos.includes("e") ? 1 : pos.includes("w") ? -1 : 0;
        const signY = pos.includes("s") ? 1 : pos.includes("n") ? -1 : 0;
        let deltaW: number;
        if (useX) {
          deltaW = signX * dx;
        } else {
          deltaW = signY * dy * aspect;
        }
        w = Math.max(MIN_SIZE, origW + deltaW);
        h = w / aspect;
        if (pos.includes("w")) x = origX + (origW - w);
        if (pos.includes("n")) y = origY + (origH - h);
      } else {
        if (pos.includes("e")) w = Math.max(MIN_SIZE, origW + dx);
        if (pos.includes("s")) h = Math.max(MIN_SIZE, origH + dy);
        if (pos.includes("w")) { w = Math.max(MIN_SIZE, origW - dx); x = origX + (origW - w); }
        if (pos.includes("n")) { h = Math.max(MIN_SIZE, origH - dy); y = origY + (origH - h); }
      }
      onUpdate(image.id, { x, y, width: w, height: h });
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
      style={{
        position: "absolute",
        left: image.x,
        top: image.y,
        width: image.width,
        height: image.height,
        opacity: image.opacity,
        cursor: selected ? "move" : "pointer",
        pointerEvents: "auto",
      }}
      onMouseDown={handleBodyMouseDown}
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
          objectFit: "fill",
          userSelect: "none",
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
          {HANDLES.map((pos) => {
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
        </>
      )}
    </div>
  );
}

export default memo(ImageElement);
