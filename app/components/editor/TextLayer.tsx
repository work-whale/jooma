"use client";

import TextElement from "./TextElement";
import type { TextObject } from "@/app/lib/presentations";

interface Props {
  texts: TextObject[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<TextObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
}

export default function TextLayer({ texts, selectedId, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      {texts.map((t) => (
        <TextElement
          key={t.id}
          text={t}
          selected={selectedId === t.id}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}
