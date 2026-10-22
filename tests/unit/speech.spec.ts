import { test, expect } from "@playwright/test";
import { pcmToMp3, saidVerbatim, realtimeCostUsd } from "@/app/lib/speech";

/*
 * The pure parts of reading text aloud (lib/speech): what a response cost,
 * whether the model said the text it was given, and the MP3 it becomes.
 */

test("cost follows the realtime mini price list", () => {
  // 100 text tokens in, 20 text and 1,000 audio tokens out.
  const usd = realtimeCostUsd({
    input_tokens: 100,
    output_tokens: 1_020,
    output_token_details: { text_tokens: 20, audio_tokens: 1_000 },
  });
  expect(usd).toBeCloseTo((100 * 0.6 + 20 * 2.4 + 1_000 * 20) / 1_000_000, 10);
});

test("cached input is billed at the cached rate", () => {
  const usd = realtimeCostUsd({ input_tokens: 100, input_token_details: { cached_tokens: 100 }, output_tokens: 0 });
  expect(usd).toBeCloseTo((100 * 0.06) / 1_000_000, 10);
});

test("a live turn bills audio in, cached audio, and the rest at their own rates", () => {
  // 1,000 input tokens: 300 text and 700 audio, of which 400 audio and 100 text came from the cache.
  const usd = realtimeCostUsd({
    input_tokens: 1_000,
    input_token_details: { audio_tokens: 700, text_tokens: 300, cached_tokens: 500, cached_tokens_details: { audio_tokens: 400, text_tokens: 100 } },
    output_tokens: 600,
    output_token_details: { text_tokens: 100, audio_tokens: 500 },
  });
  const expected = (200 * 0.6 + 100 * 0.06 + 300 * 10 + 400 * 0.3 + 100 * 2.4 + 500 * 20) / 1_000_000;
  expect(usd).toBeCloseTo(expected, 10);
});

test("no usage is no cost", () => {
  expect(realtimeCostUsd(undefined)).toBe(0);
});

test("the same words count as verbatim, whatever the case and punctuation", () => {
  expect(saidVerbatim("I've made them harder. Done!", "i've made them harder, done")).toBe(true);
  expect(saidVerbatim("Draw one adaptation.", "Draw two adaptations.")).toBe(false);
  expect(saidVerbatim("Draw one adaptation.", "Sure! Draw one adaptation.")).toBe(false);
});

test("a second of silence encodes to an MP3", async () => {
  const mp3 = await pcmToMp3(Buffer.alloc(24_000 * 2));
  expect(mp3.length).toBeGreaterThan(1_000);
  // An MPEG audio frame starts with eleven set bits.
  expect(mp3[0]).toBe(0xff);
  expect(mp3[1] & 0xe0).toBe(0xe0);
});
