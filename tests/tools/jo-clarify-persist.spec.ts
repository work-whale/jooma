import { test, expect, type Page } from "@playwright/test";
import {
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * The clarifying chips must survive the url change that follows the first
 * message of a chat.
 *
 * ── The bug this exists for ──
 * send() creates the chat on the first message, then runs
 * router.replace("/assistant/<id>") once the exchange completes. That changes
 * the `chatId` prop, which re-ran the loader effect, which re-fetched every
 * turn from the database. A stored row carries `tool_call` but NOT `clarify` —
 * deliberately, so a stale question cannot come back after a reload — so the
 * reload replaced the live turn with a clarify-less copy.
 *
 * The teacher saw the question and its chips appear, then vanish a beat later,
 * leaving "I'm about to make a phonics worksheet" and nothing to answer. The
 * reply guidance had already promised a question that was no longer on screen.
 *
 * THIS TEST SPENDS A MODEL CALL, deliberately, and it is the only Jo spec that
 * does. jo-fill.spec.ts and jo-slideshow.spec.ts drive hand built ?prefill=
 * URLs precisely to avoid that, but no URL can reproduce this: the bug is the
 * interaction between the streaming reply, the router.replace that follows the
 * first message, and the loader effect that fires on the resulting prop change.
 *
 * The spend is the cheap half of a turn — the guardrail and the tool-select
 * pass — because it stops at the question and never presses Generate. That is
 * a few hundredths of a penny per run against a bug that silently removed the
 * only way to answer Jo, and which no automated test could otherwise catch.
 */

/*
 * The composer, addressed through its own marker.
 *
 * NOT getByRole("textbox").first(): this page has three textboxes before it —
 * the top bar's tool search, the chat-list search, and then the composer. An
 * earlier version of this file typed the whole message into the tool search and
 * asserted against a page where nothing had ever been sent, which looked
 * exactly like Jo failing to answer.
 */
const composer = (page: Page) => page.locator("[data-jo-composer] textarea");

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Joclar");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test("chips asked for on the first message are still there afterwards", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await expect(composer(page)).toBeEnabled();

  // A request thin enough that Jo must ask: a worksheet with no year group.
  // This is the first message, so it creates the chat and triggers the replace.
  await composer(page).fill("I need a phonics worksheet for a Welsh school");
  await composer(page).press("Enter");

  // Wait for a REPLY, not for the url: the url only changes once the exchange
  // completes, and asserting on it first turns "Jo answered in prose" into a
  // confusing timeout on a pattern rather than a clear failure about content.
  const chips = page.getByRole("button", { name: /^Year \d+$/ });
  const card = page.getByRole("link", { name: /Opens the tool/ });
  await expect(chips.first().or(card)).toBeVisible({ timeout: 60_000 });

  // Now the url must have settled to the created chat. This is the change that
  // used to trigger the re-fetch.
  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}/, { timeout: 30_000 });

  if (await chips.count()) {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THIS. Give the reload the time it
    // used to take, then confirm the chips are still there.
    await page.waitForTimeout(3_000);
    await expect(chips.first()).toBeVisible();

    // And the escape hatches beside them, which vanished with the chips.
    await expect(page.getByRole("button", { name: /Open it as is/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add more detail/ })).toBeVisible();
  }
});

test("a plain build request opens a tool, never prose telling them where to look", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await expect(composer(page)).toBeEnabled();

  // Fully specified: subject, topic and year group are all present, so there
  // is nothing to ask about and nothing to infer. This MUST open the tool.
  await composer(page).fill("Make me a quiz on the Romans for Year 5");
  await composer(page).press("Enter");

  // THE REGRESSION. The reply came back as "Use Jooma's Quiz Maker to create
  // an editable, differentiated Year 5 Romans quiz; open it from Make" — prose
  // pointing at a tool instead of the card that opens it. The prompt had been
  // tuned so hard towards filling every field that declining to call the
  // function started to look like the safe choice.
  await expect(page.getByRole("link", { name: /Opens the tool/ })).toBeVisible({
    timeout: 60_000,
  });

  // And never the words that made the failure recognisable.
  await expect(page.getByText(/open it from Make/i)).toHaveCount(0);
});

test("the conversation is not re-fetched out from under itself", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await expect(composer(page)).toBeEnabled();

  // Count the history reads that happen AFTER the reply is on screen. The url
  // change the exchange itself causes must not trigger one, because the turns
  // in memory are more complete than the rows (a stored row has no clarify).
  const urls: string[] = [];
  await page.route("**/rest/v1/assistant_messages*", (route) => {
    if (route.request().method() === "GET") urls.push(route.request().url());
    return route.continue();
  });

  await composer(page).fill("I need a phonics worksheet for a Welsh school");
  await composer(page).press("Enter");

  // Wait for the reply, then mark the line: everything before this point is
  // setup, and a read here would be a genuine load rather than the re-fetch.
  const chips = page.getByRole("button", { name: /^Year \d+$/ });
  const card = page.getByRole("link", { name: /Opens the tool/ });
  await expect(chips.first().or(card)).toBeVisible({ timeout: 60_000 });
  const before = urls.length;

  await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.waitForTimeout(3_000);

  // The url change must add none. This is the assertion that fails if the
  // loader effect starts re-fetching a conversation it is already showing.
  expect(urls.length - before, `re-fetched after the url change: ${urls.slice(before).join(", ")}`)
    .toBe(0);
});
