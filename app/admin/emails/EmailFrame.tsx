"use client";

// One rendered email, the way an inbox shows it: a subject strip, then the
// message itself in a sandboxed iframe.
//
// `sandbox=""` is present but empty, which applies every restriction there is:
// no scripts, no same-origin, no forms, no navigation. Email HTML is tables and
// inline styles, so nothing legitimate is lost, and anything odd typed into a
// body box cannot reach the admin page. dangerouslySetInnerHTML would be wrong
// twice over: the injection surface, and layout() emitting a full document
// whose <body> background would bleed into the admin's own styles.
//
// Shared by the system email editor (EmailPreview) and the bulk email preview
// (BroadcastPreview), so both show mail the same way.

import { C, Skeleton } from "../ui";

export interface RenderedEmail {
  subject: string;
  html: string;
}

export default function EmailFrame({
  rendered,
  label,
  accent,
  height = 420,
  width,
}: {
  rendered: RenderedEmail | null;
  label?: string;
  accent?: string;
  height?: number;
  /** Fixed pixel width, for the phone-sized preview. Full width when absent. */
  width?: number;
}) {
  return (
    <div className="min-w-0">
      {label && (
        <div className="text-xs font-medium mb-1.5" style={{ color: accent ?? C.ink2 }}>
          {label}
        </div>
      )}
      {rendered === null ? (
        <Skeleton className="h-105 w-full" />
      ) : (
        <div
          className="rounded-lg border overflow-hidden mx-auto"
          style={{ borderColor: C.border, maxWidth: width ?? "100%" }}
        >
          {/* The subject changes as often as the body and is invisible inside
              the frame, so it gets its own strip, the way it appears in an
              inbox list. */}
          <div
            className="px-3 py-2 border-b text-xs truncate"
            style={{ borderColor: C.divider, backgroundColor: C.page, color: C.ink }}
            title={rendered.subject}
          >
            <span style={{ color: C.muted }}>Subject: </span>
            <span data-testid="preview-subject">{rendered.subject}</span>
          </div>
          <iframe
            title={label ?? "Email preview"}
            srcDoc={rendered.html}
            sandbox=""
            className="w-full block bg-white"
            style={{ height, border: 0 }}
          />
        </div>
      )}
    </div>
  );
}
