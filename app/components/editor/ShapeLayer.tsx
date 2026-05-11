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
}

export default function ShapeLayer({ shapes, selectedId, zoom, onSelect, onUpdate, onCommit }: Props) {
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
        />
      ))}
    </div>
  );
}
