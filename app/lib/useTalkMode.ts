"use client";

// Talk mode, shared by the Ask Jo panel and the Ask Jo page. The mic fills the
// box; in talk mode, what is said sends itself once the teacher stops, and the
// mic opens again once Jo has finished reading the reply. Jo cannot hear itself
// out of the speaker reliably in a browser, so the mic stays shut while Jo
// talks; a tap on it cuts Jo off. (Live mode, lib/useLiveCall, is the one that
// can listen while Jo speaks.)

import { useEffect, useState } from "react";
import { useDictation } from "./useDictation";

/** The parts of useJoVoice talk mode needs. */
export interface TalkVoice {
  stop(): void;
  setAuto(on: boolean): void;
  idle(): boolean;
  playing: string | null;
}

export function useTalkMode({
  voice,
  draft,
  setDraft,
  onSend,
  busy,
  locked,
  state,
}: {
  voice: TalkVoice | null;
  draft: string;
  setDraft: (text: string) => void;
  /** Sends a message, as the page's own send button would. */
  onSend: (text: string) => void;
  busy: boolean;
  locked: boolean;
  /** Held by the caller instead, when talk mode has to outlive this
   *  component (the Ask Jo page remounts its composer on a chat's first
   *  message). */
  state?: readonly [boolean, (on: boolean) => void];
}) {
  const own = useState(false);
  const [talk, setTalk] = state ?? own;
  const dictation = useDictation(setDraft, (text, heard) => {
    if (!talk) return;
    // Silence ends talk mode rather than holding the microphone open.
    if (heard && text.trim()) onSend(text);
    else setTalk(false);
  });

  const canTalk = !!voice && dictation.supported;

  const onMic = () => {
    // In talk mode, stopping early is "I'm done", and sends.
    if (dictation.listening) return dictation.stop();
    voice?.stop();
    dictation.start(draft);
  };

  const off = () => {
    setTalk(false);
    dictation.cancel();
  };

  const toggleTalk = () => {
    if (!voice) return;
    if (talk) return off();
    voice.setAuto(true);
    voice.stop();
    setTalk(true);
    dictation.start(draft);
  };

  // Listening again once Jo has finished the turn and finished reading it. The
  // short wait lets the reply's last sentences reach the queue first.
  const voicePlaying = voice?.playing ?? null;
  const voiceIdle = voice?.idle;
  const { listening, start: listen } = dictation;
  useEffect(() => {
    if (!talk || busy || locked || listening || voicePlaying) return;
    const t = window.setTimeout(() => {
      if (voiceIdle?.() !== false) listen(draft);
    }, 500);
    return () => window.clearTimeout(t);
  }, [talk, busy, locked, listening, voicePlaying, voiceIdle, listen, draft]);

  // Locked out mid-conversation (the sheet is being rewritten, or a guest ran
  // out of messages): talk mode ends rather than reopening into nothing.
  if (talk && locked) setTalk(false);

  return { talk, canTalk, dictation, onMic, toggleTalk, off };
}
