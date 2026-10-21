"use client";

// Speaking into a message box, shared by the Ask Jooma composer and the Ask Jo
// panel. The words appear as they are heard and replace, never add to, what
// the last event wrote (see lib/dictation for why that matters).

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeTranscripts, withDictation } from "./dictation";

// The Web Speech API is still vendor-prefixed in Chromium and absent in Firefox,
// and TypeScript's DOM lib does not declare it. Typed minimally rather than
// pulling in a dependency for one optional affordance.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function speechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * `onText` gets the whole draft each time more is heard. `onEnd` gets it once
 * the speaker stops, or `stop()` is called, with whether anything was heard;
 * `cancel()` ends without it.
 */
export function useDictation(onText: (draft: string) => void, onEnd?: (draft: string, heard: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onTextRef.current = onText;
    onEndRef.current = onEnd;
  });

  // Feature-detected after mount, never during render: the server has no
  // window, so deciding this at render time would produce a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(speechRecognition() !== null);
  }, []);

  const cancel = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      // Detached first, so a result still in flight cannot write into a box
      // that has just been sent and cleared.
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.abort();
    }
    setListening(false);
  }, []);

  // Stop the microphone if this unmounts mid-dictation, or it keeps listening
  // after the component is gone.
  useEffect(() => cancel, [cancel]);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  /** Listens, adding what is heard after `typed`, the draft as it stands. */
  const start = useCallback(
    (typed: string) => {
      cancel();
      const recognition = speechRecognition();
      if (!recognition) return;

      recognition.continuous = false;
      // Words appear while they are spoken. Safe now that each event replaces
      // the draft rather than adding to it.
      recognition.interimResults = true;
      recognition.lang = "en-GB";
      let draft = typed;
      recognition.onresult = (event) => {
        const parts = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript);
        draft = withDictation(typed, mergeTranscripts(parts));
        onTextRef.current(draft);
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        setListening(false);
        onEndRef.current?.(draft, draft !== typed);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    },
    [cancel],
  );

  return { supported, listening, start, stop, cancel };
}
