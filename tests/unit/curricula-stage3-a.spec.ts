import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import {
  CURRICULA_REGISTRY,
  REGIONS,
  RELEASES,
  curriculumInstruction,
  currentVersion,
  getCurriculum,
  inferCurriculum,
  parseCurriculum,
  pickerGroups,
  visibleCurricula,
} from "@/app/lib/curricula";
import { PROVENANCE } from "@/app/lib/curricula/provenance";
import { TOOL_SCOPE, hiddenToolSlugs, isToolHiddenFor } from "@/app/lib/curricula/tool-scope";

/*
 * Stage 3 batch A: the Gulf, the Middle East and Türkiye
 * (docs/curricula-stage3-build.md A.1 to A.10). Profiles only: no source is
 * open for commercial use.
 */

const A_IDS = ["saudi-arabia", "qatar", "kuwait", "oman", "bahrain", "jordan", "egypt", "israel", "turkey"] as const;
const ALL_REGIONS = REGIONS.map((r) => r.id);

const grades = (from: number, to: number, firstAge: number, prefix = "Grade") =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));
const KG12 = [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...grades(1, 12, 6)];

const YEARS: Record<(typeof A_IDS)[number], { label: string; age: number }[]> = {
  "saudi-arabia": [{ label: "KG1", age: 3 }, { label: "KG2", age: 4 }, { label: "KG3", age: 5 }, ...grades(1, 12, 6)],
  qatar: KG12,
  kuwait: KG12,
  oman: KG12,
  bahrain: grades(1, 12, 6),
  jordan: KG12,
  egypt: [{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...grades(1, 6, 6, "Primary"), ...grades(1, 3, 12, "Preparatory"), ...grades(1, 3, 15, "Secondary")],
  israel: [{ label: "Kindergarten (age 3)", age: 3 }, { label: "Kindergarten (age 4)", age: 4 }, { label: "Kindergarten (age 5)", age: 5 }, ...grades(1, 12, 6)],
  turkey: [{ label: "Preschool", age: 5 }, ...grades(1, 12, 6)],
};

/** The exam each country's prompt must name; no other batch A prompt may. */
const OWN_EXAM: Record<(typeof A_IDS)[number], RegExp> = {
  "saudi-arabia": /Tahsili/,
  qatar: /Secondary School Certificate examinations/,
  kuwait: /Grade 12 final examinations/,
  oman: /General Education Diploma/,
  bahrain: /BQA National Examinations/,
  jordan: /Tawjihi/,
  egypt: /Thanaweya Amma/,
  israel: /Bagrut/,
  turkey: /\bLGS\b/,
};

const PLACE: Record<(typeof A_IDS)[number], string> = {
  "saudi-arabia": "Saudi Arabia",
  qatar: "Qatar",
  kuwait: "Kuwait",
  oman: "Oman",
  bahrain: "Bahrain",
  jordan: "Jordan",
  egypt: "Egypt",
  israel: "Israel",
  turkey: "Türkiye",
};

const SHEET_NAME: Record<(typeof A_IDS)[number], string> = { ...PLACE, turkey: "Turkey (Türkiye)" };

const COUNTRY: Record<(typeof A_IDS)[number], string> = {
  "saudi-arabia": "SA",
  qatar: "QA",
  kuwait: "KW",
  oman: "OM",
  bahrain: "BH",
  jordan: "JO",
  egypt: "EG",
  israel: "IL",
  turkey: "TR",
};

/** The prompt with the UK term each override replaces cut away, so a check
 *  for "Ofsted" only sees the country's own words. */
const ownText = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");

test.describe("Stage 3 batch A entries", () => {
  test("the nine exist, verified, in batch A, in the Middle East except Türkiye in Europe", () => {
    const batch = CURRICULA_REGISTRY.filter((c) => c.release === "s3-a").map((c) => c.id);
    expect([...batch].sort()).toEqual([...A_IDS].sort());
    for (const id of A_IDS) {
      const c = getCurriculum(id)!;
      expect(c.verifiedOn, id).toBe("2026-11-27");
      expect(c.region, id).toBe(id === "turkey" ? "europe" : "middle-east");
      expect(c.country, id).toBe(COUNTRY[id]);
      expect(c.place, id).toBe(PLACE[id]);
      expect(c.alignment, `${id} has no statements`).toBeUndefined();
    }
    expect(RELEASES.find((r) => r.id === "s3-a")!.label).toMatch(/Türkiye/);
  });

  test("each year list is exactly the one the sources give", () => {
    for (const id of A_IDS) expect(getCurriculum(id)!.years, id).toEqual(YEARS[id]);
  });

  test("Egypt names its years Primary, Preparatory and Secondary, never Grade", () => {
    expect(getCurriculum("egypt")!.years.some((y) => /Grade/.test(y.label))).toBe(false);
    expect(getCurriculum("egypt")!.terms!.stages).toMatch(/Preparatory \(Preparatory 1 to 3\)/);
  });

  test("the stage lines carry each system's own boundaries", () => {
    const stages = (id: string) => getCurriculum(id)!.terms!.stages!;
    expect(stages("kuwait")).toMatch(/Primary \(Grades 1 to 5\), Intermediate \(Grades 6 to 9\)/);
    expect(stages("oman")).toMatch(/Cycle 1 \(Grades 1 to 4\), Cycle 2 \(Grades 5 to 10\) and Post-Basic Education \(Grades 11 and 12\)/);
    expect(stages("qatar")).toMatch(/Primary \(Grades 1 to 6\), Preparatory \(Grades 7 to 9\) and Secondary \(Grades 10 to 12\)/);
    expect(stages("saudi-arabia")).toMatch(/Secondary Tracks System/);
    expect(stages("turkey")).toMatch(/ilkokul, Grades 1 to 4\), middle school \(ortaokul, Grades 5 to 8\) and high school \(lise, Grades 9 to 12/);
    expect(stages("israel")).toMatch(/Grades 7 to 9/);
  });

  test("each has a provenance row naming its workbook row, saying what was checked and that the licence is not open", () => {
    for (const id of A_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: SHEET_NAME[id] });
      expect(p.source, id).toMatch(/^https:\/\//);
      expect(p.notes, id).toMatch(/Stage 3 batch A \(2026-11-27\)/);
      expect(p.notes, id).toMatch(/Confirmed/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/permission/i);
      expect(p.notes, id).toMatch(/Profile only/);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
  });

  test("Saudi Arabia defaults to American English (its state-school English books are McGraw-Hill); the other eight to British English", () => {
    for (const id of A_IDS) expect(getCurriculum(id)!.defaultLanguage, id).toBe(id === "saudi-arabia" ? "en-US" : "en-GB");
  });

  test("each one's teaching language is on the language gaps list", () => {
    const gaps = readFileSync(path.join(process.cwd(), "docs", "curricula-language-gaps.md"), "utf8");
    for (const id of A_IDS) expect(gaps, id).toContain(id === "turkey" ? "Turkey (Türkiye)" : PLACE[id]);
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    expect(ukOnly.length).toBe(5);
    for (const id of A_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
    }
  });
});

test.describe("Stage 3 batch A prompts", () => {
  test("each names its own system, place and exam", () => {
    for (const id of A_IDS) {
      const c = getCurriculum(id)!;
      const text = curriculumInstruction(id);
      expect(text, id).toContain(`SCHOOL SYSTEM: ${c.name}`);
      expect(text, id).toContain(`in ${PLACE[id]} `);
      expect(text, id).toMatch(OWN_EXAM[id]);
      expect(text, id).toContain(c.context!);
      expect(text, id).toContain("instead of headteacher:");
    }
  });

  test("no prompt names another batch A country's exam (catches a copy-paste between entries)", () => {
    for (const id of A_IDS) {
      const text = curriculumInstruction(id);
      for (const other of A_IDS) if (other !== id) expect(text, `${id} names ${other}'s exam`).not.toMatch(OWN_EXAM[other]);
    }
  });

  test("no prompt keeps England framing or names another country", () => {
    const places = Object.values(PLACE);
    for (const id of A_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/, /National Curriculum in England/]) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const place of places) if (place !== PLACE[id]) expect(text, `${id} names ${place}`).not.toContain(place);
      for (const other of ["Emirates", "Malta", "Singapore", "Kenya"]) expect(text, `${id} names ${other}`).not.toContain(other);
    }
  });

  test("Oman says its maths and science are Cambridge-based; Bahrain names the BQA for exams and reviews", () => {
    expect(curriculumInstruction("oman")).toMatch(/mathematics and science follow Cambridge-based programmes/);
    expect(getCurriculum("bahrain")!.terms!.inspection).toMatch(/Education and Training Quality Authority \(BQA\)/);
    expect(getCurriculum("bahrain")!.terms!.exams).toMatch(/Grade 9/);
  });

  test("Egypt names both secondary routes, and Israel does not present Meitzav as running", () => {
    expect(getCurriculum("egypt")!.terms!.exams).toMatch(/Egyptian Baccalaureate/);
    expect(getCurriculum("egypt")!.terms!.exams).toMatch(/Thanaweya Amma/);
    expect(getCurriculum("israel")!.terms!.exams).toMatch(/Meitzav[^.;]*suspended/);
  });
});

test.describe("Türkiye's rollout", () => {
  test("in 2026-27 Grades 4, 8 and 12 stay on the old programmes; from 2027-28 every grade is on the model", () => {
    const c = getCurriculum("turkey")!;
    const before = currentVersion(c, new Date("2027-08-31T12:00:00Z")).label;
    const after = currentVersion(c, new Date("2027-09-01T12:00:00Z")).label;
    expect(before).toMatch(/Grades 4, 8 and 12 stay on the previous programmes/);
    expect(after).toMatch(/every grade/);
    expect(after).not.toMatch(/previous programmes/);
  });
});

test.describe("batch A stays hidden until its switch is on", () => {
  test("a teacher sees none of the nine with every region on and batch A off", () => {
    const shown = visibleCurricula(ALL_REGIONS, false).map((c) => c.id);
    for (const id of A_IDS) expect(shown, id).not.toContain(id);
  });

  test("with batch A on, a teacher sees them under Middle East, and Türkiye under Europe", () => {
    const offered = visibleCurricula(ALL_REGIONS, false, ["s3-a"]);
    const groups = pickerGroups(offered);
    const middleEast = groups.find((g) => g.region === "middle-east")!.curricula.map((c) => c.id);
    const europe = groups.find((g) => g.region === "europe")!.curricula.map((c) => c.id);
    expect(middleEast).toEqual(["uae-moe", ...A_IDS.filter((id) => id !== "turkey")]);
    expect(europe).toEqual(["malta", "turkey"]);
  });

  test("batch A on is not enough when the region is off", () => {
    const shown = visibleCurricula(["europe"], false, ["s3-a"]).map((c) => c.id);
    expect(shown).toContain("turkey");
    for (const id of A_IDS) if (id !== "turkey") expect(shown, id).not.toContain(id);
  });

  test("an admin sees all nine with nothing on", () => {
    const shown = visibleCurricula([], true).map((c) => c.id);
    for (const id of A_IDS) expect(shown, id).toContain(id);
  });
});

test.describe("starting curriculum by country", () => {
  test("a teacher in each country starts on its curriculum once offered, and on England while batch A is off", () => {
    const on = visibleCurricula(ALL_REGIONS, false, ["s3-a"]);
    const off = visibleCurricula(ALL_REGIONS, false);
    for (const id of A_IDS) {
      expect(inferCurriculum({ country: COUNTRY[id] }, on), id).toBe(id);
      expect(inferCurriculum({ country: COUNTRY[id] }, off), id).toBe("england");
    }
  });

  test("ids are accepted exactly, and look-alikes are not", () => {
    for (const id of A_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["Saudi Arabia", "saudi", "KSA", "SA", "Turkey", "türkiye", "turkiye", "TURKEY", "egypt ", " egypt", "israel;", "jordan-nccd", "oman-moe", "qatar_2026"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
  });
});
