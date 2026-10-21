import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Speaking to Jo, and Jo speaking back.
 *
 * - The mic on Ask Jo beside a resource, and on the Ask Jooma composer, write
 *   what was said once. The regression: Chrome on Android reports growing
 *   copies of the phrase ("hello", "hello my", ...), and the composer wrote
 *   every one of them into the box.
 * - With read aloud on, Jo's reply is read a sentence at a time.
 * - Talk mode sends what was said by itself, and listens again after Jo
 *   has read the reply.
 *
 * The microphone is a stand in for the Web Speech API, the model is answered by
 * page.route, and so is the voice. NOTHING IS SPENT.
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
  teacher = await createTeacher("Jovoice");
  // Ask Jooma is locked without a plan.
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

/**
 * A microphone that hears each phrase in `window.__heard` in turn, one per
 * start(), and reports it the way Chrome on Android does: the result list
 * holds a growing copy for every word so far, and the event fires per word.
 * Nothing left to hear is silence. `window.__starts` counts the starts.
 */
async function fakeMicrophone(page: Page, heard: string[]) {
  await page.addInitScript((phrases) => {
    const w = window as unknown as { __heard: string[]; __starts: number; SpeechRecognition: unknown; webkitSpeechRecognition: unknown };
    w.__heard = phrases;
    w.__starts = 0;
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      private stopped = false;
      start() {
        w.__starts++;
        const phrase = w.__heard.shift();
        const words = phrase ? phrase.split(" ") : [];
        let i = 0;
        const step = () => {
          if (this.stopped) return;
          if (i < words.length) {
            i++;
            const results = Array.from({ length: i }, (_, k) => [{ transcript: words.slice(0, k + 1).join(" ") }]);
            this.onresult?.({ results });
            setTimeout(step, 40);
          } else {
            this.onend?.();
          }
        };
        setTimeout(step, 40);
      }
      stop() {
        this.stopped = true;
        this.onend?.();
      }
      abort() {
        this.stopped = true;
      }
    }
    // Both names: current Chromium has the unprefixed one, which wins.
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  }, heard);
}

/** Audio that "plays" at once and ends a moment later, so the queue moves on. */
async function fakeSpeaker(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("jooma:jo-read-aloud", "1");
    HTMLMediaElement.prototype.play = function () {
      setTimeout(() => this.dispatchEvent(new Event("ended")), 30);
      return Promise.resolve();
    };
  });
}

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

/** Jo's answer: two sentences, one edit, and a summary. */
async function answerJo(page: Page, sent: string[]) {
  await page.route("**/api/jo", (route) => {
    sent.push(JSON.stringify(route.request().postDataJSON().messages));
    const sections = (route.request().postDataJSON() as { snapshot: { sections: { id: string; heading: string }[] } }).snapshot.sections;
    const plenary = sections.find((s) => s.heading === "Plenary")!.id;
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({
        reply: "I'll change the exit ticket. Pupils will draw instead.",
        clarify: null,
        ops: [{ op: "editText", label: "Changing the exit ticket", sectionId: plenary, find: "name one adaptation", replace: "draw one adaptation" }],
        summary: "The exit ticket now asks for a drawing.",
      }),
    });
  });
}

test("the Ask Jo mic writes what was said once, with no repeated words", async ({ page }) => {
  await fakeMicrophone(page, ["hello my name is"]);
  await openPlan(page);

  await page.getByTestId("jo-input").fill("Please");
  await page.getByTestId("jo-mic").click();
  await expect(page.getByTestId("jo-input")).toHaveValue("Please hello my name is");
  await expect(page.getByTestId("jo-mic")).toHaveAttribute("aria-pressed", "false");
});

test("Jo reads the reply aloud a sentence at a time", async ({ page }) => {
  await fakeSpeaker(page);
  const spoken: string[] = [];
  await page.route("**/api/jo/speak", (route) => {
    spoken.push((route.request().postDataJSON() as { text: string }).text);
    return route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.from("clip") });
  });
  await answerJo(page, []);
  await openPlan(page);

  await page.getByTestId("jo-input").fill("Make the exit ticket a drawing");
  await page.getByTestId("jo-send").click();

  await expect(page.locator(".ProseMirror")).toContainText("draw one adaptation", NAV);
  await expect
    .poll(() => spoken, NAV)
    .toEqual(["I'll change the exit ticket.", "Pupils will draw instead.", "The exit ticket now asks for a drawing."]);
});

test("talk mode sends what was said, then listens again once Jo has read the reply", async ({ page }) => {
  // The second start hears nothing, and silence ends talk mode.
  await fakeMicrophone(page, ["make the exit ticket a drawing"]);
  await fakeSpeaker(page);
  await page.route("**/api/jo/speak", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.from("clip") }),
  );
  const sent: string[] = [];
  await answerJo(page, sent);
  await openPlan(page);

  await page.getByTestId("jo-talk").click();
  await expect(page.locator(".ProseMirror")).toContainText("draw one adaptation", NAV);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain("make the exit ticket a drawing");

  await expect.poll(() => page.evaluate(() => (window as unknown as { __starts: number }).__starts), NAV).toBe(2);
  await expect(page.getByTestId("jo-talk")).toHaveAttribute("aria-pressed", "false");
  expect(sent).toHaveLength(1);
});

test("the Ask Jooma mic writes what was said once, with no repeated words", async ({ page }) => {
  await fakeMicrophone(page, ["hello my name is"]);
  await signIn(page, teacher);
  await page.goto("/assistant");

  const composer = page.locator("[data-jo-composer]").first();
  await composer.getByRole("button", { name: "Dictate" }).click();
  await expect(composer.getByLabel("Message Jo")).toHaveValue("hello my name is", NAV);
});
