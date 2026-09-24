"use client";

// Live preview of a bulk email, rendered in the browser.
//
// Unlike the system email preview this needs no round trip: renderBroadcast()
// is pure and is the very function the sender calls for each recipient, so what
// is on screen is what lands, give or take the recipient's own name and
// unsubscribe link. useDeferredValue keeps typing responsive on a long body.

import { useDeferredValue, useMemo, useState } from "react";
import {
  BROADCAST_SAMPLE,
  renderBroadcast,
  respectsOptOut,
  unsubscribePageUrl,
  type BroadcastContent,
} from "@/app/lib/email-templates/broadcast";
import { C } from "../ui";
import EmailFrame from "./EmailFrame";

type Device = "desktop" | "phone";

export default function BroadcastPreview({
  content,
  purpose,
  height = 560,
}: {
  content: BroadcastContent;
  purpose: string;
  height?: number;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const deferred = useDeferredValue(content);

  const rendered = useMemo(
    () =>
      renderBroadcast(deferred, BROADCAST_SAMPLE, {
        purpose,
        unsubscribeUrl: respectsOptOut(purpose) ? unsubscribePageUrl("preview") : null,
      }),
    [deferred, purpose],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs" style={{ color: C.muted }}>
          Shown as {BROADCAST_SAMPLE.firstName} ({BROADCAST_SAMPLE.email}) would see it.
        </p>
        <div
          className="inline-flex rounded-full p-0.5 border shrink-0"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
          role="group"
          aria-label="Preview size"
        >
          {(["desktop", "phone"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
              style={device === d ? { backgroundColor: C.brand, color: "#fff" } : { color: C.muted }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <EmailFrame
        rendered={{ subject: rendered.subject || "(no subject yet)", html: rendered.html }}
        height={height}
        width={device === "phone" ? 375 : undefined}
      />
    </div>
  );
}
