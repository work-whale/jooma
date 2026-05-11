"use client";

import { memo, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import type { TextObject } from "@/app/lib/presentations";

interface Props {
  text: TextObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TextObject>) => void;
  onCommit: () => void;
  onSnap?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd?: () => void;
  onContextMenu?: (id: string, clientX: number, clientY: number) => void;
}

function TextElement({ text, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const rotation = text.rotation ?? 0;

  useEffect(() => {
    if (ref.current && !editing) {
      ref.current.textContent = text.text;
    }
  }, [text.text, editing]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (text.locked) return;
    if (editing) return;
    e.stopPropagation();
    if (!selected) onSelect(text.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = text.x;
    const origY = text.y;
    let dragged = false;

    const canSnap = onSnap && (text.rotation ?? 0) === 0;
    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragged = true;
      let nx = origX + dx, ny = origY + dy;
      if (canSnap) {
        const snapped = onSnap(text.id, nx, ny, text.width, text.fontSize * 1.2);
        nx = snapped.x; ny = snapped.y;
      }
      onUpdate(text.id, { x: nx, y: ny });
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      onDragEnd?.();
      if (dragged) onCommit();
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (text.locked) return;
    e.stopPropagation();
    if (!selected) onSelect(text.id);
    setEditing(true);
  };

  const handleBlur = () => {
    if (ref.current) {
      const newText = ref.current.textContent ?? "";
      if (newText !== text.text) onUpdate(text.id, { text: newText });
    }
    setEditing(false);
    onCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editing && e.key === "Escape") {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  const handleRotateMouseDown = (e: React.MouseEvent) => {
    if (text.locked) return;
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const origRotation = text.rotation ?? 0;

    const move = (ev: MouseEvent) => {
      const currentAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      let newRot = origRotation + deltaDeg;
      if (ev.shiftKey) newRot = Math.round(newRot / 15) * 15;
      newRot = ((newRot % 360) + 360) % 360;
      onUpdate(text.id, { rotation: newRot });
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
      ref={containerRef}
      style={{
        position: "absolute",
        left: text.x,
        top: text.y,
        width: text.width,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        pointerEvents: "auto",
      }}
      onContextMenu={(e) => {
        if (!onContextMenu || editing) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(text.id);
        onContextMenu(text.id, e.clientX, e.clientY);
      }}
    >
      <div
        ref={ref}
        contentEditable={editing}
        suppressContentEditableWarning
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        spellCheck={editing}
        style={{
          width: "100%",
          fontSize: text.fontSize,
          fontFamily: text.fontFamily,
          fontWeight: text.fontWeight,
          fontStyle: text.fontStyle,
          textDecoration: text.underline ? "underline" : "none",
          color: text.color,
          textAlign: text.textAlign,
          lineHeight: 1.2,
          cursor: text.locked ? "default" : editing ? "text" : selected ? "move" : "pointer",
          outline: selected ? "2px solid #7c3aed" : "none",
          outlineOffset: 4,
          wordWrap: "break-word",
          whiteSpace: "pre-wrap",
          userSelect: editing ? "text" : "none",
          WebkitUserSelect: editing ? "text" : "none",
          minHeight: text.fontSize,
        }}
      />
      {selected && !editing && !text.locked && (
        <div
          onMouseDown={handleRotateMouseDown}
          title="Rotate (hold Shift to snap)"
          style={{
            position: "absolute",
            left: "50%",
            top: -32,
            width: 22,
            height: 22,
            background: "#ffffff",
            border: "1.5px solid #7c3aed",
            borderRadius: "50%",
            cursor: "grab",
            pointerEvents: "auto",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#7c3aed",
          }}
        >
          <RotateCw className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

export default memo(TextElement);
