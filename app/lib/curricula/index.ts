/*
 * Every school system Jooma can write for, and the helpers that read one from
 * an untrusted request and turn it into a prompt instruction.
 *
 * Built like app/lib/languages.ts, and for the same reason: the five UK
 * curricula are a strict no-op. curriculumInstruction() returns "" for them and
 * withCurriculum() returns the very same messages array, so a UK teacher's
 * prompt is byte for byte what it was before other systems existed
 * (tests/unit/curriculum-golden.spec.ts holds that line).
 *
 * Any other system adds ONE final system message naming the system, its
 * current version and its local terms, overriding the "UK teacher" framing the
 * tool prompts are written in. That keeps 30-odd prompt files untouched.
 *
 * Shared by client and server: no server-only imports.
 */

import type { Curriculum, CurriculumVersion, Region, RegionId, YearOption } from "./types";
import { AUSTRALIA_NZ_CURRICULA } from "./australia-nz";
import { BRITISH_ISLES_CURRICULA } from "./british-isles";
import { CANADA_CURRICULA } from "./canada";
import { INTERNATIONAL_CURRICULA } from "./international";
import { IRELAND_CURRICULA } from "./ireland";
import { UK_CURRICULA } from "./uk";
import { USA_CURRICULA } from "./usa";
// Relative, so scripts/curricula-status.mjs can load the registry in plain Node.
import { NGSS_NAME_BLOCKED } from "../standards/permissions";

export type { Curriculum, CurriculumVersion, FrameworkId, LocalTerms, Region, RegionId, YearOption } from "./types";

export const REGIONS: readonly Region[] = [
  { id: "uk", label: "United Kingdom" },
  { id: "british-isles", label: "Channel Islands, Isle of Man and Gibraltar" },
  { id: "ireland", label: "Ireland" },
  { id: "international", label: "International programmes" },
  { id: "australia-nz", label: "Australia and New Zealand" },
  { id: "usa", label: "United States" },
  { id: "canada", label: "Canada" },
];

export const CURRICULA_REGISTRY: readonly Curriculum[] = [...UK_CURRICULA, ...BRITISH_ISLES_CURRICULA, ...IRELAND_CURRICULA, ...INTERNATIONAL_CURRICULA, ...AUSTRALIA_NZ_CURRICULA, ...USA_CURRICULA, ...CANADA_CURRICULA];

export const UK_CURRICULUM_IDS = ["england", "england-eyfs", "scotland", "wales", "northern-ireland"] as const;

const BY_ID = new Map(CURRICULA_REGISTRY.map((c) => [c.id, c]));
const BY_LABEL = new Map<string, string>();
for (const c of CURRICULA_REGISTRY) {
  for (const label of [c.promptLabel, ...(c.aliases ?? [])]) if (!BY_LABEL.has(label)) BY_LABEL.set(label, c.id);
}
const UK_IDS = new Set<string>(UK_CURRICULUM_IDS);
const REGION_IDS = new Set<string>(REGIONS.map((r) => r.id));

/** True when the slides wizard offers the UK year list (Nursery to Year 13,
 *  plus Adult learners): every UK and island curriculum, and a guest or an
 *  unknown value. Every other system lists its own year names. */
export function usesUkYearList(value: unknown): boolean {
  const c = getCurriculum(value);
  return !c || c.region === "uk" || c.region === "british-isles";
}

/** A known curriculum id, from an id or a label a form has sent; null for
 *  anything else. The value is untrusted: never put it in a prompt unparsed. */
export function parseCurriculum(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (BY_ID.has(value)) return value;
  return BY_LABEL.get(value) ?? null;
}

export function getCurriculum(value: unknown): Curriculum | undefined {
  const id = parseCurriculum(value);
  return id ? BY_ID.get(id) : undefined;
}

export function isUkCurriculum(value: unknown): boolean {
  const id = parseCurriculum(value);
  return id !== null && UK_IDS.has(id);
}

/** The curriculum of a parsed request body: `curriculumId` if it is a known
 *  id, else the `curriculum` label the form sent; null if neither is known. */
export function requestCurriculum(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { curriculumId?: unknown; curriculum?: unknown };
  return parseCurriculum(b.curriculumId) ?? parseCurriculum(b.curriculum);
}

/** The version in force on `now`: the latest one that has started, or the
 *  first if none has yet. */
export function currentVersion(entry: Pick<Curriculum, "versions">, now: Date = new Date()): CurriculumVersion {
  const today = now.toISOString().slice(0, 10);
  let current = entry.versions[0];
  for (const v of entry.versions) if (v.inForceFrom <= today) current = v;
  return current;
}

/** The years a curriculum offers, in order. Unknown ids get England's. */
export function yearsFor(value: unknown): YearOption[] {
  return (getCurriculum(value) ?? UK_CURRICULA[0]).years;
}

/**
 * What a form adds to its saved state (tool_runs.input). Nothing for a UK
 * curriculum, so a UK form's state is exactly what it was before and an older
 * run still reads as unchanged.
 */
export function curriculumFormState(value: unknown): { curriculumId?: string } {
  const id = parseCurriculum(value);
  return id && !UK_IDS.has(id) ? { curriculumId: id } : {};
}

/**
 * The curricula a teacher may pick. UK ones always; any other only when its
 * region is switched on (or the viewer is an admin) AND it has been checked
 * against its official source.
 */
export function visibleCurricula(regionsOn: readonly string[], isAdmin: boolean): Curriculum[] {
  const on = new Set(regionsOn.filter((r) => REGION_IDS.has(r)));
  return CURRICULA_REGISTRY.filter((c) => {
    if (c.region === "uk") return true;
    if (!c.verifiedOn) return false;
    return isAdmin || on.has(c.region);
  });
}

const TERM_LINES: [keyof NonNullable<Curriculum["terms"]>, string][] = [
  ["curriculum", "the National Curriculum"],
  ["stages", "Key Stages"],
  ["exams", "GCSEs, A levels and SATs"],
  ["inspection", "Ofsted"],
  ["send", "SEND, the SEND Code of Practice, EHCPs and the SENCO"],
  ["teacherStandards", "the Teachers' Standards"],
  ["earlyYears", "the EYFS"],
  ["attainment", "the WTS, EXS and GDS bands"],
  ["headteacher", "headteacher"],
];

/**
 * The instruction that tells the model which school system it is writing for,
 * appended as the LAST system message. Empty for a UK curriculum or none.
 */
export function curriculumInstruction(value: unknown, now: Date = new Date()): string {
  const c = getCurriculum(value);
  if (!c || UK_IDS.has(c.id)) return "";

  const version = currentVersion(c, now).label;
  const where = c.place ?? c.state ?? (c.country === "INT" ? "an international school" : "");
  const lines = [
    `SCHOOL SYSTEM: ${c.name} (current version: ${version}).`,
    `This teacher works ${where ? `in ${where} ` : ""}under the ${c.name}. Write for that system: use its year or grade names, its standards and its assessments exactly as its teachers and pupils know them. This overrides any earlier instruction that assumes a school in England or the UK.`,
  ];
  if (c.context) lines.push(c.context);
  // NGSS is a trademark Jooma has no permission to use yet (see
  // app/lib/standards/permissions.ts), so the output must not name it.
  if (NGSS_NAME_BLOCKED && (c.alignment?.frameworks.includes("ngss") || /NGSS|Next Generation Science/i.test(c.context ?? ""))) {
    lines.push(`Do not write "NGSS" or "Next Generation Science Standards" anywhere in the output. Call them "${c.place ?? "the state"}'s science standards" instead, and cite performance expectations by code only (for example 3-PS2-1).`);
  }

  const terms = TERM_LINES.filter(([key]) => c.terms?.[key]);
  if (terms.length) {
    lines.push(
      "Where the instructions above name a UK framework or term, use this system's own instead of it:",
      ...terms.map(([key, uk]) => `- instead of ${uk}: ${c.terms![key]}.`),
      "Where a UK term has no equivalent here, leave it out rather than use the UK one.",
    );
  }
  lines.push("Keep JSON keys, schema field names and enum values exactly as specified.");
  return lines.join("\n");
}

/**
 * Append the curriculum instruction as the final system message. For a UK
 * curriculum (or none) the SAME array is returned untouched.
 */
export function withCurriculum<M extends { role: string }>(messages: M[], value: unknown): M[] {
  const instruction = curriculumInstruction(value);
  if (!instruction) return messages;
  return [...messages, { role: "system", content: instruction } as unknown as M];
}

// ── Region switches ────────────────────────────────────────────────────────
// One boolean app_settings row per region (supabase/migrations/
// 20261114000000_curricula.sql), read through public_settings().

/** The app_settings key that switches a region on. The UK has none. */
export function regionSettingKey(region: RegionId): string | null {
  return region === "uk" ? null : `curricula_${region.replace(/-/g, "_")}`;
}

/** The regions switched on, from public_settings() rows. Only a value of
 *  exactly `true` counts: a malformed row can fail to show a region, never
 *  show one by accident. */
export function regionsFromSettings(rows: unknown): RegionId[] {
  if (!Array.isArray(rows)) return [];
  const on = new Set(
    rows
      .filter((r): r is { key: string; value: unknown } => !!r && typeof r === "object" && typeof (r as { key?: unknown }).key === "string")
      .filter((r) => r.value === true)
      .map((r) => r.key),
  );
  return REGIONS.filter((r) => {
    const key = regionSettingKey(r.id);
    return key !== null && on.has(key);
  }).map((r) => r.id);
}

// ── A teacher's starting curriculum ────────────────────────────────────────

/** Countries whose own curriculum is the obvious default. */
const COUNTRY_DEFAULT: Record<string, string> = {
  GB: "england",
  JE: "jersey",
  GG: "guernsey",
  IM: "isle-of-man",
  GI: "gibraltar",
};

/**
 * The curriculum to start a teacher on when their profile has none: what their
 * browser last picked (ll:curriculum), else their profile country's own, else
 * England. Only ever returns one of `offered`'s ids, or "england".
 */
export function inferCurriculum(
  hints: { savedLabel?: unknown; country?: unknown },
  offered: readonly Curriculum[],
): string {
  const ids = new Set(offered.map((c) => c.id));
  const saved = parseCurriculum(hints.savedLabel);
  if (saved && ids.has(saved)) return saved;
  const byCountry = typeof hints.country === "string" ? COUNTRY_DEFAULT[hints.country] : undefined;
  if (byCountry && ids.has(byCountry)) return byCountry;
  return "england";
}

/** What the picker lists: the offered curricula grouped by region, in
 *  registry order, with empty regions left out. */
export function pickerGroups(offered: readonly Curriculum[]): { region: RegionId; label: string; curricula: Curriculum[] }[] {
  return REGIONS.map((r) => ({ region: r.id, label: r.label, curricula: offered.filter((c) => c.region === r.id) })).filter(
    (g) => g.curricula.length > 0,
  );
}

/**
 * The output language to switch to when a teacher picks `curriculumId`: the
 * curriculum's own, but only if they have never chosen one themselves (no
 * ll:language in storage, `stored` is its raw value). Null means leave it.
 */
export function languageAfterChoosing(curriculumId: unknown, stored: string | null): string | null {
  if (stored !== null) return null;
  const c = getCurriculum(curriculumId);
  if (!c || c.defaultLanguage === "en-GB") return null;
  return c.defaultLanguage;
}
