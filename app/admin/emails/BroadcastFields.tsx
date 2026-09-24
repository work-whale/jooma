"use client";

// The wording of a bulk email: subject, preview line, heading, body and an
// optional button. Used by the Compose tab and the template editor, so a
// template and a send are written in exactly the same box.

import { useRef } from "react";
import {
  FORMATTING_HELP,
  PLACEHOLDERS,
  PURPOSES,
  PURPOSE_HINT,
  PURPOSE_LABEL,
  type BroadcastContent,
  type Purpose,
} from "@/app/lib/email-templates/broadcast";
import { C, Field, fieldClass, fieldStyle } from "../ui";

export function PurposePicker({
  value,
  onChange,
}: {
  value: Purpose;
  onChange: (p: Purpose) => void;
}) {
  return (
    <Field label="Kind of email" help={PURPOSE_HINT[value]}>
      <select
        aria-label="Kind of email"
        value={value}
        onChange={(e) => onChange(e.target.value as Purpose)}
        className={fieldClass}
        style={fieldStyle}
      >
        {PURPOSES.map((p) => (
          <option key={p} value={p}>
            {PURPOSE_LABEL[p]}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function BroadcastFields({
  value,
  onChange,
}: {
  value: BroadcastContent;
  onChange: (next: BroadcastContent) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = (key: keyof BroadcastContent) => (v: string) => onChange({ ...value, [key]: v });

  /** Drop a placeholder at the caret in the body, or at the end when the body
   *  has not been focused yet. */
  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const at = el ? el.selectionStart : value.body.length;
    const end = el ? el.selectionEnd : value.body.length;
    const body = value.body.slice(0, at) + token + value.body.slice(end);
    onChange({ ...value, body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  return (
    <>
      <Field label="Subject">
        <input
          aria-label="Subject"
          value={value.subject}
          onChange={(e) => set("subject")(e.target.value)}
          placeholder="What the inbox shows"
          className={fieldClass}
          style={fieldStyle}
          maxLength={200}
        />
      </Field>

      <Field label="Preview line" help="The grey text an inbox shows after the subject. Optional.">
        <input
          aria-label="Preview line"
          value={value.preheader}
          onChange={(e) => set("preheader")(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
          maxLength={200}
        />
      </Field>

      <Field label="Heading">
        <input
          aria-label="Heading"
          value={value.heading}
          onChange={(e) => set("heading")(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
          maxLength={200}
        />
      </Field>

      <Field label="Body" help={FORMATTING_HELP}>
        <textarea
          ref={bodyRef}
          aria-label="Body"
          rows={10}
          value={value.body}
          onChange={(e) => set("body")(e.target.value)}
          className={`${fieldClass} resize-y font-normal`}
          style={fieldStyle}
        />
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-xs" style={{ color: C.muted }}>
            Insert:
          </span>
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.hint}
              onClick={() => insert(p.name)}
              className="text-xs font-mono px-2 py-0.5 rounded-md border hover:bg-black/5"
              style={{ borderColor: C.border, color: C.brand }}
            >
              {`{{${p.name}}}`}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button label" help="Optional. Leave both blank for no button.">
          <input
            aria-label="Button label"
            value={value.ctaLabel}
            onChange={(e) => set("ctaLabel")(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
            maxLength={60}
          />
        </Field>
        <Field label="Button link" help="https://... or a placeholder such as {{completeSignupUrl}}">
          <input
            aria-label="Button link"
            value={value.ctaUrl}
            onChange={(e) => set("ctaUrl")(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
      </div>
    </>
  );
}
