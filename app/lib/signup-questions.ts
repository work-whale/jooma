/*
 * The two signup questions (Jooma 4.5 Phase 2, Step 7's signup_completed
 * "role, school"). Both optional: leaving one blank is skipping it, and saves
 * null. Saved on profiles.job_role and profiles.school_name; the values and
 * the 2 to 120 limit match the checks in migration 20261119000100.
 *
 * The school is free text (owner's choice, 19 Nov). Phase 3's weekly list of
 * schools with 3+ teachers groups on the email domain plus this cleaned name.
 *
 * Pure.
 */

export const ROLE_OPTIONS = [
  { value: "class_teacher", label: "Class teacher" },
  { value: "subject_teacher", label: "Subject teacher or head of department" },
  { value: "senco", label: "SENCo" },
  { value: "senior_leader", label: "Senior leader" },
  { value: "teaching_assistant", label: "Teaching assistant" },
  { value: "other", label: "Something else" },
] as const;

export type JobRole = (typeof ROLE_OPTIONS)[number]["value"];

const ROLES: ReadonlySet<string> = new Set(ROLE_OPTIONS.map((r) => r.value));

export function cleanRole(value: string | null | undefined): JobRole | null {
  return typeof value === "string" && ROLES.has(value) ? (value as JobRole) : null;
}

export function cleanSchool(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const tidy = value.replace(/\s+/g, " ").trim();
  return tidy.length >= 2 && tidy.length <= 120 ? tidy : null;
}
