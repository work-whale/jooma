import { readFileSync, readdirSync } from "node:fs";
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
  regionSettingKey,
  regionsFromSettings,
  visibleCurricula,
} from "@/app/lib/curricula";
import { PROVENANCE } from "@/app/lib/curricula/provenance";
import { languageInstruction } from "@/app/lib/languages";
import { TOOL_SCOPE, hiddenToolSlugs, isToolHiddenFor } from "@/app/lib/curricula/tool-scope";

/*
 * Stage 3 batch D: Latin America (docs/curricula-stage3-build.md D.1 to D.7,
 * owner decisions in docs/curricula-stage3-plan.md section 6). A new region,
 * switched on from the start; the batch D release switch keeps the six hidden.
 * One national entry each. Profiles only for now.
 */

const D = {
  mexico: { place: "Mexico", country: "MX", lang: "es", exam: /EXANI-II/ },
  brazil: { place: "Brazil", country: "BR", lang: "pt-BR", exam: /\bENEM\b/ },
  argentina: { place: "Argentina", country: "AR", lang: "es", exam: /\bAprender\b/ },
  chile: { place: "Chile", country: "CL", lang: "es", exam: /\bSIMCE\b/ },
  colombia: { place: "Colombia", country: "CO", lang: "es", exam: /Saber 11/ },
  peru: { place: "Peru", country: "PE", lang: "es", exam: /\bENLA\b/ },
} as const;
type DId = keyof typeof D;
const D_IDS = Object.keys(D) as DId[];
const SPANISH = D_IDS.filter((id) => D[id].lang === "es");
const ALL_REGIONS = REGIONS.map((r) => r.id);

const years = (prefix: string, from: number, to: number, firstAge: number, suffix = "") =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix}${from + i}${suffix}`, age: firstAge + i }));

const YEARS: Record<DId, { label: string; age: number }[]> = {
  mexico: [...years("Preescolar ", 1, 3, 3), ...years("Primaria ", 1, 6, 6), ...years("Secundaria ", 1, 3, 12), ...years("Bachillerato ", 1, 3, 15)],
  brazil: [...years("Pré-escola ", 1, 2, 4), ...years("", 1, 9, 6, "º ano"), ...years("", 1, 3, 15, "ª série")],
  argentina: [{ label: "Sala de 4", age: 4 }, { label: "Sala de 5", age: 5 }, ...years("Primaria ", 1, 6, 6), ...years("Secundaria ", 1, 6, 12)],
  chile: [{ label: "NT1 (Pre-kínder)", age: 4 }, { label: "NT2 (Kínder)", age: 5 }, ...years("", 1, 8, 6, "º básico"), ...years("", 1, 4, 14, "º medio")],
  colombia: [{ label: "Transición", age: 5 }, ...years("Grado ", 1, 11, 6)],
  peru: [...years("Inicial ", 3, 5, 3, " años"), ...years("Primaria ", 1, 6, 6), ...years("Secundaria ", 1, 5, 12)],
};

const ownText = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");

test.describe("the Latin America region", () => {
  test("is listed once, last, as Latin America, with its own switch key", () => {
    const found = REGIONS.filter((r) => r.id === "latin-america");
    expect(found).toEqual([{ id: "latin-america", label: "Latin America" }]);
    expect(ALL_REGIONS[ALL_REGIONS.length - 1]).toBe("latin-america");
    expect(regionSettingKey("latin-america")).toBe("curricula_latin_america");
  });

  test("reads as on only from a row that is exactly true", () => {
    expect(regionsFromSettings([{ key: "curricula_latin_america", value: true }])).toEqual(["latin-america"]);
    for (const value of ["true", 1, null, false]) expect(regionsFromSettings([{ key: "curricula_latin_america", value }]), String(value)).toEqual([]);
  });

  test("the batch D migration seeds the region ON, leaves batch D off, and whitelists every key", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const file = readdirSync(dir).find((f) => /curricula_latin_america/.test(f));
    expect(file, "a latin america migration").toBeDefined();
    const sql = readFileSync(path.join(dir, file!), "utf8");
    expect(sql).toMatch(/\('curricula_latin_america',\s*'Latin America',\s*'(?:[^']|'')*',\s*'curricula',\s*'true'::jsonb,\s*\d+\)/);
    expect(sql).toMatch(/on conflict \(key\) do nothing/i);
    expect(sql, "batch D must not be switched on here").not.toMatch(/curricula_s3_d'[^\n]*true/);
    expect(sql).not.toMatch(/\blike\b/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/i);
    const list = [...sql.match(/where s\.key in \(([\s\S]*?)\)\s*;/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const regionKeys = REGIONS.map((r) => regionSettingKey(r.id)).filter((k): k is string => k !== null);
    for (const k of [...regionKeys, "curricula_s3_a", "curricula_s3_b", "curricula_s3_c", "curricula_s3_d", "curricula_s3_e", "signups_open", "maintenance_mode", "google_signin"]) {
      expect(list, k).toContain(k);
    }
    expect(new Set(list).size, "no duplicates").toBe(list.length);
  });
});

test.describe("Stage 3 batch D entries", () => {
  test("the six exist, verified, in batch D, under Latin America", () => {
    const batch = CURRICULA_REGISTRY.filter((c) => c.release === "s3-d").map((c) => c.id);
    expect([...batch].sort()).toEqual([...D_IDS].sort());
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "latin-america").map((c) => c.id)).toEqual(D_IDS);
    for (const id of D_IDS) {
      const c = getCurriculum(id)!;
      expect(c.verifiedOn, id).toBe("2026-11-28");
      expect(c.country, id).toBe(D[id].country);
      expect(c.place, id).toBe(D[id].place);
      expect(c.state, `${id} is one national entry`).toBeUndefined();
      expect(c.alignment, `${id} has no statements yet`).toBeUndefined();
    }
  });

  test("each year list is exactly the one the sources give", () => {
    for (const id of D_IDS) expect(getCurriculum(id)!.years, id).toEqual(YEARS[id]);
  });

  test("the five Spanish-speaking countries default to Spanish and Brazil to Brazilian Portuguese", () => {
    for (const id of D_IDS) expect(getCurriculum(id)!.defaultLanguage, id).toBe(D[id].lang);
    expect(languageAfterChoosing("mexico", null)).toBe("es");
    expect(languageAfterChoosing("brazil", null)).toBe("pt-BR");
    expect(languageAfterChoosing("chile", "en-GB"), "a chosen language is kept").toBeNull();
  });

  // The first live run (2026-11-28) put the note in the context line, which is
  // part of the LAST system message: with English chosen, a Chile worksheet
  // came out in Spanish. So the note rides the Spanish language instruction,
  // which exists only when the output is Spanish.
  test("the Spanish ones ask for Latin American usage only inside the Spanish language instruction", () => {
    for (const id of SPANISH) {
      const es = languageInstruction("es", id);
      expect(es, id).toMatch(/Latin American Spanish/);
      expect(es, id).toMatch(/ustedes/);
      expect(es, id).toMatch(/computadora/);
      // Never in the curriculum message, which every output language gets.
      expect(curriculumInstruction(id), id).not.toMatch(/Latin American Spanish|ustedes|vosotros|computadora/);
      expect(getCurriculum(id)!.context!, id).not.toMatch(/write in Spanish/i);
      // English or another language: no note at all.
      expect(languageInstruction("en-GB", id), id).toBe("");
      expect(languageInstruction("en-US", id), id).not.toMatch(/Spanish/);
      expect(languageInstruction("pt-BR", id), id).not.toMatch(/Spanish|ustedes/);
    }
    expect(languageInstruction("es", "brazil")).not.toMatch(/Latin American/);
    expect(languageInstruction("es", "spain"), "Spain keeps its own Spanish").not.toMatch(/Latin American/);
    expect(languageInstruction("es", "england")).not.toMatch(/Latin American/);
  });

  test("the regional systems are named for Argentina, Brazil and Mexico, and the model follows the teacher's one", () => {
    expect(getCurriculum("argentina")!.context!).toMatch(/7 years of primary and 5 of secondary/);
    expect(getCurriculum("argentina")!.context!).toMatch(/province/);
    expect(getCurriculum("brazil")!.context!).toMatch(/state/);
    expect(getCurriculum("mexico")!.context!).toMatch(/state/);
  });

  test("Argentina never calls the teacher training guidelines its school curriculum", () => {
    const text = curriculumInstruction("argentina");
    expect(text).not.toMatch(/476/);
    expect(text).toMatch(/Nucleos de Aprendizajes Prioritarios|Núcleos de Aprendizajes Prioritarios/);
  });

  test("each has a provenance row naming its workbook row and saying what was checked", () => {
    for (const id of D_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: D[id].place });
      expect(p.source, id).toMatch(/^https:\/\//);
      expect(p.notes, id).toMatch(/Stage 3 batch D \(2026-11-28\)/);
      expect(p.notes, id).toMatch(/Confirmed/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/Profile only/);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    for (const id of D_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
    }
  });
});

test.describe("Stage 3 batch D prompts", () => {
  test("each names its own system, place and exam, and says the output language is unchanged", () => {
    for (const id of D_IDS) {
      const c = getCurriculum(id)!;
      const text = curriculumInstruction(id);
      expect(text, id).toContain(`SCHOOL SYSTEM: ${c.name}`);
      expect(text, id).toContain(`in ${D[id].place} `);
      expect(text, id).toMatch(D[id].exam);
      expect(text, id).toContain(c.context!);
      expect(text, id).toContain("does not change the output language");
    }
  });

  test("no prompt names another batch D country's exam", () => {
    for (const id of D_IDS) {
      const text = curriculumInstruction(id);
      for (const other of D_IDS) if (other !== id) expect(text, `${id} names ${other}'s exam`).not.toMatch(D[other].exam);
    }
  });

  test("no prompt keeps England framing or names another country", () => {
    const places = [...D_IDS.map((id) => D[id].place), "Spain", "Portugal", "Jamaica"];
    for (const id of D_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/]) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const place of places) if (place !== D[id].place) expect(text, `${id} names ${place}`).not.toContain(place);
    }
  });

  test("Mexico names no national census test, since none is set", () => {
    expect(curriculumInstruction("mexico")).toMatch(/no national standardised test/);
    expect(curriculumInstruction("mexico")).not.toMatch(/Mejoredu|PLANEA|ENLACE/);
  });
});

test.describe("rollouts", () => {
  const at = (id: string, iso: string) => currentVersion(getCurriculum(id)!, new Date(`${iso}T12:00:00Z`)).label;

  test("Brazil's new secondary rules reach the 3rd série on 1 February 2027", () => {
    expect(at("brazil", "2026-11-28")).toMatch(/1st and 2nd/);
    expect(at("brazil", "2027-01-31")).toMatch(/1st and 2nd/);
    expect(at("brazil", "2027-02-01")).toMatch(/all three/);
  });

  test("Chile and Peru name their pending reviews without dating them", () => {
    expect(getCurriculum("chile")!.versions).toHaveLength(1);
    expect(at("chile", "2026-11-28")).toMatch(/CNED/);
    expect(getCurriculum("peru")!.versions).toHaveLength(1);
    expect(at("peru", "2026-11-28")).toMatch(/review/);
  });
});

test.describe("batch D stays hidden until its switch is on", () => {
  test("a teacher sees none of the six with every region on and batch D off", () => {
    for (const releases of [[], ["s3-a", "s3-b", "s3-c", "s3-e"]]) {
      const shown = visibleCurricula(ALL_REGIONS, false, releases).map((c) => c.id);
      for (const id of D_IDS) expect(shown, `${id} ${releases}`).not.toContain(id);
    }
  });

  test("with the region off, batch D on still shows nothing; with both on, Latin America lists the six", () => {
    const noRegion = visibleCurricula(ALL_REGIONS.filter((r) => r !== "latin-america"), false, ["s3-d"]).map((c) => c.id);
    for (const id of D_IDS) expect(noRegion, id).not.toContain(id);
    const group = pickerGroups(visibleCurricula(ALL_REGIONS, false, ["s3-d"])).find((g) => g.region === "latin-america")!;
    expect(group.curricula.map((c) => c.id)).toEqual(D_IDS);
  });

  test("an admin sees the six with every switch off", () => {
    const shown = visibleCurricula([], true).map((c) => c.id);
    for (const id of D_IDS) expect(shown, id).toContain(id);
  });

  test("a teacher in each country starts on its curriculum once offered, and on England while batch D is off", () => {
    const on = visibleCurricula(ALL_REGIONS, false, ["s3-d"]);
    const off = visibleCurricula(ALL_REGIONS, false);
    for (const id of D_IDS) {
      expect(inferCurriculum({ country: D[id].country }, on), id).toBe(id);
      expect(inferCurriculum({ country: D[id].country }, off), id).toBe("england");
    }
  });

  test("ids are accepted exactly, and look-alikes are not", () => {
    for (const id of D_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["Mexico", "méxico", "brasil", "argentina ", "chile-mineduc", "buenos-aires", "sao-paulo", "lima"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
  });
});
