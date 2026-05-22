"use client";

import ActivityElement from "./ActivityElement";
import type { ActivityObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";

interface Props {
  activities: ActivityObject[];
  selectedId: string | null;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<ActivityObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  isInMultiSelection?: (id: string) => boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (id: string, e: React.MouseEvent) => void;
}

export default function ActivityLayer({
  activities, selectedId, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  isInMultiSelection, onGroupDragStart, onCloneAndDrag,
}: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {activities.map((a) => (
        <ActivityElement
          key={a.id}
          activity={a}
          selected={selectedId === a.id}
          zoom={zoom}
          theme={theme}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
          inMultiSelection={isInMultiSelection?.(a.id) ?? false}
          onGroupDragStart={onGroupDragStart}
          onCloneAndDrag={onCloneAndDrag ? (e) => onCloneAndDrag(a.id, e) : undefined}
        />
      ))}
    </div>
  );
}
