"use client";

import { memo, useEffect, useRef } from "react";
import type { ShapeObject } from "@/app/lib/presentations";

interface Props {
  shape: ShapeObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ShapeObject>) => void;
  onCommit: () => void;
}

const MIN_SIZE = 8;

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

function renderShape(s: ShapeObject) {
  const { type, fill, stroke, strokeWidth, cornerRadius } = s;
  // The SVG itself is sized to the bounding box. Shapes are drawn in (0,0)→(w,h).
  const w = Math.max(1, s.width);
  const h = Math.max(1, s.height);

  if (type === "rect") {
    return (
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={Math.max(0, w - strokeWidth)}
        height={Math.max(0, h - strokeWidth)}
        rx={cornerRadius ?? 0}
        ry={cornerRadius ?? 0}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (type === "ellipse") {
    return (
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={Math.max(0, (w - strokeWidth) / 2)}
        ry={Math.max(0, (h - strokeWidth) / 2)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (type === "triangle") {
    const pts = `${w / 2},${strokeWidth / 2} ${w - strokeWidth / 2},${h - strokeWidth / 2} ${strokeWidth / 2},${h - strokeWidth / 2}`;
    return (
      <polygon
        points={pts}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
  }
  if (type === "line") {
    return (
      <line
        x1={strokeWidth / 2}
        y1={h / 2}
        x2={w - strokeWidth / 2}
        y2={h / 2}
        stroke={stroke || fill}
        strokeWidth={strokeWidth || 4}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

function ShapeElement({ shape, selected, zoom, onSelect, onUpdate, onCommit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag whole shape
  const handleBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) onSelect(shape.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = shape.x;
    const origY = shape.y;
    let moved = false;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      onUpdate(shape.id, { x: origX + dx, y: origY + dy });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (moved) onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Drag a resize handle
  const handleHandleMouseDown = (pos: HandlePos) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = shape.x;
    const origY = shape.y;
    const origW = shape.width;
    const origH = shape.height;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let x = origX, y = origY, w = origW, h = origH;

      if (pos.includes("e")) w = Math.max(MIN_SIZE, origW + dx);
      if (pos.includes("s")) h = Math.max(MIN_SIZE, origH + dy);
      if (pos.includes("w")) {
        w = Math.max(MIN_SIZE, origW - dx);
        x = origX + (origW - w);
      }
      if (pos.includes("n")) {
        h = Math.max(MIN_SIZE, origH - dy);
        y = origY + (origH - h);
      }
      onUpdate(shape.id, { x, y, width: w, height: h });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Keep DOM in sync (no-op effect just to satisfy hooks lint if needed later)
  useEffect(() => {}, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
        opacity: shape.opacity,
        cursor: selected ? "move" : "pointer",
        pointerEvents: "auto",
      }}
      onMouseDown={handleBodyMouseDown}
    >
      <svg
        width={shape.width}
        height={shape.height}
        style={{ position: "absolute", inset: 0, overflow: "visible", display: "block" }}
      >
        {renderShape(shape)}
      </svg>

      {selected && (
        <>
          {/* Selection outline */}
          <div
            style={{
              position: "absolute",
              inset: -2,
              border: "2px solid #7c3aed",
              borderRadius: shape.type === "rect" ? (shape.cornerRadius ?? 0) + 2 : 0,
              pointerEvents: "none",
            }}
          />
          {/* Resize handles */}
          {HANDLES.map((pos) => {
            const styles: React.CSSProperties = {
              position: "absolute",
              width: 10,
              height: 10,
              background: "#ffffff",
              border: "1.5px solid #7c3aed",
              borderRadius: 2,
              cursor: cursorFor[pos],
              pointerEvents: "auto",
              transform: "translate(-50%, -50%)",
            };
            // Position each handle
            const horiz = pos.includes("w") ? 0 : pos.includes("e") ? shape.width : shape.width / 2;
            const vert = pos.includes("n") ? 0 : pos.includes("s") ? shape.height : shape.height / 2;
            styles.left = horiz;
            styles.top = vert;
            return (
              <div
                key={pos}
                style={styles}
                onMouseDown={handleHandleMouseDown(pos)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

export default memo(ShapeElement);
