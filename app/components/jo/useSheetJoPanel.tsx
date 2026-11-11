"use client";

// Everything a sheet screen needs for Ask Jo, in one call: the document to
// draw (Jo's working copy while a turn plays), where Jo is pointing, and the
// panel itself. Used by the signed in sheet editor and the free try result.

import type { RefObject } from "react";
import type { JoDocRef } from "@/app/lib/jo/threads";
import type { SheetDoc } from "@/app/lib/sheets/types";
import { sheetToolProfile } from "@/app/lib/sheets/tools";
import JoPanel from "./JoPanel";
import { useJoSession, type JoGuest } from "./useJoSession";
import { useJoVoice } from "./useJoVoice";
import { useSheetJo } from "./useSheetJo";

export interface SheetJoOptions {
  doc: SheetDoc | null;
  commit: (next: SheetDoc) => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Signed in: where the conversation is kept. */
  docRef?: JoDocRef | null;
  /** A visitor on a free try. */
  guest?: (JoGuest & { onSignUp: () => void }) | null;
  /** Why Jo cannot help yet. */
  disabled?: string | null;
  openSignal?: number;
}

export function useSheetJoPanel(opts: SheetJoOptions) {
  const { adapter, shown, focus, working } = useSheetJo({ doc: opts.doc, commit: opts.commit, containerRef: opts.containerRef });
  const session = useJoSession(adapter, {
    endpoint: opts.guest ? "/api/try/jo" : "/api/jo",
    docRef: opts.guest ? null : opts.docRef,
    guest: opts.guest ? { trialId: opts.guest.trialId, honeypot: opts.guest.honeypot } : undefined,
  });
  const profile = sheetToolProfile(opts.doc?.tool ?? "worksheet");
  // A document about one child: no voice, as on Reports. Typed messages have
  // the child's name taken out before they are sent (useSheetJo's outgoing);
  // speech cannot be, so it is not offered.
  const voiceOn = !opts.guest && !profile.aboutPupil;
  const voice = useJoVoice(voiceOn);

  const panel = (
    <JoPanel
      session={session}
      adapter={adapter}
      docLabel={profile.docLabel}
      starters={profile.joStarters}
      voice={voiceOn ? voice : null}
      guest={opts.guest ? { onSignUp: opts.guest.onSignUp } : null}
      disabled={opts.disabled ?? (opts.guest && !opts.guest.trialId ? "Jo can help once your free try is saved" : null)}
      openSignal={opts.openSignal}
    />
  );

  return {
    shown,
    joFocus: focus,
    /** Jo is mid turn: the page should not take edits of its own. */
    joBusy: session.busy || working,
    panel,
  };
}
