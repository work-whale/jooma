"use client";

import BadgeElement from "./BadgeElement";
import type { BadgeObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";

interface Props {
  badges: BadgeObject[];
  selectedId: string | null;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<BadgeObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  isInMultiSelection?: (id: string) => boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (id: string, e: React.MouseEvent) => void;
}

export default function BadgeLayer({
  badges, selectedId, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  isInMultiSelection, onGroupDragStart, onCloneAndDrag,
}: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {badges.map((b) => (
        <BadgeElement
          key={b.id}
          badge={b}
          selected={selectedId === b.id}
          zoom={zoom}
          theme={theme}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
          inMultiSelection={isInMultiSelection?.(b.id) ?? false}
          onGroupDragStart={onGroupDragStart}
          onCloneAndDrag={onCloneAndDrag ? (e) => onCloneAndDrag(b.id, e) : undefined}
        />
      ))}
    </div>
  );
}
