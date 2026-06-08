"use client";

import { memo } from "react";
import type { SlideJSON, ShapeObject, TextObject, ImageObject, AudioObject, VideoObject, CalloutObject, BadgeObject, BlockquoteObject, ActivityObject } from "@/app/lib/presentations";
import { getTheme, type SlideshowTheme } from "@/app/lib/slideshowThemes";
import { SLIDE_W, SLIDE_H } from "./constants";
import { getFrameStyle } from "./frames";
import { youtubeThumbnail } from "./youtube";
import { toThumbnailUrl } from "@/app/lib/imageStorage";
import { parseInlineBold } from "@/app/lib/utils";

/** Splits a string into <strong>...</strong> + plain spans so `**bold**`
 *  markers in body text render correctly inside thumbnails. */
function renderInlineBold(s: string) {
  const runs = parseInlineBold(s);
  return runs.map((r, i) =>
    r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>,
  );
}

interface Props {
  slide: SlideJSON;
  width: number;
  /** When true, rewrite Supabase Storage URLs to the image-transformation
   *  endpoint at the thumbnail's render width. Used by the Slideshows index
   *  card grid so it doesn't pull full-res slide images for every row. */
  thumbnailMode?: boolean;
  /** Optional deck-level theme id. The callout/badge/blockquote/activity
   *  primitives need theme colors; we accept it as a prop so the slide tray
   *  and list page can pass the deck's theme even when rendering a non-first
   *  slide (only slides[0] carries themeId in the SlideJSON itself). */
  themeId?: string;
}

// Each inner mini-element is memo'd separately so unchanged elements skip re-render
// when the active slide mutates (e.g. user changing one shape's color).
const MiniShape = memo(function MiniShape({ shape }: { shape: ShapeObject }) {
  const { type, fill, stroke, strokeWidth, cornerRadius } = shape;
  const w = Math.max(1, shape.width);
  const h = Math.max(1, shape.height);
  const rotation = shape.rotation ?? 0;

  let starPts = "";
  if (type === "star") {
    const cx = w / 2, cy = h / 2;
    const rO = Math.min(w, h) / 2 - strokeWidth / 2;
    const rI = rO * 0.4;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rO : rI;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    starPts = pts.join(" ");
  }
  let hexPts = "";
  if (type === "hexagon") {
    const cx = w / 2, cy = h / 2;
    const rW = w / 2 - strokeWidth / 2;
    const rH = h / 2 - strokeWidth / 2;
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      pts.push(`${cx + rW * Math.cos(a)},${cy + rH * Math.sin(a)}`);
    }
    hexPts = pts.join(" ");
  }
  // Path/polygon shapes (speech, heart, cloud, plus, bolt) — mirror the
  // geometry in ShapeElement so thumbnails match the editor canvas. Without
  // these, those shapes render as nothing in the tray/list thumbnails.
  const sw = strokeWidth / 2;
  const W = w - strokeWidth, H = h - strokeWidth;
  let pathD = "";
  let extraPolyPts = "";
  if (type === "speech") {
    const bodyH = H * 0.78;
    const r = Math.min(20, Math.min(W, bodyH) * 0.15);
    pathD =
      `M ${sw + r} ${sw} ` +
      `L ${sw + W - r} ${sw} ` +
      `Q ${sw + W} ${sw}, ${sw + W} ${sw + r} ` +
      `L ${sw + W} ${sw + bodyH - r} ` +
      `Q ${sw + W} ${sw + bodyH}, ${sw + W - r} ${sw + bodyH} ` +
      `L ${sw + W * 0.35} ${sw + bodyH} ` +
      `L ${sw + W * 0.18} ${sw + H} ` +
      `L ${sw + W * 0.25} ${sw + bodyH} ` +
      `L ${sw + r} ${sw + bodyH} ` +
      `Q ${sw} ${sw + bodyH}, ${sw} ${sw + bodyH - r} ` +
      `L ${sw} ${sw + r} ` +
      `Q ${sw} ${sw}, ${sw + r} ${sw} Z`;
  } else if (type === "heart") {
    const x0 = sw, y0 = sw + H * 0.25;
    pathD =
      `M ${x0 + W / 2} ${sw + H} ` +
      `C ${x0 + W / 2} ${sw + H * 0.75}, ${x0} ${sw + H * 0.55}, ${x0} ${y0 + H * 0.05} ` +
      `C ${x0} ${sw}, ${x0 + W * 0.5} ${sw}, ${x0 + W / 2} ${sw + H * 0.25} ` +
      `C ${x0 + W * 0.5} ${sw}, ${x0 + W} ${sw}, ${x0 + W} ${y0 + H * 0.05} ` +
      `C ${x0 + W} ${sw + H * 0.55}, ${x0 + W / 2} ${sw + H * 0.75}, ${x0 + W / 2} ${sw + H} Z`;
  } else if (type === "cloud") {
    pathD =
      `M ${sw + W * 0.20} ${sw + H * 0.75} ` +
      `C ${sw + W * 0.05} ${sw + H * 0.75}, ${sw + W * 0.05} ${sw + H * 0.45}, ${sw + W * 0.22} ${sw + H * 0.45} ` +
      `C ${sw + W * 0.22} ${sw + H * 0.18}, ${sw + W * 0.55} ${sw + H * 0.15}, ${sw + W * 0.58} ${sw + H * 0.4} ` +
      `C ${sw + W * 0.78} ${sw + H * 0.25}, ${sw + W * 0.98} ${sw + H * 0.45}, ${sw + W * 0.86} ${sw + H * 0.55} ` +
      `C ${sw + W * 0.99} ${sw + H * 0.60}, ${sw + W * 0.95} ${sw + H * 0.80}, ${sw + W * 0.80} ${sw + H * 0.75} Z`;
  } else if (type === "plus") {
    const arm = Math.min(W, H) * 0.32;
    const cx = sw + W / 2, cy = sw + H / 2;
    extraPolyPts = [
      `${cx - arm},${sw}`, `${cx + arm},${sw}`,
      `${cx + arm},${cy - arm}`, `${sw + W},${cy - arm}`,
      `${sw + W},${cy + arm}`, `${cx + arm},${cy + arm}`,
      `${cx + arm},${sw + H}`, `${cx - arm},${sw + H}`,
      `${cx - arm},${cy + arm}`, `${sw},${cy + arm}`,
      `${sw},${cy - arm}`, `${cx - arm},${cy - arm}`,
    ].join(" ");
  } else if (type === "bolt") {
    extraPolyPts = [
      `${sw + W * 0.55},${sw}`,
      `${sw + W * 0.15},${sw + H * 0.55}`,
      `${sw + W * 0.45},${sw + H * 0.55}`,
      `${sw + W * 0.30},${sw + H}`,
      `${sw + W * 0.85},${sw + H * 0.42}`,
      `${sw + W * 0.55},${sw + H * 0.42}`,
      `${sw + W * 0.72},${sw}`,
    ].join(" ");
  }

  const arrowHeadId = `mini-arrowhead-${shape.id}`;
  const flipScale = `scale(${shape.flipX ? -1 : 1}, ${shape.flipY ? -1 : 1})`;

  return (
    <div
      style={{
        position: "absolute",
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
        opacity: shape.opacity,
        // Honor the shape's explicit z so the paper backdrop (z: -1) sinks
        // below images. Without this, thumbnails stack in DOM order and the
        // cream paper card paints over every photo.
        zIndex: shape.z,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        filter: shape.shadow ? "drop-shadow(0 6px 12px rgba(0,0,0,0.25))" : undefined,
      }}
    >
      <svg
        width={shape.width}
        height={shape.height}
        style={{ display: "block", overflow: "visible", transform: flipScale, transformOrigin: "center center" }}
      >
        {type === "rect" && (
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={Math.max(0, w - strokeWidth)}
            height={Math.max(0, h - strokeWidth)}
            rx={cornerRadius ?? 0}
            ry={cornerRadius ?? 0}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {type === "ellipse" && (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={Math.max(0, (w - strokeWidth) / 2)}
            ry={Math.max(0, (h - strokeWidth) / 2)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
        {type === "triangle" && (
          <polygon
            points={`${w / 2},${strokeWidth / 2} ${w - strokeWidth / 2},${h - strokeWidth / 2} ${strokeWidth / 2},${h - strokeWidth / 2}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        )}
        {type === "line" && (
          <line
            x1={strokeWidth / 2}
            y1={h / 2}
            x2={w - strokeWidth / 2}
            y2={h / 2}
            stroke={stroke || fill}
            strokeWidth={strokeWidth || 4}
            strokeLinecap="round"
          />
        )}
        {type === "arrow" && (
          <>
            <defs>
              <marker id={arrowHeadId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill={stroke || fill} />
              </marker>
            </defs>
            <line
              x1={(strokeWidth || 4) / 2}
              y1={h / 2}
              x2={Math.max((strokeWidth || 4) / 2, w - (strokeWidth || 4) * 3)}
              y2={h / 2}
              stroke={stroke || fill}
              strokeWidth={strokeWidth || 4}
              markerEnd={`url(#${arrowHeadId})`}
            />
          </>
        )}
        {type === "star" && (
          <polygon points={starPts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        )}
        {type === "hexagon" && (
          <polygon points={hexPts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        )}
        {pathD && (
          <path d={pathD} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        )}
        {extraPolyPts && (
          <polygon points={extraPolyPts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
});

const MiniText = memo(function MiniText({ text }: { text: TextObject }) {
  const isList = text.listType === "bullet" || text.listType === "number";
  return (
    <div
      style={{
        position: "absolute",
        left: text.x,
        top: text.y,
        width: text.width,
        fontSize: text.fontSize,
        fontFamily: text.fontFamily,
        fontWeight: text.fontWeight,
        fontStyle: text.fontStyle,
        textDecoration: text.underline ? "underline" : "none",
        color: text.color,
        textAlign: text.textAlign,
        lineHeight: text.lineHeight ?? 1.2,
        wordWrap: "break-word",
        whiteSpace: isList ? "normal" : "pre-wrap",
        userSelect: "none",
        transform: `rotate(${text.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        ...(text.clipH !== undefined ? { maxHeight: text.clipH, overflow: "hidden" } : {}),
      }}
    >
      {isList ? (
        text.text.split("\n").map((line, i) => (
          <div key={i} style={{ display: "flex", gap: "0.6em", alignItems: "baseline" }}>
            <span style={{ flexShrink: 0 }}>
              {text.listType === "bullet" ? "•" : `${i + 1}.`}
            </span>
            <span>{renderInlineBold(line)}</span>
          </div>
        ))
      ) : (
        renderInlineBold(text.text)
      )}
    </div>
  );
});

const MiniImage = memo(function MiniImage({ image, srcOverride }: { image: ImageObject; srcOverride?: string }) {
  const isFrame = !!image.frame && image.frame !== "none";
  const isEmptyFrame = isFrame && !image.src;
  const frameStyle = getFrameStyle(image.frame, image.cornerRadius);

  // Same metrics as the editor's ImageElement (pixel-space pan/zoom).
  // ImageElement always cover-fits regardless of frame, so MiniSlide must too —
  // otherwise framed canvas crops won't match the tray thumbnail.
  const nW = image.naturalWidth ?? image.width;
  const nH = image.naturalHeight ?? image.height;
  const userScale = Math.max(1, image.innerScale ?? 1);
  const coverScale = Math.max(image.width / nW, image.height / nH);
  const finalScale = coverScale * userScale;
  const scaledW = nW * finalScale;
  const scaledH = nH * finalScale;
  const maxX = Math.max(0, (scaledW - image.width) / 2);
  const maxY = Math.max(0, (scaledH - image.height) / 2);
  const offsetX = Math.max(-maxX, Math.min(maxX, image.innerOffsetX ?? 0));
  const offsetY = Math.max(-maxY, Math.min(maxY, image.innerOffsetY ?? 0));
  const imgLeft = (image.width - scaledW) / 2 + offsetX;
  const imgTop = (image.height - scaledH) / 2 + offsetY;

  return (
    <div
      style={{
        position: "absolute",
        left: image.x,
        top: image.y,
        width: image.width,
        height: image.height,
        opacity: image.opacity,
        transform: `rotate(${image.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        filter: image.shadow ? "drop-shadow(0 6px 12px rgba(0,0,0,0.25))" : undefined,
      }}
    >
      {image.isPending && !image.src ? (
        <div style={{ width: "100%", height: "100%", background: "#e7e5e0", overflow: "hidden", position: "relative", ...frameStyle }}>
          <div className="absolute inset-0 jooma-shimmer" />
        </div>
      ) : isEmptyFrame ? (
        <div style={{ width: "100%", height: "100%", background: "#e7e5e0", ...frameStyle }} />
      ) : (() => {
        const sw = image.strokeWidth ?? 0;
        const sc = image.strokeColor ?? "#1a1a2e";
        const sa = image.strokeAlign ?? "inside";
        const useOuter = sw > 0 && (sa === "outside" || sa === "center");
        const outerPad = useOuter ? (sa === "outside" ? sw : sw / 2) : 0;
        const insetW = sw > 0 ? (sa === "inside" ? sw : sa === "center" ? sw / 2 : 0) : 0;
        return (
          <>
            {useOuter && (
              <div
                style={{
                  position: "absolute",
                  left: -outerPad,
                  top: -outerPad,
                  right: -outerPad,
                  bottom: -outerPad,
                  background: sc,
                  ...frameStyle,
                  pointerEvents: "none",
                }}
              />
            )}
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...frameStyle }}>
              {image.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={srcOverride ?? image.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: imgLeft,
                    top: imgTop,
                    width: scaledW,
                    height: scaledH,
                    maxWidth: "none",
                    maxHeight: "none",
                    display: "block",
                    userSelect: "none",
                    transform: `scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})`,
                    transformOrigin: "center center",
                  }}
                />
              )}
              {insetW > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    boxShadow: `inset 0 0 0 ${insetW}px ${sc}`,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
});

// Tiny audio player representation for thumbnails: a coloured pill with a
// solid play-button square on the left + a translucent progress track. Skips
// playback logic — this is purely a static visual.
const MiniAudio = memo(function MiniAudio({ audio }: { audio: AudioObject }) {
  const barBg = audio.panelBg ?? "rgba(255,232,200,0.18)";
  const accent = audio.playBg ?? "#34A853";
  const accentInk = audio.playInk ?? "#ffffff";
  const ink = audio.panelInk ?? "#FFE8C8";
  return (
    <div
      style={{
        position: "absolute",
        left: audio.x,
        top: audio.y,
        width: audio.width,
        height: audio.height,
        transform: `rotate(${audio.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        zIndex: audio.z,
        borderRadius: 16,
        backgroundColor: barBg,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {/* Play triangle */}
          <svg viewBox="0 0 24 24" width="16" height="16" fill={accentInk}>
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div
          style={{
            flex: 1,
            fontSize: 14,
            color: ink,
            fontStyle: "italic",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            opacity: 0.95,
          }}
        >
          {audio.title || "Audio clip"}
        </div>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,0.15)",
          position: "relative",
        }}
      />
    </div>
  );
});

const MiniVideo = memo(function MiniVideo({ video }: { video: VideoObject }) {
  const poster = video.source === "youtube" ? youtubeThumbnail(video.src) : null;
  const frameStyle = getFrameStyle(video.frame, video.cornerRadius);
  return (
    <div
      style={{
        position: "absolute",
        left: video.x,
        top: video.y,
        width: video.width,
        height: video.height,
        transform: `rotate(${video.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        zIndex: video.z,
        overflow: "hidden",
        backgroundColor: "#000",
        ...frameStyle,
      }}
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          style={{
            width: Math.min(video.width, video.height) * 0.25,
            height: Math.min(video.width, video.height) * 0.25,
            borderRadius: 999,
            backgroundColor: "rgba(255, 0, 0, 0.92)",
          }}
        />
      </div>
    </div>
  );
});

function calloutVariantColors(variant: CalloutObject["variant"], theme: SlideshowTheme) {
  const p = theme.palette;
  switch (variant) {
    case "remember": return { bg: p.calloutBgRemember ?? "#e2eef9", ink: p.calloutInkRemember ?? p.text };
    case "fun":      return { bg: p.calloutBgFun ?? "#ece1f3", ink: p.calloutInkFun ?? p.text };
    case "key":
    default:         return { bg: p.calloutBgKey ?? "#fcecc7", ink: p.calloutInkKey ?? p.text };
  }
}
function calloutVariantEmoji(v: CalloutObject["variant"]) {
  if (v === "remember") return "🧠";
  if (v === "fun") return "🦉";
  return "🔑";
}

const MiniCallout = memo(function MiniCallout({ callout, theme }: { callout: CalloutObject; theme: SlideshowTheme }) {
  const { bg, ink } = calloutVariantColors(callout.variant, theme);
  return (
    <div
      style={{
        position: "absolute",
        left: callout.x,
        top: callout.y,
        width: callout.width,
        height: callout.height,
        transform: `rotate(${callout.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        zIndex: callout.z,
        borderRadius: 16,
        backgroundColor: bg,
        color: ink,
        padding: "20px 22px",
        boxSizing: "border-box",
        fontFamily: theme.fonts.body,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{calloutVariantEmoji(callout.variant)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{callout.label}</div>
          <div style={{ fontSize: 18, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {renderInlineBold(callout.body)}
          </div>
        </div>
      </div>
    </div>
  );
});

const MiniBadge = memo(function MiniBadge({ badge, theme }: { badge: BadgeObject; theme: SlideshowTheme }) {
  const bg = theme.palette.badgeBg ?? theme.palette.accent;
  const ink = theme.palette.badgeInk ?? theme.palette.overlayText;
  return (
    <div
      style={{
        position: "absolute",
        left: badge.x,
        top: badge.y,
        height: 36,
        transform: `rotate(${badge.rotation ?? 0}deg)`,
        transformOrigin: "left top",
        zIndex: badge.z,
        display: "inline-flex",
        alignItems: "center",
        padding: "0 14px",
        borderRadius: 6,
        backgroundColor: bg,
        color: ink,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {badge.text || "BADGE"}
    </div>
  );
});

const MiniBlockquote = memo(function MiniBlockquote({ quote, theme }: { quote: BlockquoteObject; theme: SlideshowTheme }) {
  const rule = theme.palette.blockquoteRule ?? theme.palette.accent;
  return (
    <div
      style={{
        position: "absolute",
        left: quote.x,
        top: quote.y,
        width: quote.width,
        transform: `rotate(${quote.rotation ?? 0}deg)`,
        transformOrigin: "left top",
        zIndex: quote.z,
        borderLeft: `4px solid ${rule}`,
        paddingLeft: 18,
        paddingTop: 4,
        paddingBottom: 4,
        fontFamily: theme.fonts.body,
        fontStyle: "italic",
        fontSize: 22,
        lineHeight: 1.4,
        color: theme.palette.text,
      }}
    >
      <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineBold(quote.text)}</div>
      {quote.attribution && (
        <div style={{ marginTop: 8, fontStyle: "normal", fontSize: 16, color: theme.palette.muted }}>
          — {quote.attribution}
        </div>
      )}
    </div>
  );
});

const MiniActivity = memo(function MiniActivity({ activity, theme }: { activity: ActivityObject; theme: SlideshowTheme }) {
  const cardBg = theme.palette.activityCardBg ?? "#e7eef7";
  const cardInk = theme.palette.activityCardInk ?? theme.palette.text;
  const stroke = theme.palette.speechBubbleStroke ?? "#1a1a1a";
  const checkBg = theme.palette.checkBadgeBg ?? "#2e9d54";
  const checkInk = theme.palette.checkBadgeInk ?? "#ffffff";

  const cards = activity.answerMode ? (activity.answerItems ?? activity.items) : activity.items;
  const gap = 14;
  const cardH = Math.max(40, (activity.height - 24 - gap * Math.max(0, cards.length - 1)) / Math.max(1, cards.length));

  return (
    <div
      style={{
        position: "absolute",
        left: activity.x,
        top: activity.y,
        width: activity.width,
        height: activity.height,
        transform: `rotate(${activity.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        zIndex: activity.z,
      }}
    >
      {activity.kind === "order" ? (
        <div style={{ width: "100%", height: "100%", padding: 12, boxSizing: "border-box", display: "flex", gap: 24 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap, justifyContent: "center" }}>
            {cards.map((label, i) => (
              <div key={i} style={{
                height: cardH,
                borderRadius: 12,
                backgroundColor: cardBg,
                color: cardInk,
                border: `1.5px solid rgba(0,0,0,0.18)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 22, padding: "0 24px", textAlign: "center",
                fontFamily: theme.fonts.body,
              }}>{label}</div>
            ))}
          </div>
          {activity.answerMode && (
            <div style={{ width: 64, display: "flex", flexDirection: "column", gap, justifyContent: "center" }}>
              {cards.map((_, i) => (
                <div key={i} style={{
                  height: cardH,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 28, color: theme.palette.text,
                }}>{i + 1}.</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <ellipse cx="50" cy="46" rx="48" ry="40" fill="white" stroke={stroke} strokeWidth="1.5" />
            <polygon points="20,82 32,75 28,92" fill="white" stroke={stroke} strokeWidth="1.5" />
          </svg>
          <div style={{ position: "absolute", inset: 0, padding: "8% 12% 14% 12%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {activity.answerMode ? (
              <div style={{ fontFamily: theme.fonts.body, color: theme.palette.text, textAlign: "center", width: "100%" }}>
                <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 10 }}>You might have said…</div>
                <div style={{ fontSize: 18, lineHeight: 1.55 }}>
                  {(activity.answerItems ?? []).map((item, i) => (<div key={i}>{item}</div>))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 24, alignItems: "center", width: "100%" }}>
                {activity.image?.src && (
                  <div style={{ width: "40%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#000" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activity.image.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                )}
                <div style={{ flex: 1, fontFamily: theme.fonts.body, color: theme.palette.text, fontSize: 20, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {activity.questionText || "Add a question…"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {activity.answerMode && (
        <div style={{
          position: "absolute", top: -8, right: -8,
          width: 44, height: 44, borderRadius: 10,
          backgroundColor: checkBg, color: checkInk,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          fontWeight: 900, fontSize: 26,
        }}>✓</div>
      )}
    </div>
  );
});

function MiniSlideBase({ slide, width, thumbnailMode, themeId }: Props) {
  const scale = width / SLIDE_W;
  const height = SLIDE_H * scale;
  // Resolve a theme for the new primitives. Prefer the prop, then the slide's
  // own themeId (only set on slides[0]), then the default.
  const theme = getTheme(themeId ?? slide.themeId);

  // When rendering as a thumbnail, rewrite Supabase Storage URLs to the
  // image-transformation endpoint so the browser pulls a CDN-cached small
  // image instead of the full source. Non-Supabase URLs pass through.
  const bgImgSrc = thumbnailMode ? toThumbnailUrl(slide.backgroundImage, width) : slide.backgroundImage;

  // Mirror the editor's bgMetrics so thumbnails clamp offsets the same way.
  // Fallback path: if the slide doesn't carry intrinsic image dimensions
  // (older rows, or rows where the RPC didn't ship them), defer to native
  // CSS `background-size: cover` so the image still cover-fits instead of
  // being stretched to the slide's 16:9.
  let backgroundSize: string = "cover";
  let offX = 0;
  let offY = 0;
  let useCssCover = false;
  if (slide.backgroundImage) {
    if (slide.backgroundImageWidth && slide.backgroundImageHeight) {
      const userScale = Math.max(1, slide.backgroundScale ?? 1);
      const coverScale = Math.max(SLIDE_W / slide.backgroundImageWidth, SLIDE_H / slide.backgroundImageHeight);
      const scaledW = slide.backgroundImageWidth * coverScale * userScale;
      const scaledH = slide.backgroundImageHeight * coverScale * userScale;
      const maxX = Math.max(0, (scaledW - SLIDE_W) / 2);
      const maxY = Math.max(0, (scaledH - SLIDE_H) / 2);
      offX = Math.max(-maxX, Math.min(maxX, slide.backgroundOffsetX ?? 0));
      offY = Math.max(-maxY, Math.min(maxY, slide.backgroundOffsetY ?? 0));
      backgroundSize = `${scaledW * scale}px ${scaledH * scale}px`;
    } else {
      useCssCover = true;
    }
  }

  // Themed illustration background — only when there's no content/hero photo
  // taking the full-bleed slot. Scrim veil composited over the art via CSS.
  const useArt = !bgImgSrc && !!slide.backgroundArt;
  const artScrim = slide.backgroundArtScrim ?? "rgba(255,255,255,0.45)";

  return (
    <div
      style={{
        width,
        height,
        overflow: "hidden",
        position: "relative",
        backgroundColor: slide.background ?? "#ffffff",
        backgroundImage: useArt
          ? `linear-gradient(${artScrim}, ${artScrim}), url(${slide.backgroundArt})`
          : bgImgSrc ? `url(${bgImgSrc})` : undefined,
        backgroundSize: useArt ? "cover" : useCssCover ? "cover" : backgroundSize,
        backgroundRepeat: "no-repeat",
        backgroundPosition: !useArt && slide.backgroundImage && !useCssCover
          ? `calc(50% + ${offX * scale}px) calc(50% + ${offY * scale}px)`
          : "center",
      }}
    >
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
        }}
      >
        {(slide.images ?? []).map((i) => (
          <MiniImage
            key={i.id}
            image={i}
            srcOverride={thumbnailMode ? toThumbnailUrl(i.src, Math.max(80, i.width * scale)) : undefined}
          />
        ))}
        {(slide.shapes ?? []).map((s) => <MiniShape key={s.id} shape={s} />)}
        {(slide.texts ?? []).map((t) => <MiniText key={t.id} text={t} />)}
        {(slide.audios ?? []).map((a) => <MiniAudio key={a.id} audio={a} />)}
        {(slide.videos ?? []).map((v) => <MiniVideo key={v.id} video={v} />)}
        {(slide.callouts ?? []).map((c) => <MiniCallout key={c.id} callout={c} theme={theme} />)}
        {(slide.badges ?? []).map((b) => <MiniBadge key={b.id} badge={b} theme={theme} />)}
        {(slide.blockquotes ?? []).map((q) => <MiniBlockquote key={q.id} quote={q} theme={theme} />)}
        {(slide.activities ?? []).map((a) => <MiniActivity key={a.id} activity={a} theme={theme} />)}
      </div>
    </div>
  );
}

// Memo so non-active slide thumbnails don't re-render when only the active slide changes.
const MiniSlide = memo(MiniSlideBase);
export default MiniSlide;
