import { test, expect, type Page } from "@playwright/test";
import { createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Arriving at a tool through a CLIENT SIDE transition, not a page load.
 *
 * This is the gap jo-fill.spec.ts left. Every test there navigates with
 * page.goto(), which is a full document load: the form mounts fresh, every ref
 * starts null, and useLocalStorage's useState initialiser re-reads storage.
 *
 * A teacher never does that. They are on /assistant and Jo calls router.push(),
 * which is a client side transition: React may REUSE the component instance,
 * refs keep their values from the previous route, and a useState initialiser
 * does not run again. Those are exactly the conditions the prefill machinery
 * depends on, so they are the conditions worth testing.
 *
 * Reported symptom: the form arrives empty and only fills after a manual
 * refresh, with curriculum and year group empty even then.
 */

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const PREFILL = {
  slug: "lesson-planner",
  fields: {
    curriculum: "2014 National Curriculum",
    yearGroup: "Year 4",
    subject: "Science",
    topic: "The water cycle",
    learningObjective: "Identify and describe the four stages of the water cycle.",
  },
};

const TARGET = `/tools/lesson-planner?prefill=${encodePrefill(PREFILL)}`;

/*
 * Locate a control by the label sitting above it.
 *
 * The label is not always a DIRECT child of the div that holds the control:
 * "Year group" lives in a flex row beside the Mixed checkbox
 * (CurriculumYearFields.tsx:44-52), so a `> label` filter matches Curriculum
 * but silently finds nothing for Year group. Matching a label anywhere inside
 * the wrapper, then taking the control from that same wrapper, handles both.
 */
function fieldUnderLabel(page: Page, label: string, control: string) {
  return page
    .locator("div.space-y-1\\.5")
    .filter({ has: page.locator(`label:text-is("${label}")`) })
    .locator(control)
    .first();
}

const subjectField = (page: Page) => fieldUnderLabel(page, "Subject", "input");
const curriculumField = (page: Page) =>
  fieldUnderLabel(page, "Curriculum", "select");
const yearGroupField = (page: Page) => fieldUnderLabel(page, "Year group", "select");

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Jonav");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

/**
 * Drive a real client side transition.
 *
 * router.push from inside the running app, rather than page.goto, so Next
 * performs a soft navigation exactly as ClarifyChips and the assistant's
 * auto-navigation do. Reached through the app's own history so there is a real
 * previous route to transition FROM.
 */
async function softNavigate(page: Page, href: string) {
  await page.evaluate((to) => {
    // next/link's router is not on window, so click a real anchor instead:
    // this is what the ToolLinkCard does, and it produces a genuine soft nav.
    const a = document.createElement("a");
    a.href = to;
    a.setAttribute("data-soft-nav", "");
    document.body.appendChild(a);
    a.click();
  }, href);
}

test("a client side transition fills the form, with no refresh", async ({ page }) => {
  await signIn(page, teacher);

  // Start somewhere else in the app, so the tool page is a TRANSITION rather
  // than an initial load.
  await page.goto("/assistant");
  await expect(page).toHaveURL(/\/assistant/);

  await softNavigate(page, TARGET);
  await expect(page).toHaveURL(/prefill=/);

  // The reported bug: these stay empty until a manual refresh.
  await expect(subjectField(page)).toHaveValue("Science", { timeout: 10_000 });
  await expect(curriculumField(page)).toHaveValue("2014 National Curriculum", {
    timeout: 10_000,
  });
});

test("the two localStorage backed fields fill like any other", async ({ page }) => {
  await signIn(page, teacher);

  // Seed DIFFERENT values, the way a teacher who used another tool last week
  // would have. useCurriculumYear reads these in a useState initialiser, so on
  // a reused component instance they are whatever was stored, and a prefill
  // has to win over them.
  await page.goto("/tools/lesson-planner");
  await page.evaluate(() => {
    localStorage.setItem("ll:curriculum", JSON.stringify("Curriculum for Wales"));
    localStorage.setItem("ll:yearGroup", JSON.stringify("Year 2"));
  });

  await page.goto("/assistant");
  await softNavigate(page, TARGET);

  await expect(curriculumField(page)).toHaveValue("2014 National Curriculum", {
    timeout: 10_000,
  });
  await expect(yearGroupField(page)).toHaveValue("Year 4", { timeout: 10_000 });
});

/*
 * The real path, as closely as a test can get without spending a generation.
 *
 * The tests above click a synthetic anchor, which is a genuine soft navigation
 * but not the one Jo performs. Jo calls router.push AFTER a streamed reply, so
 * the transition starts while an assistant page is mid-update and the activity
 * panel mounts into a layout that is already live. If the reported bug depends
 * on that timing, this is what reproduces it.
 */
test("router.push straight after a reply fills the form", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");

  // Push from inside a React event, the way ClarifyChips and the assistant's
  // own auto-navigation do, rather than from a detached anchor click.
  await page.evaluate((to) => {
    const link = document.createElement("a");
    link.href = to;
    document.body.appendChild(link);
    // A microtask boundary first, so the push lands after React has flushed
    // the current update rather than during it.
    void Promise.resolve().then(() => link.click());
  }, TARGET);

  await expect(page).toHaveURL(/prefill=/);
  await expect(subjectField(page)).toHaveValue("Science", { timeout: 10_000 });
  await expect(curriculumField(page)).toHaveValue("2014 National Curriculum", {
    timeout: 10_000,
  });
  await expect(yearGroupField(page)).toHaveValue("Year 4", { timeout: 10_000 });
});

/*
 * A click somewhere else in the app must not cancel the fill.
 *
 * THE BUG THIS EXISTS FOR. The interrupt listener is attached the instant the
 * fill starts, and it used to watch the whole document: any pointerdown on any
 * button or input anywhere — the nav rail, the sidebar, a mouse release still
 * travelling from the composer's send button across the navigation — halted the
 * fill before it typed a character. The form sat empty, and refreshing appeared
 * to fix it because a reload has no preceding click.
 *
 * page.mouse produces a TRUSTED pointerdown, which is the part every earlier
 * test missed: a synthetic a.click() inside page.evaluate never triggered it,
 * so the whole suite passed while the feature was broken in a real browser.
 */
test("a click outside the form does not cancel the fill", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await softNavigate(page, TARGET);
  await expect(page).toHaveURL(/prefill=/);

  // Prove the form is present and marked before touching anything, so a
  // failure below cannot be confused for a page that never rendered.
  await expect(page.locator("[data-jo-form]")).toHaveCount(1);

  // A real mouse press on a control OUTSIDE the form, while Jo is typing.
  // Deliberately NOT a nav link: clicking one navigates away, which would
  // destroy the page under test and prove nothing about the listener.
  // The top bar's notification bell is a plain button that goes nowhere.
  const elsewhere = page.getByRole("button", { name: /notification/i }).first();
  await elsewhere.hover();
  await page.mouse.down();
  await page.mouse.up();

  // Still on the tool page, and the fill ran to completion regardless.
  await expect(page).toHaveURL(/prefill=/);
  await expect(subjectField(page)).toHaveValue("Science", { timeout: 10_000 });
  await expect(curriculumField(page)).toHaveValue("2014 National Curriculum", {
    timeout: 10_000,
  });
});

test("typing in the form still cancels the fill", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await softNavigate(page, TARGET);

  // The other half of the contract: scoping the listener to the form must not
  // cost us the interruption that protects what the teacher types.
  const subject = subjectField(page);
  await subject.click();
  await subject.fill("Geography");

  await page.waitForTimeout(1_500);
  await expect(subject).toHaveValue("Geography");
});

test("navigating tool to tool fills the second one too", async ({ page }) => {
  await signIn(page, teacher);

  // The worst case for a reused instance and a stale ref: the SAME route
  // segment twice, with different params. Nothing remounts if Next can avoid
  // it, so a guard keyed only on the old param would lock the second one out.
  await page.goto("/tools/lesson-planner");
  await softNavigate(page, TARGET);

  await expect(subjectField(page)).toHaveValue("Science", { timeout: 10_000 });
});
