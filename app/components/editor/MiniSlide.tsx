"use client";

import { memo } from "react";
import type { SlideJSON, ShapeObject, TextObject, ImageObject } from "@/app/lib/presentations";
import { SLIDE_W, SLIDE_H } from "./constants";
import { getFrameStyle } from "./frames";

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
        lineHeight: 1.2,
        wordWrap: "break-word",
        whiteSpace: "pre-wrap",
        userSelect: "none",
        transform: `rotate(${text.rotation ?? 0}deg)`,
        transformOrigin: "center center",
      }}
    >
      {text.text}
    </div>
  );
});

const MiniImage = memo(function MiniImage({ image }: { image: ImageObject }) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: image.frame && image.frame !== "none" ? "cover" : "fill",
          userSelect: "none",
          transform: `scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})`,
          transformOrigin: "center center",
          ...getFrameStyle(image.frame),
        }}
      />
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
      </div>
    </div>
  );
}

// Memo so non-active slide thumbnails don't re-render when only the active slide changes.
const MiniSlide = memo(MiniSlideBase);
export default MiniSlide;
