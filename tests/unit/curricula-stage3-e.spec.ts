import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import {
  CURRICULA_REGISTRY,
  REGIONS,
  curriculumInstruction,
  currentVersion,
  getCurriculum,
  inferCurriculum,
  languageAfterChoosing,
  parseCurriculum,
  pickerGroups,
  visibleCurricula,
} from "@/app/lib/curricula";
import { PROVENANCE } from "@/app/lib/curricula/provenance";
import { TOOL_SCOPE, hiddenToolSlugs, isToolHiddenFor } from "@/app/lib/curricula/tool-scope";
import { languageInstruction } from "@/app/lib/languages";

/*
 * Stage 3 batch E: the rest of Africa (docs/curricula-stage3-build.md, "Batch
 * E"). Five profiles under the Africa heading, which is already on, so the
 * batch E switch alone holds them back. All five default to British English.
 * Profiles only.
 */

const E = {
  ethiopia: { place: "Ethiopia", country: "ET", exam: /\bEAES\b/ },
  rwanda: { place: "Rwanda", country: "RW", exam: /\bNESA\b/ },
  tanzania: { place: "Tanzania", country: "TZ", exam: /\bNECTA\b/ },
  zambia: { place: "Zambia", country: "ZM", exam: /Examinations Council of Zambia/ },
  zimbabwe: { place: "Zimbabwe", country: "ZW", exam: /\bZIMSEC\b/ },
} as const;
type EId = keyof typeof E;
const E_IDS = Object.keys(E) as EId[];
const ALL_REGIONS = REGIONS.map((r) => r.id);
const STAGE2_AFRICA = ["south-africa", "kenya", "nigeria", "ghana", "uganda"];

const years = (prefix: string, from: number, to: number, firstAge: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));

const YEARS: Record<EId, { label: string; age: number }[]> = {
  ethiopia: [...years("Pre-primary", 1, 2, 5), ...years("Grade", 1, 12, 7)],
  rwanda: [...years("Nursery", 1, 3, 3), ...years("P", 1, 6, 6).map((y) => ({ ...y, label: y.label.replace(" ", "") })), ...years("S", 1, 6, 12).map((y) => ({ ...y, label: y.label.replace(" ", "") }))],
  tanzania: [{ label: "Pre-primary", age: 5 }, ...years("Standard", 1, 7, 6), ...years("Form", 1, 6, 13)],
  // The 2013-curriculum classes (Grade 7, Grades 10 to 12) sit by age among the new Forms.
  zambia: [
    ...years("ECE Level", 1, 3, 3),
    ...years("Grade", 1, 7, 6),
    ...years("Form", 1, 4, 12),
    { label: "Grade 10", age: 15 },
    { label: "Form 5", age: 16 },
    { label: "Grade 11", age: 16 },
    { label: "Form 6", age: 17 },
    { label: "Grade 12", age: 17 },
  ],
  zimbabwe: [{ label: "ECD A", age: 4 }, { label: "ECD B", age: 5 }, ...years("Grade", 1, 7, 6), ...years("Form", 1, 6, 13)],
};

const ownText = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");

test.describe("Stage 3 batch E entries", () => {
  test("the five exist, verified, in batch E, under Africa after the Stage 2 five", () => {
    const batch = CURRICULA_REGISTRY.filter((c) => c.release === "s3-e").map((c) => c.id);
    expect([...batch].sort()).toEqual([...E_IDS].sort());
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "africa").map((c) => c.id)).toEqual([...STAGE2_AFRICA, ...E_IDS]);
    for (const id of E_IDS) {
      const c = getCurriculum(id)!;
      expect(c.verifiedOn, id).toBe("2026-11-28");
      expect(c.country, id).toBe(E[id].country);
      expect(c.place, id).toBe(E[id].place);
      expect(c.state, `${id} is one national entry`).toBeUndefined();
      expect(c.alignment, `${id} has no statements yet`).toBeUndefined();
    }
  });

  test("each year list is exactly the one the sources give", () => {
    for (const id of E_IDS) expect(getCurriculum(id)!.years, id).toEqual(YEARS[id]);
  });

  test("all five default to British English, never switch a teacher's language, and carry no language notes", () => {
    for (const id of E_IDS) {
      const c = getCurriculum(id)!;
      expect(c.defaultLanguage, id).toBe("en-GB");
      expect(languageAfterChoosing(id, null), id).toBeNull();
      expect(c.languageNotes, id).toBeUndefined();
      expect(languageInstruction("en-GB", id), id).toBe("");
    }
  });

  test("English-default entries use plain English characters in their terms and context", () => {
    for (const id of E_IDS) {
      const c = getCurriculum(id)!;
      for (const [key, value] of Object.entries(c.terms!)) expect(value, `${id} ${key}`).toMatch(/^[\x20-\x7E]+$/);
      expect(c.context!, id).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  test("every one is on the language gaps list", () => {
    const gaps = readFileSync(path.join(process.cwd(), "docs", "curricula-language-gaps.md"), "utf8");
    for (const id of E_IDS) expect(gaps, id).toContain(E[id].place);
  });

  test("no context line asks for an output language (batch D lesson)", () => {
    for (const id of E_IDS) expect(getCurriculum(id)!.context!, id).not.toMatch(/\bwrite in\b|\bif you write\b/i);
  });

  test("each has a provenance row naming its workbook row and saying what was checked", () => {
    for (const id of E_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: E[id].place });
      expect(p.source, id).toMatch(/^https:\/\//);
      expect(p.notes, id).toMatch(/Stage 3 batch E \(2026-11-28\)/);
      expect(p.notes, id).toMatch(/Confirmed/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/Profile only/);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    for (const id of E_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
    }
  });
});

test.describe("Stage 3 batch E prompts", () => {
  test("each names its own system, place and exam body, and says the output language is unchanged", () => {
    for (const id of E_IDS) {
      const c = getCurriculum(id)!;
      const text = curriculumInstruction(id);
      expect(text, id).toContain(`SCHOOL SYSTEM: ${c.name}`);
      expect(text, id).toContain(`in ${E[id].place} `);
      expect(text, id).toMatch(E[id].exam);
      expect(text, id).toContain(c.context!);
      expect(text, id).toContain("does not change the output language");
    }
  });

  test("no prompt names another batch E country's exam body", () => {
    for (const id of E_IDS) {
      const text = curriculumInstruction(id);
      for (const other of E_IDS) if (other !== id) expect(text, `${id} names ${other}'s exam`).not.toMatch(E[other].exam);
    }
  });

  test("no prompt keeps England framing or names another African country", () => {
    const places = [...E_IDS.map((id) => E[id].place), "Kenya", "Uganda", "South Africa", "Nigeria", "Ghana"];
    for (const id of E_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/]) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const place of places) if (place !== E[id].place) expect(text, `${id} names ${place}`).not.toContain(place);
    }
  });
});

test.describe("rollouts", () => {
  const at = (id: string, iso: string) => currentVersion(getCurriculum(id)!, new Date(`${iso}T12:00:00Z`)).label;

  test("Tanzania's six-year primary is complete from 2028, after the last Standard VII finishes in 2027", () => {
    expect(at("tanzania", "2026-11-28")).toMatch(/Standard VII/);
    expect(at("tanzania", "2027-12-31")).toMatch(/Standard VII/);
    expect(at("tanzania", "2028-01-01")).toMatch(/six-year primary/);
    expect(at("tanzania", "2028-01-01")).not.toMatch(/Standard VII/);
  });

  test("Zambia keeps the 2013 curriculum's last exams until 2028, then runs the new structure in full", () => {
    expect(at("zambia", "2026-11-28")).toMatch(/2013 curriculum/);
    expect(at("zambia", "2028-12-31")).toMatch(/2013 curriculum/);
    expect(at("zambia", "2029-01-01")).toMatch(/in full/);
    expect(at("zambia", "2029-01-01")).not.toMatch(/2013 curriculum/);
  });
});

test.describe("batch E stays hidden until its switch is on", () => {
  test("with Africa on and batch E off, a teacher sees the Stage 2 five only", () => {
    for (const releases of [[], ["s3-a", "s3-b", "s3-c", "s3-d"]]) {
      const africa = pickerGroups(visibleCurricula(ALL_REGIONS, false, releases)).find((g) => g.region === "africa")!;
      expect(africa.curricula.map((c) => c.id), String(releases)).toEqual(STAGE2_AFRICA);
    }
  });

  test("with batch E on, Africa lists the ten; with Africa off, batch E shows nothing", () => {
    const africa = pickerGroups(visibleCurricula(ALL_REGIONS, false, ["s3-e"])).find((g) => g.region === "africa")!;
    expect(africa.curricula.map((c) => c.id)).toEqual([...STAGE2_AFRICA, ...E_IDS]);
    const noRegion = visibleCurricula(ALL_REGIONS.filter((r) => r !== "africa"), false, ["s3-e"]).map((c) => c.id);
    for (const id of E_IDS) expect(noRegion, id).not.toContain(id);
  });

  test("an admin sees the five with every switch off", () => {
    const shown = visibleCurricula([], true).map((c) => c.id);
    for (const id of E_IDS) expect(shown, id).toContain(id);
  });

  test("a teacher in each country starts on its curriculum once offered, and on England while batch E is off", () => {
    const on = visibleCurricula(ALL_REGIONS, false, ["s3-e"]);
    const off = visibleCurricula(ALL_REGIONS, false);
    for (const id of E_IDS) {
      expect(inferCurriculum({ country: E[id].country }, on), id).toBe(id);
      expect(inferCurriculum({ country: E[id].country }, off), id).toBe("england");
    }
  });

  test("ids are accepted exactly, and look-alikes are not", () => {
    for (const id of E_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["Ethiopia", "tanzania ", "zanzibar", "rwanda-reb", "zim", "zambia-ecz"]) expect(parseCurriculum(junk), junk).toBeNull();
  });
});
