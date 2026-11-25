import { test, expect } from "@playwright/test";

import {
  CURRICULA_REGISTRY,
  REGIONS,
  UK_CURRICULUM_IDS,
  currentVersion,
  curriculumFormState,
  curriculumInstruction,
  getCurriculum,
  isUkCurriculum,
  parseCurriculum,
  regionSettingKey,
  requestCurriculum,
  visibleCurricula,
  withCurriculum,
  yearIfOffered,
  yearsFor,
} from "@/app/lib/curricula";
import { UK_YEARS } from "@/app/lib/curricula/uk";
import { CURRICULA as FORM_CURRICULA, YEAR_GROUPS } from "@/app/lib/formOptions";
import { PROVENANCE } from "@/app/lib/curricula/provenance";
import { LANGUAGES, languageInstruction, withLanguage } from "@/app/lib/languages";

/*
 * The curriculum registry: one list of every school system Jooma can write
 * for, the helpers that read a curriculum from an untrusted request, and the
 * one prompt override that tells the model which system it is writing for.
 *
 * The five UK curricula are the contract with every existing teacher: they add
 * nothing to a prompt, so a UK generation is byte for byte what it was before
 * (curriculum-golden.spec.ts freezes those prompts).
 */

const nonUk = CURRICULA_REGISTRY.filter((c) => c.region !== "uk");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test.describe("the registry", () => {
  test("ids are unique, lower-case slugs", () => {
    const ids = CURRICULA_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("the five UK curricula keep today's dropdown values, in today's order", () => {
    const uk = CURRICULA_REGISTRY.filter((c) => c.region === "uk");
    expect(uk.map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS]);
    expect(uk.map((c) => c.promptLabel)).toEqual(FORM_CURRICULA.map((c) => c.value));
  });

  test("England, EYFS, Scotland and Wales offer exactly today's year groups, on the shared list", () => {
    for (const id of ["england", "england-eyfs", "scotland", "wales"]) {
      expect(getCurriculum(id)!.years, id).toBe(UK_YEARS);
      expect(yearsFor(id).map((y) => y.label), id).toEqual(YEAR_GROUPS);
    }
  });

  test("England's year list is byte for byte what it was", () => {
    expect(JSON.stringify(UK_YEARS)).toBe(
      '[{"label":"Nursery","age":3},{"label":"Reception","age":4},{"label":"Year 1","age":5},{"label":"Year 2","age":6},{"label":"Year 3","age":7},{"label":"Year 4","age":8},{"label":"Year 5","age":9},{"label":"Year 6","age":10},{"label":"Year 7","age":11},{"label":"Year 8","age":12},{"label":"Year 9","age":13},{"label":"Year 10","age":14},{"label":"Year 11","age":15}]',
    );
    for (const id of ["jersey", "guernsey", "isle-of-man", "gibraltar"]) expect(getCurriculum(id)!.years, id).toBe(UK_YEARS);
  });

  test("Northern Ireland has its own year list", () => {
    const expected = [
      { label: "Nursery", age: 3 },
      { label: "Year 1", age: 4 },
      { label: "Year 2", age: 5 },
      { label: "Year 3", age: 6 },
      { label: "Year 4", age: 7 },
      { label: "Year 5", age: 8 },
      { label: "Year 6", age: 9 },
      { label: "Year 7", age: 10 },
      { label: "Year 8", age: 11 },
      { label: "Year 9", age: 12 },
      { label: "Year 10", age: 13 },
      { label: "Year 11", age: 14 },
      { label: "Year 12", age: 15 },
      { label: "Year 13", age: 16 },
      { label: "Year 14", age: 17 },
    ];
    expect(yearsFor("northern-ireland")).toEqual(expected);
    expect(yearsFor("Northern Ireland Curriculum")).toEqual(expected);
    expect(yearsFor("northern-ireland").map((y) => y.label)).not.toContain("Reception");
    const age = (l: string) => yearsFor("northern-ireland").find((y) => y.label === l)?.age;
    expect(["Nursery", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 7", "Year 8", "Year 10", "Year 11", "Year 12", "Year 13", "Year 14"].map(age)).toEqual([3, 4, 5, 6, 7, 8, 10, 11, 13, 14, 15, 16, 17]);
  });

  test("a stored year is shown only if the curriculum offers it", () => {
    expect(yearIfOffered("northern-ireland", "Reception")).toBe("");
    expect(yearIfOffered("Northern Ireland Curriculum", "Year 12")).toBe("Year 12");
    expect(yearIfOffered("northern-ireland", "Nursery")).toBe("Nursery");
    expect(yearIfOffered("2014 National Curriculum", "Year 12")).toBe("");
    expect(yearIfOffered("england", "Reception")).toBe("Reception");
    expect(yearIfOffered("scotland", "Year 14")).toBe("");
    expect(yearIfOffered("", "Year 4")).toBe("Year 4");
  });

  test("every entry is complete", () => {
    const languages = new Set(LANGUAGES.map((l) => l.code));
    for (const c of CURRICULA_REGISTRY) {
      expect(c.name.trim(), c.id).not.toBe("");
      expect(c.promptLabel.trim(), c.id).not.toBe("");
      expect(REGIONS.map((r) => r.id), c.id).toContain(c.region);
      expect(languages.has(c.defaultLanguage), `${c.id} language ${c.defaultLanguage}`).toBe(true);
      expect(PROVENANCE[c.id]?.source, c.id).toMatch(/^https:\/\//);
      expect(c.country, c.id).toMatch(/^([A-Z]{2}|INT)$/);
    }
  });

  test("years have unique labels and ages that never go down", () => {
    for (const c of CURRICULA_REGISTRY) {
      expect(c.years.length, c.id).toBeGreaterThan(0);
      expect(new Set(c.years.map((y) => y.label)).size, c.id).toBe(c.years.length);
      for (const y of c.years) {
        expect(Number.isInteger(y.age), `${c.id} ${y.label}`).toBe(true);
        expect(y.age, `${c.id} ${y.label}`).toBeGreaterThanOrEqual(2);
        expect(y.age, `${c.id} ${y.label}`).toBeLessThanOrEqual(18);
      }
      for (let i = 1; i < c.years.length; i++) expect(c.years[i].age, `${c.id} ${c.years[i].label}`).toBeGreaterThanOrEqual(c.years[i - 1].age);
    }
  });

  test("versions are dated and in order", () => {
    for (const c of CURRICULA_REGISTRY) {
      expect(c.versions.length, c.id).toBeGreaterThan(0);
      for (const v of c.versions) expect(v.inForceFrom, `${c.id} ${v.label}`).toMatch(ISO_DATE);
      const dates = c.versions.map((v) => v.inForceFrom);
      expect([...dates].sort(), c.id).toEqual(dates);
    }
  });

  test("an entry outside the UK cannot be shown until it has been checked against its official source", () => {
    for (const c of nonUk) {
      if (!c.verifiedOn) continue;
      expect(c.verifiedOn, c.id).toMatch(ISO_DATE);
    }
    // With every region switched on, only checked entries appear.
    const all = visibleCurricula(REGIONS.map((r) => r.id), false);
    for (const c of all) if (c.region !== "uk") expect(c.verifiedOn, c.id).toBeTruthy();
  });
});

test.describe("the Stage 2 regions", () => {
  const NEW = [
    ["africa", "Africa"],
    ["asia", "Asia"],
    ["caribbean", "Caribbean"],
    ["europe", "Europe"],
    ["middle-east", "Middle East"],
  ] as const;

  test("REGIONS lists each new region exactly once, with its label, after Canada and in this order", () => {
    for (const [id, label] of NEW) {
      const found = REGIONS.filter((r) => r.id === id);
      expect(found, id).toHaveLength(1);
      expect(found[0].label, id).toBe(label);
    }
    const ids = REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(ids.indexOf("canada") + 1)).toEqual(NEW.map(([id]) => id));
  });

  test("every region's setting key is unique and has a migration (so a region cannot be added in code alone)", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("supabase/migrations/20261124000000_curricula_stage2_regions.sql", "utf8");
    const base = await readFile("supabase/migrations/20261114000000_curricula.sql", "utf8");
    const keys = REGIONS.map((r) => regionSettingKey(r.id)).filter((k): k is string => k !== null);
    expect(new Set(keys).size).toBe(keys.length);
    const whitelist = (text: string) => {
      const m = text.match(/where s\.key in \(([\s\S]*?)\)\s*;/);
      expect(m, "public_settings key list").not.toBeNull();
      return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    };
    const latest = whitelist(sql);
    // The newest definition replaces the older one, so it must hold every key.
    for (const k of keys) expect(latest, k).toContain(k);
    for (const k of whitelist(base)) expect(latest, `kept ${k}`).toContain(k);
    expect(new Set(latest).size, "no duplicates").toBe(latest.length);
    // Every key is seeded in one of the two migrations, off.
    for (const k of keys) {
      const seeded = new RegExp(`\\('${k}',\\s*'(?:[^']|'')*',\\s*'(?:[^']|'')*',\\s*'curricula',\\s*'false'::jsonb,\\s*\\d+\\)`).test(sql + base);
      expect(seeded, `${k} seeded false`).toBe(true);
    }
  });

  test("the Stage 2 migration seeds the five keys OFF, names them one by one, and never uses like", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("supabase/migrations/20261124000000_curricula_stage2_regions.sql", "utf8");
    for (const [id] of NEW) {
      const key = regionSettingKey(id)!;
      expect(sql, key).toMatch(new RegExp(`\\('${key}',\\s*'(?:[^']|'')*',\\s*'(?:[^']|'')*',\\s*'curricula',\\s*'false'::jsonb,\\s*\\d+\\)`));
      expect(sql.match(new RegExp(`'${key}'`, "g"))?.length, `${key} seeded once and listed once`).toBe(2);
    }
    expect(sql).not.toMatch(/\blike\b/i);
    expect(sql).not.toMatch(/'true'::jsonb|\btrue::jsonb/i);
    expect(sql).toMatch(/on conflict \(key\) do nothing/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/i);
    expect(sql).toMatch(/revoke execute on function public_settings\(\) from public/i);
    expect(sql).toMatch(/grant execute on function public_settings\(\) to anon, authenticated/i);
    expect(sql).not.toMatch(/[–—]/);
  });

  test("the sort order and labels match the plan", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("supabase/migrations/20261124000000_curricula_stage2_regions.sql", "utf8");
    const expected: Record<string, [string, number]> = {
      curricula_africa: ["Africa", 7],
      curricula_asia: ["Asia", 8],
      curricula_caribbean: ["Caribbean", 9],
      curricula_europe: ["Europe (Malta)", 10],
      curricula_middle_east: ["Middle East", 11],
    };
    for (const [key, [label, sort]] of Object.entries(expected)) {
      expect(sql, key).toMatch(new RegExp(`\\('${key}',\\s*'${label.replace(/[()]/g, "\\$&")}',\\s*'(?:[^']|'')*',\\s*'curricula',\\s*'false'::jsonb,\\s*${sort}\\)`));
    }
  });
});

test.describe("Scotland and Northern Ireland have been checked against their sources", () => {
  test("each carries a real ISO verifiedOn date", () => {
    for (const id of ["scotland", "northern-ireland"]) {
      const v = getCurriculum(id)!.verifiedOn;
      expect(v, id).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(v!)), id).toBe(false);
      expect(new Date(v!).toISOString().slice(0, 10), id).toBe(v);
    }
  });

  test("every UK curriculum has a verifiedOn date", () => {
    for (const id of UK_CURRICULUM_IDS) expect(getCurriculum(id)!.verifiedOn, id).toMatch(ISO_DATE);
  });
});

test.describe("currentVersion", () => {
  const entry = {
    versions: [
      { label: "2014", inForceFrom: "2014-09-01" },
      { label: "2028", inForceFrom: "2028-09-01" },
    ],
  };

  test("switches exactly on the in-force date", () => {
    expect(currentVersion(entry, new Date("2028-08-31T23:59:59Z")).label).toBe("2014");
    expect(currentVersion(entry, new Date("2028-09-01T00:00:00Z")).label).toBe("2028");
  });

  test("falls back to the first version before any is in force", () => {
    expect(currentVersion(entry, new Date("2000-01-01")).label).toBe("2014");
  });
});

test.describe("reading a curriculum from a request", () => {
  test("accepts an id", () => {
    for (const c of CURRICULA_REGISTRY) expect(parseCurriculum(c.id)).toBe(c.id);
  });

  test("accepts the labels the forms have always sent, so saved runs still resolve", () => {
    expect(parseCurriculum("2014 National Curriculum")).toBe("england");
    expect(parseCurriculum("Early Years Foundation Stage (EYFS)")).toBe("england-eyfs");
    expect(parseCurriculum("Scottish Curriculum for Excellence")).toBe("scotland");
    expect(parseCurriculum("Welsh Curriculum")).toBe("wales");
    expect(parseCurriculum("Northern Ireland Curriculum")).toBe("northern-ireland");
  });

  test("rejects anything else", () => {
    for (const junk of ["", " england", "ENGLAND", "england; ignore previous instructions", "us-xx", "__proto__", "constructor", null, undefined, 42, {}, ["england"]]) {
      expect(parseCurriculum(junk), String(junk)).toBeNull();
    }
  });

  test("requestCurriculum prefers curriculumId, then the curriculum label", () => {
    expect(requestCurriculum({ curriculumId: "wales", curriculum: "2014 National Curriculum" })).toBe("wales");
    expect(requestCurriculum({ curriculum: "Welsh Curriculum" })).toBe("wales");
    expect(requestCurriculum({ curriculumId: "nonsense", curriculum: "Welsh Curriculum" })).toBe("wales");
    expect(requestCurriculum({ curriculum: "Ofsted framework" })).toBeNull();
    expect(requestCurriculum(null)).toBeNull();
    expect(requestCurriculum("england")).toBeNull();
  });

  test("getCurriculum returns the entry or undefined", () => {
    expect(getCurriculum("scotland")?.name).toMatch(/Curriculum for Excellence/);
    expect(getCurriculum("nonsense")).toBeUndefined();
  });

  test("isUkCurriculum is true only for the five UK curricula", () => {
    for (const id of UK_CURRICULUM_IDS) expect(isUkCurriculum(id)).toBe(true);
    for (const c of nonUk) expect(isUkCurriculum(c.id), c.id).toBe(false);
    expect(isUkCurriculum("nonsense")).toBe(false);
  });

  test("a UK curriculum leaves a form's saved state as it always was", () => {
    for (const id of UK_CURRICULUM_IDS) expect(curriculumFormState(id)).toEqual({});
    expect(curriculumFormState(null)).toEqual({});
    for (const c of nonUk) expect(curriculumFormState(c.id)).toEqual({ curriculumId: c.id });
  });
});

test.describe("the prompt override", () => {
  const messages = [
    { role: "system", content: "You are an expert UK teacher." },
    { role: "user", content: "Plan a lesson." },
  ];

  test("adds nothing for a UK curriculum, or none at all", () => {
    for (const id of [...UK_CURRICULUM_IDS, null, undefined, "nonsense"]) {
      expect(curriculumInstruction(id)).toBe("");
      expect(withCurriculum(messages, id)).toBe(messages);
    }
  });

  test("appends exactly one final system message for any other curriculum, without touching the input", () => {
    const before = JSON.stringify(messages);
    for (const c of nonUk) {
      const out = withCurriculum(messages, c.id);
      expect(out.length, c.id).toBe(messages.length + 1);
      expect(out.slice(0, -1), c.id).toEqual(messages);
      expect(out.at(-1)?.role, c.id).toBe("system");
      expect(out.at(-1)?.content, c.id).toBe(curriculumInstruction(c.id));
    }
    expect(JSON.stringify(messages)).toBe(before);
  });

  test("each override names its own school system and keeps the schema intact", () => {
    for (const c of nonUk) {
      const text = curriculumInstruction(c.id);
      expect(text, c.id).toContain(c.name);
      expect(text, c.id).toContain(currentVersion(c).label);
      expect(text, c.id).toContain("JSON keys");
      expect(text, c.id).not.toMatch(/[–—]/);
    }
  });

  test("an override never names another school system", () => {
    for (const c of nonUk) {
      const text = curriculumInstruction(c.id);
      for (const other of nonUk) {
        if (other.id === c.id || c.name.includes(other.name)) continue;
        expect(text.includes(other.name), `${c.id} names ${other.id}`).toBe(false);
      }
    }
  });

  test("a system with its own terms is told to use them in place of the UK ones", () => {
    for (const c of nonUk.filter((x) => x.terms && Object.keys(x.terms).length > 0)) {
      const text = curriculumInstruction(c.id);
      expect(text, c.id).toMatch(/instead of/i);
      for (const local of Object.values(c.terms!)) expect(text, c.id).toContain(local);
    }
  });
});

test.describe("language and curriculum together", () => {
  test("a translated prompt for a UK curriculum is exactly what it was", () => {
    for (const lang of LANGUAGES) {
      for (const id of [...UK_CURRICULUM_IDS, null]) {
        expect(languageInstruction(lang.code, id)).toBe(languageInstruction(lang.code));
      }
    }
  });

  test("a translated prompt for another system keeps that system, not the UK one", () => {
    for (const c of nonUk) {
      const text = languageInstruction("fr", c.id);
      // The system's own name may say GCSE (Pearson Edexcel International
      // GCSE); what must not appear is the UK framing around it.
      expect(text.split(c.name).join(""), c.id).not.toMatch(/UK school context|key stages|\bGCSE\b/);
      expect(text, c.id).toContain("school context");
    }
  });

  test("withLanguage passes the curriculum through", () => {
    const messages = [{ role: "user", content: "x" }];
    for (const c of nonUk) {
      expect(withLanguage(messages, "fr", c.id).at(-1)?.content).toBe(languageInstruction("fr", c.id));
    }
  });
});

test.describe("which curricula a teacher is offered", () => {
  test("UK curricula are always offered, even with every region off", () => {
    expect(visibleCurricula([], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS]);
  });

  test("a region appears only when it is switched on", () => {
    for (const region of REGIONS.filter((r) => r.id !== "uk")) {
      const shown = visibleCurricula([region.id], false);
      for (const c of shown) expect(["uk", region.id], c.id).toContain(c.region);
    }
  });

  test("unknown region names switch nothing on", () => {
    expect(visibleCurricula(["mars", "__proto__"], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS]);
  });

  test("an admin sees every checked curriculum, switched on or not", () => {
    const admin = visibleCurricula([], true);
    for (const c of CURRICULA_REGISTRY) {
      const shouldShow = c.region === "uk" || Boolean(c.verifiedOn);
      expect(admin.some((x) => x.id === c.id), c.id).toBe(shouldShow);
    }
  });
});

test.describe("the research workbook", () => {
  test("every curriculum names a real row of the workbook, so its progress can be written there", async () => {
    const { readFile } = await import("node:fs/promises");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await readFile("docs/Curricula/Jooma national curricula by country and state.xlsx"));
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    const shared = await zip.file("xl/sharedStrings.xml")!.async("string");
    const tabs = [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
    const strings = new Set([...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
    for (const c of CURRICULA_REGISTRY) {
      const row = PROVENANCE[c.id]?.sheetRow;
      expect(row, c.id).toBeDefined();
      expect(tabs, c.id).toContain(row.tab);
      expect(strings.has(row.name), `${c.id}: "${row.name}"`).toBe(true);
    }
    // And nothing in provenance for an entry that no longer exists.
    expect(Object.keys(PROVENANCE).sort()).toEqual(CURRICULA_REGISTRY.map((c) => c.id).sort());
  });
});

// ── Africa (Stage 2, Step 2) ───────────────────────────────────────────────

import { englandYearAge, englandYearFor, yearForEnglandYear } from "@/app/lib/curricula/england-years";
import { TOOL_SCOPE, hiddenToolSlugs, isToolHiddenFor, readingStageFor } from "@/app/lib/curricula/tool-scope";
import { TOOLS } from "@/app/lib/tools";

const AFRICA_IDS = ["south-africa", "kenya", "nigeria", "ghana", "uganda"] as const;
type AfricaId = (typeof AFRICA_IDS)[number];

/** Year labels and starting ages, as the Step 0 check and the plan give them. */
const seq = (prefix: string, sep: string, from: number, to: number, firstAge: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ label: `${prefix}${sep}${from + i}`, age: firstAge + i }));
const AFRICA_YEARS: Record<AfricaId, { label: string; age: number }[]> = {
  "south-africa": [{ label: "Grade R", age: 5 }, ...seq("Grade", " ", 1, 12, 6)],
  kenya: [{ label: "PP1", age: 4 }, { label: "PP2", age: 5 }, ...seq("Grade", " ", 1, 12, 6)],
  nigeria: [...seq("Primary", " ", 1, 6, 6), ...seq("JSS", " ", 1, 3, 12), ...seq("SS", " ", 1, 3, 15)],
  ghana: [
    { label: "KG 1", age: 4 },
    { label: "KG 2", age: 5 },
    ...seq("B", "", 1, 6, 6),
    { label: "JHS 1 (B7)", age: 12 },
    { label: "JHS 2 (B8)", age: 13 },
    { label: "JHS 3 (B9)", age: 14 },
    ...seq("SHS", " ", 1, 3, 15),
  ],
  uganda: [...seq("P", "", 1, 7, 6), ...seq("S", "", 1, 6, 13)],
};

const PLACE: Record<AfricaId, { country: string; place: string }> = {
  "south-africa": { country: "ZA", place: "South Africa" },
  kenya: { country: "KE", place: "Kenya" },
  nigeria: { country: "NG", place: "Nigeria" },
  ghana: { country: "GH", place: "Ghana" },
  uganda: { country: "UG", place: "Uganda" },
};

test.describe("the Africa curricula", () => {
  test("the five exist in the Africa region, in this order, and nothing else is in it", () => {
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "africa").map((c) => c.id)).toEqual([...AFRICA_IDS]);
    for (const id of AFRICA_IDS) {
      const c = getCurriculum(id)!;
      expect(c, id).toBeDefined();
      expect(c.region, id).toBe("africa");
      expect(c.country, id).toBe(PLACE[id].country);
      expect(c.place, id).toBe(PLACE[id].place);
      expect(c.verifiedOn, id).toBe("2026-11-25");
      expect(c.defaultLanguage, id).toBe("en-GB");
      expect(LANGUAGES.some((l) => l.code === c.defaultLanguage), id).toBe(true);
      expect(c.versions.length, id).toBe(1);
      expect(c.alignment, `${id} has no statements (licence closed)`).toBeUndefined();
    }
  });

  test("names, prompt labels and the one dated version", () => {
    const expected: Record<AfricaId, [string, string, string, string]> = {
      "south-africa": ["South Africa: CAPS (National Curriculum Statement Grades R to 12)", "South African Curriculum (CAPS)", "National Curriculum Statement Grades R to 12 (CAPS)", "2012-01-01"],
      kenya: ["Kenya: Competency-Based Education (KICD)", "Kenyan Competency-Based Curriculum (CBE)", "Competency-Based Education (CBE), with Senior School rolling up from Grade 10 in 2026 to Grade 12 in 2028", "2017-01-01"],
      nigeria: ["Nigeria: Basic and Senior Secondary Education Curriculum (NERDC)", "Nigerian Curriculum (NERDC)", "Revised Basic and Senior Secondary Education Curriculum, from 2025-26 in Primary 1, Primary 4, JSS 1 and SS 1 and rolling up year by year", "2025-09-01"],
      ghana: ["Ghana: Standards-Based Curriculum (NaCCA)", "Ghanaian Curriculum (NaCCA)", "Standards-Based Curriculum (KG to B6), Common Core Programme (B7 to B9) and the Senior High School curriculum (from 2024-25)", "2019-09-01"],
      uganda: ["Uganda: National Curriculum (NCDC)", "Ugandan Curriculum (NCDC)", "Primary curriculum (thematic in P1 to P3) and the competency-based Lower Secondary Curriculum (from 2020), with the aligned A-level curriculum", "2020-02-01"],
    };
    for (const id of AFRICA_IDS) {
      const c = getCurriculum(id)!;
      const [name, promptLabel, versionLabel, from] = expected[id];
      expect(c.name, id).toBe(name);
      expect(c.promptLabel, id).toBe(promptLabel);
      expect(c.versions, id).toEqual([{ label: versionLabel, inForceFrom: from }]);
      expect(currentVersion(c).label, id).toBe(versionLabel);
      expect(parseCurriculum(promptLabel), id).toBe(id);
    }
  });

  test("each year list is exactly the one the sources give, one age per year", () => {
    for (const id of AFRICA_IDS) {
      const years = yearsFor(id);
      expect(years, id).toEqual(AFRICA_YEARS[id]);
      for (let i = 1; i < years.length; i++) expect(years[i].age - years[i - 1].age, `${id} ${years[i].label}`).toBe(1);
    }
    expect(yearsFor("south-africa").map((y) => y.label)).toEqual(["Grade R", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"]);
    expect(AFRICA_IDS.map((id) => yearsFor(id).length)).toEqual([13, 14, 12, 14, 13]);
    // A year from another list is not offered here.
    expect(yearIfOffered("south-africa", "Year 5")).toBe("");
    expect(yearIfOffered("kenya", "PP1")).toBe("PP1");
    expect(yearIfOffered("nigeria", "PP1")).toBe("");
    expect(yearIfOffered("ghana", "JHS 1 (B7)")).toBe("JHS 1 (B7)");
    expect(yearIfOffered("uganda", "S6")).toBe("S6");
    expect(yearIfOffered("uganda", "SS 3")).toBe("");
  });

  test("each has a provenance row naming its own workbook row and source, and says what was checked", () => {
    const expected: Record<AfricaId, [string, string]> = {
      "south-africa": ["South Africa", "https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements(CAPS).aspx"],
      kenya: ["Kenya", "https://kicd.ac.ke/"],
      nigeria: ["Nigeria", "https://nerdc.gov.ng/content_manager/cd.html"],
      ghana: ["Ghana", "https://nacca.gov.gh/"],
      uganda: ["Uganda", "https://ncdc.go.ug/"],
    };
    for (const id of AFRICA_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: expected[id][0] });
      expect(p.source, id).toBe(expected[id][1]);
      // Says which facts were confirmed and which are reference knowledge, and the licence verdict.
      expect(p.notes, id).toMatch(/Reference/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/permission/i);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
    expect(PROVENANCE["south-africa"].notes).toMatch(/2012/);
    expect(PROVENANCE.ghana.notes).toMatch(/never checked|not checked/i);
  });

  test("the region switch shows them to a teacher only when Africa is on", () => {
    const ids = (regions: string[], admin = false) => visibleCurricula(regions, admin).filter((c) => (AFRICA_IDS as readonly string[]).includes(c.id)).map((c) => c.id);
    expect(ids(["africa"])).toEqual([...AFRICA_IDS]);
    expect(ids([])).toEqual([]);
    expect(ids(["asia", "europe", "caribbean", "middle-east", "usa"])).toEqual([]);
    expect(ids([], true)).toEqual([...AFRICA_IDS]);
    expect(regionSettingKey("africa")).toBe("curricula_africa");
    // Only Africa on: the UK five plus the five, and no other region leaks in.
    expect(visibleCurricula(["africa"], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS, ...AFRICA_IDS]);
  });

  test("an id is accepted exactly, and look-alikes are not", () => {
    for (const id of AFRICA_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["South Africa", "south africa", "south_africa", "South-Africa", "kenya ", " kenya", "KENYA", "Kenya", "nigeria;", "ghana\n", "Uganda", "south-africa-caps", "za", "ke"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
    expect(requestCurriculum({ curriculumId: "kenya" })).toBe("kenya");
    expect(requestCurriculum({ curriculumId: "KENYA", curriculum: "Ugandan Curriculum (NCDC)" })).toBe("uganda");
    expect(isUkCurriculum("kenya")).toBe(false);
    expect(curriculumFormState("ghana")).toEqual({ curriculumId: "ghana" });
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    expect(ukOnly.length).toBe(5);
    expect(TOOLS.length).toBeGreaterThan(ukOnly.length);
    for (const id of AFRICA_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      for (const slug of ukOnly) expect(isToolHiddenFor(slug, id), `${id} ${slug}`).toBe(true);
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
      expect(isToolHiddenFor("phonics-support", id), id).toBe(false);
    }
  });

  test("the prompt names the system's own exams and inspection body", () => {
    const expected: Record<AfricaId, { exams: RegExp[]; inspection: string; headteacher: string }> = {
      "south-africa": { exams: [/\bNSC\b/, /matric/], inspection: "Whole School Evaluation", headteacher: "principal" },
      kenya: { exams: [/\bKJSEA\b/, /\bKPSEA\b/], inspection: "Directorate of Quality Assurance and Standards", headteacher: "headteacher (principal in a secondary or senior school)" },
      nigeria: { exams: [/\bBECE\b/, /\bWASSCE\b/, /\bNECO\b/], inspection: "Federal Education Quality Assurance Service", headteacher: "head teacher (principal in a secondary school)" },
      ghana: { exams: [/\bBECE\b/, /\bWASSCE\b/], inspection: "National Schools Inspectorate Authority (NaSIA)", headteacher: "headteacher" },
      uganda: { exams: [/\bPLE\b/, /\bUCE\b/, /\bUACE\b/], inspection: "Directorate of Education Standards (DES)", headteacher: "headteacher" },
    };
    for (const id of AFRICA_IDS) {
      const text = curriculumInstruction(id);
      for (const re of expected[id].exams) expect(text, `${id} ${re}`).toMatch(re);
      expect(text, id).toContain(expected[id].inspection);
      expect(text, id).toContain(`instead of headteacher: ${expected[id].headteacher}.`);
      expect(text, id).toContain(PLACE[id].place);
      expect(text, id).toContain(getCurriculum(id)!.context!);
    }
  });

  test("the prompt keeps no England framing and names no other country's body", () => {
    // The "instead of X:" labels name the UK terms being replaced, so look at
    // what is said about this system, not at those labels.
    const own = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");
    const UK_WORDS = [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /SENCO/, /\bSATs\b/, /National Curriculum in England/, /\bWTS\b/, /\bEXS\b/, /\bGDS\b/];
    const OWN_BODIES: Record<AfricaId, RegExp[]> = {
      "south-africa": [/\bCAPS\b/, /\bSACE\b/, /\bNSC\b/, /\bSIAS\b/],
      kenya: [/\bKICD\b/, /\bKNEC\b/, /\bKPSEA\b/, /\bKJSEA\b/, /\bKCSE\b/, /\bTSC\b/, /\bTPAD\b/],
      nigeria: [/\bNERDC\b/, /\bNECO\b/, /\bTRCN\b/, /\bECCDE\b/],
      ghana: [/\bNaCCA\b/, /\bNaSIA\b/],
      uganda: [/\bNCDC\b/, /\bUNEB\b/, /\bPLE\b/, /\bUCE\b/, /\bUACE\b/, /\bDES\b/],
    };
    for (const id of AFRICA_IDS) {
      const text = own(curriculumInstruction(id));
      for (const re of UK_WORDS) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const other of AFRICA_IDS.filter((o) => o !== id)) {
        expect(text, `${id} names ${other}`).not.toContain(PLACE[other].place);
        for (const re of OWN_BODIES[other]) expect(text, `${id} has ${other}'s ${re}`).not.toMatch(re);
      }
      // The instruction really did name its own system.
      for (const re of OWN_BODIES[id]) expect(curriculumInstruction(id), `${id} ${re}`).toMatch(re);
    }
  });

  test("only the systems with a confirmed attainment scale name one", () => {
    const withScale = ["south-africa", "kenya"];
    for (const id of AFRICA_IDS) {
      const text = curriculumInstruction(id);
      expect(getCurriculum(id)!.terms?.attainment !== undefined, id).toBe(withScale.includes(id));
      expect(/instead of the WTS, EXS and GDS bands:/.test(text), id).toBe(withScale.includes(id));
      // The UK band names appear only as the label of a replaced term, once each.
      expect(text.match(/\b(WTS|EXS|GDS)\b/g)?.length ?? 0, id).toBe(withScale.includes(id) ? 3 : 0);
    }
    expect(curriculumInstruction("south-africa")).toContain("Level 7 (outstanding achievement, 80 to 100%)");
    expect(curriculumInstruction("kenya")).toContain("EE1 down to BE2");
    for (const id of ["nigeria", "ghana", "uganda"]) {
      for (const band of ["WTS", "EXS", "GDS"]) expect(curriculumInstruction(id), `${id} ${band}`).not.toContain(band);
    }
    // Uganda has no teacher standards line: none was confirmed.
    expect(getCurriculum("uganda")!.terms?.teacherStandards).toBeUndefined();
    expect(curriculumInstruction("uganda")).not.toContain("instead of the Teachers' Standards");
  });

  test("the school-year context is the right one for each country", () => {
    expect(getCurriculum("south-africa")!.context).toMatch(/January to December in four terms/);
    expect(getCurriculum("kenya")!.context).toMatch(/January to November in three terms/);
    expect(getCurriculum("nigeria")!.context).toMatch(/September to July in three terms/);
    expect(getCurriculum("uganda")!.context).toMatch(/February to December in three terms/);
    expect(getCurriculum("ghana")!.context).toMatch(/Ghanaian places, names and cedi/);
    expect(getCurriculum("south-africa")!.context).toMatch(/rand/);
    expect(getCurriculum("nigeria")!.context).toMatch(/naira/);
    expect(getCurriculum("kenya")!.context).toMatch(/shilling/);
    expect(getCurriculum("uganda")!.context).toMatch(/shilling/);
  });

  test("age boundaries: Grade R lines up with England's Year 1, PP1 and KG 1 with Reception, S6 has no England year", () => {
    const age = (id: string, label: string) => yearsFor(id).find((y) => y.label === label)?.age;
    // The South African school year starts in January, so Grade R pupils are 5 at the start, as in England's Year 1.
    expect(age("south-africa", "Grade R")).toBe(englandYearAge("Year 1"));
    expect(age("south-africa", "Grade R")).not.toBe(englandYearAge("Reception"));
    expect(age("kenya", "PP1")).toBe(englandYearAge("Reception"));
    expect(age("ghana", "KG 1")).toBe(englandYearAge("Reception"));
    expect(age("kenya", "PP2")).toBe(englandYearAge("Year 1"));
    expect(age("ghana", "KG 2")).toBe(englandYearAge("Year 1"));
    expect(age("nigeria", "Primary 1")).toBe(englandYearAge("Year 2"));
    // Uganda S6 is 18; England's list stops at 17, so nothing lines up and nothing throws.
    expect(age("uganda", "S6")).toBe(18);
    expect(englandYearAge("Year 13")).toBe(17);
    expect(() => englandYearFor("uganda", "S6")).not.toThrow();
    expect(englandYearFor("uganda", "S6")).toBe("S6");
    expect(yearForEnglandYear("uganda", "Year 13")).toBe("Year 13");
    for (const id of AFRICA_IDS) {
      for (const y of yearsFor(id)) {
        expect(englandYearFor(id, y.label), `${id} ${y.label}`).toBe(y.label);
        expect(yearForEnglandYear(id, y.label), `${id} ${y.label}`).toBe(y.label);
      }
    }
    // Reading skills go by age: Grade R and Grade 1 (5 and 6) get the KS1 skills, Grade 2 (7) does not.
    expect(readingStageFor("Grade R", false, "south-africa")).toBe("ks1");
    expect(readingStageFor("Grade 1", false, "south-africa")).toBe("ks1");
    expect(readingStageFor("Grade 2", false, "south-africa")).toBe("ks2");
    expect(readingStageFor("S6", false, "uganda")).toBe("ks2");
    // Kenya's PP1 (age 4) is under 5 and gets the KS1 skills too.
    expect(readingStageFor("PP1", false, "kenya")).toBe("ks1");
    expect(readingStageFor("PP1", true, "kenya")).toBe("ks2");
    expect(readingStageFor("Grade 2", false, "kenya")).toBe("ks2");
  });
});

// ── Asia (Stage 2, Step 2) ─────────────────────────────────────────────────

const ASIA_IDS = ["india-cbse", "pakistan", "philippines", "malaysia", "singapore", "hong-kong"] as const;
type AsiaId = (typeof ASIA_IDS)[number];

const ASIA_PLACE: Record<AsiaId, { country: string; place: string; language: string; sheetName: string }> = {
  "india-cbse": { country: "IN", place: "India", language: "en-GB", sheetName: "India" },
  pakistan: { country: "PK", place: "Pakistan", language: "en-GB", sheetName: "Pakistan" },
  philippines: { country: "PH", place: "Philippines", language: "en-US", sheetName: "Philippines" },
  malaysia: { country: "MY", place: "Malaysia", language: "en-GB", sheetName: "Malaysia" },
  singapore: { country: "SG", place: "Singapore", language: "en-GB", sheetName: "Singapore" },
  "hong-kong": { country: "HK", place: "Hong Kong", language: "en-GB", sheetName: "Hong Kong" },
};

const ASIA_YEARS: Record<AsiaId, { label: string; age: number }[]> = {
  "india-cbse": [{ label: "Nursery", age: 3 }, { label: "LKG", age: 4 }, { label: "UKG", age: 5 }, ...seq("Class", " ", 1, 12, 6)],
  pakistan: [{ label: "ECE", age: 5 }, ...seq("Grade", " ", 1, 12, 6)],
  philippines: [{ label: "Kindergarten", age: 5 }, ...seq("Grade", " ", 1, 12, 6)],
  malaysia: [{ label: "Preschool", age: 5 }, ...seq("Year", " ", 1, 6, 6), ...seq("Form", " ", 1, 5, 12), { label: "Form 6 Lower", age: 17 }, { label: "Form 6 Upper", age: 18 }],
  singapore: [...seq("Primary", " ", 1, 6, 6), ...seq("Secondary", " ", 1, 4, 12), { label: "Secondary 5", age: 16 }, { label: "JC 1", age: 16 }, { label: "JC 2", age: 17 }],
  "hong-kong": [...seq("P", "", 1, 6, 6), ...seq("S", "", 1, 6, 12)],
};

const AFRICA_PLACES = ["South Africa", "Kenya", "Nigeria", "Ghana", "Uganda"];

/** What the prompt says about the system itself, without the "instead of X:" labels that name the UK terms being replaced. */
const ownText = (text: string) => text.split("\n").map((l) => (l.startsWith("- instead of ") ? l.slice(l.indexOf(": ") + 2) : l)).join("\n");

test.describe("the Asia curricula", () => {
  test("the six exist in the Asia region, in this order, and nothing else is in it", () => {
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "asia").map((c) => c.id)).toEqual([...ASIA_IDS]);
    for (const id of ASIA_IDS) {
      const c = getCurriculum(id)!;
      expect(c, id).toBeDefined();
      expect(c.region, id).toBe("asia");
      expect(c.country, id).toBe(ASIA_PLACE[id].country);
      expect(c.place, id).toBe(ASIA_PLACE[id].place);
      expect(c.verifiedOn, id).toBe("2026-11-25");
      expect(c.defaultLanguage, id).toBe(ASIA_PLACE[id].language);
      expect(LANGUAGES.some((l) => l.code === c.defaultLanguage), id).toBe(true);
      expect(c.alignment, `${id} has no statements (licence closed or unclear)`).toBeUndefined();
    }
  });

  test("names, prompt labels and the dated versions", () => {
    const expected: Record<AsiaId, [string, string, { label: string; inForceFrom: string }[]]> = {
      "india-cbse": [
        "India: CBSE (NCERT)",
        "Indian Curriculum (CBSE)",
        [
          { label: "CBSE Curriculum 2025-26 (under NCF-SE 2023)", inForceFrom: "2025-04-01" },
          { label: "CBSE Curriculum 2026-27 (under NCF-SE 2023), with new NCERT textbooks in Class 9 and a three-language rule from Class 6", inForceFrom: "2026-04-01" },
        ],
      ],
      pakistan: [
        "Pakistan: National Curriculum of Pakistan",
        "National Curriculum of Pakistan",
        [
          { label: "National Curriculum of Pakistan 2022-23 (provinces adopt and adapt it)", inForceFrom: "2023-04-01" },
          { label: "New National Curriculum of Pakistan 2026 for early childhood to Grade 5 (provinces set their own start, Punjab from April 2027), with the 2022-23 curriculum for Grades 6 to 12", inForceFrom: "2027-04-01" },
        ],
      ],
      philippines: [
        "Philippines: MATATAG Curriculum (DepEd)",
        "Philippine Curriculum (MATATAG, DepEd)",
        [{ label: "MATATAG Curriculum (Kindergarten to Grade 10) and the Strengthened Senior High School Curriculum (Grade 11 from 2026-27, Grade 12 from 2027-28)", inForceFrom: "2024-07-29" }],
      ],
      malaysia: [
        "Malaysia: KSSR and KSSM (Ministry of Education)",
        "Malaysian Curriculum (KSSR and KSSM)",
        [
          { label: "KSSR (2017 revision) for primary and KSSM for secondary", inForceFrom: "2017-01-01" },
          { label: "Kurikulum Persekolahan 2027 (KP2027) in Year 1 and Form 1, rolling up year by year, with KSSR and KSSM in the other years", inForceFrom: "2027-01-01" },
        ],
      ],
      singapore: [
        "Singapore: MOE syllabuses",
        "Singapore Curriculum (MOE)",
        [
          { label: "MOE syllabuses with Full Subject-Based Banding, and GCE O-Level and N-Level examinations", inForceFrom: "2024-01-01" },
          { label: "MOE syllabuses with Full Subject-Based Banding, and the Singapore-Cambridge Secondary Education Certificate (SEC) in place of O-Level and N-Level", inForceFrom: "2027-01-01" },
        ],
      ],
      "hong-kong": [
        "Hong Kong: Curriculum guides (Education Bureau)",
        "Hong Kong Curriculum (EDB)",
        [{ label: "Curriculum Development Council guides, with Primary Science and Primary Humanities replacing General Studies from 2025-26 at P1 and P4 and in all primary years by 2027-28", inForceFrom: "2025-09-01" }],
      ],
    };
    for (const id of ASIA_IDS) {
      const c = getCurriculum(id)!;
      const [name, promptLabel, versions] = expected[id];
      expect(c.name, id).toBe(name);
      expect(c.promptLabel, id).toBe(promptLabel);
      expect(c.versions, id).toEqual(versions);
      expect(parseCurriculum(promptLabel), id).toBe(id);
    }
  });

  test("each year list is exactly the one the sources give, and ages never go down", () => {
    for (const id of ASIA_IDS) {
      const years = yearsFor(id);
      expect(years, id).toEqual(ASIA_YEARS[id]);
      for (let i = 1; i < years.length; i++) expect(years[i].age - years[i - 1].age, `${id} ${years[i].label}`).toBeGreaterThanOrEqual(0);
    }
    expect(ASIA_IDS.map((id) => yearsFor(id).length)).toEqual([15, 13, 13, 14, 13, 12]);
    const firstLast = (id: AsiaId) => [yearsFor(id)[0], yearsFor(id).at(-1)!].map((y) => `${y.label}:${y.age}`);
    expect(firstLast("india-cbse")).toEqual(["Nursery:3", "Class 12:17"]);
    expect(firstLast("pakistan")).toEqual(["ECE:5", "Grade 12:17"]);
    expect(firstLast("philippines")).toEqual(["Kindergarten:5", "Grade 12:17"]);
    expect(firstLast("malaysia")).toEqual(["Preschool:5", "Form 6 Upper:18"]);
    expect(firstLast("singapore")).toEqual(["Primary 1:6", "JC 2:17"]);
    expect(firstLast("hong-kong")).toEqual(["P1:6", "S6:17"]);
    // A year from another list is not offered here.
    expect(yearIfOffered("india-cbse", "Grade 5")).toBe("");
    expect(yearIfOffered("india-cbse", "LKG")).toBe("LKG");
    expect(yearIfOffered("pakistan", "Class 5")).toBe("");
    expect(yearIfOffered("malaysia", "Form 6 Upper")).toBe("Form 6 Upper");
    expect(yearIfOffered("singapore", "JC 1")).toBe("JC 1");
    expect(yearIfOffered("hong-kong", "Primary 1")).toBe("");
    expect(yearIfOffered("philippines", "ECE")).toBe("");
  });

  test("each has a provenance row naming its own workbook row, and says what was checked", () => {
    const sources: Record<AsiaId, string> = {
      "india-cbse": "https://cbseacademic.nic.in/",
      pakistan: "https://ncc.gov.pk/",
      philippines: "https://www.deped.gov.ph/",
      malaysia: "https://www.moe.gov.my/",
      singapore: "https://www.moe.gov.sg/",
      "hong-kong": "https://www.edb.gov.hk/",
    };
    for (const id of ASIA_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: ASIA_PLACE[id].sheetName });
      expect(p.source, id).toBe(sources[id]);
      expect(p.notes, id).toMatch(/Reference/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/permission/i);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
    expect(PROVENANCE.singapore.notes).toMatch(/never checked|not checked/i);
    expect(PROVENANCE["hong-kong"].notes).toMatch(/never checked|not checked/i);
    expect(PROVENANCE["india-cbse"].notes).toMatch(/13 Nov/);
  });

  test("the region switch shows them to a teacher only when Asia is on", () => {
    const ids = (regions: string[], admin = false) => visibleCurricula(regions, admin).filter((c) => (ASIA_IDS as readonly string[]).includes(c.id)).map((c) => c.id);
    expect(ids(["asia"])).toEqual([...ASIA_IDS]);
    expect(ids([])).toEqual([]);
    expect(ids(["africa", "europe", "caribbean", "middle-east", "usa"])).toEqual([]);
    expect(ids([], true)).toEqual([...ASIA_IDS]);
    expect(regionSettingKey("asia")).toBe("curricula_asia");
    expect(visibleCurricula(["asia"], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS, ...ASIA_IDS]);
  });

  test("an id is accepted exactly, and look-alikes are not", () => {
    for (const id of ASIA_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["India", "india", "hong kong", "hongkong", "HONG-KONG", "Hong-Kong", "india_cbse", "india-cbse ", " pakistan", "Pakistan", "PHILIPPINES", "malaysia;", "singapore\n", "in", "hk", "sg", "india-cbse-ncert"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
    expect(requestCurriculum({ curriculumId: "malaysia" })).toBe("malaysia");
    expect(requestCurriculum({ curriculumId: "MALAYSIA", curriculum: "Singapore Curriculum (MOE)" })).toBe("singapore");
    expect(isUkCurriculum("singapore")).toBe(false);
    expect(curriculumFormState("hong-kong")).toEqual({ curriculumId: "hong-kong" });
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    expect(ukOnly.length).toBe(5);
    for (const id of ASIA_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      for (const slug of ukOnly) expect(isToolHiddenFor(slug, id), `${id} ${slug}`).toBe(true);
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
      expect(isToolHiddenFor("phonics-support", id), id).toBe(false);
    }
  });

  test("the prompt names the system's own exams, inspection body and head of school", () => {
    const expected: Record<AsiaId, { exams: RegExp[]; inspection: string; headteacher: string }> = {
      "india-cbse": { exams: [/CBSE board examinations/, /Class 10 and Class 12/], inspection: "CBSE affiliation and inspection under the CBSE Affiliation Bye-Laws", headteacher: "principal" },
      pakistan: { exams: [/\bSSC\b/, /\bHSSC\b/, /\bBISE\b/, /\bFBISE\b/], inspection: "Federal Directorate of Education", headteacher: "headteacher (principal in a secondary or higher secondary school)" },
      philippines: { exams: [/\bNAT\b/, /National Achievement Test/], inspection: "School-Based Management (SBM) assessment", headteacher: "school head (principal)" },
      malaysia: { exams: [/\bSPM\b/, /\bSTPM\b/, /\bPBD\b/, /UPSR and PT3 have been abolished/], inspection: "Jemaah Nazir dan Jaminan Kualiti (JNJK)", headteacher: "guru besar (head teacher) in primary and pengetua (principal) in secondary" },
      singapore: { exams: [/\bPSLE\b/, /\bSEC\b/, /GCE O-Level and N-Level until 2026/, /\bSEAB\b/], inspection: "School Excellence Model", headteacher: "principal" },
      "hong-kong": { exams: [/\bHKDSE\b/, /\bTSA\b/, /\bHKEAA\b/], inspection: "External School Review", headteacher: "principal" },
    };
    for (const id of ASIA_IDS) {
      const text = curriculumInstruction(id);
      for (const re of expected[id].exams) expect(text, `${id} ${re}`).toMatch(re);
      expect(text, id).toContain(expected[id].inspection);
      expect(text, id).toContain(`instead of headteacher: ${expected[id].headteacher}.`);
      expect(text, id).toContain(ASIA_PLACE[id].place);
      expect(text, id).toContain(getCurriculum(id)!.context!);
    }
  });

  test("the prompt keeps no England framing and names no other country's body", () => {
    // "Key Stage" and "SENCO" are real words in two of these systems and are
    // checked in their own test below; everything else here is England's.
    const UK_WORDS = [/Ofsted/, /GCSE/, /EYFS/, /\bSATs\b/, /National Curriculum in England/, /\bWTS\b/, /\bEXS\b/, /\bGDS\b/];
    const OWN_BODIES: Record<AsiaId, RegExp[]> = {
      "india-cbse": [/\bCBSE\b/, /\bNCERT\b/, /\bNCF-SE\b/, /\bCWSN\b/, /\bCPD\b/, /\bNCF-FS\b/],
      pakistan: [/\bSSC\b/, /\bHSSC\b/, /\bBISE\b/, /\bFBISE\b/, /\bECE\b/, /\bECCE\b/],
      philippines: [/\bDepEd\b/, /\bMATATAG\b/, /\bNAT\b/, /\bSBM\b/, /\bPPST\b/, /Republic Act 11650/],
      malaysia: [/\bKSSR\b/, /\bKSSM\b/, /\bSPM\b/, /\bSTPM\b/, /\bJNJK\b/, /\bPPKI\b/, /\bKSPK\b/, /\bKP2027\b/],
      singapore: [/\bPSLE\b/, /\bSEAB\b/, /\bSPED\b/, /\bMOE\b/, /\bNEL\b/],
      "hong-kong": [/\bHKDSE\b/, /\bHKEAA\b/, /\bEDB\b/, /\bTSA\b/],
    };
    for (const id of ASIA_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of UK_WORDS) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const other of ASIA_IDS.filter((o) => o !== id)) {
        expect(text, `${id} names ${other}`).not.toContain(ASIA_PLACE[other].place);
        for (const re of OWN_BODIES[other]) expect(text, `${id} has ${other}'s ${re}`).not.toMatch(re);
      }
      for (const place of AFRICA_PLACES) expect(text, `${id} names ${place}`).not.toContain(place);
      // The instruction really did name its own system.
      for (const re of OWN_BODIES[id]) expect(curriculumInstruction(id), `${id} ${re}`).toMatch(re);
    }
  });

  test("Key Stage and SENCO are real words only where the system itself uses them", () => {
    const usesKeyStage = ["philippines", "hong-kong"];
    for (const id of ASIA_IDS) {
      const text = ownText(curriculumInstruction(id));
      expect(/Key Stage/.test(text), `${id} Key Stage`).toBe(usesKeyStage.includes(id));
      expect(/\bSENCO\b/.test(text), `${id} SENCO`).toBe(id === "hong-kong");
    }
    expect(curriculumInstruction("philippines")).toContain("Key Stage 1 (Kindergarten to Grade 3), Key Stage 2 (Grades 4 to 6)");
    expect(curriculumInstruction("hong-kong")).toContain("Key Stage 1 (P1 to P3), Key Stage 2 (P4 to P6)");
    expect(curriculumInstruction("hong-kong")).toContain("Special Educational Needs Coordinator (SENCO)");
  });

  test("only the systems with an attainment scale name one", () => {
    const withScale = ["india-cbse", "philippines", "malaysia", "singapore"];
    for (const id of ASIA_IDS) {
      const text = curriculumInstruction(id);
      expect(getCurriculum(id)!.terms?.attainment !== undefined, id).toBe(withScale.includes(id));
      expect(/instead of the WTS, EXS and GDS bands:/.test(text), id).toBe(withScale.includes(id));
      // The UK band names appear only as the label of a replaced term, once each.
      expect(text.match(/\b(WTS|EXS|GDS)\b/g)?.length ?? 0, id).toBe(withScale.includes(id) ? 3 : 0);
    }
    for (const id of ["pakistan", "hong-kong"]) {
      for (const band of ["WTS", "EXS", "GDS"]) expect(curriculumInstruction(id), `${id} ${band}`).not.toContain(band);
    }
    expect(curriculumInstruction("india-cbse")).toContain("from A1 (highest) to E");
    expect(curriculumInstruction("philippines")).toContain("Outstanding (90 to 100)");
    expect(curriculumInstruction("malaysia")).toContain("TP1 to TP6");
    expect(curriculumInstruction("singapore")).toContain("from AL1 (highest) to AL8");
  });

  test("the school-year context is the right one for each country", () => {
    expect(getCurriculum("india-cbse")!.context).toMatch(/April to March/);
    expect(getCurriculum("india-cbse")!.context).toMatch(/rupee/);
    expect(getCurriculum("pakistan")!.context).toMatch(/April/);
    expect(getCurriculum("pakistan")!.context).toMatch(/rupee/);
    expect(getCurriculum("philippines")!.context).toMatch(/June to April in four quarters/);
    expect(getCurriculum("philippines")!.context).toMatch(/peso/);
    expect(getCurriculum("malaysia")!.context).toMatch(/January to December/);
    expect(getCurriculum("malaysia")!.context).toMatch(/ringgit/);
    expect(getCurriculum("singapore")!.context).toMatch(/January to November in four terms/);
    expect(getCurriculum("singapore")!.context).toMatch(/Mother Tongue/);
    // Fact check 2026-11-25: MOE now calls the Allied Educators (Learning and
    // Behavioural Support) SEN Officers (MOE parliamentary reply, 9 May 2023).
    expect(curriculumInstruction("singapore")).toContain("Special Educational Needs Officers (SEN Officers)");
    expect(curriculumInstruction("singapore")).not.toMatch(/Allied Educator|Learning and Behavioural Support/);
    expect(getCurriculum("hong-kong")!.context).toMatch(/September to July/);
    expect(getCurriculum("hong-kong")!.context).toMatch(/Hong Kong dollar/);
  });

  test("versions switch on the day the new one starts, not the day before", () => {
    const on = (id: string, date: string) => currentVersion(getCurriculum(id)!, new Date(`${date}T12:00:00Z`)).label;
    const v = (id: string, i: number) => getCurriculum(id)!.versions[i].label;
    expect(on("india-cbse", "2026-03-31")).toBe(v("india-cbse", 0));
    expect(on("india-cbse", "2026-04-01")).toBe(v("india-cbse", 1));
    expect(on("pakistan", "2027-03-31")).toBe(v("pakistan", 0));
    expect(on("pakistan", "2027-04-01")).toBe(v("pakistan", 1));
    expect(on("malaysia", "2026-12-31")).toBe(v("malaysia", 0));
    expect(on("malaysia", "2027-01-01")).toBe(v("malaysia", 1));
    expect(on("singapore", "2026-12-31")).toBe(v("singapore", 0));
    expect(on("singapore", "2027-01-01")).toBe(v("singapore", 1));
    // And the prompt carries the version in force on the day it is built.
    expect(curriculumInstruction("singapore", new Date("2026-12-31T12:00:00Z"))).toContain("and GCE O-Level and N-Level examinations)");
    expect(curriculumInstruction("singapore", new Date("2027-01-01T12:00:00Z"))).toContain("in place of O-Level and N-Level)");
    // One-version systems never change.
    expect(on("philippines", "2030-01-01")).toBe(v("philippines", 0));
    expect(on("hong-kong", "2030-01-01")).toBe(v("hong-kong", 0));
  });

  test("age boundaries: LKG lines up with Reception, repeated ages and Form 6 Upper break nothing", () => {
    const age = (id: string, label: string) => yearsFor(id).find((y) => y.label === label)?.age;
    expect(age("india-cbse", "LKG")).toBe(englandYearAge("Reception"));
    expect(age("india-cbse", "UKG")).toBe(englandYearAge("Year 1"));
    expect(age("india-cbse", "Nursery")).toBe(englandYearAge("Nursery"));
    // Singapore: Secondary 5 and JC 1 are both 16, so two years share an age.
    expect(age("singapore", "Secondary 5")).toBe(16);
    expect(age("singapore", "JC 1")).toBe(16);
    expect(age("singapore", "Secondary 4")).toBe(15);
    expect(() => englandYearFor("singapore", "JC 1")).not.toThrow();
    expect(englandYearFor("singapore", "JC 1")).toBe("JC 1");
    expect(englandYearFor("singapore", "Secondary 5")).toBe("Secondary 5");
    expect(readingStageFor("JC 1", false, "singapore")).toBe("ks2");
    // Malaysia Form 6 Upper is 18; England's list stops at 17, so nothing lines up and nothing throws.
    expect(age("malaysia", "Form 6 Upper")).toBe(18);
    expect(englandYearAge("Year 13")).toBe(17);
    expect(() => englandYearFor("malaysia", "Form 6 Upper")).not.toThrow();
    expect(englandYearFor("malaysia", "Form 6 Upper")).toBe("Form 6 Upper");
    expect(readingStageFor("Form 6 Upper", false, "malaysia")).toBe("ks2");
    for (const id of ASIA_IDS) {
      for (const y of yearsFor(id)) {
        expect(englandYearFor(id, y.label), `${id} ${y.label}`).toBe(y.label);
        expect(yearForEnglandYear(id, y.label), `${id} ${y.label}`).toBe(y.label);
      }
    }
  });
});

// ── Caribbean and Europe (Stage 2, Step 2) ─────────────────────────────────

const CARIBBEAN_IDS = ["jamaica", "trinidad-and-tobago"] as const;
const EUROPE_IDS = ["malta"] as const;
const CE_IDS = [...CARIBBEAN_IDS, ...EUROPE_IDS] as const;
type CeId = (typeof CE_IDS)[number];

const CE_PLACE: Record<CeId, { region: string; country: string; place: string; sheetName: string; name: string; promptLabel: string; source: string }> = {
  jamaica: {
    region: "caribbean",
    country: "JM",
    place: "Jamaica",
    sheetName: "Jamaica",
    name: "Jamaica: National Standards Curriculum (Ministry of Education)",
    promptLabel: "Jamaican Curriculum (National Standards Curriculum)",
    source: "https://moey.gov.jm/",
  },
  "trinidad-and-tobago": {
    region: "caribbean",
    country: "TT",
    place: "Trinidad and Tobago",
    sheetName: "Trinidad and Tobago",
    name: "Trinidad and Tobago: National Curriculum (Ministry of Education)",
    promptLabel: "Trinidad and Tobago Curriculum (Ministry of Education)",
    source: "https://www.moe.gov.tt/",
  },
  malta: {
    region: "europe",
    country: "MT",
    place: "Malta",
    sheetName: "Malta",
    name: "Malta: National Curriculum Framework (Ministry for Education)",
    promptLabel: "Maltese Curriculum (National Curriculum Framework)",
    source: "https://education.gov.mt/",
  },
};

const CE_YEARS: Record<CeId, { label: string; age: number }[]> = {
  jamaica: seq("Grade", " ", 1, 13, 6),
  "trinidad-and-tobago": [
    { label: "Infants 1", age: 5 },
    { label: "Infants 2", age: 6 },
    ...seq("Standard", " ", 1, 5, 7),
    ...seq("Form", " ", 1, 5, 12),
    { label: "Form 6 Lower", age: 17 },
    { label: "Form 6 Upper", age: 18 },
  ],
  malta: [{ label: "Kindergarten 1", age: 3 }, { label: "Kindergarten 2", age: 4 }, ...seq("Year", " ", 1, 11, 5)],
};

const ASIA_PLACES = ["India", "Pakistan", "Philippines", "Malaysia", "Singapore", "Hong Kong"];

test.describe("the Caribbean and Malta curricula", () => {
  test("Jamaica and Trinidad and Tobago are the Caribbean, Malta is Europe, and nothing else is in either", () => {
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "caribbean").map((c) => c.id)).toEqual([...CARIBBEAN_IDS]);
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "europe").map((c) => c.id)).toEqual([...EUROPE_IDS]);
    for (const id of CE_IDS) {
      const c = getCurriculum(id)!;
      expect(c, id).toBeDefined();
      expect(c.region, id).toBe(CE_PLACE[id].region);
      expect(c.country, id).toBe(CE_PLACE[id].country);
      expect(c.place, id).toBe(CE_PLACE[id].place);
      expect(c.verifiedOn, id).toBe("2026-11-25");
      expect(c.defaultLanguage, id).toBe("en-GB");
      expect(LANGUAGES.some((l) => l.code === c.defaultLanguage), id).toBe(true);
      expect(c.alignment, `${id} has no statements (licence closed or unclear)`).toBeUndefined();
    }
    // They sit after Asia in the registry, Caribbean before Europe (the Middle East follows).
    const order = CURRICULA_REGISTRY.map((c) => c.id);
    expect(order.slice(order.indexOf("hong-kong") + 1, order.indexOf("malta") + 1)).toEqual([...CE_IDS]);
  });

  test("names, prompt labels and the one version each", () => {
    const versions: Record<CeId, { label: string; inForceFrom: string }[]> = {
      jamaica: [{ label: "National Standards Curriculum (NSC) for Grades 1 to 9, with CXC syllabuses (CSEC and CAPE) from Grade 10", inForceFrom: "2016-09-01" }],
      "trinidad-and-tobago": [{ label: "Ministry of Education primary curriculum guides (2013) and the secondary curriculum, with CXC syllabuses (CSEC and CAPE) from Form 4", inForceFrom: "2013-09-01" }],
      malta: [{ label: "National Curriculum Framework (2012) and the Learning Outcomes Framework (from 2018)", inForceFrom: "2012-09-01" }],
    };
    for (const id of CE_IDS) {
      const c = getCurriculum(id)!;
      expect(c.name, id).toBe(CE_PLACE[id].name);
      expect(c.promptLabel, id).toBe(CE_PLACE[id].promptLabel);
      expect(c.versions, id).toEqual(versions[id]);
      expect(parseCurriculum(CE_PLACE[id].promptLabel), id).toBe(id);
      // One-version systems never change, whatever the date.
      const label = (d: string) => currentVersion(c, new Date(`${d}T12:00:00Z`)).label;
      expect(label("2030-01-01"), id).toBe(versions[id][0].label);
      expect(label("2026-11-25"), id).toBe(versions[id][0].label);
    }
  });

  test("each year list is exactly the one the sources give, and ages never go down", () => {
    for (const id of CE_IDS) {
      const years = yearsFor(id);
      expect(years, id).toEqual(CE_YEARS[id]);
      for (let i = 1; i < years.length; i++) expect(years[i].age - years[i - 1].age, `${id} ${years[i].label}`).toBeGreaterThanOrEqual(0);
    }
    expect(CE_IDS.map((id) => yearsFor(id).length)).toEqual([13, 14, 13]);
    const firstLast = (id: CeId) => [yearsFor(id)[0], yearsFor(id).at(-1)!].map((y) => `${y.label}:${y.age}`);
    expect(firstLast("jamaica")).toEqual(["Grade 1:6", "Grade 13:18"]);
    expect(firstLast("trinidad-and-tobago")).toEqual(["Infants 1:5", "Form 6 Upper:18"]);
    expect(firstLast("malta")).toEqual(["Kindergarten 1:3", "Year 11:15"]);
    // A year from another list is not offered here.
    expect(yearIfOffered("jamaica", "Grade 13")).toBe("Grade 13");
    expect(yearIfOffered("jamaica", "Form 1")).toBe("");
    expect(yearIfOffered("jamaica", "Year 7")).toBe("");
    expect(yearIfOffered("trinidad-and-tobago", "Standard 5")).toBe("Standard 5");
    expect(yearIfOffered("trinidad-and-tobago", "Grade 5")).toBe("");
    expect(yearIfOffered("trinidad-and-tobago", "Form 6 Upper")).toBe("Form 6 Upper");
    expect(yearIfOffered("malta", "Kindergarten 1")).toBe("Kindergarten 1");
    expect(yearIfOffered("malta", "Year 11")).toBe("Year 11");
    expect(yearIfOffered("malta", "Year 12")).toBe("");
    expect(yearIfOffered("malta", "Reception")).toBe("");
  });

  test("each has a provenance row naming its own workbook row, and says what was checked", () => {
    for (const id of CE_IDS) {
      const p = PROVENANCE[id];
      expect(p, id).toBeDefined();
      expect(p.sheetRow, id).toEqual({ tab: "Countries", name: CE_PLACE[id].sheetName });
      expect(p.source, id).toBe(CE_PLACE[id].source);
      expect(p.notes, id).toMatch(/Reference/);
      expect(p.notes, id).toMatch(/licen[cs]e/i);
      expect(p.notes, id).toMatch(/permission/i);
      expect(p.notes, id).toMatch(/never checked|not checked/i);
      expect(p.notes, id).not.toMatch(/[–—]/);
    }
    expect(PROVENANCE.jamaica.notes).toMatch(/Bulletin 141/);
    expect(PROVENANCE.jamaica.notes).toMatch(/Hurricane Melissa/);
    expect(PROVENANCE.jamaica.notes).toMatch(/closed/i);
    expect(PROVENANCE["trinidad-and-tobago"].notes).toMatch(/unclear/i);
    expect(PROVENANCE.malta.notes).toMatch(/unclear/i);
    expect(PROVENANCE.malta.notes).toMatch(/copyright/i);
    // The six rows the workbook never checked were checked before release.
    for (const id of ["singapore", "hong-kong", "ghana", "malta", "jamaica", "trinidad-and-tobago"]) {
      expect(PROVENANCE[id].notes, id).toMatch(/Fact check 2026-11-25: /);
    }
    expect(PROVENANCE.malta.notes).toMatch(/Benchmark.*ended after 2023/);
    expect(PROVENANCE.singapore.notes).toMatch(/SEN Officers/);
  });

  test("each region switch shows only its own country: Malta is not offered with only the Caribbean on, and the reverse", () => {
    const ids = (regions: string[], admin = false) => visibleCurricula(regions, admin).filter((c) => (CE_IDS as readonly string[]).includes(c.id)).map((c) => c.id);
    expect(ids(["caribbean"])).toEqual([...CARIBBEAN_IDS]);
    expect(ids(["europe"])).toEqual([...EUROPE_IDS]);
    expect(ids(["caribbean", "europe"])).toEqual([...CE_IDS]);
    expect(ids([])).toEqual([]);
    expect(ids(["africa", "asia", "middle-east", "usa", "canada"])).toEqual([]);
    expect(ids([], true)).toEqual([...CE_IDS]);
    expect(regionSettingKey("caribbean")).toBe("curricula_caribbean");
    expect(regionSettingKey("europe")).toBe("curricula_europe");
    expect(visibleCurricula(["caribbean"], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS, ...CARIBBEAN_IDS]);
    expect(visibleCurricula(["europe"], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS, ...EUROPE_IDS]);
  });

  test("an id is accepted exactly, and look-alikes are not", () => {
    for (const id of CE_IDS) expect(parseCurriculum(id), id).toBe(id);
    for (const junk of ["Jamaica", "JAMAICA", "jamaican", "trinidad", "Trinidad and Tobago", "trinidad_and_tobago", "trinidad-and-tobago ", "trinidad-tobago", "tt", "TT", "MALTA", "Malta", "maltese", " malta", "malta;", "jm", "mt"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
    expect(requestCurriculum({ curriculumId: "malta" })).toBe("malta");
    expect(requestCurriculum({ curriculumId: "MALTA", curriculum: "Jamaican Curriculum (National Standards Curriculum)" })).toBe("jamaica");
    expect(isUkCurriculum("jamaica")).toBe(false);
    expect(isUkCurriculum("malta")).toBe(false);
    expect(curriculumFormState("trinidad-and-tobago")).toEqual({ curriculumId: "trinidad-and-tobago" });
  });

  test("every one hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    expect(ukOnly.length).toBe(5);
    for (const id of CE_IDS) {
      expect(hiddenToolSlugs(id).sort(), id).toEqual([...ukOnly].sort());
      for (const slug of ukOnly) expect(isToolHiddenFor(slug, id), `${id} ${slug}`).toBe(true);
      expect(isToolHiddenFor("worksheet-generator", id), id).toBe(false);
      expect(isToolHiddenFor("phonics-support", id), id).toBe(false);
    }
  });

  test("the prompt names the system's own exams, inspection body and head of school", () => {
    const expected: Record<CeId, { exams: RegExp[]; inspection: string; headteacher: string }> = {
      jamaica: { exams: [/\bPEP\b/, /Primary Exit Profile/, /\bCSEC\b/, /\bCAPE\b/, /\bCXC\b/, /Grades 4 to 6/], inspection: "National Education Inspectorate (NEI)", headteacher: "principal" },
      "trinidad-and-tobago": {
        exams: [/\bSEA\b/, /Secondary Entrance Assessment/, /\bCSEC\b/, /\bCAPE\b/, /\bCXC\b/, /Standard 5/],
        inspection: "Division of School Supervision and Management",
        headteacher: "principal",
      },
      malta: {
        exams: [/\bMATSEC\b/, /national annual examinations in Years 4 to 6/, /End-of-Primary Examination in Year 6/, /Year 11/, /Intermediate and Advanced level/],
        inspection: "Directorate for Quality and Standards in Education (DQSE)",
        headteacher: "head of school",
      },
    };
    for (const id of CE_IDS) {
      const text = curriculumInstruction(id);
      for (const re of expected[id].exams) expect(text, `${id} ${re}`).toMatch(re);
      expect(text, id).toContain(expected[id].inspection);
      expect(text, id).toContain(`instead of headteacher: ${expected[id].headteacher}.`);
      expect(text, id).toContain(CE_PLACE[id].place);
      expect(text, id).toContain(getCurriculum(id)!.context!);
    }
    expect(curriculumInstruction("jamaica")).toContain("the Jamaica Teaching Council's professional standards");
    expect(curriculumInstruction("jamaica")).toContain("Early Childhood Commission");
    expect(curriculumInstruction("jamaica")).toContain("Individual Education Plan");
    expect(curriculumInstruction("trinidad-and-tobago")).toContain("Student Support Services Division");
    expect(curriculumInstruction("trinidad-and-tobago")).toContain("Early Childhood Care and Education (ECCE)");
    expect(curriculumInstruction("malta")).toContain("Learning Support Educators (LSEs)");
    expect(curriculumInstruction("malta")).toContain("Inclusion Coordinator (INCO)");
    expect(curriculumInstruction("malta")).toContain("Individual Educational Programme (IEP)");
    // Fact check 2026-11-25: the Year 6 Benchmark ended after 2023 (Eurydice), and
    // external reviews are the DQSE's (Education Act, Cap. 605), not a "Quality Assurance Department".
    expect(curriculumInstruction("malta")).not.toMatch(/Benchmark/);
    expect(curriculumInstruction("malta")).not.toContain("Quality Assurance Department");
    expect(curriculumInstruction("malta")).toContain("National Quality Standards");
  });

  test("Jamaica and Trinidad and Tobago share the CXC exams, and each names only its own other bodies", () => {
    // CXC, CSEC and CAPE belong to both, so neither forbids them in the other.
    for (const id of CARIBBEAN_IDS) {
      const text = curriculumInstruction(id);
      for (const re of [/\bCXC\b/, /\bCSEC\b/, /\bCAPE\b/, /Caribbean Examinations Council/]) expect(text, `${id} ${re}`).toMatch(re);
    }
    const jamaica = ownText(curriculumInstruction("jamaica"));
    const tt = ownText(curriculumInstruction("trinidad-and-tobago"));
    for (const re of [/Trinidad/, /Tobago/, /\bSEA\b/, /Secondary Entrance Assessment/, /Division of School Supervision/, /Student Support Services/, /\bECCE\b/, /\bForm [1-6]\b/, /\bStandard [1-5]\b/, /Infants/]) {
      expect(jamaica, `Jamaica has ${re}`).not.toMatch(re);
    }
    for (const re of [/Jamaica/, /\bPEP\b/, /Primary Exit Profile/, /\bNEI\b/, /National Education Inspectorate/, /\bNSC\b/, /Early Childhood Commission/, /Special Education Unit/, /Teaching Council/, /\bGrade \d/]) {
      expect(tt, `Trinidad and Tobago has ${re}`).not.toMatch(re);
    }
    // Each says its own system.
    for (const re of [/\bPEP\b/, /\bNEI\b/, /\bNSC\b/, /Early Childhood Commission/, /Special Education Unit/, /Teaching Council/]) expect(jamaica, `Jamaica ${re}`).toMatch(re);
    for (const re of [/\bSEA\b/, /Division of School Supervision/, /Student Support Services/, /\bECCE\b/, /Infants 1 and 2/]) expect(tt, `Trinidad and Tobago ${re}`).toMatch(re);
  });

  test("Malta and Singapore both have a Secondary Education Certificate, so they are told apart by MATSEC and Singapore-Cambridge", () => {
    const malta = curriculumInstruction("malta");
    const singapore = curriculumInstruction("singapore");
    expect(malta).toMatch(/\bMATSEC\b/);
    expect(malta).not.toContain("Singapore");
    expect(malta).not.toMatch(/\bSEAB\b/);
    expect(singapore).toContain("Singapore-Cambridge");
    expect(singapore).not.toMatch(/MATSEC/);
    expect(singapore).not.toContain("Malta");
    for (const id of CARIBBEAN_IDS) expect(curriculumInstruction(id), id).not.toMatch(/MATSEC|Singapore-Cambridge/);
  });

  test("the prompt keeps no England framing and names no other country's body", () => {
    const UK_WORDS = [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/, /National Curriculum in England/, /\bWTS\b/, /\bEXS\b/, /\bGDS\b/];
    const OWN: Record<CeId, RegExp[]> = {
      jamaica: [/\bPEP\b/, /\bNSC\b/, /\bNEI\b/, /Early Childhood Commission/, /Special Education Unit/],
      "trinidad-and-tobago": [/\bSEA\b/, /\bECCE\b/, /Student Support Services/, /Division of School Supervision/],
      malta: [/\bMATSEC\b/, /\bNCF\b/, /\bLSEs?\b/, /\bINCO\b/, /\bIEP\b/, /\bDQSE\b/, /End-of-Primary Examination/],
    };
    for (const id of CE_IDS) {
      const text = ownText(curriculumInstruction(id));
      for (const re of UK_WORDS) expect(text, `${id} ${re}`).not.toMatch(re);
      for (const other of CE_IDS.filter((o) => o !== id)) {
        expect(text, `${id} names ${other}`).not.toContain(CE_PLACE[other].place);
        for (const re of OWN[other]) expect(text, `${id} has ${other}'s ${re}`).not.toMatch(re);
      }
      for (const place of [...AFRICA_PLACES, ...ASIA_PLACES]) expect(text, `${id} names ${place}`).not.toContain(place);
      // The instruction really did name its own system.
      for (const re of OWN[id]) expect(curriculumInstruction(id), `${id} ${re}`).toMatch(re);
    }
    // Malta has no Caribbean exams.
    expect(curriculumInstruction("malta")).not.toMatch(/\bCXC\b|\bCSEC\b|\bCAPE\b|Caribbean|Jamaic|Trinidad/);
  });

  test("none has an attainment scale, so no UK band name appears at all", () => {
    for (const id of CE_IDS) {
      const text = curriculumInstruction(id);
      expect(getCurriculum(id)!.terms?.attainment, id).toBeUndefined();
      expect(/instead of the WTS, EXS and GDS bands:/.test(text), id).toBe(false);
      for (const band of ["WTS", "EXS", "GDS"]) expect(text, `${id} ${band}`).not.toContain(band);
    }
    // Only Jamaica has teacher standards.
    expect(getCurriculum("jamaica")!.terms?.teacherStandards).toBeDefined();
    expect(getCurriculum("trinidad-and-tobago")!.terms?.teacherStandards).toBeUndefined();
    expect(getCurriculum("malta")!.terms?.teacherStandards).toBeUndefined();
  });

  test("the school-year context is the right one for each country", () => {
    expect(getCurriculum("jamaica")!.context).toMatch(/September to July in three terms/);
    expect(getCurriculum("jamaica")!.context).toMatch(/Jamaican Patois/);
    expect(getCurriculum("jamaica")!.context).toMatch(/Jamaican dollar/);
    expect(getCurriculum("trinidad-and-tobago")!.context).toMatch(/September to July in three terms/);
    expect(getCurriculum("trinidad-and-tobago")!.context).toMatch(/TT dollar/);
    expect(getCurriculum("malta")!.context).toMatch(/late September to June/);
    expect(getCurriculum("malta")!.context).toMatch(/Maltese and English are both official languages/);
    expect(getCurriculum("malta")!.context).toMatch(/State, Church and independent schools/);
    expect(getCurriculum("malta")!.context).toMatch(/euro/);
  });

  test("age boundaries: Malta lines up with England by age, and Grade 13 and Form 6 Upper break nothing", () => {
    const age = (id: string, label: string) => yearsFor(id).find((y) => y.label === label)?.age;
    // Malta Year 1 to Year 11 line up with England's Year 1 to Year 11 (5 to 15).
    for (let n = 1; n <= 11; n++) expect(age("malta", `Year ${n}`), `Year ${n}`).toBe(englandYearAge(`Year ${n}`));
    expect(age("malta", "Year 1")).toBe(5);
    expect(age("malta", "Year 6")).toBe(10);
    expect(age("malta", "Year 11")).toBe(15);
    expect(age("malta", "Kindergarten 1")).toBe(englandYearAge("Nursery"));
    expect(age("malta", "Kindergarten 2")).toBe(englandYearAge("Reception"));
    // Trinidad and Tobago's Infants 1 starts at England's Year 1 age.
    expect(age("trinidad-and-tobago", "Infants 1")).toBe(englandYearAge("Year 1"));
    expect(age("jamaica", "Grade 1")).toBe(englandYearAge("Year 2"));
    // Jamaica Grade 13 and Trinidad and Tobago Form 6 Upper are 18; England's list stops at 17.
    expect(age("jamaica", "Grade 13")).toBe(18);
    expect(age("trinidad-and-tobago", "Form 6 Upper")).toBe(18);
    expect(englandYearAge("Year 13")).toBe(17);
    expect(() => englandYearFor("jamaica", "Grade 13")).not.toThrow();
    expect(englandYearFor("jamaica", "Grade 13")).toBe("Grade 13");
    expect(() => englandYearFor("trinidad-and-tobago", "Form 6 Upper")).not.toThrow();
    expect(englandYearFor("trinidad-and-tobago", "Form 6 Upper")).toBe("Form 6 Upper");
    expect(readingStageFor("Grade 13", false, "jamaica")).toBe("ks2");
    expect(readingStageFor("Form 6 Upper", false, "trinidad-and-tobago")).toBe("ks2");
    for (const id of CE_IDS) {
      for (const y of yearsFor(id)) {
        expect(englandYearFor(id, y.label), `${id} ${y.label}`).toBe(y.label);
        expect(yearForEnglandYear(id, y.label), `${id} ${y.label}`).toBe(y.label);
      }
    }
  });
});

// ── The Middle East: the United Arab Emirates (Stage 2, Step 2) ────────────

const UAE_VERSION_LABEL =
  "Ministry of Education national curriculum, Kindergarten to Grade 12, with Artificial Intelligence compulsory from 2025-26 and merged with Design, Innovation and Computer Science into one Artificial Intelligence and Technology subject from 2026-27";

test.describe("the United Arab Emirates curriculum", () => {
  test("uae-moe is the only entry in the middle-east region, with the right identity", () => {
    expect(CURRICULA_REGISTRY.filter((c) => c.region === "middle-east").map((c) => c.id)).toEqual(["uae-moe"]);
    const c = getCurriculum("uae-moe")!;
    expect(c).toBeDefined();
    expect(c.region).toBe("middle-east");
    expect(c.country).toBe("AE");
    expect(c.place).toBe("United Arab Emirates");
    expect(c.name).toBe("United Arab Emirates: Ministry of Education curriculum");
    expect(c.promptLabel).toBe("UAE Ministry of Education Curriculum");
    expect(c.verifiedOn).toBe("2026-11-25");
    expect(c.defaultLanguage).toBe("en-GB");
    expect(LANGUAGES.some((l) => l.code === c.defaultLanguage)).toBe(true);
    expect(c.alignment, "no statements (source closed)").toBeUndefined();
    expect(c.versions).toEqual([{ label: UAE_VERSION_LABEL, inForceFrom: "2025-08-25" }]);
    expect(parseCurriculum("UAE Ministry of Education Curriculum")).toBe("uae-moe");
    // One version: the label never changes, whatever the date.
    expect(currentVersion(c, new Date("2030-01-01T12:00:00Z")).label).toBe(UAE_VERSION_LABEL);
    expect(currentVersion(c, new Date("2026-11-25T12:00:00Z")).label).toBe(UAE_VERSION_LABEL);
    // It sits after Malta, at the end of the registry.
    expect(CURRICULA_REGISTRY.at(-1)!.id).toBe("uae-moe");
    expect(CURRICULA_REGISTRY.at(-2)!.id).toBe("malta");
  });

  test("the year list runs KG1 (4) to Grade 12 (17), exactly", () => {
    const years = yearsFor("uae-moe");
    expect(years).toEqual([{ label: "KG1", age: 4 }, { label: "KG2", age: 5 }, ...seq("Grade", " ", 1, 12, 6)]);
    expect(years.length).toBe(14);
    expect(`${years[0].label}:${years[0].age}`).toBe("KG1:4");
    expect(`${years.at(-1)!.label}:${years.at(-1)!.age}`).toBe("Grade 12:17");
    for (let i = 1; i < years.length; i++) expect(years[i].age - years[i - 1].age).toBeGreaterThanOrEqual(0);
    expect(yearIfOffered("uae-moe", "KG1")).toBe("KG1");
    expect(yearIfOffered("uae-moe", "Grade 12")).toBe("Grade 12");
    expect(yearIfOffered("uae-moe", "Grade 13")).toBe("");
    expect(yearIfOffered("uae-moe", "Grade 0")).toBe("");
    expect(yearIfOffered("uae-moe", "Reception")).toBe("");
    expect(yearIfOffered("uae-moe", "Year 4")).toBe("");
    expect(yearIfOffered("uae-moe", "KG 1")).toBe("");
  });

  test("the provenance row names its workbook row and says what was checked", () => {
    const p = PROVENANCE["uae-moe"];
    expect(p).toBeDefined();
    expect(p.sheetRow).toEqual({ tab: "Countries", name: "United Arab Emirates" });
    expect(p.source).toBe("https://www.moe.gov.ae/");
    expect(p.notes).toMatch(/Reference/);
    expect(p.notes).toMatch(/EmSAT/);
    expect(p.notes).toMatch(/licen[cs]e/i);
    expect(p.notes).toMatch(/permission/i);
    expect(p.notes).toMatch(/KHDA|ADEK|SPEA/);
    expect(p.notes).not.toMatch(/[–—]/);
  });

  test("only the middle-east switch shows it", () => {
    const ids = (regions: string[], admin = false) => visibleCurricula(regions, admin).filter((c) => c.id === "uae-moe").map((c) => c.id);
    expect(ids(["middle-east"])).toEqual(["uae-moe"]);
    expect(ids([])).toEqual([]);
    expect(ids(["africa", "asia", "caribbean", "europe", "usa", "canada"])).toEqual([]);
    expect(ids([], true)).toEqual(["uae-moe"]);
    expect(regionSettingKey("middle-east")).toBe("curricula_middle_east");
    expect(visibleCurricula(["middle-east"], false).map((c) => c.id)).toEqual([...UK_CURRICULUM_IDS, "uae-moe"]);
  });

  test("an id is accepted exactly, and look-alikes are not", () => {
    expect(parseCurriculum("uae-moe")).toBe("uae-moe");
    for (const junk of ["UAE", "uae", "uae_moe", "UAE-MOE", "uae-moe ", " uae-moe", "uae-moe;", "United Arab Emirates", "Emirati", "uae-khda", "uae-adek", "uae-moe-2", "ae"]) {
      expect(parseCurriculum(junk), junk).toBeNull();
    }
    expect(requestCurriculum({ curriculumId: "uae-moe" })).toBe("uae-moe");
    expect(requestCurriculum({ curriculumId: "UAE-MOE", curriculum: "UAE Ministry of Education Curriculum" })).toBe("uae-moe");
    expect(isUkCurriculum("uae-moe")).toBe(false);
    expect(curriculumFormState("uae-moe")).toEqual({ curriculumId: "uae-moe" });
  });

  test("it hides every UK-only tool and keeps a universal one", () => {
    const ukOnly = Object.entries(TOOL_SCOPE).filter(([, s]) => s === "uk-only").map(([k]) => k);
    expect(ukOnly.length).toBe(5);
    expect(hiddenToolSlugs("uae-moe").sort()).toEqual([...ukOnly].sort());
    for (const slug of ukOnly) expect(isToolHiddenFor(slug, "uae-moe"), slug).toBe(true);
    expect(isToolHiddenFor("worksheet-generator", "uae-moe")).toBe(false);
    expect(isToolHiddenFor("phonics-support", "uae-moe")).toBe(false);
  });

  test("the prompt names the Ministry's own exams, cycles, inspection and inclusion wording", () => {
    const text = curriculumInstruction("uae-moe");
    expect(text).toContain("United Arab Emirates: Ministry of Education curriculum");
    expect(text).toContain("United Arab Emirates");
    expect(text).toContain("the national curriculum of the UAE Ministry of Education (MoE)");
    expect(text).toContain("Kindergarten (KG1 and KG2), Cycle 1 (Grades 1 to 4), Cycle 2 (Grades 5 to 8) and Cycle 3 (Grades 9 to 12, in the General and Advanced streams)");
    expect(text).toContain("the EmSAT is no longer required at Grade 12 (cancelled in November 2024)");
    expect(text).toMatch(/Ministry's centrally set end-of-term examinations/);
    expect(text).toContain("the Ministry of Education's school inspection and evaluation");
    expect(text).toContain("inclusive education for students of determination, with an Individual Education Plan (IEP)");
    expect(text).toContain("the UAE Teacher Licensing System and its professional standards for teachers");
    expect(text).toContain("the Ministry's Kindergarten curriculum (KG1 and KG2)");
    expect(text).toContain("instead of headteacher: principal.");
    expect(text).toContain(getCurriculum("uae-moe")!.context!);
    expect(text).toMatch(/Arabic, Islamic Education and Moral, Social and Cultural Studies are compulsory/);
    expect(text).toMatch(/dirham/);
  });

  test("the prompt keeps no England framing and names no other Stage 2 country or body", () => {
    const text = ownText(curriculumInstruction("uae-moe"));
    for (const re of [/Ofsted/, /GCSE/, /Key Stage/, /EYFS/, /\bSENCO\b/, /\bSATs\b/, /National Curriculum in England/, /\bWTS\b/, /\bEXS\b/, /\bGDS\b/]) expect(text, `${re}`).not.toMatch(re);
    for (const place of [...AFRICA_PLACES, ...ASIA_PLACES, "Jamaica", "Trinidad", "Tobago", "Malta"]) expect(text, place).not.toContain(place);
    for (const re of [/\bCXC\b/, /\bCSEC\b/, /\bCAPE\b/, /MATSEC/, /Singapore-Cambridge/, /\bCBSE\b/, /\bCAPS\b/, /\bNERDC\b/, /\bNaCCA\b/, /\bKCSE\b/, /\bPEP\b/, /\bSEA\b/, /\bNEI\b/]) expect(text, `${re}`).not.toMatch(re);
    // The private-school regulators are deliberately not entries.
    for (const re of [/\bKHDA\b/, /\bADEK\b/, /\bSPEA\b/, /Knowledge and Human Development Authority/]) expect(curriculumInstruction("uae-moe"), `${re}`).not.toMatch(re);
  });

  test("no attainment scale, so no UK band name appears at all", () => {
    const text = curriculumInstruction("uae-moe");
    expect(getCurriculum("uae-moe")!.terms?.attainment).toBeUndefined();
    expect(/instead of the WTS, EXS and GDS bands:/.test(text)).toBe(false);
    for (const band of ["WTS", "EXS", "GDS"]) expect(text).not.toContain(band);
  });

  test("the school-year context says Arabic and English, Emirati places and dirhams", () => {
    const ctx = getCurriculum("uae-moe")!.context!;
    expect(ctx).toMatch(/Public schools teach in Arabic, with English taught from Kindergarten/);
    expect(ctx).toMatch(/late August to early July/);
    expect(ctx).toMatch(/Emirati places, names and dirham amounts/);
  });

  test("age boundaries: KG1 and KG2 line up with Reception and Year 1, Grade 12 (17) breaks nothing", () => {
    const age = (label: string) => yearsFor("uae-moe").find((y) => y.label === label)?.age;
    expect(age("KG1")).toBe(englandYearAge("Reception"));
    expect(age("KG2")).toBe(englandYearAge("Year 1"));
    expect(age("Grade 1")).toBe(englandYearAge("Year 2"));
    expect(age("Grade 12")).toBe(englandYearAge("Year 13"));
    for (const y of yearsFor("uae-moe")) {
      expect(() => englandYearFor("uae-moe", y.label), y.label).not.toThrow();
      expect(englandYearFor("uae-moe", y.label), y.label).toBe(y.label);
      expect(yearForEnglandYear("uae-moe", y.label), y.label).toBe(y.label);
    }
    expect(readingStageFor("Grade 12", false, "uae-moe")).toBe("ks2");
  });
});

test.describe("Stage 2 as a whole", () => {
  test("every Stage 2 region has at least one verified curriculum, and the fifteen ids are exactly the planned ones", () => {
    const stage2 = ["africa", "asia", "caribbean", "europe", "middle-east"];
    for (const region of stage2) {
      expect(CURRICULA_REGISTRY.some((c) => c.region === region && c.verifiedOn), region).toBe(true);
    }
    const ids = CURRICULA_REGISTRY.filter((c) => stage2.includes(c.region)).map((c) => c.id);
    expect([...ids].sort()).toEqual(
      [
        "south-africa", "kenya", "nigeria", "ghana", "uganda", "india-cbse", "pakistan", "philippines", "malaysia", "singapore", "hong-kong", "jamaica", "trinidad-and-tobago", "malta", "uae-moe",
      ].sort(),
    );
    expect(ids.length).toBe(15);
    for (const id of ids) expect(getCurriculum(id)!.verifiedOn, id).toBe("2026-11-25");
  });
});
