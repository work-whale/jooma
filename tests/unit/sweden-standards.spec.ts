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
import seLgr22 from "@/app/lib/standards/data/se-lgr22.json";
import seGy25 from "@/app/lib/standards/data/se-gy25.json";

/*
 * Sweden: Skolverket's syllabuses, central content (centralt innehåll), in
 * Skolverket's Swedish from the Syllabus API (CC0 1.0). Built by
 * scripts/build-asia-standards.mjs --country=sweden from the snapshot
 * scripts/fetch-sweden-syllabus.mjs saved (docs/standards/sweden/
 * syllabus-snapshot.json). Official text only (owner, 2026-11-28): no
 * official English is online, so the statements are Swedish.
 *
 * Checked here: every central content item in the snapshot is a statement,
 * word for word (soft hyphens removed), and nothing else is; the Years 1 to 3
 * science text is listed once; ages; counts; strands; and how the curriculum,
 * the card, the matcher and the prompt use it.
 *
 * No en or em dash is written in this file.
 */

const GR = seLgr22 as FrameworkData;
const GY = seGy25 as FrameworkData;
const ALL = [...GR.statements, ...GY.statements];
type Subject = {
  name: string;
  typeOfSyllabus: string;
  reform?: string;
  startDate: string;
  endDate?: string;
  centralContents?: { year: string; text: string }[];
  courses?: { code: string; name: string; centralContent: { text: string } }[];
};
const SNAP = JSON.parse(readFileSync("docs/standards/sweden/syllabus-snapshot.json", "utf8")) as { fetched: string; subjects: Record<string, Subject> };
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, "g");
// The source's own words: tags and soft hyphens out, whitespace tidied, a
// dash a hyphen (the brand rule).
const plain = (html: string) => html.replace(/­/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().replace(DASHES, "-");
const items = (html: string) => [...html.matchAll(/<li>([^]*?)<\/li>/g)].map((m) => plain(m[1]));
const byText = (t: string) => ALL.filter((s) => s.text === t);

test.describe("Sweden: the data", () => {
  test("ids are unique and name their framework", () => {
    const ids = ALL.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of GR.statements) expect(frameworkOf(s.id)).toBe("se-lgr22");
    for (const s of GY.statements) expect(frameworkOf(s.id)).toBe("se-gy25");
    for (const id of ids) expect(id).toMatch(/^se-(lgr22|gy25)-[0-9a-f]{10}$/);
  });

  test("the snapshot holds the syllabuses in force: Lgr22 course syllabuses and the GY25 grade-subject syllabuses", () => {
    const codes = Object.keys(SNAP.subjects).sort();
    expect(codes).toEqual(["BIOG", "ENGE", "FYSK", "GRGRBIO01", "GRGRENG01", "GRGRFYS01", "GRGRKEM01", "GRGRMAT01", "GRGRSVE01", "KEMI", "MATE", "NATU", "SVEN"]);
    for (const [code, s] of Object.entries(SNAP.subjects)) {
      expect(s.endDate, code).toBeUndefined();
      if (code.startsWith("GR")) expect(s.typeOfSyllabus, code).toBe("COURSE_SYLLABUS");
      else {
        expect(s.typeOfSyllabus, code).toBe("GRADE_SUBJECT_SYLLABUS");
        expect(s.reform, code).toBe("GY25");
      }
    }
  });

  test("every central content item is a statement, word for word, and nothing else is", () => {
    // Compulsory school: each band's items; Years 1 to 3 science once.
    const gr: string[] = [];
    const seenNo = new Set<string>();
    for (const [code, s] of Object.entries(SNAP.subjects)) {
      if (!code.startsWith("GR")) continue;
      const science = /BIO|FYS|KEM/.test(code);
      for (const b of s.centralContents!) {
        for (const t of items(b.text)) {
          if (science && b.year === "1-3") {
            if (seenNo.has(t)) continue;
            seenNo.add(t);
          }
          gr.push(t);
        }
      }
    }
    expect(GR.statements.map((s) => s.text).sort()).toEqual(gr.sort());
    const gy = Object.entries(SNAP.subjects)
      .filter(([code]) => !code.startsWith("GR"))
      .flatMap(([, s]) => s.courses!.flatMap((c) => items(c.centralContent.text)));
    expect(GY.statements.map((s) => s.text).sort()).toEqual(gy.sort());
  });

  test("the Years 1 to 3 science text is the same in biology, physics and chemistry, and listed once", () => {
    const of = (code: string) => items(SNAP.subjects[code].centralContents!.find((b) => b.year === "1-3")!.text);
    expect(of("GRGRFYS01")).toEqual(of("GRGRBIO01"));
    expect(of("GRGRKEM01")).toEqual(of("GRGRBIO01"));
    for (const t of of("GRGRBIO01")) expect(byText(t), t).toHaveLength(1);
  });

  test("every statement is in a core subject, Swedish text, tidy, no code, ages the framework covers", () => {
    for (const [fw, d] of [["se-lgr22", GR], ["se-gy25", GY]] as const) {
      for (const s of d.statements) {
        expect(["Swedish", "Mathematics", "Science", "English"]).toContain(s.subject);
        expect(s.code).toBe("");
        expect(s.text.length).toBeGreaterThan(5);
        expect(s.strand).not.toBe("");
        for (const a of s.ages) expect(FRAMEWORK_AGES[fw]).toContain(a);
        expect(s.text, s.id).not.toMatch(DASHES);
        expect(s.text, s.id).not.toMatch(/­|<|>|&[a-z]+;|\s{2,}|^\s|\s$/);
      }
    }
  });

  test("ages: Years 1 to 3 = 7 to 9, 4 to 6 = 10 to 12, 7 to 9 = 13 to 15; every upper secondary level = 16 to 18", () => {
    // A few items recur word for word in a later band (each band restates
    // them); each copy is its own statement. So: every item of a band has a
    // statement at that band's ages.
    const agesOf = (code: string, year: string) => {
      const texts = items(SNAP.subjects[code].centralContents!.find((b) => b.year === year)!.text);
      const want = { "1-3": "7,8,9", "4-6": "10,11,12", "7-9": "13,14,15" }[year]!;
      return [...new Set(texts.map((t) => (byText(t).some((s) => s.ages.join(",") === want) ? want : `missing: ${t}`)))];
    };
    expect(agesOf("GRGRMAT01", "1-3")).toEqual(["7,8,9"]);
    expect(agesOf("GRGRMAT01", "4-6")).toEqual(["10,11,12"]);
    expect(agesOf("GRGRMAT01", "7-9")).toEqual(["13,14,15"]);
    expect(agesOf("GRGRBIO01", "1-3")).toEqual(["7,8,9"]);
    expect([...new Set(GY.statements.map((s) => s.ages.join(",")))]).toEqual(["16,17,18"]);
    // A shifted band would fail: percentages first come in Years 4 to 6.
    expect(byText("Tal i procentform och deras samband med tal i bråk- och decimalform.").map((s) => s.ages)).toEqual([[10, 11, 12]]);
  });

  test("counts per subject and age are pinned to the snapshot", () => {
    const count = (d: FrameworkData) => {
      const c: Record<string, Record<number, number>> = {};
      for (const s of d.statements) for (const a of s.ages) ((c[s.subject] ??= {})[a] = (c[s.subject][a] ?? 0) + 1);
      return c;
    };
    expect(GR.statements.length).toBe(271);
    expect(GY.statements.length).toBe(356);
    const band = (a: number, b: number, c: number) => ({ 7: a, 8: a, 9: a, 10: b, 11: b, 12: b, 13: c, 14: c, 15: c });
    expect(count(GR)).toEqual({ Swedish: band(22, 21, 25), Mathematics: band(22, 27, 28), English: band(11, 18, 16), Science: band(13, 33, 35) });
    const up = (n: number) => ({ 16: n, 17: n, 18: n });
    expect(count(GY)).toEqual({ Swedish: up(29), Mathematics: up(111), English: up(58), Science: up(158) });
  });

  test("strands: the syllabus's headings, after the science subject or the level", () => {
    const strands = (d: FrameworkData, subject: string, age: number) => [...new Set(statementsForAge([d], age).filter((s) => s.subject === subject).map((s) => s.strand))];
    expect(strands(GR, "Mathematics", 10)).toEqual(["Taluppfattning och tals användning", "Algebra", "Geometri", "Sannolikhet och statistik", "Samband och förändring", "Problemlösning"]);
    expect(strands(GR, "Science", 8)).toEqual(["Året runt i naturen", "Kropp och hälsa", "Kraft och rörelse", "Material och ämnen", "Systematiska undersökningar"]);
    expect(strands(GR, "Science", 13)).toContain("Fysik: Fysiken i naturen och samhället");
    expect(strands(GR, "English", 13)).toContain("Lyssna och läsa - reception");
    expect(strands(GY, "Swedish", 16)).toEqual(["Svenska nivå 1", "Svenska nivå 2", "Svenska nivå 3"]);
    const maths = strands(GY, "Mathematics", 17);
    expect(maths).toContain("Matematik nivå 1c: Trigonometri och vektorer");
    expect(maths).toHaveLength(30);
    // A heading split by markup in the source is joined.
    expect(strands(GY, "Science", 16)).toContain("Fysik nivå 1a1: Fysikens arbetsmetoder");
    // Lead-ins are not statements.
    for (const s of ALL) expect(s.text, s.id).not.toMatch(/^Undervisningen /);
  });

  test("the files carry the credits, which name Skolverket and CC0 and say the items are edited", () => {
    for (const [fw, d] of [["se-lgr22", GR], ["se-gy25", GY]] as const) {
      expect(d.source.credit).toBe(FRAMEWORK_CREDIT[fw]);
      expect(FRAMEWORK_CREDIT[fw]).toContain("Skolverket");
      expect(FRAMEWORK_CREDIT[fw]).toContain("CC0 1.0");
      expect(FRAMEWORK_CREDIT[fw]).toContain("edited");
      expect(FRAMEWORK_CREDIT[fw]).not.toMatch(DASHES);
    }
  });
});

test.describe("Sweden: the curriculum uses it", () => {
  test("Sweden aligns to both, permitted, at every year but the preschool class", () => {
    const c = getCurriculum("sweden")!;
    expect(c.alignment).toEqual({ frameworks: ["se-lgr22", "se-gy25"], adapted: false });
    expect(FRAMEWORK_PERMITTED["se-lgr22"]).toBe(true);
    expect(FRAMEWORK_PERMITTED["se-gy25"]).toBe(true);
    expect(alignmentMode("sweden")).toBe("standards");
    expect(alignmentYears(c).map((y) => y.label)).toEqual(c.years.map((y) => y.label).filter((l) => l !== "Preschool class"));
    expect(frameworksForYear(c, "Preschool class")).toEqual([]);
    expect(frameworksForYear(c, "Grade 1")).toEqual(["se-lgr22"]);
    expect(frameworksForYear(c, "Grade 9")).toEqual(["se-lgr22"]);
    expect(frameworksForYear(c, "Upper Secondary 1")).toEqual(["se-gy25"]);
  });

  test("each year it covers has all four subjects", () => {
    const c = getCurriculum("sweden")!;
    for (const y of alignmentYears(c)) {
      const subjects = [...new Set(statementsForAge([GR, GY], y.age).map((s) => s.subject))].sort();
      expect(subjects, y.label).toEqual(["English", "Mathematics", "Science", "Swedish"]);
    }
    expect(c.years.find((y) => y.label === "Grade 1")?.age).toBe(7);
    expect(c.years.find((y) => y.label === "Upper Secondary 1")?.age).toBe(16);
  });

  test("the card sends the ticked statements and names the syllabuses", () => {
    const picked = statementsForAge([GR], 10).filter((s) => s.subject === "Mathematics").slice(0, 2);
    const p = alignParamFor("sweden", true, "Grade 4", { subject: "", strand: "" }, picked)!;
    expect(p).toMatchObject({ countryName: "Sweden", year: "Grade 4", subject: "Mathematics" });
    expect(p.curriculumName).toBe("Lgr22 syllabuses (Skolverket)");
    expect(p.statements.map((s) => s.id)).toEqual(picked.map((s) => s.id));
    expect(p.statements.map((s) => s.text)).toEqual(picked.map((s) => s.text));
    const upper = alignParamFor("sweden", true, "Upper Secondary 2", { subject: "", strand: "" }, statementsForAge([GY], 17).slice(0, 1))!;
    expect(upper.curriculumName).toBe("GY25 subject syllabuses (Skolverket)");
  });

  test("with permission off, nothing is listed or sent", () => {
    const perm = FRAMEWORK_PERMITTED as Record<string, boolean>;
    const saved = [perm["se-lgr22"], perm["se-gy25"]];
    perm["se-lgr22"] = false;
    perm["se-gy25"] = false;
    try {
      expect(alignmentMode("sweden")).toBe("none");
      expect(alignParamFor("sweden", true, "Grade 4", { subject: "", strand: "" }, statementsForAge([GR], 10).slice(0, 1))).toBeUndefined();
    } finally {
      [perm["se-lgr22"], perm["se-gy25"]] = saved;
    }
  });

  test("the card says the statements are in Swedish and the resource is not", () => {
    for (const fw of ["se-lgr22", "se-gy25"] as const) {
      const note = FRAMEWORK_LANGUAGE_NOTE[fw]!;
      expect(note).toContain("Swedish");
      expect(note).toContain("Skolverket");
      expect(note).toContain("still written in the language you choose");
      expect(note).not.toMatch(DASHES);
    }
  });

  test("the terms page credits both", () => {
    const terms = readFileSync("app/terms/page.tsx", "utf8");
    expect(terms).toMatch(/FRAMEWORK_CREDIT\["se-lgr22"\]/);
    expect(terms).toMatch(/FRAMEWORK_CREDIT\["se-gy25"\]/);
  });
});

test.describe("Sweden: the topic matcher and the prompt", () => {
  const g4 = statementsForAge([GR], 10);
  const subjects = [...new Set(g4.map((s) => s.subject))];

  test("a typed subject picks its subject, in English or in Swedish", () => {
    expect(matchingSubjects("Maths", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("matematik", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("Swedish", subjects)).toEqual(["Swedish"]);
    expect(matchingSubjects("Svenska", subjects)).toEqual(["Swedish"]);
    expect(matchingSubjects("Science", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("naturkunskap", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("Biologi", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("fysik", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("English", subjects)).toEqual(["English"]);
    expect(matchingSubjects("engelska", subjects)).toEqual(["English"]);
  });

  test("elsewhere, Swedish finds no Swedish subject", () => {
    expect(matchingSubjects("Swedish", ["Languages", "Mathematics"])).toEqual([]);
  });

  test("an English topic shares no words with Swedish statements and still gets a capped list of the subject", () => {
    const list = capCandidates(filterBySubject(statementsForAge([GY], 16), "Maths", "quadratic equations"), "quadratic equations");
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(list.every((s) => s.subject === "Mathematics")).toBe(true);
  });

  test("Swedish statements add the own-language line, known by their framework (Latin script)", () => {
    const s = GR.statements.find((x) => x.subject === "Mathematics")!;
    expect(s.text).not.toMatch(/[぀-ヿ一-鿿]/);
    const block = (statements: { id?: string; text: string }[]) =>
      curriculumPromptBlock({ curriculumName: "Lgr22 syllabuses (Skolverket)", subject: "Mathematics", statements }, "Grade 4", "worksheet", worksheetCurriculumRules("Grade 4"));
    expect(block([{ id: s.id, text: s.text }])).toContain("The statements above are quoted in the curriculum's own language.");
    expect(block([{ id: GY.statements[0].id, text: GY.statements[0].text }])).toContain("own language");
    // The same text with no id, or an English framework's id, adds nothing.
    expect(block([{ text: s.text }])).not.toContain("own language");
    expect(block([{ id: "no-lk20-km1", text: s.text }])).not.toContain("own language");
    // An id that only looks like one ("se-lgr22x-") does not count.
    expect(block([{ id: "se-lgr22x-1", text: s.text }])).not.toContain("own language");
  });
});
