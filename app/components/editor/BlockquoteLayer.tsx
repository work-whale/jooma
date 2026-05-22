"use client";

import BlockquoteElement from "./BlockquoteElement";
import type { BlockquoteObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";

interface Props {
  blockquotes: BlockquoteObject[];
  selectedId: string | null;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<BlockquoteObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  isInMultiSelection?: (id: string) => boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (id: string, e: React.MouseEvent) => void;
}

export default function BlockquoteLayer({
  blockquotes, selectedId, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  isInMultiSelection, onGroupDragStart, onCloneAndDrag,
}: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {blockquotes.map((q) => (
        <BlockquoteElement
          key={q.id}
          quote={q}
          selected={selectedId === q.id}
          zoom={zoom}
          theme={theme}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
          inMultiSelection={isInMultiSelection?.(q.id) ?? false}
          onGroupDragStart={onGroupDragStart}
          onCloneAndDrag={onCloneAndDrag ? (e) => onCloneAndDrag(q.id, e) : undefined}
        />
      ))}
    </div>
  );
}
