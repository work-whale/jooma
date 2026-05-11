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
}

export default function ImageLayer({ images, selectedId, zoom, onSelect, onUpdate, onCommit }: Props) {
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
        />
      ))}
    </div>
  );
}
