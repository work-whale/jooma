import { test, expect } from "@playwright/test";

import { CURRICULA_REGISTRY, UK_CURRICULUM_IDS } from "@/app/lib/curricula";
import { TOOL_SCOPE, hiddenToolSlugs, isToolHiddenFor, showsUkPhonicsSchemes } from "@/app/lib/curricula/tool-scope";
import { TOOLS } from "@/app/lib/tools";

/*
 * Which tools a teacher on another school system is offered.
 *
 * Five tools are built on England-only frameworks and are hidden from teachers
 * on a non-UK curriculum (approved 2026-11-14): Pupil Premium, Inspection
 * Prep, ECT Report, EYFS Plan and EYFS Action Plan. Jersey, Guernsey, the Isle
 * of Man and Gibraltar teach England's curriculum (EYFS included) and keep
 * them. Everything else stays, told to use the teacher's own system.
 */

const slugs = TOOLS.map((t) => t.href.replace("/tools/", ""));
const UK_ONLY = ["pupil-premium-planner", "inspection-prep", "ect-report-writer", "eyfs-planner", "eyfs-action-plan"];

test("every tool has a scope, and nothing else does", () => {
  expect(Object.keys(TOOL_SCOPE).sort()).toEqual([...slugs].sort());
});

test("exactly the five approved tools are UK only", () => {
  expect(Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k).sort()).toEqual([...UK_ONLY].sort());
});

test("Phonics adapts rather than hides", () => {
  expect(TOOL_SCOPE["phonics-support"]).toBe("adapts");
});

test("a UK teacher, or one whose curriculum is unknown, sees every tool", () => {
  for (const id of [...UK_CURRICULUM_IDS, null, undefined, "nonsense"]) {
    expect(hiddenToolSlugs(id)).toEqual([]);
    for (const slug of slugs) expect(isToolHiddenFor(slug, id)).toBe(false);
  }
});

test("the islands and Gibraltar keep the UK-only tools", () => {
  for (const c of CURRICULA_REGISTRY.filter((x) => x.region === "british-isles")) expect(hiddenToolSlugs(c.id), c.id).toEqual([]);
});

test("any other school system loses exactly the UK-only tools", () => {
  for (const c of CURRICULA_REGISTRY.filter((x) => x.region !== "uk" && x.region !== "british-isles")) {
    expect(hiddenToolSlugs(c.id).sort(), c.id).toEqual([...UK_ONLY].sort());
  }
});

test("unknown slugs are never hidden", () => {
  expect(isToolHiddenFor("not-a-tool", "jersey")).toBe(false);
});

test("the DfE phonics scheme list is offered only where England's schemes are taught", () => {
  for (const id of [...UK_CURRICULUM_IDS, null]) expect(showsUkPhonicsSchemes(id)).toBe(true);
  for (const c of CURRICULA_REGISTRY.filter((x) => x.region === "british-isles")) expect(showsUkPhonicsSchemes(c.id)).toBe(true);
  for (const c of CURRICULA_REGISTRY.filter((x) => x.region !== "uk" && x.region !== "british-isles")) expect(showsUkPhonicsSchemes(c.id)).toBe(false);
});

// ── Options that change with the school system ─────────────────────────────

import { bandsFor, examStylesFor, readingStageFor } from "@/app/lib/curricula/tool-scope";
import { DIFFERENTIATION_BANDS, DIFFERENTIATION_VALUES } from "@/app/lib/differentiation";
import { EXAM_STYLES } from "@/app/lib/sheets/exam-styles";
import { keyStageFor } from "@/app/lib/comprehension-domains";

const others = CURRICULA_REGISTRY.filter((x) => x.region !== "uk" && x.region !== "british-isles");

test.describe("attainment bands", () => {
  test("a UK-like teacher sees exactly the bands they always have", () => {
    for (const id of [...UK_CURRICULUM_IDS, "jersey", null]) expect(bandsFor(id)).toBe(DIFFERENTIATION_BANDS);
  });

  test("anyone else sees the same four values, named in plain words with no KS codes", () => {
    for (const c of others) {
      const bands = bandsFor(c.id);
      expect(bands.map((b) => b.value), c.id).toEqual([...DIFFERENTIATION_VALUES]);
      for (const b of bands) expect(`${b.label} ${b.detail}`, c.id).not.toMatch(/\b(WBS|WTS|EXS|GDS|Greater Depth)\b/);
    }
  });
});

test.describe("exam styles", () => {
  test("a UK-like teacher keeps every style", () => {
    for (const id of [...UK_CURRICULUM_IDS, "gibraltar", null]) expect(examStylesFor(id)).toEqual(EXAM_STYLES);
  });

  test("anyone else gets no KS2 SATs or GCSE board styles, but still a school test", () => {
    for (const c of others) {
      const styles = examStylesFor(c.id);
      expect(styles.length, c.id).toBeGreaterThan(0);
      for (const s of styles) expect(s.phase, `${c.id} ${s.id}`).toBe("school");
    }
  });
});

test.describe("reading domains", () => {
  test("a UK teacher's key stage is exactly what it was", () => {
    for (const y of ["Nursery", "Reception", "Year 1", "Year 2", "Year 3", "Year 6", "Year 11", ""]) {
      for (const mixed of [false, true]) {
        for (const id of [...UK_CURRICULUM_IDS, null]) expect(readingStageFor(y, mixed, id), `${y} ${mixed}`).toBe(keyStageFor(y, mixed));
      }
    }
  });

  test("anyone else is matched by age: the KS1 skills for 5 and 6 year olds, KS2 for the rest", () => {
    expect(readingStageFor("Senior Infants", false, "ireland")).toBe("ks1");
    expect(readingStageFor("1st Class", false, "ireland")).toBe("ks1");
    expect(readingStageFor("2nd Class", false, "ireland")).toBe("ks2");
    expect(readingStageFor("Stage 1", false, "cambridge-primary")).toBe("ks1");
    expect(readingStageFor("Stage 3", false, "cambridge-primary")).toBe("ks2");
    expect(readingStageFor("1st Class", true, "ireland")).toBe("ks2");
    expect(readingStageFor("Not a year", false, "ireland")).toBe("ks2");
  });
});
