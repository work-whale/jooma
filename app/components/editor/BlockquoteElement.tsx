"use client";

import { useRef } from "react";
import type { BlockquoteObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";
import { parseInlineBold } from "@/app/lib/utils";

interface Props {
  quote: BlockquoteObject;
  selected: boolean;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<BlockquoteObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  inMultiSelection?: boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (e: React.MouseEvent) => void;
}

type HandlePos = "ml" | "mr";
const HANDLES: HandlePos[] = ["ml", "mr"];

const MIN_W = 200;

function renderInlineBold(s: string) {
  return parseInlineBold(s).map((r, i) =>
    r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>,
  );
}

export default function BlockquoteElement({
  quote, selected, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  inMultiSelection = false, onGroupDragStart, onCloneAndDrag,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rotation = quote.rotation ?? 0;
  const rule = theme.palette.blockquoteRule ?? theme.palette.accent;

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (e.altKey && onCloneAndDrag && !quote.locked) {
      onCloneAndDrag(e);
      return;
    }
    if (inMultiSelection && onGroupDragStart && !e.shiftKey) {
      onGroupDragStart(e);
      return;
    }
    e.stopPropagation();
    if (!selected) onSelect(quote.id);
    if (quote.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = quote.x;
    const origY = quote.y;
    let moved = false;
    const canSnap = onSnap && rotation === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const h = ref.current?.offsetHeight ?? 100;
        const snapped = onSnap(quote.id, nx, ny, quote.width, h);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(quote.id, { x: nx, y: ny });
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
    if (quote.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origX = quote.x, origW = quote.width;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      let nx = origX, nw = origW;
      if (pos === "ml") { nx = origX + dx; nw = origW - dx; }
      if (pos === "mr") { nw = origW + dx; }
      if (nw < MIN_W) { if (pos === "ml") nx = origX + (origW - MIN_W); nw = MIN_W; }
      onUpdate(quote.id, { x: nx, width: nw });
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
      ref={ref}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(quote.id);
        onContextMenu(quote.id, e.clientX, e.clientY);
      }}
      style={{
        position: "absolute",
        left: quote.x,
        top: quote.y,
        width: quote.width,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "left top",
        pointerEvents: "auto",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        zIndex: quote.z,
        cursor: quote.locked ? "default" : selected ? "move" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        borderLeft: `4px solid ${rule}`,
        paddingLeft: 18,
        paddingTop: 4,
        paddingBottom: 4,
        fontFamily: theme.fonts.body,
        fontStyle: "italic",
        fontSize: 22,
        lineHeight: 1.4,
        color: theme.palette.text,
      }}
    >
      <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineBold(quote.text)}</div>
      {quote.attribution && (
        <div
          style={{
            marginTop: 8,
            fontStyle: "normal",
            fontSize: 16,
            color: theme.palette.muted,
          }}
        >
          — {quote.attribution}
        </div>
      )}

      {selected && !quote.locked && HANDLES.map((pos) => (
        <div
          key={pos}
          onMouseDown={handleHandleMouseDown(pos)}
          style={{
            position: "absolute",
            width: 12, height: 12,
            background: "#fff", border: "2px solid #7c3aed", borderRadius: 3,
            cursor: "ew-resize",
            top: "50%",
            transform: "translateY(-50%)",
            left: pos === "ml" ? -6 : "auto",
            right: pos === "mr" ? -6 : "auto",
          }}
        />
      ))}
    </div>
  );
}
