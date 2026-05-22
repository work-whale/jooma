"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import type { VideoObject } from "@/app/lib/presentations";
import { youtubeEmbedUrl, youtubeThumbnail } from "./youtube";
import { getFrameStyle, getFrameCornerPx } from "./frames";
import type { FrameShape } from "./frames";

interface Props {
  video: VideoObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<VideoObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
}

type HandlePos = "tl" | "tr" | "bl" | "br";
const HANDLES: HandlePos[] = ["tl", "tr", "bl", "br"];

const MIN_W = 200;
const MIN_H = 120;

export default function VideoElement({ video, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // For YouTube: until the user clicks the play overlay, render a poster image
  // instead of the iframe. Keeps the editor light and avoids dozens of network
  // requests just to scroll past video slides.
  const [activated, setActivated] = useState(false);
  const rotation = video.rotation ?? 0;

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) onSelect(video.id);
    if (video.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = video.x;
    const origY = video.y;
    let moved = false;
    const canSnap = onSnap && (video.rotation ?? 0) === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const snapped = onSnap(video.id, nx, ny, video.width, video.height);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(video.id, { x: nx, y: ny });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onDragEnd?.();
      if (moved) onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleHandleMouseDown = (pos: HandlePos) => (e: React.MouseEvent) => {
    if (video.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = video.x, origY = video.y;
    const origW = video.width, origH = video.height;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      // Alt held → symmetric resize: opposite edge extends by the same amount,
      // so the centre stays fixed. Achieved by doubling the size delta and
      // shifting x/y by half the extra growth.
      const fromCenter = ev.altKey;
      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (fromCenter) {
        if (pos === "tl") { nx = origX + dx; ny = origY + dy; nw = origW - 2 * dx; nh = origH - 2 * dy; }
        if (pos === "tr") { nx = origX - dx; ny = origY + dy; nw = origW + 2 * dx; nh = origH - 2 * dy; }
        if (pos === "bl") { nx = origX + dx; ny = origY - dy; nw = origW - 2 * dx; nh = origH + 2 * dy; }
        if (pos === "br") { nx = origX - dx; ny = origY - dy; nw = origW + 2 * dx; nh = origH + 2 * dy; }
      } else {
        if (pos === "tl") { nx = origX + dx; ny = origY + dy; nw = origW - dx; nh = origH - dy; }
        if (pos === "tr") { ny = origY + dy; nw = origW + dx; nh = origH - dy; }
        if (pos === "bl") { nx = origX + dx; nw = origW - dx; nh = origH + dy; }
        if (pos === "br") { nw = origW + dx; nh = origH + dy; }
      }
      if (nw < MIN_W) { if (pos === "tl" || pos === "bl") nx = origX + (origW - MIN_W) / (fromCenter ? 2 : 1); nw = MIN_W; }
      if (nh < MIN_H) { if (pos === "tl" || pos === "tr") ny = origY + (origH - MIN_H) / (fromCenter ? 2 : 1); nh = MIN_H; }
      onUpdate(video.id, { x: nx, y: ny, width: nw, height: nh });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const isYoutube = video.source === "youtube";
  const ytPoster = isYoutube ? youtubeThumbnail(video.src) : null;
  const ytEmbed = isYoutube
    ? youtubeEmbedUrl(video.src, { start: video.startSeconds, end: video.endSeconds, autoplay: activated })
    : null;
  // The same frame system the editor uses for images works here: CSS
  // clip-path / border-radius applied to the inner content wrapper so the
  // outline (drawn on the outer element) still hugs the rect.
  const frameStyle = getFrameStyle(
    (video.frame ?? "none") as FrameShape,
    video.cornerRadius,
  );
  // Mirror the frame's rounded corners onto the outer container so the
  // selection outline curves with the picture instead of being a square box.
  const outerCornerPx = getFrameCornerPx(
    (video.frame ?? "none") as FrameShape,
    video.cornerRadius,
  );

  return (
    <div
      ref={ref}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(video.id);
        onContextMenu(video.id, e.clientX, e.clientY);
      }}
      style={{
        position: "absolute",
        left: video.x,
        top: video.y,
        width: video.width,
        height: video.height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        pointerEvents: "auto",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        borderRadius: outerCornerPx ?? undefined,
        zIndex: video.z,
        cursor: video.locked ? "default" : selected ? "move" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        backgroundColor: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          backgroundColor: "#000",
          ...frameStyle,
        }}
      >
        {video.isPending ? (
          <div className="absolute inset-0 jooma-shimmer" />
        ) : isYoutube ? (
          activated ? (
            <iframe
              src={ytEmbed ?? ""}
              title={video.title ?? "YouTube video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            />
          ) : (
            <div
              onClick={(e) => {
                // Click activates the iframe — but only if the user wasn't
                // mid-drag (handled by mousedown above). Selected-only behavior
                // so the first click selects and the second activates playback.
                if (selected) {
                  e.stopPropagation();
                  setActivated(true);
                }
              }}
              style={{ width: "100%", height: "100%", position: "relative", cursor: "pointer" }}
            >
              {ytPoster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ytPoster}
                  alt={video.title ?? "Video"}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
              <div
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.25)",
                }}
              >
                <div
                  style={{
                    width: 64, height: 64, borderRadius: 999,
                    backgroundColor: "rgba(255, 0, 0, 0.92)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Play className="w-7 h-7 text-white ml-1" />
                </div>
              </div>
            </div>
          )
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={video.src}
            controls
            style={{ width: "100%", height: "100%", display: "block", backgroundColor: "#000" }}
          />
        )}
      </div>

      {selected && !video.locked && HANDLES.map((pos) => {
        // Pull corner handles inward by R*(1 - 1/√2) so they sit on the
        // rounded corner's 45° point instead of the square bounding box.
        const cornerInset = (outerCornerPx ?? 0) * (1 - 1 / Math.SQRT2);
        return (
          <div
            key={pos}
            onMouseDown={handleHandleMouseDown(pos)}
            style={{
              position: "absolute",
              width: 14, height: 14,
              background: "#fff", border: "2px solid #7c3aed", borderRadius: 4,
              cursor: pos === "tl" || pos === "br" ? "nwse-resize" : "nesw-resize",
              top: pos[0] === "t" ? -7 + cornerInset : "auto",
              bottom: pos[0] === "b" ? -7 + cornerInset : "auto",
              left: pos[1] === "l" ? -7 + cornerInset : "auto",
              right: pos[1] === "r" ? -7 + cornerInset : "auto",
            }}
          />
        );
      })}
    </div>
  );
}
