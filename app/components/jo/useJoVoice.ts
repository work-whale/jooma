"use client";

// Jo reading a reply aloud (app/api/jo/speak). One clip at a time: starting
// another, or stopping, ends the one playing.

import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_KEY = "jooma:jo-read-aloud";

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function useJoVoice(enabled: boolean) {
  /** The text being read, or fetched, right now. */
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAutoState] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Read after mount: localStorage is not there on the server.
    if (enabled) setAutoState(readAuto());
  }, [enabled]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPlaying(null);
    setLoading(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string) => {
      if (!enabled) return;
      stop();
      const clean = text.trim();
      if (!clean) return;
      setError(null);
      setPlaying(clean);
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/jo/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("speak failed");
        const url = URL.createObjectURL(await res.blob());
        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => stop();
        setLoading(false);
        await audio.play();
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("Jo couldn't read that aloud just now.");
        stop();
      }
    },
    [enabled, stop],
  );

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      window.localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      /* private window: the choice lasts this visit */
    }
  }, []);

  return { speak, stop, playing, loading, error, auto, setAuto };
}
