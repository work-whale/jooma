"use client";

import CalloutElement from "./CalloutElement";
import type { CalloutObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";

interface Props {
  callouts: CalloutObject[];
  selectedId: string | null;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<CalloutObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  isInMultiSelection?: (id: string) => boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (id: string, e: React.MouseEvent) => void;
}

export default function CalloutLayer({
  callouts, selectedId, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  isInMultiSelection, onGroupDragStart, onCloneAndDrag,
}: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {callouts.map((c) => (
        <CalloutElement
          key={c.id}
          callout={c}
          selected={selectedId === c.id}
          zoom={zoom}
          theme={theme}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
          inMultiSelection={isInMultiSelection?.(c.id) ?? false}
          onGroupDragStart={onGroupDragStart}
          onCloneAndDrag={onCloneAndDrag ? (e) => onCloneAndDrag(c.id, e) : undefined}
        />
      ))}
    </div>
  );
}
