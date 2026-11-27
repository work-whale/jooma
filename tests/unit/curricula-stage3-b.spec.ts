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
  parseCurriculum,
  pickerGroups,
  visibleCurricula,
} from "@/app/lib/curricula";
import { PROVENANCE } from "@/app/lib/curricula/provenance";
import { TOOL_SCOPE, hiddenToolSlugs, isToolHiddenFor } from "@/app/lib/curricula/tool-scope";

/*
 * Stage 3 batch B: Asia (docs/curricula-stage3-build.md B.1 to B.7). Profiles
 * only for now. Bangladesh is held (B.5).
 */

const B_IDS = ["china", "japan", "south-korea", "taiwan", "vietnam", "thailand", "indonesia", "sri-lanka", "nepal"] as const;
type BId = (typeof B_IDS)[number];
const ALL_REGIONS = REGIONS.map((r) => r.id);

const years = (prefix: string, from: number, to: number, firstAge: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));

const YEARS: Record<BId, { label: string; age: number }[]> = {
  china: [...years("Grade", 1, 9, 6), ...years("Senior High", 1, 3, 15)],
  japan: [...years("Elementary", 1, 6, 6), ...years("Junior High", 1, 3, 12), ...years("Senior High", 1, 3, 15)],
  "south-korea": [...years("Elementary", 1, 6, 6), ...years("Middle", 1, 3, 12), ...years("High", 1, 3, 15)],
  taiwan: years("Grade", 1, 12, 6),
  vietnam: years("Grade", 1, 12, 6),
  thailand: [...years("Prathom", 1, 6, 6), ...years("Mathayom", 1, 6, 12)],
  indonesia: years("Grade", 1, 12, 6),
  "sri-lanka": years("Grade", 1, 13, 5),
  nepal: years("Grade", 1, 12, 5),
};

/** The exam each prompt must name; no other batch B prompt may. */
const OWN_EXAM: Record<BId, RegExp> = {
  china: /gaokao/,
  japan: /Common Test for University Admissions/,
  "south-korea": /\bCSAT\b/,
  taiwan: /\bGSAT\b/,
  vietnam: /national high school graduation examination/,
  thailand: /\bO-NET\b/,
  indonesia: /\bTKA\b/,
  "sri-lanka": /Ordinary Level/,
  nepal: /Secondary Education Examination/,
};

const PLACE: Record<BId, string> = {
  china: "China",
  japan: "Japan",
  "south-korea": "South Korea",
  taiwan: "Taiwan",
  vietnam: "Vietnam",
  thailand: "Thailand",
  indonesia: "Indonesia",
  "sri-lanka": "Sri Lanka",
  nepal: "Nepal",
};

const COUNTRY: Record<BId, string> = {
  china: "CN",
  japan: "JP",
  "south-korea": "KR",
  taiwan: "TW",
  vietnam: "VN",
  thailand: "TH",
  indonesia: "ID",
  "sri-lanka": "LK",
  nepal: "NP",
};

const US_ENGLISH = new Set<BId>(["japan", "south-korea", "taiwan"]);

const ownText = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");

test.describe("Stage 3 batch B entries", () => {
  test("the nine exist, verified, in batch B, under Asia; Bangladesh is held", () => {
    const batch = CURRICULA_REGISTRY.filter((c) => c.release === "s3-b").map((c) => c.id);
    expect([...batch].sort()).toEqual([...B_IDS].sort());
    for (const id of B_IDS) {
      const c = getCurriculum(id)!;
      expect(c.verifiedOn, id).toBe("2026-11-27");
      expect(c.region, id).toBe("asia");
      expect(c.country, id).toBe(COUNTRY[id]);
      expect(c.place, id).toBe(PLACE[id]);
      expect(c.alignment, `${id} has no statements yet`).toBeUndefined();
    }
    expect(getCurriculum("bangladesh")).toBeUndefined();
  });

  test("each year list is exactly the one the sources give", () => {
    for (const id of B_IDS) expect(getCurriculum(id)!.years, id).toEqual(YEARS[id]);
  });

  test("Sri Lanka and Nepal start Grade 1 at five, everyone else at six", () => {
    for (const id of B_IDS) expect(getCurriculum(id)!.years[0].age, id).toBe(id === "sri-lanka" || id === "nepal" ? 5 : 6);
  });

  test("terms and context are plain English characters only (a Turkish word pulled a live run into Turkish)", () => {
    for (const id of B_IDS) {
      const c = getCurriculum(id)!;
      for (const [key, value] of Object.entries(c.terms!)) expect(value, `${id} ${key}`).toMatch(/^[\x20-\x7E]+$/);
      expect(c.context!, id).toMatch(/^[\x20-\x7E]+$/);
      expect(c.name, id).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  test("each has a provenance row naming its workbook row and saying what was checked", () => {
    for (const id of B_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: PLACE[id] });
      expect(p.source, id).toMatch(/^https:\/\//);
      expect(p.notes, id).toMatch(/Stage 3 batch B \(2026-11-27\)/);
      expect(p.notes, id).toMatch(/Confirmed/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/Profile only/);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
    // The open sources say so, and that statements wait for the owner.
    for (const id of ["japan", "taiwan", "vietnam"] as const) expect(PROVENANCE[id].notes, id).toMatch(/open/i);
  });

  test("Japan, South Korea and Taiwan default to American English, the rest to British", () => {
    for (const id of B_IDS) expect(getCurriculum(id)!.defaultLanguage, id).toBe(US_ENGLISH.has(id) ? "en-US" : "en-GB");
  });

  test("each one's teaching language is on the language gaps list", () => {
    const gaps = readFileSync(path.join(process.cwd(), "docs", "curricula-language-gaps.md"), "utf8");
    for (const id of B_IDS) expect(gaps, id).toContain(PLACE[id]);
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    for (const id of B_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
    }
  });
});

test.describe("Stage 3 batch B prompts", () => {
  test("each names its own system, place and exam, and says the output language is unchanged", () => {
    for (const id of B_IDS) {
      const c = getCurriculum(id)!;
      const text = curriculumInstruction(id);
      expect(text, id).toContain(`SCHOOL SYSTEM: ${c.name}`);
      expect(text, id).toContain(`in ${PLACE[id]} `);
      expect(text, id).toMatch(OWN_EXAM[id]);
      expect(text, id).toContain(c.context!);
      expect(text, id).toContain("does not change the output language");
    }
  });

  test("no prompt names another batch B country's exam", () => {
    for (const id of B_IDS) {
      const text = curriculumInstruction(id);
      for (const other of B_IDS) if (other !== id) expect(text, `${id} names ${other}'s exam`).not.toMatch(OWN_EXAM[other]);
    }
  });

  test("no prompt keeps England framing or names another country", () => {
    const places = [...Object.values(PLACE), "Singapore", "Malaysia", "Philippines", "Hong Kong", "India", "Pakistan"];
    for (const id of B_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/]) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const place of places) if (place !== PLACE[id]) expect(text, `${id} names ${place}`).not.toContain(place);
    }
  });

  test("Japan and South Korea say when their school year starts; Japan names the 2030 revision", () => {
    expect(getCurriculum("japan")!.context).toMatch(/April/);
    expect(getCurriculum("south-korea")!.context).toMatch(/March/);
    expect(currentVersion(getCurriculum("japan")!).label).toMatch(/2030/);
  });
});

test.describe("South Korea's rollout", () => {
  test("in 2026 the 2022 curriculum reaches Middle 1 and 2 and High 1 and 2; from March 2027, every grade", () => {
    const c = getCurriculum("south-korea")!;
    const before = currentVersion(c, new Date("2027-02-28T12:00:00Z")).label;
    const after = currentVersion(c, new Date("2027-03-01T12:00:00Z")).label;
    expect(before).toMatch(/Middle 1 and 2, High 1 and 2/);
    expect(after).toMatch(/every grade/);
  });
});

test.describe("batch B stays hidden until its switch is on", () => {
  test("a teacher sees none of the nine with every region on and batch B off, or with only batch A on", () => {
    for (const releases of [[], ["s3-a"]]) {
      const shown = visibleCurricula(ALL_REGIONS, false, releases).map((c) => c.id);
      for (const id of B_IDS) expect(shown, `${id} ${releases}`).not.toContain(id);
    }
  });

  test("with batch B on, Asia lists the Stage 2 six then the nine", () => {
    const asia = pickerGroups(visibleCurricula(ALL_REGIONS, false, ["s3-b"])).find((g) => g.region === "asia")!.curricula.map((c) => c.id);
    expect(asia).toEqual(["india-cbse", "pakistan", "philippines", "malaysia", "singapore", "hong-kong", ...B_IDS]);
  });

  test("a teacher in each country starts on its curriculum once offered, and on England while batch B is off", () => {
    const on = visibleCurricula(ALL_REGIONS, false, ["s3-b"]);
    const off = visibleCurricula(ALL_REGIONS, false);
    for (const id of B_IDS) {
      expect(inferCurriculum({ country: COUNTRY[id] }, on), id).toBe(id);
      expect(inferCurriculum({ country: COUNTRY[id] }, off), id).toBe("england");
    }
  });

  test("ids are accepted exactly, and look-alikes are not", () => {
    for (const id of B_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["China", "korea", "south_korea", "Korea", "japan ", "JP", "sri lanka", "srilanka", "viet-nam", "vietnam;", "bangladesh"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
  });
});
