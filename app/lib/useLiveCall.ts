"use client";

// A Live call with Jo, from the browser (lib/live). The microphone and Jo's
// voice travel over WebRTC straight to OpenAI; the call is opened through
// /api/jo/live, which keeps the key on the server and watches the call. Jo's
// tools run here, on the page, because the page is what holds the document
// and the conversation: a tool call arrives on the data channel, runs, and its
// result goes back the same way for Jo to speak.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSurface } from "./live";

export type LiveState = "idle" | "connecting" | "live";

/** A tool Jo can call. `heard` is what the teacher actually said, when it was
 *  transcribed in time, so the request reaches the pipeline in their words. */
export type LiveTool = (args: Record<string, unknown>, heard: string | null) => Promise<unknown>;

/** How long a call may take to connect before Live gives up on this network. */
const CONNECT_MS = 10_000;
/** How long to wait for the teacher's words to be transcribed. */
const HEARD_MS = 1_500;

interface Options {
  surface: LiveSurface;
  docLabel?: string;
  tools: Record<string, LiveTool>;
  /** One spoken exchange that did not go through a tool, for the thread. */
  onExchange?: (heard: string, said: string) => void;
}

type ServerEvent = {
  type?: string;
  item_id?: string;
  transcript?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  response?: { output?: { type?: string; content?: { transcript?: string; text?: string }[] }[] };
};

export function useLiveCall(opts: Options) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<LiveState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [maxSeconds, setMaxSeconds] = useState(600);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<number[]>([]);
  // What the teacher said, by conversation item, and which item was last.
  const heardRef = useRef(new Map<string, string>());
  const lastItemRef = useRef<string | null>(null);

  // Feature-detected after mount: the server has no WebRTC.
  useEffect(() => {
    setSupported(typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const end = useCallback((why: string | null = null) => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    heardRef.current.clear();
    lastItemRef.current = null;
    setState("idle");
    setMuted(false);
    setError(why);
  }, []);

  // A call does not outlive the page it was started on.
  useEffect(() => () => end(), [end]);

  const send = (event: object) => {
    const channel = channelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  };

  /** The teacher's words for an item, waiting briefly for them to arrive. */
  const heardFor = async (itemId: string | null): Promise<string | null> => {
    if (!itemId) return null;
    for (let waited = 0; waited < HEARD_MS; waited += 100) {
      const words = heardRef.current.get(itemId);
      if (words) return words;
      await new Promise((r) => setTimeout(r, 100));
    }
    return heardRef.current.get(itemId) ?? null;
  };

  const runTool = async (event: ServerEvent) => {
    const itemId = lastItemRef.current;
    let output: unknown;
    try {
      const tool = optsRef.current.tools[event.name ?? ""];
      if (!tool) throw new Error(`No tool called ${event.name}`);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(event.arguments || "{}");
      } catch {
        /* no arguments */
      }
      output = await tool(args, await heardFor(itemId));
    } catch (err) {
      output = { error: err instanceof Error ? err.message : "That didn't work." };
    }
    if (itemId) heardRef.current.delete(itemId);
    send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: event.call_id, output: JSON.stringify(output) } });
    send({ type: "response.create" });
  };

  const onEvent = (raw: MessageEvent) => {
    let event: ServerEvent;
    try {
      event = JSON.parse(String(raw.data));
    } catch {
      return;
    }
    switch (event.type) {
      case "input_audio_buffer.committed":
        if (event.item_id) lastItemRef.current = event.item_id;
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.item_id && event.transcript?.trim()) heardRef.current.set(event.item_id, event.transcript.trim());
        break;
      case "response.function_call_arguments.done":
        void runTool(event);
        break;
      case "response.done": {
        // A reply that called a tool reaches the thread through the tool. One
        // that did not is only ever spoken, so it is written down here.
        const output = event.response?.output ?? [];
        if (output.some((o) => o.type === "function_call")) break;
        const said = output
          .filter((o) => o.type === "message")
          .flatMap((o) => o.content ?? [])
          .map((c) => c.transcript ?? c.text ?? "")
          .join(" ")
          .trim();
        const itemId = lastItemRef.current;
        if (!said || !itemId) break;
        void heardFor(itemId).then((heard) => {
          if (!heard) return;
          heardRef.current.delete(itemId);
          optsRef.current.onExchange?.(heard, said);
        });
        break;
      }
    }
  };

  const start = useCallback(async () => {
    if (pcRef.current) return;
    setError(null);
    setElapsed(0);
    setState("connecting");

    let mic: MediaStream;
    try {
      // The browser's echo cancellation is what lets the teacher talk over Jo
      // without Jo hearing itself.
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      end("Jo needs your microphone for Live. Allow it in the browser and try again.");
      return;
    }
    micRef.current = mic;

    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    audioRef.current ??= new Audio();
    audioRef.current.autoplay = true;
    pc.ontrack = (e) => {
      if (audioRef.current) audioRef.current.srcObject = e.streams[0];
    };
    for (const track of mic.getTracks()) pc.addTrack(track, mic);
    const channel = pc.createDataChannel("oai-events");
    channelRef.current = channel;
    channel.addEventListener("message", onEvent);

    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      if (pc.connectionState === "connected") setState("live");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") end("Live lost the connection. Talk mode still works.");
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch("/api/jo/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, surface: optsRef.current.surface, docLabel: optsRef.current.docLabel }),
      });
      if (pcRef.current !== pc) return;
      if (!res.ok) {
        // Out of credit, or no plan: UpgradeGate already shows its modal.
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        end(res.status === 402 ? null : (data.error ?? "Live couldn't start just now. Please try again."));
        return;
      }
      const { sdp, maxSeconds: cap } = (await res.json()) as { sdp: string; maxSeconds: number };
      await pc.setRemoteDescription({ type: "answer", sdp });
      setMaxSeconds(cap);

      // School networks sometimes block the audio route. Give up rather than
      // leave the teacher talking to nothing.
      timersRef.current.push(
        window.setTimeout(() => {
          if (pcRef.current === pc && pc.connectionState !== "connected") end("Live couldn't connect on this network. Talk mode still works.");
        }, CONNECT_MS),
      );
      // The server ends the call at the cap; this ends it here too, in case
      // the server's goodbye never arrives.
      timersRef.current.push(window.setTimeout(() => pcRef.current === pc && end(), (cap + 15) * 1000));
    } catch {
      if (pcRef.current === pc) end("Live couldn't start just now. Please try again.");
    }
    // onEvent and end read only refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);

  // The session clock.
  useEffect(() => {
    if (state !== "live") return;
    const began = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  // Stable, and without end's reason argument, so it can be a click handler.
  const hangUp = useCallback(() => end(), [end]);

  return { supported, state, elapsed, maxSeconds, muted, error, start, end: hangUp, toggleMute };
}
