import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

import { getCurriculum } from "@/app/lib/curricula";
import {
  FRAMEWORK_AGES,
  FRAMEWORK_CREDIT,
  FRAMEWORK_LANGUAGE_NOTE,
  FRAMEWORK_PERMITTED,
  alignmentMode,
  alignmentYears,
  frameworkOf,
  frameworksForYear,
  statementsForAge,
  type FrameworkData,
} from "@/app/lib/standards";
import { alignParamFor } from "@/app/lib/standards/align";
import { MAX_CANDIDATES, capCandidates, filterBySubject, matchingSubjects } from "@/app/lib/standards/suggest";
import { curriculumPromptBlock, worksheetCurriculumRules } from "@/app/lib/national-curriculum/prompt";
import noLk20 from "@/app/lib/standards/data/no-lk20.json";

/*
 * Norway: the LK20 competence aims (Udir), under NLOD, in Udir's own English
 * text from Grep. Built by scripts/build-asia-standards.mjs --country=norway
 * from the snapshot scripts/fetch-norway-grep.mjs saved
 * (docs/standards/norway/grep-snapshot.json). Official text only (owner,
 * 2026-11-28): Udir publishes English for all four core subjects.
 *
 * Checked here: every aim of every set in the snapshot is a statement, word
 * for word, at the ages its set's title gives; the plans are the ones in
 * force; counts; strands; and how the curriculum, the card, the matcher and
 * the prompt use it.
 *
 * No en or em dash is written in this file.
 */

const NO = noLk20 as FrameworkData;
type Text = { tekst?: { spraak: string; verdi: string }[] } | { spraak: string; verdi: string }[];
type Ref = { kode: string };
type Snapshot = {
  fetched: string;
  plans: Record<string, { status: string; tittel: Text; gyldighetsperiode: { "gyldig-fra": { dato?: string } | null }; "kompetansemaal-kapittel": { kompetansemaalsett: Ref[] } }>;
  sets: Record<string, { kode: string; tittel: Text; kompetansemaal: Ref[] }>;
  aims: Record<string, { kode: string; tittel: Text }>;
};
const SNAP = JSON.parse(readFileSync("docs/standards/norway/grep-snapshot.json", "utf8")) as Snapshot;
const say = (x: Text, lang: string) => (Array.isArray(x) ? x : (x.tekst ?? [])).find((v) => v.spraak === lang)?.verdi;
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
const byText = (t: string) => NO.statements.find((s) => s.text === t);

test.describe("Norway: the data", () => {
  test("ids are the Grep aim codes, unique, and name the framework", () => {
    const ids = NO.statements.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^no-lk20-km[0-9]+$/);
      expect(frameworkOf(id)).toBe("no-lk20");
    }
  });

  test("the snapshot holds the plans in force from 2026-08-01, not the ones they replaced", () => {
    expect(Object.keys(SNAP.plans).sort()).toEqual(["ENG01-06", "MAT01-06", "MAT05-04", "MAT06-04", "MAT08-01", "MAT09-02", "NAT01-05", "NOR01-08"]);
    for (const [code, plan] of Object.entries(SNAP.plans)) expect(plan.status, code).toMatch(/status_publisert$/);
    for (const code of ["NOR01-08", "MAT01-06", "NAT01-05", "ENG01-06", "MAT09-02"]) {
      expect(JSON.stringify(SNAP.plans[code].gyldighetsperiode["gyldig-fra"]), code).toContain("2026-08-01");
    }
  });

  test("every aim of every set is a statement, in Udir's English word for word, and nothing else is", () => {
    const expected = new Map<string, string>();
    for (const plan of Object.values(SNAP.plans)) {
      for (const ref of plan["kompetansemaal-kapittel"].kompetansemaalsett) {
        for (const a of SNAP.sets[ref.kode].kompetansemaal) {
          const aim = SNAP.aims[a.kode];
          // Each is an aim of the regulation: it has its Norwegian text too.
          expect(say(aim.tittel, "nob"), a.kode).toBeTruthy();
          expect(say(aim.tittel, "eng"), a.kode).toBeTruthy();
          expected.set(`no-lk20-${a.kode.toLowerCase()}`, say(aim.tittel, "eng")!.replace(/\s+/g, " ").trim());
        }
      }
    }
    expect(NO.statements.length).toBe(expected.size);
    for (const s of NO.statements) expect(s.text, s.id).toBe(expected.get(s.id));
  });

  test("every statement is in a core subject, with text, no code, and ages the framework covers", () => {
    for (const s of NO.statements) {
      expect(["Norwegian", "Mathematics", "Science", "English"]).toContain(s.subject);
      expect(s.code).toBe("");
      expect(s.text.length).toBeGreaterThan(10);
      expect(s.strand).not.toBe("");
      for (const a of s.ages) expect(FRAMEWORK_AGES["no-lk20"]).toContain(a);
      expect(s.text, s.id).not.toMatch(DASHES);
      expect(s.text, s.id).not.toMatch(/\s{2,}|^\s|\s$/);
    }
  });

  test("ages come from the set titles: each set covers the years since the one before; Vg1 = 16", () => {
    const agesOf = (setCode: string) => {
      const ids = SNAP.sets[setCode].kompetansemaal.map((a) => `no-lk20-${a.kode.toLowerCase()}`);
      return [...new Set(NO.statements.filter((s) => ids.includes(s.id)).map((s) => s.ages.join(",")))];
    };
    // Norwegian after Years 2, 4, 7, 10.
    expect(agesOf("KV1107")).toEqual(["6,7"]);
    expect(agesOf("KV1108")).toEqual(["8,9"]);
    expect(agesOf("KV1109")).toEqual(["10,11,12"]);
    expect(agesOf("KV1110")).toEqual(["13,14,15"]);
    // Maths has a set every year from Year 3.
    expect(agesOf("KV1021")).toEqual(["6,7"]);
    expect(agesOf("KV1022")).toEqual(["8"]);
    expect(agesOf("KV1029")).toEqual(["15"]);
    // Science's Year 4 set: Grep says "used in Years 4 and 5", which would
    // leave Year 3 with no science; its title (the regulation) says Year 4.
    expect(agesOf("KV1076")).toEqual(["8,9"]);
    // Upper secondary.
    expect(agesOf("KV1113")).toEqual(["16"]);
    expect(agesOf("KV1112")).toEqual(["17"]);
    expect(agesOf("KV1114")).toEqual(["18"]);
    expect(agesOf("KV979")).toEqual(["16"]);
    expect(agesOf("KV46")).toEqual(["17"]);
    // A shifted band would fail: Year 5's fractions aim is age 10 only.
    expect(byText("use numbers, drawings, and tangible objects to describe and explore the relationships between fractions, decimals, and percentages")!.ages).toEqual([10]);
  });

  test("counts per subject and age are pinned to the snapshot", () => {
    const c: Record<string, Record<number, number>> = {};
    for (const s of NO.statements) for (const a of s.ages) ((c[s.subject] ??= {})[a] = (c[s.subject][a] ?? 0) + 1);
    expect(NO.statements.length).toBe(592);
    expect(c).toEqual({
      Norwegian: { 6: 14, 7: 14, 8: 16, 9: 16, 10: 17, 11: 17, 12: 17, 13: 16, 14: 16, 15: 16, 16: 13, 17: 22, 18: 29 },
      Mathematics: { 6: 15, 7: 15, 8: 12, 9: 10, 10: 10, 11: 11, 12: 11, 13: 10, 14: 11, 15: 11, 16: 86, 17: 7, 18: 10 },
      Science: { 6: 10, 7: 10, 8: 17, 9: 17, 10: 21, 11: 21, 12: 21, 13: 22, 14: 22, 15: 22, 16: 86, 18: 10 },
      English: { 6: 11, 7: 11, 8: 15, 9: 15, 10: 16, 11: 16, 12: 16, 13: 19, 14: 19, 15: 19, 16: 34 },
    });
  });

  test("strands: core elements in Years 1 to 10, the course or programme in upper secondary", () => {
    const strands = (subject: string, age: number) => [...new Set(statementsForAge([NO], age).filter((s) => s.subject === subject).map((s) => s.strand))].sort();
    expect(strands("Science", 13)).toEqual(["Body and health", "Earth and life on Earth", "Natural-science practices and approaches", "Technology"]);
    expect(strands("English", 10)).toEqual(["Communication", "Language learning", "Working with texts in English"]);
    // Vg1 maths: 1P, its ten vocational versions, and T.
    const vg1 = strands("Mathematics", 16);
    expect(vg1).toContain("Mathematics 1P");
    expect(vg1).toContain("Mathematics vg1 theoretical (Mathematics T)");
    expect(vg1).toContain("Mathematics 1P-Y for Building and Construction");
    expect(vg1).toHaveLength(12);
    expect(strands("Norwegian", 17)).toEqual(["Vg2 programmes for general studies", "Vg2 vocational education programmes"]);
  });

  test("the file carries the credit NLOD asks for, and says the aims are edited excerpts", () => {
    expect(NO.source.credit).toBe(FRAMEWORK_CREDIT["no-lk20"]);
    expect(FRAMEWORK_CREDIT["no-lk20"]).toContain("Contains data under NLOD");
    expect(FRAMEWORK_CREDIT["no-lk20"]).toContain("made available on data.udir.no");
    expect(FRAMEWORK_CREDIT["no-lk20"]).toContain("edited");
    expect(FRAMEWORK_CREDIT["no-lk20"]).not.toMatch(DASHES);
  });
});

test.describe("Norway: the curriculum uses it", () => {
  test("Norway aligns to LK20, permitted, at every year it lists", () => {
    const c = getCurriculum("norway")!;
    expect(c.alignment).toEqual({ frameworks: ["no-lk20"], adapted: false });
    expect(FRAMEWORK_PERMITTED["no-lk20"]).toBe(true);
    expect(alignmentMode("norway")).toBe("standards");
    expect(alignmentYears(c).map((y) => y.label)).toEqual(c.years.map((y) => y.label));
    expect(frameworksForYear(c, "Grade 1")).toEqual(["no-lk20"]);
  });

  test("each year has the subjects LK20 sets aims for there", () => {
    const c = getCurriculum("norway")!;
    const four = ["English", "Mathematics", "Norwegian", "Science"];
    const expected: Record<string, string[]> = { Vg1: four, Vg2: ["Mathematics", "Norwegian"], Vg3: ["Mathematics", "Norwegian", "Science"] };
    for (const y of c.years) {
      const subjects = [...new Set(statementsForAge([NO], y.age).map((s) => s.subject))].sort();
      expect(subjects, y.label).toEqual(expected[y.label] ?? four);
    }
    expect(c.years.find((y) => y.label === "Grade 1")?.age).toBe(6);
    expect(c.years.find((y) => y.label === "Vg1")?.age).toBe(16);
  });

  test("the card sends the ticked aims and names the curricula", () => {
    const picked = statementsForAge([NO], 10).filter((s) => s.subject === "Mathematics").slice(0, 2);
    const p = alignParamFor("norway", true, "Grade 5", { subject: "", strand: "" }, picked)!;
    expect(p).toMatchObject({ countryName: "Norway", year: "Grade 5", subject: "Mathematics" });
    expect(p.curriculumName).toBe("LK20 curricula (Udir)");
    expect(p.statements.map((s) => s.id)).toEqual(picked.map((s) => s.id));
    expect(p.statements.map((s) => s.text)).toEqual(picked.map((s) => s.text));
  });

  test("with permission off, nothing is listed or sent", () => {
    const saved = FRAMEWORK_PERMITTED["no-lk20"];
    (FRAMEWORK_PERMITTED as Record<string, boolean>)["no-lk20"] = false;
    try {
      expect(alignmentMode("norway")).toBe("none");
      expect(alignParamFor("norway", true, "Grade 5", { subject: "", strand: "" }, statementsForAge([NO], 10).slice(0, 1))).toBeUndefined();
    } finally {
      (FRAMEWORK_PERMITTED as Record<string, boolean>)["no-lk20"] = saved;
    }
  });

  test("the aims are in English, so the card has no language note", () => {
    expect(FRAMEWORK_LANGUAGE_NOTE["no-lk20"]).toBeUndefined();
  });

  test("the terms page credits it", () => {
    expect(readFileSync("app/terms/page.tsx", "utf8")).toMatch(/FRAMEWORK_CREDIT\["no-lk20"\]/);
  });
});

test.describe("Norway: the topic matcher", () => {
  const g5 = statementsForAge([NO], 10);
  const subjects = [...new Set(g5.map((s) => s.subject))];

  test("a typed subject picks its subject, in English or in Norwegian", () => {
    expect(matchingSubjects("Maths", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("matematikk", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("Norwegian", subjects)).toEqual(["Norwegian"]);
    expect(matchingSubjects("Norsk", subjects)).toEqual(["Norwegian"]);
    expect(matchingSubjects("Science", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("naturfag", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("English", subjects)).toEqual(["English"]);
    expect(matchingSubjects("engelsk", subjects)).toEqual(["English"]);
  });

  test("elsewhere, Norwegian finds no Norwegian subject", () => {
    expect(matchingSubjects("Norwegian", ["Languages", "Mathematics"])).toEqual([]);
  });

  test("an English topic shares words with the aims and gets a capped list of the subject", () => {
    const list = capCandidates(filterBySubject(statementsForAge([NO], 16), "Maths", "percentages"), "percentages");
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(list.every((s) => s.subject === "Mathematics")).toBe(true);
  });

  test("English aims add no own-language line to the prompt", () => {
    const block = curriculumPromptBlock(
      { curriculumName: "LK20 curricula (Udir)", subject: "Mathematics", statements: [{ text: NO.statements[0].text }] },
      "Grade 5",
      "worksheet",
      worksheetCurriculumRules("Grade 5"),
    );
    expect(block).not.toContain("own language");
  });
});
