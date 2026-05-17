"use client";

import { memo } from "react";
import type { SlideJSON, ShapeObject, TextObject, ImageObject, AudioObject, VideoObject } from "@/app/lib/presentations";
import { SLIDE_W, SLIDE_H } from "./constants";
import { getFrameStyle } from "./frames";
import { youtubeThumbnail } from "./youtube";

interface Props {
  slide: SlideJSON;
  width: number;
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
      }}
    >
      {isList ? (
        text.text.split("\n").map((line, i) => (
          <div key={i} style={{ display: "flex", gap: "0.6em", alignItems: "baseline" }}>
            <span style={{ flexShrink: 0 }}>
              {text.listType === "bullet" ? "•" : `${i + 1}.`}
            </span>
            <span>{line}</span>
          </div>
        ))
      ) : (
        text.text
      )}
    </div>
  );
});

const MiniImage = memo(function MiniImage({ image }: { image: ImageObject }) {
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
                  src={image.src}
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

function MiniSlideBase({ slide, width }: Props) {
  const scale = width / SLIDE_W;
  const height = SLIDE_H * scale;

  // Mirror the editor's bgMetrics so thumbnails clamp offsets the same way.
  let backgroundSize: string = "cover";
  let offX = 0;
  let offY = 0;
  if (slide.backgroundImage) {
    const userScale = Math.max(1, slide.backgroundScale ?? 1);
    let scaledW = SLIDE_W * userScale;
    let scaledH = SLIDE_H * userScale;
    if (slide.backgroundImageWidth && slide.backgroundImageHeight) {
      const coverScale = Math.max(SLIDE_W / slide.backgroundImageWidth, SLIDE_H / slide.backgroundImageHeight);
      scaledW = slide.backgroundImageWidth * coverScale * userScale;
      scaledH = slide.backgroundImageHeight * coverScale * userScale;
    }
    const maxX = Math.max(0, (scaledW - SLIDE_W) / 2);
    const maxY = Math.max(0, (scaledH - SLIDE_H) / 2);
    offX = Math.max(-maxX, Math.min(maxX, slide.backgroundOffsetX ?? 0));
    offY = Math.max(-maxY, Math.min(maxY, slide.backgroundOffsetY ?? 0));
    backgroundSize = `${scaledW * scale}px ${scaledH * scale}px`;
  }

  return (
    <div
      style={{
        width,
        height,
        overflow: "hidden",
        position: "relative",
        backgroundColor: slide.background ?? "#ffffff",
        backgroundImage: slide.backgroundImage ? `url(${slide.backgroundImage})` : undefined,
        backgroundSize,
        backgroundRepeat: "no-repeat",
        backgroundPosition: slide.backgroundImage
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
        {(slide.images ?? []).map((i) => <MiniImage key={i.id} image={i} />)}
        {(slide.shapes ?? []).map((s) => <MiniShape key={s.id} shape={s} />)}
        {(slide.texts ?? []).map((t) => <MiniText key={t.id} text={t} />)}
        {(slide.audios ?? []).map((a) => <MiniAudio key={a.id} audio={a} />)}
        {(slide.videos ?? []).map((v) => <MiniVideo key={v.id} video={v} />)}
      </div>
    </div>
  );
}

// Memo so non-active slide thumbnails don't re-render when only the active slide changes.
const MiniSlide = memo(MiniSlideBase);
export default MiniSlide;
