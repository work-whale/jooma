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
  editingInnerImageId?: string | null;
  onEnterEditInner?: (id: string) => void;
  onExitEditInner?: () => void;
  onRemoveInnerImage?: () => void;
  /** Returns true if this image is part of the active multi-selection. */
  isInMultiSelection?: (id: string) => boolean;
  /** Called on mousedown over a multi-selected image to start the group drag. */
  onGroupDragStart?: (e: React.MouseEvent) => void;
  /** Called on Alt+mousedown to spawn a duplicate and drag it. */
  onCloneAndDrag?: (id: string, e: React.MouseEvent) => void;
}

export default function ImageLayer({ images, selectedId, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu, editingInnerImageId, onEnterEditInner, onExitEditInner, onRemoveInnerImage, isInMultiSelection, onGroupDragStart, onCloneAndDrag }: Props) {
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
          editingInner={editingInnerImageId === img.id}
          onEnterEditInner={onEnterEditInner}
          onExitEditInner={onExitEditInner}
          onRemoveInnerImage={onRemoveInnerImage}
          inMultiSelection={isInMultiSelection?.(img.id) ?? false}
          onGroupDragStart={onGroupDragStart}
          onCloneAndDrag={onCloneAndDrag ? (e) => onCloneAndDrag(img.id, e) : undefined}
        />
      ))}
    </div>
  );
}
