"use client";

// Everything a Quiz or Staff Slides result needs for Ask Jo, in one call: the
// list to draw (Jo's working copy while a turn plays), the ring over the card
// Jo is changing, and the panel.
//
// The conversation lasts the visit: both tools save a new run each time their
// result changes (as their refine step always has), so there is no one run to
// keep it against.

import type { RefObject } from "react";
import type { ListTool } from "@/app/lib/jo/list-ops";
import JoPanel from "./JoPanel";
import JoItemFocus from "./JoItemFocus";
import { useJoSession } from "./useJoSession";
import { useJoVoice } from "./useJoVoice";
import { useListJo } from "./useListJo";

const STARTERS: Record<ListTool, string[]> = {
  quiz: [
    "Make the questions easier for younger pupils",
    "Add two harder questions at the end",
    "Make the wrong answers more convincing",
    "Shuffle which option is correct",
  ],
  staffSlides: [
    "Add a discussion slide after slide 2",
    "Make the language more accessible",
    "Shorten every slide to three bullet points",
    "Add a reflection callout to each content slide",
  ],
  reports: [
    "Make every report a little shorter",
    "Make the tone warmer",
    "Vary how the reports begin",
    "Make the next steps more specific",
  ],
};

const DOC_LABEL: Record<ListTool, string> = { quiz: "quiz", staffSlides: "deck", reports: "reports" };

export function useListJoPanel<T>(opts: {
  tool: ListTool;
  values: T[];
  commit: (next: T[]) => void;
  containerRef: RefObject<HTMLElement | null>;
  disabled?: string | null;
  openSignal?: number;
  /** Applied to every message before it is sent: Reports take names out. */
  outgoing?: (text: string) => string;
  /** Talking to Jo. Off for Reports: a spoken name would reach the speech
   *  model before it could be taken out. */
  voice?: boolean;
}) {
  const { adapter, shown, focus, working } = useListJo<T>({
    tool: opts.tool,
    values: opts.values,
    commit: opts.commit,
    containerRef: opts.containerRef,
    outgoing: opts.outgoing,
  });
  const session = useJoSession(adapter, { endpoint: "/api/jo" });
  const voiceOn = opts.voice !== false;
  const voice = useJoVoice(voiceOn);

  const panel = (
    <JoPanel
      session={session}
      adapter={adapter}
      docLabel={DOC_LABEL[opts.tool]}
      starters={STARTERS[opts.tool]}
      voice={voiceOn ? voice : null}
      disabled={opts.disabled ?? null}
      openSignal={opts.openSignal}
    />
  );

  const overlay = <JoItemFocus focus={focus} containerRef={opts.containerRef} />;

  return { shown, panel, overlay, joBusy: session.busy || working };
}
