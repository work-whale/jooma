import { defineConfig, devices } from "@playwright/test";

/*
 * End to end tests.
 *
 *   pnpm test:e2e            headless, the usual run
 *   pnpm test:e2e:headed     watch it happen in a real browser
 *   pnpm test:e2e:ui         Playwright's interactive runner
 *
 * WHICH DATABASE THESE HIT
 *
 * Whatever .env.local points at, which today is STAGING. These tests create
 * their own throwaway users through the service role and delete them again, so
 * nothing accumulates, but they are writing to a real hosted database rather
 * than a local one. Do not point them at production.
 *
 * A dev server on port 3000 is reused if one is running, and started if not.
 * See the note beside `webServer` for why an isolated port is not an option.
 */

/*
 * Port 3000, the ordinary dev port, and these tests REUSE a server you already
 * have running rather than starting a second one.
 *
 * Next.js 16 refuses to run two dev servers against the same directory, even on
 * different ports, so an isolated port for tests is not available: the second
 * one exits with "Another next dev server is already running". Reuse is
 * therefore the only arrangement that works whether or not you happen to be
 * running `pnpm dev` at the time.
 *
 * `localhost`, NOT `127.0.0.1`. Next's dev server treats those as different
 * origins and blocks its own dev resources on the one it was not started with
 * ("Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr").
 * The page still renders, because the server-rendered HTML arrives fine, but
 * React never hydrates: every controlled input stays empty as far as React is
 * concerned, and every button gated on form state stays disabled forever. It
 * looks exactly like a broken app rather than a misconfigured test, and cost an
 * hour once already.
 *
 * Override with E2E_BASE_URL to point at a preview deployment instead.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",

  // These tests sign in, connect two accounts and share between them. Running
  // files in parallel against one database invites two runs colliding on the
  // same fixture, and the time saved is not worth the flake.
  fullyParallel: false,
  workers: 1,

  // A failing assertion should be a real failure, not something a retry hides.
  // In CI one retry absorbs genuine network flakiness against hosted Supabase.
  retries: process.env.CI ? 1 : 0,

  // No `.only` left behind in a committed test.
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  // Generous: the first request to a route in dev compiles it, which can take
  // several seconds on a cold Next.js server.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    // Kept only for a failure, which is when they are worth having and when
    // nobody minds the disk. See .gitignore.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Every run, not just failures: these tests are about what the teacher SEES
    // (Jo typing into a form), so the recording is the artefact you check the
    // feature against, not only the evidence of a break. Videos land in
    // test-results/<test>/video.webm and are gitignored.
    video: "on",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Starts a dev server only if nothing is already answering on that port, so
  // running these alongside your own `pnpm dev` works and costs no startup.
  // Skipped entirely when E2E_BASE_URL points somewhere remote.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm next dev --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
