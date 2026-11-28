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

/*
 * Stage 3 batch C: Europe (docs/curricula-stage3-build.md C.1 to C.6). One
 * national entry per country (owner, 2026-11-27): Germany, Switzerland,
 * Belgium and Spain are not split. Profiles only for now.
 */

const C = {
  austria: { place: "Austria", country: "AT", lang: "de", exam: /iKMPLUS/ },
  belgium: { place: "Belgium", country: "BE", lang: "en-GB", exam: /Flemish tests/ },
  bulgaria: { place: "Bulgaria", country: "BG", lang: "en-GB", exam: /Grades 4, 7 and 10/ },
  croatia: { place: "Croatia", country: "HR", lang: "en-GB", exam: /State Matura/ },
  cyprus: { place: "Cyprus", country: "CY", lang: "en-GB", exam: /Pancyprian/ },
  "czech-republic": { place: "Czech Republic", country: "CZ", lang: "en-GB", exam: /single entrance exam/ },
  denmark: { place: "Denmark", country: "DK", lang: "en-GB", exam: /leaving examinations/ },
  estonia: { place: "Estonia", country: "EE", lang: "et", exam: /basic school final examinations/ },
  finland: { place: "Finland", country: "FI", lang: "en-GB", exam: /matriculation examination/ },
  france: { place: "France", country: "FR", lang: "fr", exam: /brevet/ },
  germany: { place: "Germany", country: "DE", lang: "de", exam: /Abitur/ },
  greece: { place: "Greece", country: "GR", lang: "en-GB", exam: /Panhellenic/ },
  hungary: { place: "Hungary", country: "HU", lang: "en-GB", exam: /erettsegi/ },
  iceland: { place: "Iceland", country: "IS", lang: "en-GB", exam: /studentsprof/ },
  italy: { place: "Italy", country: "IT", lang: "it", exam: /INVALSI/ },
  latvia: { place: "Latvia", country: "LV", lang: "en-GB", exam: /centralised examinations/ },
  lithuania: { place: "Lithuania", country: "LT", lang: "en-GB", exam: /\bPUPP\b/ },
  netherlands: { place: "Netherlands", country: "NL", lang: "en-GB", exam: /doorstroomtoets/ },
  norway: { place: "Norway", country: "NO", lang: "en-GB", exam: /Grades 5, 8 and 9/ },
  poland: { place: "Poland", country: "PL", lang: "pl", exam: /ósmoklasisty/ },
  portugal: { place: "Portugal", country: "PT", lang: "pt", exam: /exames nacionais/ },
  romania: { place: "Romania", country: "RO", lang: "en-GB", exam: /Evaluarea Nationala/ },
  serbia: { place: "Serbia", country: "RS", lang: "en-GB", exam: /final exam at the end of Grade 8/ },
  slovakia: { place: "Slovakia", country: "SK", lang: "en-GB", exam: /Testovanie 9/ },
  slovenia: { place: "Slovenia", country: "SI", lang: "en-GB", exam: /\bNPZ\b/ },
  spain: { place: "Spain", country: "ES", lang: "es", exam: /\bPAU\b/ },
  sweden: { place: "Sweden", country: "SE", lang: "sv", exam: /Grades 3, 6 and 9/ },
  switzerland: { place: "Switzerland", country: "CH", lang: "en-GB", exam: /Swiss Matura/ },
  ukraine: { place: "Ukraine", country: "UA", lang: "en-GB", exam: /\bNMT\b/ },
} as const;
type CId = keyof typeof C;
const C_IDS = Object.keys(C) as CId[];
const ALL_REGIONS = REGIONS.map((r) => r.id);

const years = (prefix: string, from: number, to: number, firstAge: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix} ${from + i}`, age: firstAge + i }));

const YEARS: Record<CId, { label: string; age: number }[]> = {
  austria: years("Grade", 1, 13, 6),
  belgium: [...years("Kindergarten", 1, 3, 3), ...years("Primary", 1, 6, 6), ...years("Secondary", 1, 6, 12)],
  bulgaria: years("Grade", 1, 12, 7),
  croatia: [...years("Grade", 1, 8, 7), ...years("Secondary", 1, 4, 15)],
  cyprus: [...years("Primary", 1, 6, 6), ...years("Gymnasium", 1, 3, 12), ...years("Lyceum", 1, 3, 15)],
  "czech-republic": [...years("Grade", 1, 9, 6), ...years("Secondary", 1, 4, 15)],
  denmark: [{ label: "Grade 0", age: 6 }, ...years("Grade", 1, 9, 7), ...years("Upper Secondary", 1, 3, 16)],
  estonia: years("Grade", 1, 12, 7),
  finland: [{ label: "Pre-primary", age: 6 }, ...years("Grade", 1, 9, 7), ...years("Upper Secondary", 1, 3, 16)],
  france: ["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2de", "1re", "Terminale"].map((label, i) => ({ label, age: 3 + i })),
  germany: years("Grade", 1, 13, 6),
  greece: [...years("Primary", 1, 6, 6), ...years("Gymnasio", 1, 3, 12), ...years("Lykeio", 1, 3, 15)],
  hungary: years("Grade", 1, 12, 6),
  iceland: [...years("Grade", 1, 10, 6), ...years("Upper Secondary", 1, 3, 16)],
  italy: [...years("Primary", 1, 5, 6), ...years("Lower Secondary", 1, 3, 11), ...years("Upper Secondary", 1, 5, 14)],
  latvia: years("Grade", 1, 12, 7),
  lithuania: years("Grade", 1, 12, 7),
  netherlands: [...years("Groep", 1, 8, 4), ...years("Secondary", 1, 6, 12)],
  norway: [...years("Grade", 1, 10, 6), ...years("Vg", 1, 3, 16).map((y) => ({ ...y, label: y.label.replace(" ", "") }))],
  poland: [...years("Grade", 1, 8, 7), ...years("Secondary", 1, 4, 15)],
  portugal: years("Grade", 1, 12, 6),
  romania: [{ label: "Preparatory class", age: 6 }, ...years("Grade", 1, 12, 7)],
  serbia: [...years("Grade", 1, 8, 7), ...years("Secondary", 1, 4, 15)],
  slovakia: [...years("Grade", 1, 9, 6), ...years("Secondary", 1, 4, 15)],
  slovenia: [...years("Grade", 1, 9, 6), ...years("Secondary", 1, 4, 15)],
  spain: [...years("Primary", 1, 6, 6), ...years("ESO", 1, 4, 12), ...years("Bachillerato", 1, 2, 16)],
  sweden: [{ label: "Preschool class", age: 6 }, ...years("Grade", 1, 9, 7), ...years("Upper Secondary", 1, 3, 16)],
  switzerland: [...years("HarmoS", 1, 11, 4), ...years("Upper Secondary", 1, 4, 15)],
  ukraine: years("Grade", 1, 11, 6),
};

const ENGLISH_DEFAULT = C_IDS.filter((id) => C[id].lang === "en-GB");
const ownText = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");

const WITH_STATEMENTS = new Set<string>(["norway", "sweden"]);

test.describe("Stage 3 batch C entries", () => {
  test("the twenty-nine exist, verified, in batch C, under Europe", () => {
    const batch = CURRICULA_REGISTRY.filter((c) => c.release === "s3-c").map((c) => c.id);
    expect([...batch].sort()).toEqual([...C_IDS].sort());
    for (const id of C_IDS) {
      const c = getCurriculum(id)!;
      expect(c.verifiedOn, id).toBe("2026-11-27");
      expect(c.region, id).toBe("europe");
      expect(c.country, id).toBe(C[id].country);
      expect(c.place, id).toBe(C[id].place);
      // Open-licence statements, built after the profiles (owner, 2026-11-28).
      if (WITH_STATEMENTS.has(id)) expect(c.alignment?.frameworks.length, `${id} has its own statements`).toBeGreaterThan(0);
      else expect(c.alignment, `${id} has no statements yet`).toBeUndefined();
    }
  });

  test("one national entry each: no Land, canton, community or region entries", () => {
    for (const c of CURRICULA_REGISTRY) {
      if (["DE", "CH", "BE", "ES"].includes(c.country)) expect(c.state, c.id).toBeUndefined();
    }
    expect(CURRICULA_REGISTRY.filter((c) => ["DE", "CH", "BE", "ES"].includes(c.country)).map((c) => c.id).sort()).toEqual(["belgium", "germany", "spain", "switzerland"]);
  });

  test("each year list is exactly the one the sources give", () => {
    for (const id of C_IDS) expect(getCurriculum(id)!.years, id).toEqual(YEARS[id]);
  });

  test("countries whose language Jooma writes default to it; the rest, Belgium and Switzerland included, to British English", () => {
    for (const id of C_IDS) expect(getCurriculum(id)!.defaultLanguage, id).toBe(C[id].lang);
  });

  test("picking France switches a teacher who never chose a language to French, and leaves a chosen one alone", () => {
    expect(languageAfterChoosing("france", null)).toBe("fr");
    expect(languageAfterChoosing("germany", null)).toBe("de");
    expect(languageAfterChoosing("france", "en-GB")).toBeNull();
    expect(languageAfterChoosing("denmark", null)).toBeNull();
  });

  test("English-default entries use plain English characters in their terms and context", () => {
    for (const id of ENGLISH_DEFAULT) {
      const c = getCurriculum(id)!;
      for (const [key, value] of Object.entries(c.terms!)) expect(value, `${id} ${key}`).toMatch(/^[\x20-\x7E]+$/);
      expect(c.context!, id).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  test("every English-default country is on the language gaps list", () => {
    const gaps = readFileSync(path.join(process.cwd(), "docs", "curricula-language-gaps.md"), "utf8");
    for (const id of ENGLISH_DEFAULT) expect(gaps, id).toContain(C[id].place);
  });

  test("each has a provenance row naming its workbook row and saying what was checked", () => {
    for (const id of C_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: C[id].place });
      expect(p.source, id).toMatch(/^https:\/\//);
      expect(p.notes, id).toMatch(/Stage 3 batch C \(2026-11-27\)/);
      expect(p.notes, id).toMatch(/Confirmed|workbook, checked/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(WITH_STATEMENTS.has(id) ? /Statements \(2026-11-28/ : /Profile only/);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    for (const id of C_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
    }
  });
});

test.describe("Stage 3 batch C prompts", () => {
  test("each names its own system, place and exam, and says the output language is unchanged", () => {
    for (const id of C_IDS) {
      const c = getCurriculum(id)!;
      const text = curriculumInstruction(id);
      expect(text, id).toContain(`SCHOOL SYSTEM: ${c.name}`);
      expect(text, id).toContain(`in ${C[id].place} `);
      expect(text, id).toMatch(C[id].exam);
      expect(text, id).toContain(c.context!);
      expect(text, id).toContain("does not change the output language");
    }
  });

  test("no prompt names another batch C country's exam", () => {
    for (const id of C_IDS) {
      const text = curriculumInstruction(id);
      for (const other of C_IDS) if (other !== id) expect(text, `${id} names ${other}'s exam`).not.toMatch(C[other].exam);
    }
  });

  test("no prompt keeps England framing or names another country", () => {
    const places = [...C_IDS.map((id) => C[id].place), "Malta", "Türkiye"];
    for (const id of C_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/]) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const place of places) if (place !== C[id].place) expect(text, `${id} names ${place}`).not.toContain(place);
    }
  });
});

test.describe("rollouts", () => {
  const at = (id: string, iso: string) => currentVersion(getCurriculum(id)!, new Date(`${iso}T12:00:00Z`)).label;

  test("France builds year by year: 4e and terminale in 2027, 3e in 2028", () => {
    expect(at("france", "2027-08-31")).not.toMatch(/4e/);
    expect(at("france", "2027-09-01")).toMatch(/4e/);
    expect(at("france", "2028-09-01")).toMatch(/3e/);
  });

  test("the Netherlands adds citizenship and digital literacy on 1 August 2027", () => {
    expect(at("netherlands", "2027-07-31")).not.toMatch(/citizenship/);
    expect(at("netherlands", "2027-08-01")).toMatch(/citizenship/);
  });

  test("Czech schools must teach the revised programme from 2027-28; Poland and Austria move on in September 2027", () => {
    expect(at("czech-republic", "2027-08-31")).toMatch(/voluntary/);
    expect(at("czech-republic", "2027-09-01")).toMatch(/compulsory/);
    expect(at("poland", "2027-09-01")).toMatch(/post-primary/);
    expect(at("austria", "2027-09-01")).toMatch(/upper level/);
  });
});

test.describe("batch C stays hidden until its switch is on", () => {
  test("a teacher sees none of the twenty-nine with every region on and batch C off", () => {
    for (const releases of [[], ["s3-a", "s3-b"]]) {
      const shown = visibleCurricula(ALL_REGIONS, false, releases).map((c) => c.id);
      for (const id of C_IDS) expect(shown, `${id} ${releases}`).not.toContain(id);
    }
  });

  test("with batches A and C on, Europe lists Malta, Türkiye, then the twenty-nine", () => {
    const europe = pickerGroups(visibleCurricula(ALL_REGIONS, false, ["s3-a", "s3-c"])).find((g) => g.region === "europe")!.curricula.map((c) => c.id);
    expect(europe).toEqual(["malta", "turkey", ...C_IDS]);
  });

  test("a teacher in each country starts on its curriculum once offered, and on England while batch C is off", () => {
    const on = visibleCurricula(ALL_REGIONS, false, ["s3-c"]);
    const off = visibleCurricula(ALL_REGIONS, false);
    for (const id of C_IDS) {
      expect(inferCurriculum({ country: C[id].country }, on), id).toBe(id);
      expect(inferCurriculum({ country: C[id].country }, off), id).toBe("england");
    }
  });

  test("ids are accepted exactly, and look-alikes are not", () => {
    for (const id of C_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["France", "czech", "czechia", "the-netherlands", "holland", "germany ", "bavaria", "catalonia", "flanders", "ticino"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
  });
});
