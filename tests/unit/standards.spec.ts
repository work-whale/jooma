import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

import { CURRICULA_REGISTRY, getCurriculum } from "@/app/lib/curricula";
import {
  FRAMEWORK_AGES,
  FRAMEWORK_CREDIT,
  alignmentMode,
  alignmentYears,
  frameworkOf,
  shortCode,
  statementsForAge,
  type FrameworkData,
} from "@/app/lib/standards";
import ccssMath from "@/app/lib/standards/data/ccss-math.json";
import ccssEla from "@/app/lib/standards/data/ccss-ela.json";
import ngss from "@/app/lib/standards/data/ngss.json";
import ac9 from "@/app/lib/standards/data/ac9.json";

/*
 * The published standards outside England: Common Core, NGSS and the
 * Australian Curriculum v9.0 (all learning areas but Languages), built by scripts/build-standards.mjs.
 *
 * Checked here: the shape of the data, the counts the published documents
 * have, every statement word for word against its source, and which curricula
 * get which data.
 */

/** The frameworks this spec checks against their PDFs and workbook: Common Core,
 *  NGSS and the Australian Curriculum. The UK nations are in uk-curricula-data.spec.ts. */
type Standards = "ccss-math" | "ccss-ela" | "ngss" | "ac9";

const DATA: Record<Standards, FrameworkData> = {
  "ccss-math": ccssMath as FrameworkData,
  "ccss-ela": ccssEla as FrameworkData,
  ngss: ngss as FrameworkData,
  ac9: ac9 as FrameworkData,
};
const IDS = Object.keys(DATA) as Standards[];

test.describe("the data", () => {
  test("ids are unique across every framework, and each says which framework it is", () => {
    const all = IDS.flatMap((f) => DATA[f].statements.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    for (const f of IDS) for (const s of DATA[f].statements) expect(frameworkOf(s.id), s.id).toBe(f);
  });

  test("every statement is complete, with ages its framework covers", () => {
    for (const f of IDS) {
      for (const s of DATA[f].statements) {
        expect(s.text.length, s.id).toBeGreaterThan(15);
        expect(s.subject, s.id).not.toBe("");
        expect(s.strand, s.id).not.toBe("");
        expect(s.ages.length, s.id).toBeGreaterThan(0);
        for (const a of s.ages) expect(FRAMEWORK_AGES[f], `${s.id} age ${a}`).toContain(a);
        // The brand: no en or em dashes in anything a teacher reads.
        expect(s.text, s.id).not.toMatch(/[–—]/);
        expect(s.text[0], s.id).toBe(s.text[0].toUpperCase());
      }
    }
  });

  test("codes follow each framework's own scheme", () => {
    for (const s of DATA["ccss-math"].statements) expect(s.code).toMatch(/^CCSS\.MATH\.CONTENT\.(K|[1-8]|HS[NAFGS])[.-][A-Z]+(\.[A-Z])?\.\d+$/);
    for (const s of DATA["ccss-ela"].statements) expect(s.code).toMatch(/^CCSS\.ELA-LITERACY\.(RL|RI|RF|W|SL|L)\.(K|\d+|9-10|11-12)\.\d+$/);
    for (const s of DATA.ngss.statements) expect(s.code).toMatch(/^(K-2|3-5|K|[1-5]|MS|HS)-[A-Z]{2,4}\d?-\d+$/);
    for (const s of DATA.ac9.statements) expect(s.code).toMatch(/^AC9[A-Z]+\d*[A-Z]+\d+$/);
  });

  test("the counts the published documents have", () => {
    // NGSS: 208 performance expectations.
    expect(DATA.ngss.statements.length).toBe(208);
    // Common Core ELA: the grade-specific RL, RI, RF, W, SL and L standards.
    expect(DATA["ccss-ela"].statements.length).toBe(455);
    // Common Core maths: K to 8 and high school, as printed with codes.
    expect(DATA["ccss-math"].statements.length).toBeGreaterThanOrEqual(380);
    // Australian Curriculum v9.0, Foundation to Year 10: English, Mathematics, Science (676), then
    // Humanities and Social Sciences, The Arts, Technologies and Health and Physical Education
    // (719 more). Languages are not included. The split by area is in ac9-areas.spec.ts.
    expect(DATA.ac9.statements.length).toBe(1395);
  });

  test("known statements landed in the right grade", () => {
    const by = (f: Standards, code: string) => DATA[f].statements.find((s) => s.code === code);
    expect(by("ccss-ela", "CCSS.ELA-LITERACY.RL.3.1")?.text).toMatch(/^Ask and answer questions to demonstrate understanding of a text/);
    expect(by("ccss-ela", "CCSS.ELA-LITERACY.RL.4.1")?.text).toMatch(/^Refer to details and examples in a text/);
    expect(by("ccss-ela", "CCSS.ELA-LITERACY.L.2.3")?.text).toMatch(/Compare formal and informal uses of English/);
    expect(by("ccss-ela", "CCSS.ELA-LITERACY.W.K.4")).toBeUndefined(); // "Begins in grade 3"
    expect(by("ccss-ela", "CCSS.ELA-LITERACY.RL.5.8")).toBeUndefined(); // "Not applicable to literature"
    expect(by("ccss-math", "CCSS.MATH.CONTENT.3.NBT.A.1")?.text).toMatch(/^Use place value understanding to round whole numbers/);
    expect(by("ccss-math", "CCSS.MATH.CONTENT.3.NF.A.2")?.text).toMatch(/\(a\) Represent a fraction 1\/b on a number line/);
    expect(by("ngss", "3-LS1-1")?.text).toMatch(/^Develop models to describe that organisms have unique and diverse life cycles/);
    expect(by("ngss", "3-LS1-1")?.ages).toEqual([8]);
    expect(by("ngss", "MS-PS1-1")?.ages).toEqual([11, 12, 13]);
    expect(by("ac9", "AC9E2LE01")?.ages).toEqual([7]);
  });

  test("each file carries the credit the card shows", () => {
    for (const f of IDS) expect(DATA[f].source.credit, f).toBe(FRAMEWORK_CREDIT[f]);
  });

  test("short codes are the ones teachers write", () => {
    expect(shortCode("CCSS.MATH.CONTENT.3.NBT.A.1")).toBe("3.NBT.A.1");
    expect(shortCode("CCSS.ELA-LITERACY.RL.3.1")).toBe("RL.3.1");
    expect(shortCode("3-PS2-1")).toBe("3-PS2-1");
    expect(shortCode("AC9M3N01")).toBe("AC9M3N01");
  });
});

// ── Word for word against the sources ──────────────────────────────────────

// Letters only, as tests/unit/national-curriculum.spec.ts does: the build
// drops footnote markers and restores exponents as superscripts, so digits
// are checked by the tests just below instead.
const letters = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

test.describe("digits the PDF mangles", () => {
  const math = () => DATA["ccss-math"].statements;
  const by = (code: string) => math().find((s) => s.code === `CCSS.MATH.CONTENT.${code}`)!.text;

  test("no footnote markers or page footnotes are left in any statement", () => {
    for (const f of IDS) {
      for (const s of DATA[f].statements) {
        // A digit stuck to the end of a word or sentence ("the problem.2").
        expect(s.text, s.code).not.toMatch(/(?:[a-z]{2}|[a-z][.)”"])\d{1,2}(?=\s|$)/);
        // A page footnote run on ("1See Glossary, Table 2.").
        expect(s.text, s.code).not.toMatch(/\d{1,2}(?:See|Students|This|Explanations|Sizes) /);
        expect(s.text, s.code).not.toContain("�");
        // No LaTeX: the card shows plain text, and prompts forbid LaTeX.
        expect(s.text, s.code).not.toMatch(/\\[(a-z[]/);
      }
    }
  });

  test("ACARA's LaTeX fractions read as plain fractions", () => {
    const n02 = DATA.ac9.statements.find((s) => s.code === "AC9M3N02")!.text;
    expect(n02).toContain("including 1/2, 1/3, 1/4, 1/5 and 1/10");
    expect(DATA.ac9.statements.find((s) => s.code === "AC9M7M03")!.text).toContain("between π and the features of circles");
  });

  test("exponents are superscripts again, and decimals and codes are untouched", () => {
    expect(by("8.EE.A.2")).toContain("x² = p and x³ = p");
    expect(by("HSA-APR.C.4")).toContain("(x² + y²)² = (x² - y²)² + (2xy)²");
    expect(by("HSN-CN.A.1")).toContain("i² = -1");
    expect(by("8.NS.A.2")).toContain("between 1.4 and 1.5");
    expect(by("4.NF.C.6")).toContain("rewrite 0.62 as 62/100");
    expect(by("2.NBT.B.9")).toMatch(/properties of operations\.$/);
    expect(by("4.NF.C.5")).toContain("10 and 100. For example");
    expect(by("1.OA.D.8")).toContain("5 = □ - 3");
  });
});

async function pdfText(path: string): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const { text } = await extractText(pdf, { mergePages: false });
  // Running headers and page numbers otherwise land inside a statement that
  // crosses a page break.
  return text
    .map((p) =>
      p
        .split("\n")
        .filter((l) => !/^\s*\d+\s*$/.test(l) && !/^\d+ \| /.test(l.trim()) && !/^Common Core State Standard/i.test(l.trim()) && !/^COMMON CORE STATE STANDARDS/.test(l.trim()))
        .join("\n"),
    )
    .join("\n");
}

/** Statements whose stem or any lettered part is not in the source. */
function missingFrom(source: string, data: FrameworkData): string[] {
  const hay = letters(source);
  return data.statements
    .filter((s) => s.text.split(/\s\([a-z]\)\s/).some((fragment) => !hay.includes(letters(fragment))))
    .map((s) => `${s.code}: ${s.text.slice(0, 120)}`);
}

const skipWithout = (path: string) => test.skip(!existsSync(path), `${path} is missing from this checkout`);

test.describe("every statement is in its source, word for word", () => {
  test.setTimeout(120_000);

  for (const [f, path] of [
    ["ccss-math", "docs/standards/CCSS_Math_Standards_ADA.pdf"],
    ["ccss-ela", "docs/standards/CCSS_ELA_Standards_ADA.pdf"],
    ["ngss", "docs/standards/NGSS_AllTopic.pdf"],
  ] as const) {
    test(`${f}, against ${path}`, async () => {
      skipWithout(path);
      expect(missingFrom(await pdfText(path), DATA[f])).toEqual([]);
    });
  }

  test("ac9, each against its own row of the ACARA workbook", async () => {
    const path = "docs/standards/AC9_curriculum_workbook.xlsx";
    skipWithout(path);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(readFileSync(path));
    const shared = [...(await zip.file("xl/sharedStrings.xml")!.async("string")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
    );
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const byCode = new Map<string, string>();
    for (const r of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: Record<string, string> = {};
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        cells[c[1]] = /t="s"/.test(c[2]) && v !== undefined ? shared[Number(v)] : (v ?? "");
      }
      if (cells.E && cells.J && !cells.K) byCode.set(cells.E, cells.J);
    }
    // The build writes ACARA's LaTeX as plain text, so its commands ("\frac",
    // "\pi") are left out of the comparison.
    const source = (code: string) => (byCode.get(code) ?? "").replace(/\\[a-z]+/g, "");
    const wrong = DATA.ac9.statements.filter((s) => letters(source(s.code)) !== letters(s.text)).map((s) => s.code);
    expect(wrong).toEqual([]);
  });
});

// ── Which curricula align to what ──────────────────────────────────────────

test.describe("which curricula get which standards", () => {
  test("England, EYFS and the islands keep England's own statements", () => {
    const ids = ["england", "england-eyfs", ...CURRICULA_REGISTRY.filter((x) => x.region === "british-isles").map((x) => x.id)];
    expect(ids.length).toBeGreaterThan(2);
    for (const id of ids) expect(alignmentMode(id), id).toBe("england");
    expect(alignmentMode(null)).toBe("england");
  });

  test("a Common Core state as written gets Common Core and NGSS, unmarked", () => {
    expect(getCurriculum("us-ca")?.alignment).toEqual({ frameworks: ["ccss-ela", "ccss-math", "ngss"], adapted: false });
    expect(alignmentMode("us-ca")).toBe("standards");
  });

  test("a state that revised them gets them marked as adapted", () => {
    expect(getCurriculum("us-az")?.alignment?.adapted).toBe(true);
  });

  test("a state with its own standards gets none, and says so", () => {
    for (const id of ["us-tx", "us-fl", "us-va"]) {
      expect(getCurriculum(id)?.alignment, id).toBeUndefined();
      expect(alignmentMode(id), id).toBe("none");
    }
  });

  test("Australia aligns to v9.0, marked as adapted where a state publishes its own version", () => {
    expect(getCurriculum("au-qld")?.alignment).toEqual({ frameworks: ["ac9"], adapted: false });
    for (const id of ["au-nsw", "au-vic", "au-wa", "au-sa"]) expect(getCurriculum(id)?.alignment?.adapted, id).toBe(true);
  });

  test("systems with no published data yet are told so rather than shown England's", () => {
    for (const id of ["ireland", "ib-myp", "cambridge-primary", "new-zealand", "ca-on"]) expect(alignmentMode(id), id).toBe("none");
  });

  test("only years with statements are offered", () => {
    const qld = getCurriculum("au-qld")!;
    expect(alignmentYears(qld).map((y) => y.label)).toEqual(["Prep", ...Array.from({ length: 10 }, (_, i) => `Year ${i + 1}`)]);
    const ca = getCurriculum("us-ca")!;
    expect(alignmentYears(ca).map((y) => y.label)).toEqual(["Kindergarten", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]);
  });

  test("a year's statements come from every framework the curriculum uses", () => {
    const grade3 = statementsForAge([DATA["ccss-ela"], DATA["ccss-math"], DATA.ngss], 8);
    expect(new Set(grade3.map((s) => s.subject))).toEqual(new Set(["English Language Arts", "Mathematics", "Science"]));
    expect(grade3.every((s) => s.ages.includes(8))).toBe(true);
  });
});

// ── What a generation sends ────────────────────────────────────────────────

import { alignParamFor } from "@/app/lib/standards/align";
import { curriculumAlignParam } from "@/app/lib/national-curriculum/prompt";
import primary from "@/app/lib/national-curriculum/data/primary.json";

test.describe("what the card sends", () => {
  const sel = { subject: "", strand: "" };

  test("England and the islands send exactly what they always have", () => {
    const picked = (primary as { statements: { id: string; subject: string; strand: string; text: string; years: number[]; page: number }[] }).statements.filter((s) => s.years.includes(4)).slice(0, 2);
    for (const c of ["2014 National Curriculum", "england", "jersey", null]) {
      expect(alignParamFor(c, true, "Year 4", sel, picked)).toEqual(curriculumAlignParam(true, "Year 4", sel, picked as never));
    }
  });

  test("a Common Core state sends the codes and names the framework", () => {
    const picked = DATA["ccss-math"].statements.filter((s) => s.code.startsWith("CCSS.MATH.CONTENT.3.NBT")).slice(0, 2);
    const p = alignParamFor("us-ca", true, "Grade 3", sel, picked)!;
    expect(p).toMatchObject({ countryId: "us", countryName: "California", year: "Grade 3", grade: "Grade 3", subject: "Mathematics", strand: picked[0].strand });
    expect(p.curriculumName).toBe("Common Core State Standards for Mathematics");
    expect(p.statements.map((s) => s.text)).toEqual(picked.map((s) => `${shortCode(s.code)}: ${s.text}`));
  });

  test("an adapted state says so in the curriculum name", () => {
    const picked = DATA.ac9.statements.filter((s) => s.ages.includes(8)).slice(0, 1);
    expect(alignParamFor("au-nsw", true, "Year 3", sel, picked)?.curriculumName).toBe("Australian Curriculum v9.0 (as adapted in New South Wales)");
  });

  test("nothing is sent when the card is off, nothing is ticked, the year is not theirs, or there is no data", () => {
    const picked = DATA.ngss.statements.slice(0, 1);
    expect(alignParamFor("us-ca", false, "Grade 3", sel, picked)).toBeUndefined();
    expect(alignParamFor("us-ca", true, "Grade 3", sel, [])).toBeUndefined();
    expect(alignParamFor("us-ca", true, "Year 4", sel, picked)).toBeUndefined();
    expect(alignParamFor("us-tx", true, "Grade 3", sel, picked)).toBeUndefined();
    expect(alignParamFor("ireland", true, "3rd Class", sel, picked)).toBeUndefined();
  });
});

// ── NGSS stays off until written permission ────────────────────────────────
// A paid product needs WestEd's approval to use the NGSS name and the National
// Academies Press's permission to copy the standards text. Until both arrive,
// the data stays in the repo but no teacher sees it and no output names it.

import { FRAMEWORK_PERMITTED } from "@/app/lib/standards/permissions";
import { loadStandardsFor, usableFrameworks } from "@/app/lib/standards";
import { curriculumInstruction } from "@/app/lib/curricula";

test.describe("NGSS stays off until permission", () => {
  const sel = { subject: "", strand: "" };

  test("NGSS is switched off; Common Core and the Australian Curriculum are on", () => {
    expect(FRAMEWORK_PERMITTED).toEqual({
      "ccss-math": true,
      "ccss-ela": true,
      ngss: false,
      ac9: true,
      "cfe-early": true,
      "cfe-first": true,
      "cfe-second": true,
      "cfe-third-fourth": true,
      "nic-fs": true,
      "nic-ks1": true,
      "nic-ks2": true,
      "nic-ks3": true,
      "nic-ks4": true,
    });
  });

  test("the registry still records that California uses NGSS, but only Common Core is usable", () => {
    expect(getCurriculum("us-ca")?.alignment?.frameworks).toContain("ngss");
    expect(usableFrameworks(getCurriculum("us-ca"))).toEqual(["ccss-ela", "ccss-math"]);
  });

  test("a Common Core state's year lists no science statements", () => {
    // loadStandardsFor's lazy JSON import needs the bundler, so the same steps
    // run here on the data already loaded: usable frameworks, then the year.
    const frameworks = usableFrameworks(getCurriculum("us-ca"));
    const grade3 = statementsForAge(frameworks.map((f) => DATA[f as Standards]), 8);
    expect(grade3.length).toBeGreaterThan(0);
    expect(grade3.some((s) => s.id.startsWith("ngss-") || s.subject === "Science")).toBe(false);
  });

  test("a state whose only data is NGSS is told alignment is not available", async () => {
    expect(getCurriculum("us-ak")?.alignment?.frameworks).toEqual(["ngss"]);
    expect(alignmentMode("us-ak")).toBe("none");
    expect(alignmentYears(getCurriculum("us-ak")!)).toEqual([]);
    expect((await loadStandardsFor("us-ak", "Grade 3")).statements).toEqual([]);
  });

  test("an NGSS statement is never sent, alone or mixed in", () => {
    const n = DATA.ngss.statements.filter((s) => s.ages.includes(8)).slice(0, 1);
    const m = DATA["ccss-math"].statements.filter((s) => s.ages.includes(8)).slice(0, 1);
    expect(alignParamFor("us-ca", true, "Grade 3", sel, n)).toBeUndefined();
    const mixed = alignParamFor("us-ca", true, "Grade 3", sel, [...n, ...m])!;
    expect(mixed.statements.map((s) => s.id)).toEqual([m[0].id]);
    expect(mixed.curriculumName).not.toMatch(/NGSS|Next Generation/);
  });

  test("the model is told not to write the NGSS name for a state that uses it", () => {
    for (const id of ["us-ca", "us-ak", "us-mi"]) {
      expect(curriculumInstruction(id), id).toMatch(/Do not write "NGSS" or "Next Generation Science Standards"/);
    }
  });

  test("no curriculum a teacher can pick shows the NGSS name", () => {
    const named = CURRICULA_REGISTRY.filter((c) =>
      [c.name, c.promptLabel, ...c.versions.map((v) => v.label)].some((s) => /NGSS|Next Generation Science/i.test(s)),
    ).map((c) => c.id);
    expect(named).toEqual([]);
  });

  test("California's old label, saved on earlier runs, still reads as California", () => {
    expect(getCurriculum("California: California Common Core State Standards; CA NGSS")?.id).toBe("us-ca");
  });

  test("states with no NGSS link, other systems and the UK get no such line", () => {
    for (const id of ["us-tx", "au-qld", "ireland", "ib-myp"]) {
      expect(curriculumInstruction(id), id).not.toMatch(/NGSS|Next Generation/);
    }
    expect(curriculumInstruction("england")).toBe("");
  });
});
