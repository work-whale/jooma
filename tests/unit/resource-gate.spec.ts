import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { resourceGate, UNCHARGED_SLUGS, chargesResources, pictureGate } from "@/app/lib/resource-gate";

/*
 * The resources check in front of every cost-bearing request (plan 2c), as a
 * pure decision so proxy.ts and /api/generate-slideshow only wire it up.
 *
 * Edge cases: 0 left blocks even a sub-asset; an estimate above what is left
 * blocks a generation before it starts; a refine or an Ask Jo chat is never
 * refused for the balance (refining never spends, chat is free behind the
 * hourly limit); admins and School are never refused; paid plans are offered a
 * top-up, Free and the trial the P3 sheet; the SQL that measures spend skips
 * exactly the same slugs as this file.
 */

const row = (over = {}) => ({ plan: "free", total: 12, next_refill_at: "2026-11-22T00:00:00Z", ...over });

test("an estimate above what is left blocks before Make, with P3 for Free", () => {
  const r = resourceGate(row(), { path: "/api/lesson-planner", estimate: 29.5, isAdmin: false });
  expect(r).toMatchObject({
    blocked: true,
    action: "upgrade",
    message: "This usually needs about 30. You have 12.",
    prompt: { prompt: "P3", variant: "free", needed: 30, left: 12, refillAt: "2026-11-22T00:00:00.000Z" },
  });
});

test("an estimate that fits is allowed", () => {
  expect(resourceGate(row(), { path: "/api/worksheet-generator", estimate: 2.5, isAdmin: false })).toBeNull();
});

test("0 left blocks a sub-asset too, but a positive balance lets one through", () => {
  expect(resourceGate(row({ total: 0 }), { path: "/api/generate-image", estimate: null, isAdmin: false })).toMatchObject({
    blocked: true,
  });
  expect(resourceGate(row({ total: 1 }), { path: "/api/generate-image", estimate: null, isAdmin: false })).toBeNull();
});

test("refines and Ask Jo chat are never refused for the balance", () => {
  for (const path of ["/api/modify", "/api/jo", "/api/edit-text", "/api/assistant"]) {
    expect(resourceGate(row({ total: 0 }), { path, estimate: null, isAdmin: false }), path).toBeNull();
  }
});

test("paid plans are offered a top-up; the trial gets its own P3", () => {
  expect(resourceGate(row({ plan: "pro", total: 0 }), { path: "/api/quiz-generator", estimate: 1, isAdmin: false })).toMatchObject({
    action: "topup",
    prompt: { prompt: null, variant: "topup" },
  });
  expect(
    resourceGate(row({ plan: "pro_trial", total: 3, next_refill_at: null }), { path: "/api/lesson-planner", estimate: 30, isAdmin: false }),
  ).toMatchObject({ action: "upgrade", prompt: { prompt: "P3", variant: "trial", refillAt: null } });
});

test("admins and School are never refused", () => {
  expect(resourceGate(row({ total: 0 }), { path: "/api/lesson-planner", estimate: 30, isAdmin: true })).toBeNull();
  expect(resourceGate(row({ plan: "school", total: 0 }), { path: "/api/lesson-planner", estimate: 30, isAdmin: false })).toBeNull();
});

test("a missing or garbled row never blocks (fail open, as the old gate did)", () => {
  expect(resourceGate(null, { path: "/api/lesson-planner", estimate: 30, isAdmin: false })).toBeNull();
});

test("which slugs spend resources", () => {
  expect(chargesResources("lesson-planner")).toBe(true);
  expect(chargesResources("modify")).toBe(false);
  expect(chargesResources("assistant")).toBe(false);
});

test("the SQL that measures spend skips exactly these slugs", () => {
  const sql = fs.readFileSync("supabase/migrations/20261118000000_plans_engine.sql", "utf8");
  const m = sql.match(/-- UNCHARGED_SLUGS\s*\n\s*t\.tool_slug not in \(([^)]*)\)/);
  expect(m, "resources_spent() must list the uncharged slugs").not.toBeNull();
  const listed = m![1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  expect(listed).toEqual([...UNCHARGED_SLUGS].sort());
});

test("a generated picture is refused on Free and Standard with P5, allowed on Pro", () => {
  for (const plan of ["free", "standard"]) {
    expect(pictureGate(plan, "/api/generate-image")).toMatchObject({ blocked: true, prompt: "P5" });
  }
  expect(pictureGate("pro", "/api/generate-image")).toBeNull();
  expect(pictureGate("pro_trial", "/api/generate-image")).toBeNull();
  expect(pictureGate("free", "/api/quiz-generator")).toBeNull();
});
