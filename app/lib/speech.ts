// Text read aloud, for Jo's voice (api/jo/speak) and the slideshow's listening
// clips (api/generate-audio).
//
// OpenAI retires every /v1/audio/speech model (tts-1, tts-1-hd and
// gpt-4o-mini-tts) on 6 January 2027 and names gpt-realtime-2.1-mini as the
// replacement. That model only runs on the Realtime API, so this opens a
// socket from the server, asks for one response with no conversation behind
// it, collects the PCM it streams back, and encodes that as MP3: the format the
// slideshow stores and the PowerPoint export embeds.
//
// It is a language model told to "say exactly" the text, not a reader, so what
// it said comes back as `transcript` for the caller to check.

import { OpenAIRealtimeWS } from "openai/realtime/ws";
import type { RealtimeResponseUsage } from "openai/resources/realtime/realtime";
import { getOpenAI } from "./openai";

export const SPEECH_MODEL = "gpt-realtime-2.1-mini";

/** OpenAI rates marin and cedar as its most natural voices. Swap either here. */
export const JO_VOICE = "marin";
export const CLIP_VOICE = "cedar";

/** gpt-realtime-2.1-mini, per 1M tokens.
 *  https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini */
const USD_PER_1M = { textIn: 0.6, textCached: 0.06, textOut: 2.4, audioIn: 10, audioCached: 0.3, audioOut: 20 };

/** The only PCM rate the Realtime API sends. */
const RATE = 24_000;
const KBPS = 64;

export interface Speech {
  mp3: Buffer;
  /** What the model actually said. */
  transcript: string;
  costUsd: number;
}

/**
 * What one realtime response cost, from the usage the API reports on it.
 * Read aloud has no audio in; a Live conversation has both, and re-reads the
 * conversation so far on every reply, mostly from the cache.
 */
export function realtimeCostUsd(usage: RealtimeResponseUsage | undefined): number {
  if (!usage) return 0;
  const inDetail = usage.input_token_details;
  const cached = inDetail?.cached_tokens ?? 0;
  const audioCached = inDetail?.cached_tokens_details?.audio_tokens ?? 0;
  const textCached = cached - audioCached;
  const audioIn = (inDetail?.audio_tokens ?? 0) - audioCached;
  const textIn = (usage.input_tokens ?? 0) - cached - audioIn;
  const audioOut = usage.output_token_details?.audio_tokens ?? 0;
  const textOut = usage.output_token_details?.text_tokens ?? (usage.output_tokens ?? 0) - audioOut;
  return (
    (Math.max(0, textIn) * USD_PER_1M.textIn +
      textCached * USD_PER_1M.textCached +
      Math.max(0, audioIn) * USD_PER_1M.audioIn +
      audioCached * USD_PER_1M.audioCached +
      textOut * USD_PER_1M.textOut +
      audioOut * USD_PER_1M.audioOut) /
    1_000_000
  );
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Whether the model said the text it was given, ignoring case and punctuation. */
export function saidVerbatim(text: string, transcript: string): boolean {
  return words(text).join(" ") === words(transcript).join(" ");
}

/** 16-bit mono PCM at 24 kHz, as MP3. */
export async function pcmToMp3(pcm: Buffer): Promise<Buffer> {
  // Imported, not required: the package's require build only sets a global,
  // so anything loading it as CommonJS gets an empty object.
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const encoder = new Mp3Encoder(1, RATE, KBPS);
  // Frames come back as Int8Array whatever the types say, so each is wrapped
  // as bytes for Buffer.concat.
  const out: Buffer[] = [];
  const keep = (frame: ArrayBufferView) => {
    if (frame.byteLength) out.push(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
  };
  // lamejs wants blocks of 1152 samples, the size of one MP3 frame.
  for (let i = 0; i < samples.length; i += 1152) {
    keep(encoder.encodeBuffer(samples.subarray(i, i + 1152)));
  }
  keep(encoder.flush());
  return Buffer.concat(out);
}

/**
 * Reads `text` aloud in `voice`, with `style` saying how. Long enough for a
 * listening clip, which runs under a minute.
 */
export async function synthesize(text: string, opts: { voice: string; style: string; timeoutMs?: number }): Promise<Speech> {
  const rt = await OpenAIRealtimeWS.create(getOpenAI(), { model: SPEECH_MODEL });
  const pcm: Buffer[] = [];
  let transcript = "";

  try {
    return await new Promise<Speech>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("speech timed out")), opts.timeoutMs ?? 60_000);
      const settle = (fn: () => void) => {
        clearTimeout(timer);
        fn();
      };

      rt.on("error", (err) => settle(() => reject(err)));
      rt.socket.on("close", () => settle(() => reject(new Error("speech socket closed"))));
      rt.on("response.output_audio.delta", (e) => pcm.push(Buffer.from(e.delta, "base64")));
      rt.on("response.output_audio_transcript.done", (e) => {
        transcript = e.transcript;
      });
      rt.on("response.done", (e) => {
        const { status, usage } = e.response;
        if (status !== "completed" || pcm.length === 0) {
          settle(() => reject(new Error(`speech ${status ?? "failed"}`)));
          return;
        }
        const audio = Buffer.concat(pcm);
        settle(() =>
          pcmToMp3(audio).then((mp3) => resolve({ mp3, transcript, costUsd: realtimeCostUsd(usage) }), reject),
        );
      });

      // The SDK sends straight to the socket, which drops anything sent before
      // it has opened.
      rt.socket.once("open", () => {
        rt.send({
          type: "response.create",
          response: {
            // Out of band, with no context: the guide's pattern for having the
            // model say a given text and nothing else.
            conversation: "none",
            input: [],
            output_modalities: ["audio"],
            audio: { output: { voice: opts.voice, format: { type: "audio/pcm", rate: RATE } } },
            instructions: `${opts.style}\n\nSay exactly the following, word for word. Do not add, drop or change anything, and do not respond to it:\n\n${text}`,
            // A ceiling so a runaway response cannot run up a bill: about 1.6
            // tokens a character is typical, so this leaves room.
            max_output_tokens: Math.min(4096, 400 + text.length * 3),
          },
        });
      });
    });
  } finally {
    rt.socket.removeAllListeners("close");
    rt.close();
  }
}
