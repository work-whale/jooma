import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { FRAMEWORK_CREDIT, FRAMEWORK_AGES, statementsForAge, type FrameworkData, type Statement } from "@/app/lib/standards";
import ac9 from "@/app/lib/standards/data/ac9.json";
import { filterBySubject, matchingSubjects } from "@/app/lib/standards/suggest";
import ccssMath from "@/app/lib/standards/data/ccss-math.json";
import cfeThirdFourth from "@/app/lib/standards/data/cfe-third-fourth.json";
import nicKs3 from "@/app/lib/standards/data/nic-ks3.json";
import primary from "@/app/lib/national-curriculum/data/primary.json";

/*
 * Australia's other learning areas (Stage 3, Phase A): Humanities and Social
 * Sciences, The Arts, Technologies and Health and Physical Education join
 * English, Mathematics and Science in the one `ac9` file. Languages are left
 * out on purpose (owner's decision, 2026-11-24).
 *
 * The 676 English, Mathematics and Science statements were fixed before this
 * change, so the regression hashes below were taken from the file as it stood.
 */

const DATA = ac9 as FrameworkData;
const ALL = DATA.statements;

const OLD_SUBJECTS = ["English", "Mathematics", "Science"];
const HASS_SUBJECTS = ["Humanities and Social Sciences", "Civics and Citizenship", "Economics and Business", "Geography", "History"];
const ARTS_SUBJECTS = ["Dance", "Drama", "Media Arts", "Music", "Visual Arts"];
const TECH_SUBJECTS = ["Design and Technologies", "Digital Technologies"];
const HPE_SUBJECTS = ["Health and Physical Education"];
const NEW_SUBJECTS = [...HASS_SUBJECTS, ...ARTS_SUBJECTS, ...TECH_SUBJECTS, ...HPE_SUBJECTS];

const inSubjects = (subjects: string[]) => ALL.filter((s) => subjects.includes(s.subject));
const sha = (lines: string[]) => createHash("sha256").update(lines.sort().join("\n")).digest("hex");

test.describe("counts per learning area", () => {
  test("each learning area has the content descriptions the workbook has", () => {
    expect(inSubjects(HASS_SUBJECTS).length).toBe(333);
    expect(inSubjects(ARTS_SUBJECTS).length).toBe(165);
    expect(inSubjects(TECH_SUBJECTS).length).toBe(124);
    expect(inSubjects(HPE_SUBJECTS).length).toBe(97);
    expect(inSubjects(OLD_SUBJECTS).length).toBe(676);
    expect(ALL.length).toBe(1395);
  });

  test("and each subject inside them", () => {
    const by: Record<string, number> = {};
    for (const s of ALL) by[s.subject] = (by[s.subject] ?? 0) + 1;
    expect(by).toEqual({
      English: 284,
      Mathematics: 240,
      Science: 152,
      "Humanities and Social Sciences": 89,
      "Civics and Citizenship": 42,
      "Economics and Business": 40,
      Geography: 57,
      History: 105,
      Dance: 33,
      Drama: 33,
      "Media Arts": 33,
      Music: 33,
      "Visual Arts": 33,
      "Design and Technologies": 51,
      "Digital Technologies": 73,
      "Health and Physical Education": 97,
    });
  });
});

test.describe("saved runs keep working: the 676 English, Mathematics and Science statements are unchanged", () => {
  const old = () => inSubjects(OLD_SUBJECTS);

  test("every id and its text, byte for byte", () => {
    // sha256 of the sorted "id|text" lines, taken from the file before the change.
    expect(sha(old().map((s) => `${s.id}|${s.text}`))).toBe("f5f58114c2c9e15bf398356282e798ab29b732bb16329a789fbfa46b99c5d73c");
  });

  test("and the rest of each statement: code, subject, strand, ages", () => {
    expect(sha(old().map((s) => [s.id, s.code, s.subject, s.strand, s.ages.join(","), s.text].join("|")))).toBe(
      "1c3b8048e065a5f259a1c8f524edae85062619618db54fe28b25e75984b8f580",
    );
  });
});

test.describe("ages", () => {
  const find = (code: string) => ALL.find((s) => s.code === code)!;

  test("a two-year band gives both ages: Years 3 and 4 is 8 and 9", () => {
    // Dance, Years 3 and 4, Exploring and responding.
    expect(find("AC9ADA4E01").ages).toEqual([8, 9]);
    // Health and Physical Education, Years 7 and 8 and Years 1 and 2.
    const hpe = inSubjects(HPE_SUBJECTS);
    const bands = new Set(hpe.map((s) => s.ages.join(",")));
    expect([...bands].sort()).toEqual(["10,11", "12,13", "14,15", "5", "6,7", "8,9"]);
  });

  test("Foundation is age 5", () => {
    const foundation = inSubjects(["Dance"]).filter((x) => x.ages.length === 1);
    expect(foundation.length).toBeGreaterThan(0);
    for (const s of foundation) expect(s.ages).toEqual([5]);
    expect(find("AC9ADA4E01").ages).not.toContain(5);
  });

  test("every age is within 5 to 15, and the framework says so", () => {
    for (const s of ALL) {
      expect(s.ages.length, s.id).toBeGreaterThan(0);
      for (const a of s.ages) {
        expect(a, s.id).toBeGreaterThanOrEqual(5);
        expect(a, s.id).toBeLessThanOrEqual(15);
        expect(FRAMEWORK_AGES.ac9, s.id).toContain(a);
      }
    }
  });

  test("Year N in Humanities and Social Sciences is age N + 5 only", () => {
    for (const s of inSubjects(HASS_SUBJECTS)) expect(s.ages.length, s.id).toBe(1);
    const hass = inSubjects(["Humanities and Social Sciences"]);
    // Foundation to Year 6 is age 5 to 11, and every year has some.
    for (let age = 5; age <= 11; age++) expect(hass.some((s) => s.ages[0] === age), `age ${age}`).toBe(true);
    expect(Math.min(...hass.map((s) => s.ages[0]))).toBe(5);
    expect(Math.max(...hass.map((s) => s.ages[0]))).toBe(11);
    // Years 7 to 10 (History here) are ages 12 to 15.
    const history = inSubjects(["History"]);
    expect(Math.min(...history.map((s) => s.ages[0]))).toBe(12);
    expect(Math.max(...history.map((s) => s.ages[0]))).toBe(15);
    // Year 3 History in HASS F to 6 is age 8.
    expect(hass.filter((s) => s.strand === "Knowledge and understanding: History" && s.ages[0] === 8).length).toBeGreaterThan(0);
  });

  test("the existing three learning areas keep one age per statement", () => {
    for (const s of inSubjects(OLD_SUBJECTS)) expect(s.ages.length, s.id).toBe(1);
  });
});

test.describe("what is in the file and what is not", () => {
  test("no Languages statement", () => {
    for (const s of ALL) {
      expect(OLD_SUBJECTS.concat(NEW_SUBJECTS), s.id).toContain(s.subject);
      expect(s.code, s.id).not.toMatch(/^AC9L/);
    }
    for (const lang of ["French", "Japanese", "Auslan", "Latin", "Arabic", "Chinese"]) expect(ALL.some((s) => s.subject === lang)).toBe(false);
    expect(ALL.some((s) => /Languages|Latin|Auslan|Aboriginal and Torres Strait Islander Languages/.test(s.subject))).toBe(false);
  });

  test("no elaboration: every code is a content description code, with no suffix", () => {
    for (const s of ALL) {
      expect(s.code, s.id).toMatch(/^AC9[A-Z]+\w*\d$/);
      expect(s.code, s.id).not.toContain("_");
      expect(s.id, s.id).toBe(`ac9-${s.code.toLowerCase()}`);
    }
    expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
  });

  test("the subject names: no 'HASS F-6', no '7-10', exactly the expected set", () => {
    const subjects = [...new Set(ALL.map((s) => s.subject))];
    for (const s of subjects) {
      expect(s).not.toBe("HASS F-6");
      expect(s).not.toMatch(/7-10$/);
      expect(s).not.toMatch(/F-6/);
    }
    expect([...subjects].sort()).toEqual([...OLD_SUBJECTS, ...NEW_SUBJECTS].sort());
  });

  test("the source names the learning areas, says Languages are left out, and keeps the credit", () => {
    expect(DATA.source.title).not.toBe("Australian Curriculum v9.0 (English, Mathematics, Science)");
    for (const word of ["English", "Mathematics", "Science", "Humanities and Social Sciences", "The Arts", "Technologies", "Health and Physical Education"]) {
      expect(DATA.source.title, word).toContain(word);
    }
    expect(DATA.source.title).toMatch(/Languages are not included/);
    expect(DATA.source.title).toMatch(/^Australian Curriculum v9\.0/);
    expect(DATA.source.credit).toBe(FRAMEWORK_CREDIT.ac9);
    expect(DATA.source.credit).toContain("CC BY 4.0");
    expect(DATA.source.credit).toContain("accessed 15 November 2026");
  });

  test("no em or en dash anywhere in the file", () => {
    expect(JSON.stringify(DATA)).not.toMatch(/[\u2013\u2014]/);
  });
});

test.describe("every year has the learning areas that apply to it", () => {
  const at = (age: number) => statementsForAge([DATA], age);
  const subjectsAt = (age: number) => new Set(at(age).map((s) => s.subject));

  test("Humanities and Social Sciences covers Foundation to Year 6 (ages 5 to 11)", () => {
    for (let age = 5; age <= 11; age++) expect(subjectsAt(age).has("Humanities and Social Sciences"), `age ${age}`).toBe(true);
    for (let age = 12; age <= 15; age++) expect(subjectsAt(age).has("Humanities and Social Sciences"), `age ${age}`).toBe(false);
  });

  test("History, Geography, Civics and Citizenship, Economics and Business cover Years 7 to 10 (ages 12 to 15) and nothing earlier", () => {
    for (const subject of ["History", "Geography", "Civics and Citizenship", "Economics and Business"]) {
      for (let age = 12; age <= 15; age++) expect(subjectsAt(age).has(subject), `${subject} age ${age}`).toBe(true);
      for (let age = 5; age <= 11; age++) expect(subjectsAt(age).has(subject), `${subject} age ${age}`).toBe(false);
    }
  });

  test("every Arts, Technologies and Health and Physical Education subject covers every age from 5 to 15", () => {
    for (const subject of [...ARTS_SUBJECTS, ...TECH_SUBJECTS, ...HPE_SUBJECTS]) {
      for (let age = 5; age <= 15; age++) expect(subjectsAt(age).has(subject), `${subject} age ${age}`).toBe(true);
    }
  });

  test("English, Mathematics and Science still cover every age", () => {
    for (const subject of OLD_SUBJECTS) for (let age = 5; age <= 15; age++) expect(subjectsAt(age).has(subject), `${subject} age ${age}`).toBe(true);
  });
});

test.describe("strands belong to their own subject", () => {
  const strandsOf = (subject: string, age: number) => new Set(inSubjects([subject]).filter((s) => s.ages.includes(age)).map((s) => s.strand));

  test("History and Geography in Year 7 share no strand", () => {
    const history = strandsOf("History", 12);
    const geography = strandsOf("Geography", 12);
    expect(history.size).toBeGreaterThan(2);
    expect(geography.size).toBeGreaterThan(2);
    expect(history.has("Knowledge and understanding: Deep time history of Australia")).toBe(true);
    expect(geography.has("Knowledge and understanding: Water in the world")).toBe(true);
    expect([...history].some((h) => /Water in the world|Place and liveability/.test(h))).toBe(false);
    expect([...geography].some((g) => /Deep time|ancient world|historical sources/i.test(g))).toBe(false);
  });

  test("Design and Technologies and Digital Technologies in Years 3 and 4 keep their own strands", () => {
    const design = strandsOf("Design and Technologies", 8);
    const digital = strandsOf("Digital Technologies", 8);
    expect([...design].some((s) => /Privacy and security|Data representation|Digital systems/.test(s))).toBe(false);
    expect([...digital].some((s) => /Technologies context|Technologies and society/.test(s))).toBe(false);
    expect(design.has("Knowledge and understanding: Technologies and society")).toBe(true);
    expect(digital.has("Knowledge and understanding: Data representation")).toBe(true);
    expect(digital.has("Processes and production skills: Privacy and security")).toBe(true);
  });

  test("Dance and Music in Years 3 and 4: each statement has the strand the workbook gives it", () => {
    const dance = ALL.find((s) => s.code === "AC9ADA4E01")!;
    const music = ALL.find((s) => s.code === "AC9AMU4E01")!;
    expect(dance.subject).toBe("Dance");
    expect(dance.strand).toBe("Exploring and responding");
    expect(music.subject).toBe("Music");
    expect(music.strand).toBe("Exploring and responding");
    expect(ALL.find((s) => s.code === "AC9ADA4P01")!.strand).toBe("Presenting and performing");
    // The last Dance strand of the band must not leak into the first Music row.
    expect(ALL.find((s) => s.code === "AC9AMU4E02")!.strand).toBe("Exploring and responding");
  });

  test("every statement of every new subject agrees with the workbook's own strand rows", async () => {
    const path = "docs/standards/AC9_curriculum_workbook.xlsx";
    test.skip(!existsSync(path), `${path} is missing from this checkout`);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(readFileSync(path));
    const shared = [...(await zip.file("xl/sharedStrings.xml")!.async("string")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
    );
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    // The strand in force for a content row is the last strand row of the SAME
    // subject and level above it (the sheet repeats the strand rows per subject).
    const current = new Map<string, { strand: string; sub: string }>();
    const expected = new Map<string, string>();
    const languageCodes = new Set<string>();
    for (const r of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: Record<string, string> = {};
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const inline = c[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        cells[c[1]] = unesc(/t="s"/.test(c[2]) && v !== undefined ? shared[Number(v)] : (inline ?? v ?? ""));
      }
      const key = `${cells.A}|${cells.B}|${cells.C}`;
      if (cells.H) current.set(key, { strand: cells.H, sub: "" });
      if (cells.I) current.set(key, { ...(current.get(key) ?? { strand: "", sub: "" }), sub: cells.I });
      const isContent = /^AC9[A-Z]+\w*\d$/.test(cells.E ?? "") && cells.J && !cells.K;
      if (!isContent) continue;
      if (cells.A === "Languages") {
        languageCodes.add(cells.E);
        continue;
      }
      const w = current.get(key) ?? { strand: "", sub: "" };
      expected.set(cells.E, [w.strand, w.sub].filter(Boolean).join(": "));
    }
    expect(languageCodes.size).toBe(1283);
    // The file holds exactly the non-Languages content descriptions.
    expect(new Set(ALL.map((s) => s.code))).toEqual(new Set(expected.keys()));
    const wrong = ALL.filter((s) => s.strand !== expected.get(s.code)!.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim()).map((s) => `${s.code}: ${s.strand} / ${expected.get(s.code)}`);
    expect(wrong).toEqual([]);
    for (const c of languageCodes) expect(ALL.some((s) => s.code === c)).toBe(false);
  });
});

test.describe("the topic matcher reaches the new subjects", () => {
  const year = (age: number): Statement[] => statementsForAge([DATA], age);
  const picked = (age: number, typed: string) => [...new Set(filterBySubject(year(age), typed).map((s) => s.subject))].sort();
  const YEAR5 = 10;
  const YEAR8 = 13;

  test("PE, P.E., physical education, sport: Health and Physical Education", () => {
    for (const typed of ["PE", "P.E.", "pe", "Physical Education", "physical education", "sport"]) {
      expect(picked(YEAR5, typed), typed).toEqual(["Health and Physical Education"]);
      expect(picked(YEAR8, typed), typed).toEqual(["Health and Physical Education"]);
    }
  });

  test("health and wellbeing words reach Health and Physical Education too", () => {
    for (const typed of ["health", "Health", "wellbeing"]) expect(picked(YEAR5, typed), typed).toEqual(["Health and Physical Education"]);
  });

  test("Geography selects Geography and not History, from Year 7; before that it is the one HASS subject", () => {
    expect(picked(YEAR8, "Geography")).toEqual(["Geography"]);
    expect(picked(YEAR8, "geography")).toEqual(["Geography"]);
    expect(picked(YEAR8, "History")).toEqual(["History"]);
    expect(picked(YEAR5, "Geography")).toEqual(["Humanities and Social Sciences"]);
    expect(picked(YEAR5, "history")).toEqual(["Humanities and Social Sciences"]);
  });

  test("HASS and humanities: the one primary subject, or all four secondary ones", () => {
    for (const typed of ["HASS", "hass", "Humanities", "humanities", "Humanities and Social Sciences"]) {
      expect(picked(YEAR5, typed), typed).toEqual(["Humanities and Social Sciences"]);
      expect(picked(YEAR8, typed), typed).toEqual(["Civics and Citizenship", "Economics and Business", "Geography", "History"]);
    }
  });

  test("civics, citizenship, economics, business", () => {
    expect(picked(YEAR8, "Civics")).toEqual(["Civics and Citizenship"]);
    expect(picked(YEAR8, "citizenship")).toEqual(["Civics and Citizenship"]);
    expect(picked(YEAR8, "Economics")).toEqual(["Economics and Business"]);
    expect(picked(YEAR8, "Business")).toEqual(["Economics and Business"]);
    expect(picked(YEAR5, "Civics")).toEqual(["Humanities and Social Sciences"]);
    expect(picked(YEAR5, "Economics")).toEqual(["Humanities and Social Sciences"]);
  });

  test("art and visual art select Visual Arts; music selects Music; drama and dance their own; media Media Arts", () => {
    expect(picked(YEAR5, "art")).toEqual(["Visual Arts"]);
    expect(picked(YEAR5, "Art")).toEqual(["Visual Arts"]);
    expect(picked(YEAR5, "visual art")).toEqual(["Visual Arts"]);
    expect(picked(YEAR5, "Visual Arts")).toEqual(["Visual Arts"]);
    expect(picked(YEAR5, "music")).toEqual(["Music"]);
    expect(picked(YEAR5, "Music")).toEqual(["Music"]);
    expect(picked(YEAR5, "drama")).toEqual(["Dance", "Drama"]);
    expect(picked(YEAR5, "dance")).toEqual(["Dance", "Drama"]);
    expect(picked(YEAR5, "media")).toEqual(["Media Arts"]);
    expect(picked(YEAR5, "Media Arts")).toEqual(["Media Arts"]);
  });

  test("digital technologies, digital tech and coding select Digital Technologies only", () => {
    for (const typed of ["digital technologies", "Digital Technologies", "digital tech", "digital technology", "coding", "computing", "programming"]) {
      expect(picked(YEAR5, typed), typed).toEqual(["Digital Technologies"]);
    }
  });

  test("design and technology, D&T and technology select Design and Technologies only", () => {
    for (const typed of ["design and technology", "Design and Technologies", "D&T", "d&t", "technology"]) {
      expect(picked(YEAR5, typed), typed).toEqual(["Design and Technologies"]);
    }
  });

  test("the old three are not widened: Science is not Humanities and Social Sciences", () => {
    for (const age of [YEAR5, YEAR8]) {
      expect(picked(age, "Science")).toEqual(["Science"]);
      expect(picked(age, "Sciences")).toEqual(["Science"]);
      expect(picked(age, "Maths")).toEqual(["Mathematics"]);
      expect(picked(age, "English")).toEqual(["English"]);
    }
  });

  test("the topic can name the subject when the subject box is empty", () => {
    expect(filterBySubject(year(YEAR8), "", "The ancient world").length).toBe(year(YEAR8).length);
    expect([...new Set(filterBySubject(year(YEAR5), undefined, "Music and rhythm").map((s) => s.subject))]).toEqual(["Music"]);
  });

  test("an unknown subject still falls back to every statement, which the cap then holds down", () => {
    const all = year(YEAR8);
    expect(all.length).toBeGreaterThan(69);
    for (const typed of ["Underwater basket weaving", "", "   ", undefined, null]) expect(filterBySubject(all, typed), String(typed)).toEqual(all);
    expect(matchingSubjects("Latin", [...new Set(all.map((s) => s.subject))])).toEqual([]);
  });

  test("other curricula are unaffected: a US, a Scottish, a Northern Irish and an English subject behave as before", () => {
    const us = statementsForAge([ccssMath as FrameworkData], 8);
    expect([...new Set(filterBySubject(us, "Math").map((s) => s.subject))]).toEqual(["Mathematics"]);
    const scot = statementsForAge([cfeThirdFourth as FrameworkData], 12);
    expect([...new Set(filterBySubject(scot, "Maths").map((s) => s.subject))]).toEqual(["Numeracy and mathematics"]);
    expect([...new Set(filterBySubject(scot, "PE").map((s) => s.subject))]).toEqual(["Health and wellbeing"]);
    const ni = statementsForAge([nicKs3 as FrameworkData], 12);
    expect([...new Set(filterBySubject(ni, "Music").map((s) => s.subject))]).toEqual(["The Arts"]);
    const eng = (primary as { statements: (Pick<Statement, "id" | "subject" | "strand" | "text"> & { years: unknown[] })[] }).statements.filter((s) => s.years.includes(4));
    expect([...new Set(filterBySubject(eng, "Art").map((s) => s.subject))]).toEqual(["Art and design"]);
    expect([...new Set(filterBySubject(eng, "Digital technology").map((s) => s.subject))]).toEqual(["Design and technology"]);
  });
});
