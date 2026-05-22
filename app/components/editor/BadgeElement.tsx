"use client";

import { useRef } from "react";
import type { BadgeObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";

interface Props {
  badge: BadgeObject;
  selected: boolean;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<BadgeObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  inMultiSelection?: boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (e: React.MouseEvent) => void;
}

const BADGE_HEIGHT = 36;

export default function BadgeElement({
  badge, selected, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  inMultiSelection = false, onGroupDragStart, onCloneAndDrag,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rotation = badge.rotation ?? 0;
  const bg = theme.palette.badgeBg ?? theme.palette.accent;
  const ink = theme.palette.badgeInk ?? theme.palette.overlayText;

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (e.altKey && onCloneAndDrag && !badge.locked) {
      onCloneAndDrag(e);
      return;
    }
    if (inMultiSelection && onGroupDragStart && !e.shiftKey) {
      onGroupDragStart(e);
      return;
    }
    e.stopPropagation();
    if (!selected) onSelect(badge.id);
    if (badge.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = badge.x;
    const origY = badge.y;
    let moved = false;
    const canSnap = onSnap && rotation === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap && ref.current) {
        const w = ref.current.offsetWidth;
        const snapped = onSnap(badge.id, nx, ny, w, BADGE_HEIGHT);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(badge.id, { x: nx, y: ny });
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

  return (
    <div
      ref={ref}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(badge.id);
        onContextMenu(badge.id, e.clientX, e.clientY);
      }}
      style={{
        position: "absolute",
        left: badge.x,
        top: badge.y,
        height: BADGE_HEIGHT,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "left top",
        pointerEvents: "auto",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        zIndex: badge.z,
        cursor: badge.locked ? "default" : selected ? "move" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 14px",
        borderRadius: 6,
        backgroundColor: bg,
        color: ink,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {badge.text || "BADGE"}
    </div>
  );
}
