import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { answerLive, fakeLiveCall, fakeMicrophone, fakeSpeaker, liveHeard, livePush, liveSent } from "../support/voice";

/*
 * Live mode (lib/live, lib/useLiveCall) and talk mode on the Ask Jo page.
 *
 * - Live beside a resource: the credit warning, the call bar, an edit asked
 *   for out loud landing on the page in the teacher's own words, the result
 *   going back for Jo to speak, a spoken-only exchange kept in the thread.
 * - Out of credit: the upgrade modal, and no call.
 * - Live on the Ask Jo page: a tool set up by voice, and the page staying put.
 * - Talk on the Ask Jo page: the reply read a sentence at a time, the mic
 *   opening again, across the url change of a new chat.
 *
 * WebRTC, the microphone, the speaker and the models are all stand-ins
 * (tests/support/voice and page.route). NOTHING IS SPENT. The real call is in
 * speech-live.spec, behind LIVE_SPEECH=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const PLAN = `## Learning objective

Identify how animals are suited to where they live.

## Plenary

Exit ticket: name one adaptation.`;

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Jolive");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

async function openPlan(page: Page) {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "lesson-planner", title: "Habitats", input: {}, output: PLAN })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${data.id}`);
  await expect(page.locator(".ProseMirror")).toContainText("Exit ticket", NAV);
  await expect(page.getByTestId("jo-panel")).toBeVisible();
}

test("Live beside a resource: warned, connected, an edit by voice, and the result spoken back", async ({ page }) => {
  await fakeLiveCall(page);
  // Read aloud is on, to show Live keeps it quiet: Jo speaks for itself.
  await fakeSpeaker(page);
  let spoken = 0;
  await page.route("**/api/jo/speak", (route) => {
    spoken++;
    return route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.from("clip") });
  });
  const opened: { surface?: string; docLabel?: string }[] = [];
  await answerLive(page, opened);
  const asked: string[] = [];
  await page.route("**/api/jo", (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[]; snapshot: { sections: { id: string; heading: string }[] } };
    asked.push(body.messages[body.messages.length - 1].content);
    const plenary = body.snapshot.sections.find((s) => s.heading === "Plenary")!.id;
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({
        reply: "I'll change the exit ticket.",
        clarify: null,
        ops: [{ op: "editText", label: "Changing the exit ticket", sectionId: plenary, find: "name one adaptation", replace: "draw one adaptation" }],
        summary: "The exit ticket now asks for a drawing.",
      }),
    });
  });
  await openPlan(page);

  // The warning comes first, with the credits.
  await page.getByTestId("jo-live").click();
  await expect(page.getByTestId("live-confirm")).toBeVisible();
  await expect(page.getByTestId("live-credits")).toContainText("credits left", NAV);
  await page.getByTestId("live-start").click();
  await expect(page.getByTestId("live-bar")).toContainText("Live", NAV);
  expect(opened[0]).toMatchObject({ surface: "panel" });

  // Said out loud, reworded by the voice model: the teacher's words win.
  await liveHeard(page, "item_1", "Can you make the exit ticket a drawing please");
  await livePush(page, {
    type: "response.function_call_arguments.done",
    name: "edit_resource",
    call_id: "call_1",
    arguments: JSON.stringify({ request: "exit ticket drawing" }),
  });
  await expect(page.locator(".ProseMirror")).toContainText("draw one adaptation", NAV);
  expect(asked).toEqual(["Can you make the exit ticket a drawing please"]);

  await expect
    .poll(async () => (await liveSent(page)).find((e) => e.item?.call_id === "call_1")?.item?.output ?? "", NAV)
    .toContain("Changing the exit ticket");
  expect((await liveSent(page)).some((e) => e.type === "response.create")).toBe(true);

  // A question answered by voice alone is written into the thread.
  await liveHeard(page, "item_2", "Which year group is this for");
  await livePush(page, {
    type: "response.done",
    response: { output: [{ type: "message", content: [{ type: "output_audio", transcript: "It reads like Year 4 to me." }] }] },
  });
  await expect(page.getByTestId("jo-messages")).toContainText("Which year group is this for", NAV);
  await expect(page.getByTestId("jo-messages")).toContainText("It reads like Year 4 to me.");

  await page.getByTestId("live-end").click();
  await expect(page.getByTestId("live-bar")).toHaveCount(0);
  expect(spoken).toBe(0);
});

test("Live with no credit left shows the upgrade, and no call starts", async ({ page }) => {
  await fakeLiveCall(page);
  await page.route("**/api/jo/live", (route) =>
    route.fulfill({
      status: 402,
      headers: { "content-type": "application/json", "x-upgrade-required": "1" },
      body: JSON.stringify({
        error: "You've used this month's 1,000 credits. Add 1,000 more for £1.50, they last until the end of the month.",
        code: "ai_credit_exhausted",
        reason: "credit_exhausted",
        action: "topup",
      }),
    }),
  );
  await openPlan(page);

  await page.getByTestId("jo-live").click();
  await page.getByTestId("live-start").click();
  await expect(page.getByText("You've used this month's 1,000 credits")).toBeVisible(NAV);
  await expect(page.getByTestId("live-bar")).toHaveCount(0);
  await expect(page.getByTestId("live-error")).toHaveCount(0);
});

/** The Ask Jo page's reply: a sentence or two, and a lesson plan set up. */
async function answerAssistant(page: Page, asked: string[], withTool: boolean) {
  await page.route("**/api/assistant", (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] };
    asked.push(body.messages[body.messages.length - 1].content);
    const tool = Buffer.from(JSON.stringify({ slug: "lesson-planner", fields: { topic: "The water cycle", subject: "Science" } }), "utf8").toString("base64");
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", ...(withTool ? { "x-assistant-tool": tool } : {}) },
      body: "Sure. I've set up a lesson plan on the water cycle.",
    });
  });
}

test("Live on the Ask Jo page sets up a tool by voice, and the page stays put", async ({ page }) => {
  await fakeLiveCall(page);
  await answerLive(page);
  const asked: string[] = [];
  await answerAssistant(page, asked, true);
  await signIn(page, teacher);
  await page.goto("/assistant");

  await page.getByTestId("assistant-live").click();
  await page.getByTestId("live-start").click();
  await expect(page.getByTestId("live-bar")).toContainText("Live", NAV);

  await liveHeard(page, "item_1", "Plan me a science lesson on the water cycle");
  await livePush(page, {
    type: "response.function_call_arguments.done",
    name: "ask_jo",
    call_id: "call_1",
    arguments: JSON.stringify({ request: "water cycle lesson" }),
  });
  await expect(page.locator('a[href*="/tools/lesson-planner"]').first()).toBeVisible(NAV);
  expect(asked).toEqual(["Plan me a science lesson on the water cycle"]);
  await expect
    .poll(async () => (await liveSent(page)).find((e) => e.item?.call_id === "call_1")?.item?.output ?? "", NAV)
    .toContain("toolCard");

  // The first message made a chat and moved the url; the call survived it,
  // and the page did not open the tool on its own.
  await expect(page).toHaveURL(/\/assistant\/[^/]+$/, NAV);
  await page.waitForTimeout(1_500);
  await expect(page).toHaveURL(/\/assistant\/[^/]+$/);
  await expect(page.getByTestId("live-bar")).toBeVisible();

  await page.getByTestId("live-end").click();
  await expect(page.getByTestId("live-bar")).toHaveCount(0);
});

test("Talk on the Ask Jo page reads the reply a sentence at a time, then listens again", async ({ page }) => {
  // The second start hears nothing, and silence ends talk mode.
  await fakeMicrophone(page, ["give me a starter idea for fractions"]);
  await fakeSpeaker(page);
  const spoken: string[] = [];
  await page.route("**/api/jo/speak", (route) => {
    spoken.push((route.request().postDataJSON() as { text: string }).text);
    return route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.from("clip") });
  });
  const asked: string[] = [];
  await answerAssistant(page, asked, false);
  await signIn(page, teacher);
  await page.goto("/assistant");

  await page.getByTestId("assistant-talk").click();
  await expect.poll(() => asked, NAV).toEqual(["give me a starter idea for fractions"]);
  await expect.poll(() => spoken, NAV).toEqual(["Sure.", "I've set up a lesson plan on the water cycle."]);

  // Across the new chat's url change, talk mode carried on and listened again.
  await expect(page).toHaveURL(/\/assistant\/[^/]+$/, NAV);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starts: number }).__starts), NAV).toBe(2);
  await expect(page.getByTestId("assistant-talk")).toHaveAttribute("aria-pressed", "false");
});
