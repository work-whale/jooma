"use client";

import { memo, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import type { TextObject } from "@/app/lib/presentations";

// Each list line: a <div> containing a non-editable marker <span> followed by an
// editable content <span>. contenteditable="false" prevents the user from
// deleting the marker via backspace, even at the start of the line. On save we
// read only the editable spans and rejoin with \n.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function markerFor(kind: "bullet" | "number", index: number): string {
  return kind === "bullet" ? "•" : `${index + 1}.`;
}
function renderListHTML(text: string, kind: "bullet" | "number"): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => {
      const content = line ? escapeHtml(line) : "<br>";
      return `<div data-jl="1" style="display:flex;gap:0.6em;align-items:baseline"><span contenteditable="false" data-jl-mark="1" style="flex-shrink:0;user-select:none;-webkit-user-select:none;cursor:default">${markerFor(kind, i)}</span><span data-jl-content="1" style="flex:1">${content}</span></div>`;
    })
    .join("");
}
// Robust: handles a mix of our marker-structured divs and any browser-created
// plain divs/brs/text-nodes that snuck in (e.g. from a Shift+Enter the browser
// inserted, or an Enter that landed outside a content span).
function readListLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      if (lines.length === 0) lines.push(t);
      else lines[lines.length - 1] += t;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        lines.push("");
      } else {
        const editable = el.querySelector<HTMLElement>("[data-jl-content]");
        lines.push(editable ? (editable.textContent ?? "") : (el.textContent ?? ""));
      }
    }
  }
  return lines.length > 0 ? lines : [root.textContent ?? ""];
}
function renumberMarkers(root: HTMLElement, kind: "bullet" | "number") {
  if (kind === "bullet") return;
  const markers = root.querySelectorAll<HTMLElement>("[data-jl-mark]");
  markers.forEach((m, i) => { m.textContent = markerFor(kind, i); });
}

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
  inMultiSelection?: boolean;
  onGroupDragStart?: (e: React.MouseEvent) => void;
  onCloneAndDrag?: (e: React.MouseEvent) => void;
}

function TextElement({ text, selected, zoom, onSelect, onUpdate, onCommit, onSnap, onDragEnd, onContextMenu, inMultiSelection = false, onGroupDragStart, onCloneAndDrag }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const rotation = text.rotation ?? 0;

  useEffect(() => {
    if (!ref.current || editing) return;
    if (text.listType === "bullet" || text.listType === "number") {
      ref.current.innerHTML = renderListHTML(text.text, text.listType);
    } else {
      ref.current.textContent = text.text;
    }
  }, [text.text, text.listType, editing]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    if (text.listType === "bullet" || text.listType === "number") {
      ref.current.innerHTML = renderListHTML(text.text, text.listType);
    } else {
      // contenteditable collapses \n in textContent — wrap each line in a <div>
      // so the browser preserves the line break and treats Enter consistently.
      const lines = text.text.split("\n");
      if (lines.length > 1) {
        ref.current.innerHTML = lines
          .map((l) => `<div>${l ? escapeHtml(l) : "<br>"}</div>`)
          .join("");
      } else {
        ref.current.textContent = text.text;
      }
    }
    ref.current.focus();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editing) return;
    // Alt+mousedown: spawn a duplicate at the same position and drag it.
    if (e.altKey && onCloneAndDrag && !text.locked) {
      onCloneAndDrag(e);
      return;
    }
    // Route to group drag when part of a multi-selection so the whole group
    // moves together and the selection isn't dropped.
    if (inMultiSelection && onGroupDragStart && !e.shiftKey) {
      onGroupDragStart(e);
      return;
    }
    e.stopPropagation();
    if (!selected) onSelect(text.id);
    // Locked: select only so the user can unlock from the toolbar.
    if (text.locked) return;

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
      let newText: string;
      if (text.listType === "bullet" || text.listType === "number") {
        const lines = readListLines(ref.current);
        newText = lines.length > 0 ? lines.join("\n") : (ref.current.textContent ?? "");
      } else {
        // innerText respects block-level line breaks (each <div> the browser
        // inserts for Enter becomes \n). textContent would concatenate without
        // newlines.
        newText = (ref.current.innerText ?? "").replace(/\r\n/g, "\n");
      }
      if (newText !== text.text) onUpdate(text.id, { text: newText });
    }
    setEditing(false);
    onCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editing && e.key === "Escape") {
      e.preventDefault();
      ref.current?.blur();
      return;
    }
    // For list lines: Enter creates a new line with its own marker so the
    // bullets/numbers stay continuous. We ALWAYS preventDefault here so the
    // browser doesn't sneak in a markerless <div>. If the caret can't be
    // located inside one of our content spans (e.g. it landed in the marker or
    // outside everything), we just append a fresh bullet line at the end.
    if (
      editing && e.key === "Enter" && !e.shiftKey &&
      (text.listType === "bullet" || text.listType === "number") &&
      ref.current
    ) {
      e.preventDefault();
      const sel = window.getSelection();
      const tmp = document.createElement("div");

      const insertNewLineAtEnd = (content: string) => {
        if (!ref.current) return;
        tmp.innerHTML = renderListHTML(content, text.listType as "bullet" | "number");
        const newLine = tmp.firstElementChild as HTMLElement | null;
        if (!newLine) return;
        ref.current.appendChild(newLine);
        renumberMarkers(ref.current, text.listType as "bullet" | "number");
        const newContent = newLine.querySelector<HTMLElement>("[data-jl-content]");
        if (newContent && sel) {
          const r = document.createRange();
          r.setStart(newContent, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      };

      if (!sel || sel.rangeCount === 0) {
        insertNewLineAtEnd("");
        return;
      }
      const range = sel.getRangeAt(0);
      // Find the content span the caret is in.
      let node: Node | null = range.startContainer;
      while (node && node !== ref.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute?.("data-jl-content")) break;
        node = node.parentNode;
      }
      if (!node || node === ref.current) {
        insertNewLineAtEnd("");
        return;
      }
      const contentSpan = node as HTMLElement;
      const lineDiv = contentSpan.parentElement;
      if (!lineDiv) {
        insertNewLineAtEnd("");
        return;
      }

      // Split text at the caret: keep `before` in the current line, push `after`
      // into a new line.
      const fullText = contentSpan.textContent ?? "";
      const preRange = range.cloneRange();
      preRange.selectNodeContents(contentSpan);
      preRange.setEnd(range.startContainer, range.startOffset);
      const caretOffset = preRange.toString().length;
      const before = fullText.slice(0, caretOffset);
      const after = fullText.slice(caretOffset);
      contentSpan.textContent = before;

      tmp.innerHTML = renderListHTML(after, text.listType as "bullet" | "number");
      const newLine = tmp.firstElementChild as HTMLElement | null;
      if (!newLine) return;
      lineDiv.insertAdjacentElement("afterend", newLine);
      renumberMarkers(ref.current, text.listType as "bullet" | "number");

      // Place caret at the start of the new line's content span.
      const newContent = newLine.querySelector<HTMLElement>("[data-jl-content]");
      if (newContent) {
        const r = document.createRange();
        r.setStart(newContent, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    // Backspace at the very start of a list line: merge it with the previous line.
    if (
      editing && e.key === "Backspace" &&
      (text.listType === "bullet" || text.listType === "number") &&
      ref.current
    ) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;
      let node: Node | null = range.startContainer;
      while (node && node !== ref.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute?.("data-jl-content")) break;
        node = node.parentNode;
      }
      if (!node || node === ref.current) return;
      const contentSpan = node as HTMLElement;
      // Only intercept if caret is at offset 0 of the content.
      const preRange = range.cloneRange();
      preRange.selectNodeContents(contentSpan);
      preRange.setEnd(range.startContainer, range.startOffset);
      if (preRange.toString().length !== 0) return;
      const lineDiv = contentSpan.parentElement;
      const prevDiv = lineDiv?.previousElementSibling as HTMLElement | null;
      if (!prevDiv) return;
      e.preventDefault();
      const prevContent = prevDiv.querySelector<HTMLElement>("[data-jl-content]");
      if (!prevContent) return;
      const prevLen = (prevContent.textContent ?? "").length;
      prevContent.textContent = (prevContent.textContent ?? "") + (contentSpan.textContent ?? "");
      lineDiv?.remove();
      renumberMarkers(ref.current, text.listType);
      // Place caret at the merge point in the previous line.
      const textNode = prevContent.firstChild ?? prevContent;
      const r = document.createRange();
      if (textNode.nodeType === Node.TEXT_NODE) {
        r.setStart(textNode, Math.min(prevLen, (textNode.textContent ?? "").length));
      } else {
        r.setStart(prevContent, 0);
      }
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  // Resize handles. `w`/`e` change width (height auto-fits content); `n`/`s`
  // set an explicit height on the text box (acts as a min-height in the
  // renderer). Alt held → symmetric resize from the centre.
  const MIN_TEXT_W = 40;
  const MIN_TEXT_H = 20;
  const handleResizeMouseDown = (side: "w" | "e" | "n" | "s") => (e: React.MouseEvent) => {
    if (text.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = text.x;
    const origY = text.y;
    const origW = text.width;
    // For top/bottom resize we need a current height to extend from. If the
    // box has no explicit height yet, fall back to the actual rendered height
    // (containerRef gives us the wrapped content height).
    const measuredH = containerRef.current
      ? containerRef.current.getBoundingClientRect().height / zoom
      : text.fontSize * (text.lineHeight ?? 1.2);
    const origH = text.height ?? measuredH;
    const origCX = origX + origW / 2;
    const origCY = origY + origH / 2;
    const rad = ((text.rotation ?? 0) * Math.PI) / 180;
    const cos2 = Math.cos(rad);
    const sin2 = Math.sin(rad);

    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      // Project screen delta into the text's local (unrotated) frame.
      const localDx = dx * cos2 + dy * sin2;
      const localDy = -dx * sin2 + dy * cos2;
      const fromCenter = ev.altKey;
      const k = fromCenter ? 2 : 1;

      let w = origW;
      let h = origH;
      let cxLocal = 0;
      let cyLocal = 0;
      if (side === "e") {
        w = Math.max(MIN_TEXT_W, origW + k * localDx);
        cxLocal = fromCenter ? 0 : (w - origW) / 2;
      } else if (side === "w") {
        w = Math.max(MIN_TEXT_W, origW - k * localDx);
        cxLocal = fromCenter ? 0 : -(w - origW) / 2;
      } else if (side === "s") {
        h = Math.max(MIN_TEXT_H, origH + k * localDy);
        cyLocal = fromCenter ? 0 : (h - origH) / 2;
      } else { // "n"
        h = Math.max(MIN_TEXT_H, origH - k * localDy);
        cyLocal = fromCenter ? 0 : -(h - origH) / 2;
      }

      // Project the centre shift back into screen space.
      const dCxScreen = cxLocal * cos2 - cyLocal * sin2;
      const dCyScreen = cxLocal * sin2 + cyLocal * cos2;
      const patch: Partial<TextObject> = {};
      if (side === "e" || side === "w") {
        patch.x = origCX + dCxScreen - w / 2;
        patch.y = origCY + dCyScreen - origH / 2;
        patch.width = w;
      } else {
        patch.x = origCX + dCxScreen - origW / 2;
        patch.y = origCY + dCyScreen - h / 2;
        patch.height = h;
      }
      onUpdate(text.id, patch);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onCommit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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
        zIndex: text.z,
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
          lineHeight: text.lineHeight ?? 1.2,
          cursor: text.locked ? "default" : editing ? "text" : selected ? "move" : "pointer",
          outline: selected ? "2px solid #7c3aed" : "none",
          outlineOffset: 4,
          wordWrap: "break-word",
          whiteSpace: "pre-wrap",
          userSelect: editing ? "text" : "none",
          WebkitUserSelect: editing ? "text" : "none",
          // Explicit height from top/bottom resize handles wins; otherwise
          // fall back to one line so a brand-new empty text box is still
          // visible/clickable. The selection outline is on this div, so the
          // user sees the box grow as soon as they drag a top/bottom handle.
          minHeight: text.height ?? text.fontSize,
        }}
      />
      {selected && !editing && !text.locked && (
        <>
          {/* Resize handles. The text element's selection outline sits 4px
              outside the box (outlineOffset: 4), so each handle is centred ON
              that outline rather than the text edge — looks flush with the
              visible selection box. */}
          {([
            { side: "w", cursor: "ew-resize", left: "-4px",         top: "50%" },
            { side: "e", cursor: "ew-resize", left: "calc(100% + 4px)", top: "50%" },
            { side: "n", cursor: "ns-resize", left: "50%",          top: "-4px" },
            { side: "s", cursor: "ns-resize", left: "50%",          top: "calc(100% + 4px)" },
          ] as const).map(({ side, cursor, left, top }) => (
            <div
              key={side}
              onMouseDown={handleResizeMouseDown(side)}
              style={{
                position: "absolute",
                left,
                top,
                width: 10,
                height: 10,
                background: "#ffffff",
                border: "1.5px solid #7c3aed",
                borderRadius: 2,
                cursor,
                pointerEvents: "auto",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
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
        </>
      )}
    </div>
  );
}

export default memo(TextElement);
