"use client";

import VideoElement from "./VideoElement";
import type { VideoObject } from "@/app/lib/presentations";

interface Props {
  videos: VideoObject[];
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<VideoObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
}

export default function VideoLayer({ videos, selectedId, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {videos.map((v) => (
        <VideoElement
          key={v.id}
          video={v}
          selected={selectedId === v.id}
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
