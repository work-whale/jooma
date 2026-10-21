"use client";

// Jo reading aloud (app/api/jo/speak). Clips play one after another from a
// queue, so a reply can be read a sentence at a time while it is still being
// written: the next clip is fetched while the one before it plays. Stopping
// empties the queue.

import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_KEY = "jooma:jo-read-aloud";
/** Clips fetched ahead of the one playing. More would spend on sentences a
 *  teacher who stops Jo never hears. */
const AHEAD = 2;

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

interface Clip {
  text: string;
  /** Whose clip this is: a message id, so a reply can show it is being read. */
  owner: string;
  url: Promise<string | null> | null;
}

export function useJoVoice(enabled: boolean) {
  /** The owner of the clip being read, or fetched, right now. */
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAutoState] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Clip[]>([]);
  const busyRef = useRef(false);
  const controllerRef = useRef(new AbortController());

  useEffect(() => {
    // Read after mount: localStorage is not there on the server.
    if (enabled) setAutoState(readAuto());
  }, [enabled]);

  const stop = useCallback(() => {
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    for (const clip of queueRef.current) void clip.url?.then((url) => url && URL.revokeObjectURL(url));
    queueRef.current = [];
    busyRef.current = false;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
    }
    audioRef.current = null;
    setPlaying(null);
    setLoading(false);
  }, []);

  useEffect(() => stop, [stop]);

  const fetchClip = useCallback(async (text: string, signal: AbortSignal): Promise<string | null> => {
    try {
      const res = await fetch("/api/jo/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!res.ok) throw new Error("speak failed");
      const url = URL.createObjectURL(await res.blob());
      if (signal.aborted) {
        URL.revokeObjectURL(url);
        return null;
      }
      return url;
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") setError("Jo couldn't read that aloud just now.");
      return null;
    }
  }, []);

  // Fetches the clips at the front of the queue and plays the first, once the
  // one before it has finished.
  const pump = useCallback(() => {
    const signal = controllerRef.current.signal;
    const queue = queueRef.current;
    for (const clip of queue.slice(0, AHEAD)) clip.url ??= fetchClip(clip.text, signal);
    if (busyRef.current) return;
    const head = queue[0];
    if (!head) {
      setPlaying(null);
      setLoading(false);
      return;
    }
    busyRef.current = true;
    setPlaying(head.owner);
    setLoading(true);
    const next = () => {
      if (signal.aborted) return;
      queueRef.current.shift();
      audioRef.current = null;
      busyRef.current = false;
      pump();
    };
    void head.url!.then(async (url) => {
      if (signal.aborted) return;
      if (!url) return next();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        next();
      };
      setLoading(false);
      try {
        await audio.play();
      } catch {
        // Blocked by the browser's autoplay rule, or the clip would not decode.
        URL.revokeObjectURL(url);
        if (!signal.aborted) setError("Jo couldn't read that aloud just now.");
        next();
      }
    });
  }, [fetchClip]);

  /** Reads `text` once everything already queued has been read. */
  const enqueue = useCallback(
    (text: string, owner: string) => {
      const clean = text.replace(/\s+/g, " ").trim();
      if (!enabled || !clean) return;
      setError(null);
      queueRef.current.push({ text: clean, owner, url: null });
      pump();
    },
    [enabled, pump],
  );

  /** Reads `text` now, in place of anything playing or queued. */
  const speak = useCallback(
    (text: string, owner: string) => {
      stop();
      enqueue(text, owner);
    },
    [stop, enqueue],
  );

  /** True once nothing is playing, fetching or waiting. Read from a ref, so a
   *  check made straight after enqueue already sees the new clip. */
  const idle = useCallback(() => queueRef.current.length === 0, []);

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      window.localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      /* private window: the choice lasts this visit */
    }
  }, []);

  return { speak, enqueue, stop, idle, playing, loading, error, auto, setAuto };
}
