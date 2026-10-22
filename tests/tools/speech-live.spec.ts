import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Jo's voice for real: reading aloud and a slideshow listening clip, through
 * gpt-realtime-2.1-mini (lib/speech), which replaced the /v1/audio/speech
 * models OpenAI retires on 6 January 2027, and a Live call (lib/live).
 *
 * THIS SPENDS, a few pence a run, so it is skipped unless asked for:
 *
 *   LIVE_SPEECH=1 pnpm playwright test tests/tools/speech-live.spec.ts
 *
 * Run it after touching lib/speech, lib/live, their routes, or the openai
 * package: the sockets, the encoder, the session settings OpenAI accepts and
 * the bundling only show up in the real thing.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.skip(!process.env.LIVE_SPEECH, "spends: set LIVE_SPEECH=1 to run");
test.setTimeout(180_000);
// Chromium's stand-in microphone for the Live call: a real WebRTC track, no
// hardware. The read aloud tests do not touch it.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["microphone"],
});

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

test.describe("a real Live call", () => {
  test("Live connects beside a resource, answers, and its cost is written down", async ({ page }) => {
    // The page's data channel, captured so the test can ask Jo something in
    // text: the stand-in microphone only beeps.
    await page.addInitScript(() => {
      const w = window as unknown as { __dc?: RTCDataChannel; __events: string[] };
      w.__events = [];
      const create = RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel = function (...args: Parameters<typeof create>) {
        const channel = create.apply(this, args);
        w.__dc = channel;
        channel.addEventListener("message", (e) => w.__events.push(JSON.parse(String(e.data)).type));
        return channel;
      };
    });

    const { data, error } = await admin
      .from("tool_runs")
      .insert({ user_id: teacher.id, tool_slug: "lesson-planner", title: "Habitats", input: {}, output: "## Plenary\n\nExit ticket: name one adaptation." })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await signIn(page, teacher);
    await page.goto(`/tools/lesson-planner?run=${data.id}`);
    await expect(page.getByTestId("jo-panel")).toBeVisible({ timeout: 120_000 });

    await page.getByTestId("jo-live").click();
    await page.getByTestId("live-start").click();
    await expect(page.getByTestId("live-error")).toHaveCount(0);
    await expect(page.getByTestId("live-bar")).toContainText("Live", { timeout: 30_000 });

    await page.waitForFunction(() => (window as unknown as { __dc?: RTCDataChannel }).__dc?.readyState === "open");
    await page.evaluate(() => {
      const dc = (window as unknown as { __dc: RTCDataChannel }).__dc;
      dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "Say hello in five words." }] } }));
      dc.send(JSON.stringify({ type: "response.create" }));
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __events: string[] }).__events.includes("response.done")), { timeout: 30_000 })
      .toBe(true);

    await page.getByTestId("live-end").click();
    await expect(page.getByTestId("live-bar")).toHaveCount(0);

    // Written when the server sees the call close.
    await expect
      .poll(
        async () => {
          const { data: rows } = await admin.from("asset_cost").select("cost_usd").eq("user_id", teacher.id).eq("step", "live");
          return (rows ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0);
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
  });
});
