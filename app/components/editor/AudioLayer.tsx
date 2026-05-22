"use client";

import AudioElement from "./AudioElement";
import type { AudioObject } from "@/app/lib/presentations";

interface Props {
  audios: AudioObject[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<AudioObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  onEdit?: (id: string) => void;
}

export default function AudioLayer({ audios, selectedId, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu, onEdit }: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {audios.map((a) => (
        <AudioElement
          key={a.id}
          audio={a}
          selected={selectedId === a.id}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onCommit={onCommit}
          onSnap={onSnap}
          onDragEnd={onDragEnd}
          onContextMenu={onContextMenu}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
