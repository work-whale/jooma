"use client";

// Everything the slides editor needs for Ask Jo, in one call: the panel, the
// ring Jo draws on the canvas, and whether a turn is playing. The slides
// counterpart of useSheetJoPanel.

import type { RefObject } from "react";
import type { JoDocRef } from "@/app/lib/jo/threads";
import JoPanel from "./JoPanel";
import JoCanvasFocus from "./JoCanvasFocus";
import { useJoSession, type JoGuest } from "./useJoSession";
import { useJoVoice } from "./useJoVoice";
import { useSlidesJo, type SlidesBridge } from "./useSlidesJo";

const STARTERS = [
  "Make slides 2 and 3 simpler for lower ability",
  "Add a recap slide at the end",
  "Shorten the bullet points on every slide",
  "Change the theme to something brighter",
];

export interface SlidesJoOptions {
  bridge: SlidesBridge;
  /** The canvas area, which the ring is drawn in. */
  canvasRef: RefObject<HTMLElement | null>;
  /** The slide on screen. */
  slideRef: RefObject<HTMLElement | null>;
  activeSlideId: string | null;
  /** Signed in: where the conversation is kept. */
  docRef?: JoDocRef | null;
  /** A visitor on a free try. */
  guest?: (JoGuest & { onSignUp: () => void }) | null;
  /** Why Jo cannot help yet. */
  disabled?: string | null;
  openSignal?: number;
}

export function useSlidesJoPanel(opts: SlidesJoOptions) {
  const { adapter, focus, working } = useSlidesJo(opts.bridge);
  const session = useJoSession(adapter, {
    endpoint: opts.guest ? "/api/try/jo" : "/api/jo",
    docRef: opts.guest ? null : opts.docRef,
    guest: opts.guest ? { trialId: opts.guest.trialId, honeypot: opts.guest.honeypot } : undefined,
  });
  const voice = useJoVoice(!opts.guest);

  const panel = (
    <JoPanel
      session={session}
      adapter={adapter}
      docLabel="deck"
      starters={STARTERS}
      voice={opts.guest ? null : voice}
      guest={opts.guest ? { onSignUp: opts.guest.onSignUp } : null}
      disabled={opts.disabled ?? (opts.guest && !opts.guest.trialId ? "Jo can help once your free try is saved" : null)}
      openSignal={opts.openSignal}
      variant="editor"
    />
  );

  const overlay = <JoCanvasFocus focus={focus} containerRef={opts.canvasRef} slideRef={opts.slideRef} activeSlideId={opts.activeSlideId} />;

  return { panel, overlay, joBusy: session.busy || working };
}
