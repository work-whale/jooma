"use client";

import ImageElement from "./ImageElement";
import type { ImageObject } from "@/app/lib/presentations";

interface Props {
  images: ImageObject[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<ImageObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
}

export default function ImageLayer({ images, selectedId, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {images.map((img) => (
        <ImageElement
          key={img.id}
          image={img}
          selected={selectedId === img.id}
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
