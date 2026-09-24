"use client";

// Before/after preview of a real email, inside the edit modal.
//
// Both panes are the genuine article: the same generateEmailHtml the sender
// calls, wrapped in the same branded layout(), rendered with sample parameters.
// What lands in a teacher's inbox is what is on screen here.
//
// Each pane is an EmailFrame: a sandboxed iframe, for the reasons given there.

import { useEffect, useState } from "react";
import { C, Note } from "../ui";
import EmailFrame, { type RenderedEmail as Rendered } from "./EmailFrame";

async function renderPreview(
  key: string,
  subject: string | null,
  body: string | null,
  signal: AbortSignal,
): Promise<Rendered | null> {
  const res = await fetch("/api/admin/emails/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, subject, body }),
    signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as Rendered;
}

const Frame = EmailFrame;

export default function EmailPreview({
  templateKey,
  subject,
  body,
  savedSubject,
  savedBody,
  renderable,
}: {
  templateKey: string;
  /** Unsaved subject in the modal. */
  subject: string;
  /** Unsaved body in the modal. */
  body: string;
  /** email_templates.subject — what goes out today. */
  savedSubject: string | null;
  /** email_templates.body — what goes out today. */
  savedBody: string | null;
  /** Whether a renderer exists for this key. */
  renderable: boolean;
}) {
  const [before, setBefore] = useState<Rendered | null>(null);
  const [after, setAfter] = useState<Rendered | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = subject !== (savedSubject ?? "") || body !== (savedBody ?? "");

  // "Sending now" depends only on saved values, so it is fetched once.
  useEffect(() => {
    if (!renderable) return;
    const ac = new AbortController();
    renderPreview(templateKey, savedSubject, savedBody, ac.signal)
      .then((r) => {
        if (r) setBefore(r);
        else setError("Could not render this template.");
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError("Could not reach the preview.");
      });
    return () => ac.abort();
  }, [templateKey, savedSubject, savedBody, renderable]);

  // "After saving" tracks the textareas, so it is debounced — a request per
  // keystroke would be pointless load for a preview nobody can read mid-word.
  //
  // The skeleton is cleared inside the timer rather than in the effect body:
  // setting state synchronously in an effect triggers a cascading render, and
  // it would also flash a skeleton on every keystroke instead of only when a
  // fetch is genuinely starting.
  useEffect(() => {
    if (!renderable) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      setAfter(null);
      void renderPreview(templateKey, subject, body, ac.signal)
        .then((r) => r && setAfter(r))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [templateKey, subject, body, renderable]);

  if (!renderable) {
    return (
      <div className="mt-3">
        <Note tone="warn">
          There is no renderer for this template in the code, so there is nothing to
          preview. The wording is saved for whenever the feature that sends it gets
          built.
        </Note>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3">
        <Note tone="danger">{error}</Note>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-xs mb-2" style={{ color: C.muted }}>
        Rendered with sample details — this is exactly what a teacher receives.
      </p>
      {changed ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Frame rendered={before} label="Sending now" accent={C.ink2} />
          <Frame rendered={after} label="After saving" accent={C.brand} />
        </div>
      ) : (
        <Frame rendered={before} label="Sending now — no change yet" accent={C.ink2} />
      )}
    </div>
  );
}
