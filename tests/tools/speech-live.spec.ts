import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Reading aloud, for real: Jo's voice and a slideshow listening clip, through
 * gpt-realtime-2.1-mini (lib/speech), which replaced the /v1/audio/speech
 * models OpenAI retires on 6 January 2027.
 *
 * THIS SPENDS, a fraction of a penny a run, so it is skipped unless asked for:
 *
 *   LIVE_SPEECH=1 pnpm playwright test tests/tools/speech-live.spec.ts
 *
 * Run it after touching lib/speech, the two routes, or the openai package: the
 * socket, the encoder and the bundling only show up in the real thing.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.skip(!process.env.LIVE_SPEECH, "spends: set LIVE_SPEECH=1 to run");
test.setTimeout(180_000);

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Speech");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

/** An MPEG audio frame starts with eleven set bits. */
function isMp3(bytes: Buffer): boolean {
  return bytes.length > 1_000 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

test("Jo reads a reply aloud as MP3", async ({ page }) => {
  await signIn(page, teacher);
  const res = await page.request.post("/api/jo/speak", { data: { text: "I've made the questions a little harder." } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("audio/mpeg");
  expect(isMp3(await res.body())).toBe(true);
});

test("a listening clip is narrated, stored, and priced", async ({ page }) => {
  await signIn(page, teacher);
  const script = "Deep in the desert, a camel stores fat in its hump. It can go for days without a drink of water.";
  const res = await page.request.post("/api/generate-audio", {
    data: { topic: "Animal adaptations", scriptOverride: script, activityType: "true-false" },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { src: string; transcript: string; costUsd: number };
  expect(body.transcript.length).toBeGreaterThan(20);
  expect(body.costUsd).toBeGreaterThan(0);

  const clip = await page.request.get(body.src);
  expect(isMp3(await clip.body())).toBe(true);

  await admin.storage.from("audio").remove([body.src.split("/").pop()!]);
});
