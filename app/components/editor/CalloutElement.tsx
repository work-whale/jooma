"use client";

import { useRef } from "react";
import type { CalloutObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";
import { parseInlineBold } from "@/app/lib/utils";

interface Props {
  callout: CalloutObject;
  selected: boolean;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CalloutObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  inMultiSelection?: boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (e: React.MouseEvent) => void;
}

type HandlePos = "tl" | "tr" | "bl" | "br";
const HANDLES: HandlePos[] = ["tl", "tr", "bl", "br"];

const MIN_W = 240;
const MIN_H = 72;

/** Picks bg + ink for a variant. Falls back to safe defaults so themes that
 *  don't yet have callout colours keep rendering. */
function variantColors(variant: CalloutObject["variant"], theme: SlideshowTheme) {
  const p = theme.palette;
  switch (variant) {
    case "remember":
      return { bg: p.calloutBgRemember ?? "#e2eef9", ink: p.calloutInkRemember ?? p.text };
    case "fun":
      return { bg: p.calloutBgFun ?? "#ece1f3", ink: p.calloutInkFun ?? p.text };
    case "key":
    default:
      return { bg: p.calloutBgKey ?? "#fcecc7", ink: p.calloutInkKey ?? p.text };
  }
}

function variantEmoji(variant: CalloutObject["variant"]): string {
  switch (variant) {
    case "remember": return "🧠";
    case "fun":      return "🦉";
    case "key":
    default:         return "🔑";
  }
}

function renderInlineBold(s: string) {
  return parseInlineBold(s).map((r, i) =>
    r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>,
  );
}

export default function CalloutElement({
  callout, selected, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  inMultiSelection = false, onGroupDragStart, onCloneAndDrag,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rotation = callout.rotation ?? 0;
  const { bg, ink } = variantColors(callout.variant, theme);
  const emoji = variantEmoji(callout.variant);

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (e.altKey && onCloneAndDrag && !callout.locked) {
      onCloneAndDrag(e);
      return;
    }
    if (inMultiSelection && onGroupDragStart && !e.shiftKey) {
      onGroupDragStart(e);
      return;
    }
    e.stopPropagation();
    if (!selected) onSelect(callout.id);
    if (callout.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = callout.x;
    const origY = callout.y;
    let moved = false;
    const canSnap = onSnap && rotation === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const h = callout.height ?? MIN_H;
        const snapped = onSnap(callout.id, nx, ny, callout.width, h);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(callout.id, { x: nx, y: ny });
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
    if (callout.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = callout.x, origY = callout.y;
    const origW = callout.width, origH = callout.height ?? MIN_H;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (pos === "tl") { nx = origX + dx; ny = origY + dy; nw = origW - dx; nh = origH - dy; }
      if (pos === "tr") { ny = origY + dy; nw = origW + dx; nh = origH - dy; }
      if (pos === "bl") { nx = origX + dx; nw = origW - dx; nh = origH + dy; }
      if (pos === "br") { nw = origW + dx; nh = origH + dy; }
      if (nw < MIN_W) { if (pos === "tl" || pos === "bl") nx = origX + (origW - MIN_W); nw = MIN_W; }
      if (nh < MIN_H) { if (pos === "tl" || pos === "tr") ny = origY + (origH - MIN_H); nh = MIN_H; }
      onUpdate(callout.id, { x: nx, y: ny, width: nw, height: nh });
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
        if (!selected) onSelect(callout.id);
        onContextMenu(callout.id, e.clientX, e.clientY);
      }}
      style={{
        position: "absolute",
        left: callout.x,
        top: callout.y,
        width: callout.width,
        height: callout.height,
        minHeight: MIN_H,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        pointerEvents: "auto",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        zIndex: callout.z,
        cursor: callout.locked ? "default" : selected ? "move" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        borderRadius: 16,
        backgroundColor: bg,
        color: ink,
        padding: "20px 22px",
        boxSizing: "border-box",
        fontFamily: theme.fonts.body,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{callout.label}</div>
          <div style={{ fontSize: 18, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {renderInlineBold(callout.body)}
          </div>
        </div>
      </div>

      {selected && !callout.locked && HANDLES.map((pos) => (
        <div
          key={pos}
          onMouseDown={handleHandleMouseDown(pos)}
          style={{
            position: "absolute",
            width: 14, height: 14,
            background: "#fff", border: "2px solid #7c3aed", borderRadius: 4,
            cursor: pos === "tl" || pos === "br" ? "nwse-resize" : "nesw-resize",
            top: pos[0] === "t" ? -7 : "auto",
            bottom: pos[0] === "b" ? -7 : "auto",
            left: pos[1] === "l" ? -7 : "auto",
            right: pos[1] === "r" ? -7 : "auto",
          }}
        />
      ))}
    </div>
  );
}
