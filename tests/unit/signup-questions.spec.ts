import { test, expect } from "@playwright/test";
import { cleanRole, cleanSchool, ROLE_OPTIONS } from "@/app/lib/signup-questions";

/*
 * The two signup questions (spec Step 9, Phase 2: "role and school, both
 * skippable"). Saved on profiles.job_role and profiles.school_name and sent
 * with signup_completed.
 *
 * Edge cases: skipping either (blank) saves null, never ""; a role outside the
 * list (a hand-edited request) is null, matching the database check; the
 * school is trimmed and inner spaces collapsed; too short (1 character) or
 * too long is refused rather than cut mid-word; the database limits (2 to 120)
 * match; labels follow the copy rules.
 */

test("six roles, values matching the database check", () => {
  expect(ROLE_OPTIONS.map((r) => r.value)).toEqual([
    "class_teacher",
    "subject_teacher",
    "senco",
    "senior_leader",
    "teaching_assistant",
    "other",
  ]);
  for (const r of ROLE_OPTIONS) expect(r.label).not.toMatch(/–|—|\bAI\b/);
});

test("a role: a listed value, or null for blank and anything else", () => {
  expect(cleanRole("senco")).toBe("senco");
  expect(cleanRole("")).toBeNull();
  expect(cleanRole(null)).toBeNull();
  expect(cleanRole("headteacher")).toBeNull();
  expect(cleanRole("SENCO")).toBeNull();
});

test("a school: trimmed and tidied, or null when skipped", () => {
  expect(cleanSchool("  St Mary's   C of E  Primary ")).toBe("St Mary's C of E Primary");
  expect(cleanSchool("")).toBeNull();
  expect(cleanSchool("   ")).toBeNull();
  expect(cleanSchool(undefined)).toBeNull();
});

test("a school: 2 to 120 characters, as the database allows", () => {
  expect(cleanSchool("A")).toBeNull();
  expect(cleanSchool("AB")).toBe("AB");
  expect(cleanSchool("x".repeat(120))).toHaveLength(120);
  expect(cleanSchool("x".repeat(121))).toBeNull();
});
