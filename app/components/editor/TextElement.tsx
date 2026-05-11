"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { TextObject } from "@/app/lib/presentations";

interface Props {
  text: TextObject;
  selected: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TextObject>) => void;
  onCommit: () => void;
}

function TextElement({ text, selected, zoom, onSelect, onUpdate, onCommit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);

  // Push the current text into the DOM whenever the prop changes and we're not editing.
  // (Once contentEditable is on, we let the user type freely and read it back on blur.)
  useEffect(() => {
    if (ref.current && !editing) {
      ref.current.textContent = text.text;
    }
  }, [text.text, editing]);

  // Focus + select all when entering edit mode
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
    if (editing) return;
    e.stopPropagation();
    if (!selected) onSelect(text.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = text.x;
    const origY = text.y;
    let dragged = false;

    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragged = true;
      onUpdate(text.id, { x: origX + dx, y: origY + dy });
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (dragged) onCommit();
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
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
    onCommit(); // commit edit to history
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editing && e.key === "Escape") {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  return (
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
        cursor: editing ? "text" : selected ? "move" : "pointer",
        outline: selected ? "2px solid #7c3aed" : "none",
        outlineOffset: 4,
        pointerEvents: "auto",
        wordWrap: "break-word",
        whiteSpace: "pre-wrap",
        userSelect: editing ? "text" : "none",
        WebkitUserSelect: editing ? "text" : "none",
        minHeight: text.fontSize,
      }}
    />
  );
}

export default memo(TextElement);
