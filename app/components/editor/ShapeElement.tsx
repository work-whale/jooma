"use client";

import { memo, useRef } from "react";
import { RotateCw } from "lucide-react";
import type { ShapeObject } from "@/app/lib/presentations";

interface Props {
  shape: ShapeObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ShapeObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
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
  if (type === "arrow") {
    const sw = strokeWidth || 4;
    const arrowHeadId = `arrowhead-${s.id}`;
    return (
      <>
        <defs>
          <marker
            id={arrowHeadId}
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill={stroke || fill} />
          </marker>
        </defs>
        <line
          x1={sw / 2}
          y1={h / 2}
          x2={Math.max(sw / 2, w - sw * 3)}
          y2={h / 2}
          stroke={stroke || fill}
          strokeWidth={sw}
          markerEnd={`url(#${arrowHeadId})`}
        />
      </>
    );
  }
  if (type === "star") {
    const cx = w / 2;
    const cy = h / 2;
    const rOuter = Math.min(w, h) / 2 - strokeWidth / 2;
    const rInner = rOuter * 0.4;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    return (
      <polygon
        points={pts.join(" ")}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
  }
  if (type === "hexagon") {
    const cx = w / 2;
    const cy = h / 2;
    const rW = w / 2 - strokeWidth / 2;
    const rH = h / 2 - strokeWidth / 2;
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      pts.push(`${cx + rW * Math.cos(a)},${cy + rH * Math.sin(a)}`);
    }
    return (
      <polygon
        points={pts.join(" ")}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
  }
  if (type === "pentagon" || type === "octagon") {
    const sides = type === "pentagon" ? 5 : 8;
    const cx = w / 2;
    const cy = h / 2;
    const rW = w / 2 - strokeWidth / 2;
    const rH = h / 2 - strokeWidth / 2;
    const pts: string[] = [];
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      pts.push(`${cx + rW * Math.cos(a)},${cy + rH * Math.sin(a)}`);
    }
    return <polygon points={pts.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  if (type === "diamond") {
    const sw = strokeWidth / 2;
    const pts = `${w / 2},${sw} ${w - sw},${h / 2} ${w / 2},${h - sw} ${sw},${h / 2}`;
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  if (type === "heart") {
    // Heart via cubic Bézier curves, scaled to the bounding box.
    const sw = strokeWidth / 2;
    const W = w - strokeWidth, H = h - strokeWidth;
    const x0 = sw, y0 = sw + H * 0.25;
    const d = `M ${x0 + W / 2} ${sw + H} ` +
      `C ${x0 + W / 2} ${sw + H * 0.75}, ${x0} ${sw + H * 0.55}, ${x0} ${y0 + H * 0.05} ` +
      `C ${x0} ${sw}, ${x0 + W * 0.5} ${sw}, ${x0 + W / 2} ${sw + H * 0.25} ` +
      `C ${x0 + W * 0.5} ${sw}, ${x0 + W} ${sw}, ${x0 + W} ${y0 + H * 0.05} ` +
      `C ${x0 + W} ${sw + H * 0.55}, ${x0 + W / 2} ${sw + H * 0.75}, ${x0 + W / 2} ${sw + H} Z`;
    return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  if (type === "cloud") {
    // Cloud built from overlapping circles + a flat base.
    const sw = strokeWidth / 2;
    const W = w - strokeWidth, H = h - strokeWidth;
    const d =
      `M ${sw + W * 0.20} ${sw + H * 0.75} ` +
      `C ${sw + W * 0.05} ${sw + H * 0.75}, ${sw + W * 0.05} ${sw + H * 0.45}, ${sw + W * 0.22} ${sw + H * 0.45} ` +
      `C ${sw + W * 0.22} ${sw + H * 0.18}, ${sw + W * 0.55} ${sw + H * 0.15}, ${sw + W * 0.58} ${sw + H * 0.4} ` +
      `C ${sw + W * 0.78} ${sw + H * 0.25}, ${sw + W * 0.98} ${sw + H * 0.45}, ${sw + W * 0.86} ${sw + H * 0.55} ` +
      `C ${sw + W * 0.99} ${sw + H * 0.60}, ${sw + W * 0.95} ${sw + H * 0.80}, ${sw + W * 0.80} ${sw + H * 0.75} ` +
      `Z`;
    return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  if (type === "speech") {
    // Speech bubble: rounded rect with a tail pointing down-left.
    const sw = strokeWidth / 2;
    const W = w - strokeWidth, H = h - strokeWidth;
    const bodyH = H * 0.78;
    const r = Math.min(20, Math.min(W, bodyH) * 0.15);
    const d =
      `M ${sw + r} ${sw} ` +
      `L ${sw + W - r} ${sw} ` +
      `Q ${sw + W} ${sw}, ${sw + W} ${sw + r} ` +
      `L ${sw + W} ${sw + bodyH - r} ` +
      `Q ${sw + W} ${sw + bodyH}, ${sw + W - r} ${sw + bodyH} ` +
      `L ${sw + W * 0.35} ${sw + bodyH} ` +
      `L ${sw + W * 0.18} ${sw + H} ` +
      `L ${sw + W * 0.25} ${sw + bodyH} ` +
      `L ${sw + r} ${sw + bodyH} ` +
      `Q ${sw} ${sw + bodyH}, ${sw} ${sw + bodyH - r} ` +
      `L ${sw} ${sw + r} ` +
      `Q ${sw} ${sw}, ${sw + r} ${sw} Z`;
    return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  if (type === "plus") {
    const sw = strokeWidth / 2;
    const W = w - strokeWidth, H = h - strokeWidth;
    const arm = Math.min(W, H) * 0.32; // half-width of each arm
    const cx = sw + W / 2, cy = sw + H / 2;
    const pts = [
      `${cx - arm},${sw}`, `${cx + arm},${sw}`,
      `${cx + arm},${cy - arm}`, `${sw + W},${cy - arm}`,
      `${sw + W},${cy + arm}`, `${cx + arm},${cy + arm}`,
      `${cx + arm},${sw + H}`, `${cx - arm},${sw + H}`,
      `${cx - arm},${cy + arm}`, `${sw},${cy + arm}`,
      `${sw},${cy - arm}`, `${cx - arm},${cy - arm}`,
    ].join(" ");
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  if (type === "bolt") {
    // Lightning bolt zigzag.
    const sw = strokeWidth / 2;
    const W = w - strokeWidth, H = h - strokeWidth;
    const pts = [
      `${sw + W * 0.55},${sw}`,
      `${sw + W * 0.15},${sw + H * 0.55}`,
      `${sw + W * 0.45},${sw + H * 0.55}`,
      `${sw + W * 0.30},${sw + H}`,
      `${sw + W * 0.85},${sw + H * 0.42}`,
      `${sw + W * 0.55},${sw + H * 0.42}`,
      `${sw + W * 0.72},${sw}`,
    ].join(" ");
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }
  return null;
}

function ShapeElement({ shape, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rotation = shape.rotation ?? 0;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) onSelect(shape.id);
    // Locked: select only so the user can unlock from the toolbar.
    if (shape.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = shape.x;
    const origY = shape.y;
    let moved = false;

    const canSnap = onSnap && (shape.rotation ?? 0) === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const snapped = onSnap(shape.id, nx, ny, shape.width, shape.height);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(shape.id, { x: nx, y: ny });
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
    if (shape.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = shape.x;
    const origY = shape.y;
    const origW = shape.width;
    const origH = shape.height;
    const origCX = origX + origW / 2;
    const origCY = origY + origH / 2;

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      // Project screen delta into the shape's local (unrotated) frame
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;

      let w = origW, h = origH;
      let cxLocal = 0, cyLocal = 0;
      if (pos.includes("e")) { w = Math.max(MIN_SIZE, origW + localDx); cxLocal = (w - origW) / 2; }
      if (pos.includes("w")) { w = Math.max(MIN_SIZE, origW - localDx); cxLocal = -(w - origW) / 2; }
      if (pos.includes("s")) { h = Math.max(MIN_SIZE, origH + localDy); cyLocal = (h - origH) / 2; }
      if (pos.includes("n")) { h = Math.max(MIN_SIZE, origH - localDy); cyLocal = -(h - origH) / 2; }

      // Center shift back in screen frame
      const dCxScreen = cxLocal * cos - cyLocal * sin;
      const dCyScreen = cxLocal * sin + cyLocal * cos;
      const newCX = origCX + dCxScreen;
      const newCY = origCY + dCyScreen;

      onUpdate(shape.id, { x: newCX - w / 2, y: newCY - h / 2, width: w, height: h });
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
    if (shape.locked) return;
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const origRotation = shape.rotation ?? 0;

    const move = (ev: MouseEvent) => {
      const currentAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      let newRot = origRotation + deltaDeg;
      if (ev.shiftKey) newRot = Math.round(newRot / 15) * 15;
      newRot = ((newRot % 360) + 360) % 360;
      onUpdate(shape.id, { rotation: newRot });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const flipScale = `scale(${shape.flipX ? -1 : 1}, ${shape.flipY ? -1 : 1})`;

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
        cursor: shape.locked ? "default" : selected ? "move" : "pointer",
        pointerEvents: "auto",
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        filter: shape.shadow ? "drop-shadow(0 6px 12px rgba(0,0,0,0.25))" : undefined,
      }}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(shape.id);
        onContextMenu(shape.id, e.clientX, e.clientY);
      }}
    >
      <svg
        width={shape.width}
        height={shape.height}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          display: "block",
          transform: flipScale,
          transformOrigin: "center center",
        }}
      >
        {renderShape(shape)}
      </svg>

      {selected && (
        <>
          <div
            style={{
              position: "absolute",
              inset: -2,
              border: "2px solid #7c3aed",
              borderRadius: shape.type === "rect" ? (shape.cornerRadius ?? 0) + 2 : 0,
              pointerEvents: "none",
            }}
          />
          {!shape.locked && HANDLES.map((pos) => {
            const horiz = pos.includes("w") ? 0 : pos.includes("e") ? shape.width : shape.width / 2;
            const vert = pos.includes("n") ? 0 : pos.includes("s") ? shape.height : shape.height / 2;
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
          {!shape.locked && (
            <div
              onMouseDown={handleRotateMouseDown}
              title="Rotate (hold Shift to snap)"
              style={{
                position: "absolute",
                left: shape.width / 2,
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

export default memo(ShapeElement);
