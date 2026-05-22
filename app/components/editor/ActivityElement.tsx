"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import type { ActivityObject } from "@/app/lib/presentations";
import type { SlideshowTheme } from "@/app/lib/slideshowThemes";

interface Props {
  activity: ActivityObject;
  selected: boolean;
  zoom: number;
  theme: SlideshowTheme;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ActivityObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
  inMultiSelection?: boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (e: React.MouseEvent) => void;
}

type HandlePos = "tl" | "tr" | "bl" | "br";
const HANDLES: HandlePos[] = ["tl", "tr", "bl", "br"];

const MIN_W = 480;
const MIN_H = 280;

/** Renders the "ordering" activity: a vertical stack of light-blue rounded
 *  cards. When `answerMode` is on, items are shown in `answerItems` order
 *  with large right-side numbers and a green check badge top-right. */
function OrderingActivity({ activity, theme, answerMode }: {
  activity: ActivityObject;
  theme: SlideshowTheme;
  answerMode: boolean;
}) {
  const cardBg = theme.palette.activityCardBg ?? "#e7eef7";
  const cardInk = theme.palette.activityCardInk ?? theme.palette.text;
  const cards = answerMode ? (activity.answerItems ?? activity.items) : activity.items;
  const gap = 14;
  // Compute card height to fill the box neatly.
  const usableH = activity.height - 24; // outer padding
  const cardH = Math.max(50, (usableH - gap * (cards.length - 1)) / Math.max(1, cards.length));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: 12,
        boxSizing: "border-box",
        display: "flex",
        gap: 24,
        alignItems: "stretch",
        position: "relative",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap, justifyContent: "center" }}>
        {cards.map((label, i) => (
          <div
            key={i}
            style={{
              height: cardH,
              borderRadius: 12,
              backgroundColor: cardBg,
              color: cardInk,
              border: `1.5px solid rgba(0,0,0,0.18)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 22,
              fontFamily: theme.fonts.body,
              padding: "0 24px",
              textAlign: "center",
            }}
          >
            {label}
          </div>
        ))}
      </div>
      {answerMode && (
        <div
          style={{
            width: 64,
            display: "flex",
            flexDirection: "column",
            gap,
            justifyContent: "center",
          }}
        >
          {cards.map((_, i) => (
            <div
              key={i}
              style={{
                height: cardH,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 28,
                color: theme.palette.text,
              }}
            >
              {i + 1}.
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders the "question" activity inside a speech-bubble shape. Question
 *  mode: image (left) + question (right). Answer mode: centered "You might
 *  have said..." + bullet list. */
function QuestionActivity({ activity, theme, answerMode }: {
  activity: ActivityObject;
  theme: SlideshowTheme;
  answerMode: boolean;
}) {
  const stroke = theme.palette.speechBubbleStroke ?? "#1a1a1a";
  // The bubble is an ellipse with a triangular pointer at the bottom-left.
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <ellipse cx="50" cy="46" rx="48" ry="40" fill="white" stroke={stroke} strokeWidth="1.5" />
        <polygon points="20,82 32,75 28,92" fill="white" stroke={stroke} strokeWidth="1.5" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "8% 12% 14% 12%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {answerMode ? (
          <div
            style={{
              fontFamily: theme.fonts.body,
              color: theme.palette.text,
              textAlign: "center",
              width: "100%",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 10 }}>
              You might have said…
            </div>
            <div style={{ fontSize: 18, lineHeight: 1.55 }}>
              {(activity.answerItems ?? []).map((item, i) => (
                <div key={i}>{item}</div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 24, alignItems: "center", width: "100%" }}>
            {activity.image?.src && (
              <div
                style={{
                  width: "40%",
                  aspectRatio: "1 / 1",
                  borderRadius: 10,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "#000",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activity.image.src}
                  alt=""
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            )}
            <div
              style={{
                flex: 1,
                fontFamily: theme.fonts.body,
                color: theme.palette.text,
                fontSize: 20,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {activity.questionText || "Add a question…"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityElement({
  activity, selected, zoom, theme,
  onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu,
  inMultiSelection = false, onGroupDragStart, onCloneAndDrag,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rotation = activity.rotation ?? 0;
  const checkBg = theme.palette.checkBadgeBg ?? "#2e9d54";
  const checkInk = theme.palette.checkBadgeInk ?? "#ffffff";

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (e.altKey && onCloneAndDrag && !activity.locked) {
      onCloneAndDrag(e);
      return;
    }
    if (inMultiSelection && onGroupDragStart && !e.shiftKey) {
      onGroupDragStart(e);
      return;
    }
    e.stopPropagation();
    if (!selected) onSelect(activity.id);
    if (activity.locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = activity.x;
    const origY = activity.y;
    let moved = false;
    const canSnap = onSnap && rotation === 0;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const snapped = onSnap(activity.id, nx, ny, activity.width, activity.height);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(activity.id, { x: nx, y: ny });
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
    if (activity.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = activity.x, origY = activity.y;
    const origW = activity.width, origH = activity.height;
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
      onUpdate(activity.id, { x: nx, y: ny, width: nw, height: nh });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      ref={ref}
      onMouseDown={handleBodyMouseDown}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(activity.id);
        onContextMenu(activity.id, e.clientX, e.clientY);
      }}
      style={{
        position: "absolute",
        left: activity.x,
        top: activity.y,
        width: activity.width,
        height: activity.height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        pointerEvents: "auto",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        zIndex: activity.z,
        cursor: activity.locked ? "default" : selected ? "move" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {activity.kind === "order" ? (
        <OrderingActivity activity={activity} theme={theme} answerMode={activity.answerMode} />
      ) : (
        <QuestionActivity activity={activity} theme={theme} answerMode={activity.answerMode} />
      )}

      {activity.answerMode && (
        <div
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: checkBg,
            color: checkInk,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          }}
        >
          <Check className="w-6 h-6" strokeWidth={3} />
        </div>
      )}

      {selected && !activity.locked && HANDLES.map((pos) => (
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
