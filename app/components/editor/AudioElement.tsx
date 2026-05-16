"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, RotateCw, AudioLines, Pencil } from "lucide-react";
import type { AudioObject } from "@/app/lib/presentations";

interface Props {
  audio: AudioObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<AudioObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  onEdit?: (id: string) => void;
}

type HandlePos = "tl" | "tr" | "bl" | "br";
const HANDLES: HandlePos[] = ["tl", "tr", "bl", "br"];

const MIN_W = 540;
const MIN_H = 56;

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioElement({ audio, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu, onEdit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);
  const rotation = audio.rotation ?? 0;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(el.currentTime);
      if (el.duration && isFinite(el.duration)) setProgress(el.currentTime / el.duration);
    };
    const onLoaded = () => {
      if (el.duration && isFinite(el.duration)) setDuration(el.duration);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("ended", onEnd);
    };
  }, [audio.src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_SPEEDS[speedIdx];
  }, [speedIdx]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const skip = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min((el.duration || 0), el.currentTime + delta));
  };
  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpeedIdx((i) => (i + 1) % PLAYBACK_SPEEDS.length);
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
  };

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) onSelect(audio.id);
    if (audio.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = audio.x;
    const origY = audio.y;
    let moved = false;
    const canSnap = onSnap && (audio.rotation ?? 0) === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const snapped = onSnap(audio.id, nx, ny, audio.width, audio.height);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(audio.id, { x: nx, y: ny });
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
    if (audio.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = audio.x, origY = audio.y;
    const origW = audio.width, origH = audio.height;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (pos === "tl") { nx = origX + dx; ny = origY + dy; nw = origW - dx; nh = origH - dy; }
      if (pos === "tr") { ny = origY + dy; nw = origW + dx; nh = origH - dy; }
      if (pos === "bl") { nx = origX + dx; nw = origW - dx; nh = origH + dy; }
      if (pos === "br") { nw = origW + dx; nh = origH + dy; }
      if (nw < MIN_W) { if (pos === "tl" || pos === "bl") nx = origX + (origW - MIN_W); nw = MIN_W; }
      if (nh < MIN_H) { if (pos === "tl" || pos === "tr") ny = origY + (origH - MIN_H); nh = MIN_H; }
      onUpdate(audio.id, { x: nx, y: ny, width: nw, height: nh });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Defaults sit in the "warm" range so a player dropped on a blank slide still
  // looks intentional. Generated audios bake theme colours into the AudioObject.
  const BAR_BG = audio.panelBg ?? "rgba(255,232,200,0.18)";
  const INK = audio.panelInk ?? "#FFE8C8";
  const ACCENT = audio.playBg ?? "#34A853";
  const ACCENT_INK = audio.playInk ?? "#ffffff";

  return (
    <div
      ref={ref}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(audio.id);
        onContextMenu(audio.id, e.clientX, e.clientY);
      }}
      style={{
        position: "absolute",
        left: audio.x,
        top: audio.y,
        width: audio.width,
        height: audio.height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        pointerEvents: "auto",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        zIndex: audio.z,
        cursor: audio.locked ? "default" : selected ? "move" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        className="w-full h-full rounded-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: BAR_BG }}
      >
        <div className="flex items-center gap-3 px-4 py-3 flex-1">
          <button
            type="button"
            onClick={skip(-5)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 relative"
            title="Back 5s"
            style={{ color: INK }}
          >
            <RotateCcw className="w-4 h-4" />
            <span className="absolute text-[8px] font-bold" style={{ transform: "translate(0, 1px)" }}>5</span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="w-10 h-10 rounded-lg flex items-center justify-center hover:scale-105 transition-transform shrink-0"
            style={{ backgroundColor: ACCENT, color: ACCENT_INK }}
            disabled={!audio.src}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={skip(5)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 relative"
            title="Forward 5s"
            style={{ color: INK }}
          >
            <RotateCw className="w-4 h-4" />
            <span className="absolute text-[8px] font-bold" style={{ transform: "translate(0, 1px)" }}>5</span>
          </button>

          <button
            type="button"
            onClick={cycleSpeed}
            className="px-2 py-1 text-sm font-bold rounded hover:bg-white/10"
            style={{ color: INK }}
            title="Playback speed"
          >
            {PLAYBACK_SPEEDS[speedIdx]}x
          </button>

          <p className="flex-1 truncate italic text-sm" style={{ color: INK, opacity: 0.95 }}>
            {audio.title || "Audio clip"}
          </p>

          <AudioLines className="w-5 h-5 shrink-0" style={{ color: ACCENT }} />
          <span className="text-sm font-mono tabular-nums shrink-0" style={{ color: INK }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit?.(audio.id); }}
            className="px-3 py-1.5 text-xs font-semibold rounded-full flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: ACCENT, color: ACCENT_INK }}
            title="Edit audio"
          >
            <Pencil className="w-3 h-3" />
            Edit audio
          </button>
        </div>

        <div className="px-4 pb-3">
          <div
            onClick={seek}
            className="h-1.5 rounded-full cursor-pointer relative overflow-hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
          >
            <div
              className="absolute top-0 left-0 h-full"
              style={{ width: `${progress * 100}%`, backgroundColor: ACCENT }}
            />
            <div
              className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 shadow"
              style={{ left: `calc(${progress * 100}% - 6px)`, backgroundColor: "#fff" }}
            />
          </div>
        </div>

        {audio.src && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio ref={audioRef} src={audio.src} preload="metadata" />
        )}
      </div>

      {selected && !audio.locked && HANDLES.map((pos) => (
        <div
          key={pos}
          onMouseDown={handleHandleMouseDown(pos)}
          style={{
            position: "absolute",
            width: 14, height: 14,
            background: "#fff", border: "2px solid #7c3aed", borderRadius: 4,
            cursor: pos === "tl" || pos === "br" ? "nwse-resize" : "nesw-resize",
            top: pos[0] === "t" ? -7 : "auto",
            bottom: pos[0] === "b" ? -7 : "auto",
            left: pos[1] === "l" ? -7 : "auto",
            right: pos[1] === "r" ? -7 : "auto",
          }}
        />
      ))}
    </div>
  );
}
