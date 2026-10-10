"use client";

// Everything a text tool's result needs for Ask Jo, in one call: the document
// to draw (Jo's working copy while a turn plays), the ring over the section Jo
// is changing, and the panel. The text tool counterpart of useSheetJoPanel.

import type { RefObject } from "react";
import type { JoDocRef } from "@/app/lib/jo/threads";
import JoPanel from "./JoPanel";
import JoSectionFocus from "./JoSectionFocus";
import { useJoSession } from "./useJoSession";
import { useJoVoice } from "./useJoVoice";
import { useMarkdownJo } from "./useMarkdownJo";

const STARTERS = [
  "Make it shorter and easier to read",
  "Adapt it for a mixed ability class",
  "Add a section I can use as a plenary",
  "Make the tone warmer and more positive",
];

export interface MarkdownJoOptions {
  markdown: string | null;
  commit: (next: string) => void;
  /** Positioned, and wraps the editor. */
  containerRef: RefObject<HTMLElement | null>;
  /** "Lesson Planner". */
  toolName: string;
  docRef?: JoDocRef | null;
  disabled?: string | null;
  openSignal?: number;
}

export function useMarkdownJoPanel(opts: MarkdownJoOptions) {
  const { adapter, shown, focus, shownDoc, working } = useMarkdownJo({
    markdown: opts.markdown,
    commit: opts.commit,
    containerRef: opts.containerRef,
    toolName: opts.toolName,
  });
  const session = useJoSession(adapter, { endpoint: "/api/jo", docRef: opts.docRef });
  const voice = useJoVoice(true);

  const panel = (
    <JoPanel
      session={session}
      adapter={adapter}
      docLabel="document"
      starters={STARTERS}
      voice={voice}
      disabled={opts.disabled ?? null}
      openSignal={opts.openSignal}
    />
  );

  const overlay = <JoSectionFocus focus={focus} doc={shownDoc} containerRef={opts.containerRef} />;

  return { shown, panel, overlay, joBusy: session.busy || working };
}
