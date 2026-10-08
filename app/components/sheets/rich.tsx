"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Inline text on a sheet: **bold**, fractions drawn stacked (3/4), and, where
 * asked for, ___ drawn as a writing gap.
 *
 * Fractions: a numeric a/b that is not part of a longer slash run, so a date
 * such as 12/05/2026 is left alone. Drawn stacked so a maths sheet reads like
 * a maths sheet, rather than as the "random slashes" teachers reported.
 */
export function Rich({ text, gaps = false }: { text: string; gaps?: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{inline(part.slice(2, -2), gaps)}</strong>
        ) : (
          <Fragment key={i}>{inline(part, gaps)}</Fragment>
        ),
      )}
    </>
  );
}

const FRACTION = /(?<![\d/.])(\d{1,4})\/(\d{1,4})(?![\d/])/g;

function inline(text: string, gaps: boolean): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pieces = gaps ? text.split(/(___)/g) : [text];
  pieces.forEach((piece, pi) => {
    if (gaps && piece === "___") {
      out.push(<span key={`g${pi}`} className="js-gap" />);
      return;
    }
    let last = 0;
    for (const m of piece.matchAll(FRACTION)) {
      if (m.index! > last) out.push(piece.slice(last, m.index));
      out.push(
        <span key={`f${pi}-${m.index}`} className="js-frac" aria-label={`${m[1]} over ${m[2]}`}>
          <span>{m[1]}</span>
          <span>{m[2]}</span>
        </span>,
      );
      last = m.index! + m[0].length;
    }
    if (last < piece.length) out.push(piece.slice(last));
  });
  return out;
}

/**
 * Text a teacher can click into and change.
 *
 * Shown formatted until clicked, then as the plain text it is stored as, with
 * the **bold** markers visible, so what is edited is exactly what is saved.
 * Committed on blur, which is also where the editor records the change for
 * undo. Enter finishes a single-line field; Escape abandons the edit.
 */
export function EditableText({
  value,
  onChange,
  editable,
  as: Tag = "span",
  className = "",
  placeholder = "Type here",
  multiline = false,
  gaps = false,
  label,
  id,
}: {
  value: string;
  onChange?: (next: string) => void;
  editable: boolean;
  as?: "span" | "p" | "div" | "h1" | "h2" | "h3";
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  gaps?: boolean;
  /** Accessible name while editing, e.g. "Question 3". */
  label?: string;
  /** An anchor for the outline rail. */
  id?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const original = useRef(value);

  useLayoutEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.innerText = value;
    el.focus();
    // Caret at the end, where most edits start.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only on entering edit mode: the text is the DOM's from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (!editing) original.current = value;
  }, [value, editing]);

  if (!editable || !editing) {
    return (
      // Keyed apart from the editing element below: the browser writes the
      // typed text into that one, and if React reused the node for this view it
      // would add its own text beside the typed text, showing it twice.
      <Tag
        key="view"
        id={id}
        className={`${editable ? "js-edit " : ""}${className}`}
        data-placeholder={placeholder}
        onClick={editable ? () => setEditing(true) : undefined}
        onKeyDown={editable ? (e: React.KeyboardEvent) => { if (e.key === "Enter") setEditing(true); } : undefined}
        tabIndex={editable ? 0 : undefined}
        role={editable ? "button" : undefined}
        aria-label={editable ? `Edit ${label ?? "text"}` : undefined}
      >
        {value ? <Rich text={value} gaps={gaps} /> : null}
      </Tag>
    );
  }

  const finish = (commit: boolean) => {
    const el = ref.current;
    const raw = el ? el.innerText : value;
    const next = multiline ? raw.replace(/\n{3,}/g, "\n\n").trim() : raw.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (commit && next !== original.current) onChange?.(next);
  };

  return (
    <Tag
      key="editing"
      id={id}
      ref={(el: HTMLElement | null) => { ref.current = el; }}
      className={`js-edit ${className}`}
      contentEditable
      suppressContentEditableWarning
      aria-label={label}
      data-placeholder={placeholder}
      onBlur={() => finish(true)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
        if (e.key === "Enter" && !multiline) { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
      }}
      onPaste={(e: React.ClipboardEvent) => {
        // Plain text only: pasted formatting would not survive saving anyway.
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
    />
  );
}
