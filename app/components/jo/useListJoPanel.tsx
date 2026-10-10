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
};

export function useListJoPanel<T>(opts: {
  tool: ListTool;
  values: T[];
  commit: (next: T[]) => void;
  containerRef: RefObject<HTMLElement | null>;
  disabled?: string | null;
  openSignal?: number;
}) {
  const { adapter, shown, focus, working } = useListJo<T>({
    tool: opts.tool,
    values: opts.values,
    commit: opts.commit,
    containerRef: opts.containerRef,
  });
  const session = useJoSession(adapter, { endpoint: "/api/jo" });
  const voice = useJoVoice(true);

  const panel = (
    <JoPanel
      session={session}
      adapter={adapter}
      docLabel={opts.tool === "quiz" ? "quiz" : "deck"}
      starters={STARTERS[opts.tool]}
      voice={voice}
      disabled={opts.disabled ?? null}
      openSignal={opts.openSignal}
    />
  );

  const overlay = <JoItemFocus focus={focus} containerRef={opts.containerRef} />;

  return { shown, panel, overlay, joBusy: session.busy || working };
}
