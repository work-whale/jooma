"use client";

import ShapeElement from "./ShapeElement";
import type { ShapeObject } from "@/app/lib/presentations";

interface Props {
  shapes: ShapeObject[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<ShapeObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  isInMultiSelection?: (id: string) => boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (id: string, e: React.MouseEvent) => void;
}

export default function ShapeLayer({ shapes, selectedId, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu, isInMultiSelection, onGroupDragStart, onCloneAndDrag }: Props) {
  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      {shapes.map((s) => (
        <ShapeElement
          key={s.id}
          shape={s}
          selected={selectedId === s.id}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
          inMultiSelection={isInMultiSelection?.(s.id) ?? false}
          onGroupDragStart={onGroupDragStart}
          onCloneAndDrag={onCloneAndDrag ? (e) => onCloneAndDrag(s.id, e) : undefined}
        />
      ))}
    </div>
  );
}
