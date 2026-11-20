import { test, expect } from "@playwright/test";

import { CURRICULA_REGISTRY, getCurriculum, usesUkYearList } from "@/app/lib/curricula";
import { alignmentMode, alignmentYears, usableFrameworks } from "@/app/lib/standards";
import { alignParamFor, suggestionSource } from "@/app/lib/standards/align";
import primary from "@/app/lib/national-curriculum/data/primary.json";

/*
 * "Align to curriculum" for Scotland, Wales and Northern Ireland.
 *
 * Until each nation's own statements land, it must show an honest "not
 * available yet" note and never England's list under its name. Once its data
 * lands, it must show its own statements and still never England's. Several
 * checks below are written against the registry's live state, so they keep
 * being true as each nation is built.
 */

const NATION_IDS = ["scotland", "wales", "northern-ireland"] as const;
const NATION_LABELS = ["Scottish Curriculum for Excellence", "Welsh Curriculum", "Northern Ireland Curriculum"] as const;
const NATIONS = [...NATION_IDS, ...NATION_LABELS];

/** What the mode must be for a nation: its own data, or the note. */
const expectedMode = (x: string) => (usableFrameworks(getCurriculum(x)).length ? "standards" : "none");

const sel = { subject: "", strand: "" };
const englandStatements = (primary as { statements: { id: string; subject: string; strand: string; text: string; years: number[] }[] }).statements
  .filter((s) => s.years.includes(4))
  .slice(0, 2)
  .map(({ id, subject, strand, text }) => ({ id, subject, strand, text }));

test.describe("step 0: Scotland, Wales and Northern Ireland never get England's statements", () => {
  test("England, EYFS and the islands still align to England's own statements", () => {
    for (const x of ["england", "england-eyfs", "jersey", "guernsey", "isle-of-man", "gibraltar", null, undefined, "", "nonsense", "2014 National Curriculum", "Early Years Foundation Stage (EYFS)"]) {
      expect(alignmentMode(x), String(x)).toBe("england");
    }
  });

  test("Scotland, Wales and Northern Ireland are never in England's mode, by id or by label", () => {
    for (const x of NATIONS) {
      expect(alignmentMode(x), x).not.toBe("england");
      expect(alignmentMode(x), x).toBe(expectedMode(x));
    }
  });

  test("a nation with no data yet is told so and offered no years", () => {
    for (const id of NATION_IDS) {
      const c = getCurriculum(id)!;
      if (usableFrameworks(c).length) continue; // built since: covered by its own tests
      expect(alignmentMode(id), id).toBe("none");
      expect(alignmentYears(c), id).toEqual([]);
    }
  });

  test("England's statements are never sent for Scotland, Wales or Northern Ireland, even from a restored run", () => {
    expect(englandStatements).toHaveLength(2);
    // The control: for England itself the same call sends them.
    expect(alignParamFor("england", true, "Year 4", sel, englandStatements)?.statements).toHaveLength(2);
    for (const x of NATIONS) {
      expect(alignParamFor(x, true, "Year 4", sel, englandStatements), x).toBeUndefined();
    }
  });

  test("the slides wizard keeps the UK year list for every UK and island curriculum", () => {
    for (const x of ["england", "england-eyfs", "scotland", "wales", "northern-ireland", "jersey", "guernsey", "isle-of-man", "gibraltar", null, "nonsense"]) {
      expect(usesUkYearList(x), String(x)).toBe(true);
    }
    for (const x of ["us-ca", "au-qld", "ireland", "ib-myp"]) expect(usesUkYearList(x), x).toBe(false);
    // The registry holds every other region's curricula to the same rule.
    for (const c of CURRICULA_REGISTRY) {
      expect(usesUkYearList(c.id), c.id).toBe(c.region === "uk" || c.region === "british-isles");
    }
  });

  test("the topic matcher only uses England's statements for England", () => {
    expect(suggestionSource(undefined, "Year 4")).toBe("england");
    expect(suggestionSource("england", "Nursery")).toBe("england");
    expect(suggestionSource("england", "Year 8")).toBeNull();
    expect(suggestionSource("us-ca", "Grade 3")).toBe("standards");
    expect(suggestionSource("us-tx", "Grade 3")).toBeNull();
    expect(suggestionSource("ireland", "3rd Class")).toBeNull();
    // A nation: its own data when it has any for the year, never England's.
    for (const id of NATION_IDS) {
      const c = getCurriculum(id)!;
      const expected = expectedMode(id) === "standards" && alignmentYears(c).some((y) => y.label === "Year 4") ? "standards" : null;
      expect(suggestionSource(id, "Year 4"), id).toBe(expected);
      expect(suggestionSource(id, "Year 4"), id).not.toBe("england");
    }
  });
});

// ── Shared plumbing: nothing visible changes outside the three nations ──────

import { FRAMEWORK_IDS, alignmentStageLabel, frameworkOf, type FrameworkData } from "@/app/lib/standards";
import ccssMath from "@/app/lib/standards/data/ccss-math.json";
import ac9 from "@/app/lib/standards/data/ac9.json";

test.describe("shared plumbing", () => {
  test("frameworkOf reads every framework's own prefix", () => {
    expect(FRAMEWORK_IDS.length).toBeGreaterThanOrEqual(4);
    for (const f of FRAMEWORK_IDS) expect(frameworkOf(`${f}-x`), f).toBe(f);
    // England's ids, nothing, and a bare prefix are no framework.
    expect(frameworkOf("y4-maths-number-fractions-01")).toBeNull();
    expect(frameworkOf("")).toBeNull();
    expect(frameworkOf("ccss-")).toBeNull();
    // A prefix is a whole word: "ngssx-1" is not NGSS.
    expect(frameworkOf("ngssx-1")).toBeNull();
  });

  test("every framework id is told apart from the others by its own prefix", () => {
    for (const a of FRAMEWORK_IDS) for (const b of FRAMEWORK_IDS) {
      if (a !== b) expect(`${a}-`.startsWith(`${b}-`), `${a} vs ${b}`).toBe(false);
    }
  });

  test("US and Australian params are unchanged: no stage, same names", () => {
    const sel0 = { subject: "", strand: "" };
    const math = (ccssMath as FrameworkData).statements.filter((s) => s.code.startsWith("CCSS.MATH.CONTENT.3.NBT")).slice(0, 2);
    const ca = alignParamFor("us-ca", true, "Grade 3", sel0, math)!;
    expect("stage" in ca).toBe(false);
    expect(ca.countryId).toBe("us");
    expect(ca.countryName).toBe("California");
    expect(ca.curriculumName).toBe("Common Core State Standards for Mathematics");
    const au = (ac9 as FrameworkData).statements.filter((s) => s.ages.includes(8)).slice(0, 1);
    const nsw = alignParamFor("au-nsw", true, "Year 3", sel0, au)!;
    expect("stage" in nsw).toBe(false);
    expect(nsw.countryId).toBe("au");
    expect(nsw.curriculumName).toBe("Australian Curriculum v9.0 (as adapted in New South Wales)");
  });

  test("no stage label outside the UK nations", () => {
    expect(alignmentStageLabel(getCurriculum("us-ca")!, "Grade 3")).toBeNull();
    expect(alignmentStageLabel(getCurriculum("au-qld")!, "Year 3")).toBeNull();
    expect(alignmentStageLabel(getCurriculum("england")!, "Year 4")).toBeNull();
    // A year the curriculum does not have has no stage either.
    expect(alignmentStageLabel(getCurriculum("us-ca")!, "Year 4")).toBeNull();
  });
});

// ── Scotland: Curriculum for Excellence experiences and outcomes ───────────

import { FRAMEWORK_AGES, FRAMEWORK_NAME, FRAMEWORK_STAGE, statementsForAge, usableFrameworks as usable } from "@/app/lib/standards";
import { curriculumPromptBlock, worksheetCurriculumRules } from "@/app/lib/national-curriculum/prompt";
import cfeEarly from "@/app/lib/standards/data/cfe-early.json";
import cfeFirst from "@/app/lib/standards/data/cfe-first.json";
import cfeSecond from "@/app/lib/standards/data/cfe-second.json";
import cfeThirdFourth from "@/app/lib/standards/data/cfe-third-fourth.json";
import earlyYears from "@/app/lib/national-curriculum/data/early-years.json";
import type { FrameworkId } from "@/app/lib/standards";

const CFE_IDS = ["cfe-early", "cfe-first", "cfe-second", "cfe-third-fourth"] as const;
const CFE: Record<(typeof CFE_IDS)[number], FrameworkData> = {
  "cfe-early": cfeEarly as FrameworkData,
  "cfe-first": cfeFirst as FrameworkData,
  "cfe-second": cfeSecond as FrameworkData,
  "cfe-third-fourth": cfeThirdFourth as FrameworkData,
};
const englandIds = new Set([
  ...(primary as { statements: { id: string }[] }).statements.map((s) => s.id),
  ...(earlyYears as { statements: { id: string }[] }).statements.map((s) => s.id),
]);
const byCode = (code: string) => Object.values(CFE).flatMap((d) => d.statements).find((s) => s.code.split(" / ")[0] === code)!;

test.describe("Scotland", () => {
  const scotland = () => getCurriculum("scotland")!;
  const sel0 = { subject: "", strand: "" };

  test("Scotland aligns to its own Es and Os, by id and by the label a form sends", () => {
    expect(scotland().alignment).toEqual({ frameworks: [...CFE_IDS], adapted: false });
    expect(alignmentMode("scotland")).toBe("standards");
    expect(alignmentMode("Scottish Curriculum for Excellence")).toBe("standards");
    // England's own curriculum is untouched by this.
    expect(alignmentMode("england")).toBe("england");
  });

  test("each year sees its level, and Year 11 sees none", () => {
    const labels = alignmentYears(scotland()).map((y) => y.label);
    expect(labels).toEqual(["Nursery", "Reception", ...Array.from({ length: 10 }, (_, i) => `Year ${i + 1}`)]);
    const stage = (y: string) => alignmentStageLabel(scotland(), y);
    expect(["Nursery", "Reception", "Year 1"].map(stage)).toEqual(Array(3).fill("Early level"));
    expect(["Year 2", "Year 3", "Year 4"].map(stage)).toEqual(Array(3).fill("First level"));
    expect(["Year 5", "Year 6", "Year 7"].map(stage)).toEqual(Array(3).fill("Second level"));
    expect(["Year 8", "Year 9", "Year 10"].map(stage)).toEqual(Array(3).fill("Third and fourth level"));
    // S4 is the senior phase (qualifications), and Year 12 and 13 are beyond Es and Os.
    expect(["Year 11", "Year 12", "Year 13"].map(stage)).toEqual([null, null, null]);
    expect(["Year 11", "Year 12", "Year 13"].filter((y) => labels.includes(y))).toEqual([]);
  });

  test("every age has exactly one level, and the boundaries fall between Year 1 and 2, 4 and 5, 7 and 8", () => {
    for (let age = 3; age <= 14; age++) {
      const fws = CFE_IDS.filter((f) => FRAMEWORK_AGES[f].includes(age));
      expect(fws, `age ${age}`).toHaveLength(1);
    }
    expect(CFE_IDS.some((f) => FRAMEWORK_AGES[f].includes(15))).toBe(false);
    expect(CFE_IDS.some((f) => FRAMEWORK_AGES[f].includes(2))).toBe(false);
    const levelAt = (age: number) => CFE_IDS.find((f) => FRAMEWORK_AGES[f].includes(age));
    expect([levelAt(5), levelAt(6), levelAt(8), levelAt(9), levelAt(11), levelAt(12)]).toEqual([
      "cfe-early", "cfe-first", "cfe-first", "cfe-second", "cfe-second", "cfe-third-fourth",
    ]);
  });

  test("a Scottish year lists only Scottish statements of its own level", () => {
    const data = usable(scotland()).map((f) => CFE[f as (typeof CFE_IDS)[number]]);
    expect(data).toHaveLength(4);
    for (let age = 3; age <= 14; age++) {
      const list = statementsForAge(data, age);
      expect(list.length, `age ${age}`).toBeGreaterThan(0);
      const level = CFE_IDS.find((f) => FRAMEWORK_AGES[f].includes(age))!;
      for (const s of list) {
        expect(frameworkOf(s.id), s.id).toBe(level);
        expect(englandIds.has(s.id), s.id).toBe(false);
      }
    }
    expect(statementsForAge(data, 15)).toEqual([]);
  });

  test("what a Scottish deck or worksheet sends names the level and quotes code first, word for word", () => {
    const picked = [byCode("MNU 1-02a")];
    const p = alignParamFor("scotland", true, "Year 4", sel0, picked)!;
    expect(p).toMatchObject({
      countryId: "scotland",
      countryName: "Scotland",
      curriculumName: "Curriculum for Excellence experiences and outcomes",
      stage: "First level",
      year: "Year 4",
      grade: "Year 4",
      subject: "Numeracy and mathematics",
    });
    expect(p.statements).toEqual([{ id: picked[0].id, text: `MNU 1-02a: ${picked[0].text}` }]);
    // The label a form sends gives the same answer.
    expect(alignParamFor("Scottish Curriculum for Excellence", true, "Year 4", sel0, picked)).toEqual(p);
  });

  test("the framework name is said once, however many levels are on the list", () => {
    const two = alignParamFor("scotland", true, "Year 8", sel0, CFE["cfe-third-fourth"].statements.slice(0, 2))!;
    expect(two.curriculumName).toBe("Curriculum for Excellence experiences and outcomes");
    const mixed = alignParamFor("scotland", true, "Year 5", sel0, [byCode("MNU 1-02a"), byCode("MNU 2-02a")])!;
    expect(mixed.curriculumName).toBe("Curriculum for Excellence experiences and outcomes");
  });

  test("the prompt block names the curriculum and level, and quotes the statements", () => {
    const p = alignParamFor("scotland", true, "Year 4", sel0, [byCode("MNU 1-02a")])!;
    const block = curriculumPromptBlock(p, "Year 4", "worksheet", worksheetCurriculumRules("Year 4"));
    expect(block).toContain("Curriculum for Excellence experiences and outcomes · First level · Year 4");
    expect(block).toContain("  1. MNU 1-02a: I have investigated");
    expect(block).not.toContain("National Curriculum in England");
  });

  test("nothing is sent when off, empty, uncovered, or from another nation", () => {
    const one = [byCode("MNU 1-02a")];
    expect(alignParamFor("scotland", false, "Year 4", sel0, one)).toBeUndefined();
    expect(alignParamFor("scotland", true, "Year 4", sel0, [])).toBeUndefined();
    // Year 11 (S4) has no Es and Os; a stale tick from another year is not sent.
    expect(alignParamFor("scotland", true, "Year 11", sel0, one)).toBeUndefined();
    expect(alignParamFor("scotland", true, "Adult learners", sel0, one)).toBeUndefined();
    // England's statements, and a US framework's, are not Scotland's.
    expect(alignParamFor("scotland", true, "Year 4", sel0, englandStatements)).toBeUndefined();
    const us = (ccssMath as FrameworkData).statements.slice(0, 1);
    expect(alignParamFor("scotland", true, "Year 4", sel0, us)).toBeUndefined();
    // And Scottish statements are not California's.
    expect(alignParamFor("us-ca", true, "Grade 3", sel0, one)).toBeUndefined();
  });

  test("each level has its own name and stage, and the stage is not shown outside Scotland", () => {
    for (const f of CFE_IDS) expect(FRAMEWORK_NAME[f as FrameworkId]).toBe("Curriculum for Excellence experiences and outcomes");
    expect(FRAMEWORK_STAGE["cfe-early"]).toBe("Early level");
    expect(FRAMEWORK_STAGE["cfe-third-fourth"]).toBe("Third and fourth level");
    expect(alignmentStageLabel(getCurriculum("us-ca")!, "Grade 3")).toBeNull();
  });
});

// ── Northern Ireland: the statutory requirements of the 2007 Order ─────────

import nicFs from "@/app/lib/standards/data/nic-fs.json";
import nicKs1 from "@/app/lib/standards/data/nic-ks1.json";
import nicKs2 from "@/app/lib/standards/data/nic-ks2.json";
import nicKs3 from "@/app/lib/standards/data/nic-ks3.json";
import nicKs4 from "@/app/lib/standards/data/nic-ks4.json";

const NIC_IDS = ["nic-fs", "nic-ks1", "nic-ks2", "nic-ks3", "nic-ks4"] as const;
const NIC: Record<(typeof NIC_IDS)[number], FrameworkData> = {
  "nic-fs": nicFs as FrameworkData,
  "nic-ks1": nicKs1 as FrameworkData,
  "nic-ks2": nicKs2 as FrameworkData,
  "nic-ks3": nicKs3 as FrameworkData,
  "nic-ks4": nicKs4 as FrameworkData,
};
const nicText = (f: (typeof NIC_IDS)[number], needle: string) => NIC[f].statements.find((s) => s.text.includes(needle))!;

test.describe("Northern Ireland", () => {
  const ni = () => getCurriculum("northern-ireland")!;
  const sel0 = { subject: "", strand: "" };

  test("Northern Ireland aligns to the Order's requirements, by id and by the label a form sends", () => {
    expect(ni().alignment).toEqual({ frameworks: [...NIC_IDS], adapted: false });
    expect(alignmentMode("northern-ireland")).toBe("standards");
    expect(alignmentMode("Northern Ireland Curriculum")).toBe("standards");
  });

  test("Year 1 to Year 11 are covered, each under its stage; Nursery, Reception, Year 12 and 13 are not", () => {
    const labels = alignmentYears(ni()).map((y) => y.label);
    expect(labels).toEqual(Array.from({ length: 11 }, (_, i) => `Year ${i + 1}`));
    const stage = (y: string) => alignmentStageLabel(ni(), y);
    expect(["Year 1", "Year 2"].map(stage)).toEqual(Array(2).fill("Foundation Stage"));
    expect(["Year 3", "Year 4"].map(stage)).toEqual(Array(2).fill("Key Stage 1"));
    expect(["Year 5", "Year 6", "Year 7"].map(stage)).toEqual(Array(3).fill("Key Stage 2"));
    expect(["Year 8", "Year 9", "Year 10"].map(stage)).toEqual(Array(3).fill("Key Stage 3"));
    expect(stage("Year 11")).toBe("Key Stage 4");
    // The nursery years are before the Foundation Stage; Year 12 on (age 16) is past Key Stage 4 here.
    expect(["Nursery", "Reception", "Year 12", "Year 13"].map(stage)).toEqual(Array(4).fill(null));
    expect(["Nursery", "Reception", "Year 12", "Year 13", "Adult learners"].filter((y) => labels.includes(y))).toEqual([]);
  });

  test("every age from 5 to 15 has exactly one stage, and none outside it has any", () => {
    for (let age = 5; age <= 15; age++) {
      expect(NIC_IDS.filter((f) => FRAMEWORK_AGES[f].includes(age)), `age ${age}`).toHaveLength(1);
    }
    for (const age of [3, 4, 16, 17, 18]) expect(NIC_IDS.some((f) => FRAMEWORK_AGES[f].includes(age)), `age ${age}`).toBe(false);
    const stageAt = (age: number) => NIC_IDS.find((f) => FRAMEWORK_AGES[f].includes(age));
    expect([6, 7, 8, 9, 11, 12, 13, 14, 15].map(stageAt)).toEqual(["nic-fs", "nic-ks1", "nic-ks1", "nic-ks2", "nic-ks2", "nic-ks3", "nic-ks3", "nic-ks3", "nic-ks4"]);
  });

  test("a Northern Irish year lists only Northern Irish statements of its own stage", () => {
    const data = usable(ni()).map((f) => NIC[f as (typeof NIC_IDS)[number]]);
    expect(data).toHaveLength(5);
    for (let age = 5; age <= 15; age++) {
      const list = statementsForAge(data, age);
      expect(list.length, `age ${age}`).toBeGreaterThan(0);
      const stage = NIC_IDS.find((f) => FRAMEWORK_AGES[f].includes(age))!;
      for (const s of list) {
        expect(frameworkOf(s.id), s.id).toBe(stage);
        expect(englandIds.has(s.id), s.id).toBe(false);
      }
    }
    expect(statementsForAge(data, 16)).toEqual([]);
    expect(statementsForAge(data, 4)).toEqual([]);
  });

  test("what a Northern Irish worksheet sends names the stage and quotes the requirement as the Order has it", () => {
    const picked = [nicText("nic-ks1", "Use prepositions to state position")];
    const p = alignParamFor("Northern Ireland Curriculum", true, "Year 3", sel0, picked)!;
    expect(p).toMatchObject({
      countryId: "northern-ireland",
      countryName: "Northern Ireland",
      curriculumName: "Northern Ireland Curriculum statutory requirements",
      stage: "Key Stage 1",
      year: "Year 3",
      grade: "Year 3",
    });
    // No code: the Order has none, so the text is sent as it stands.
    expect(p.statements).toEqual([{ id: picked[0].id, text: picked[0].text }]);
    expect(alignParamFor("northern-ireland", true, "Year 3", sel0, picked)).toEqual(p);
    // The name is said once for statements from two stages.
    const two = alignParamFor("northern-ireland", true, "Year 5", sel0, [picked[0], nicText("nic-ks2", "Develop strategies to add and subtract mentally")])!;
    expect(two.curriculumName).toBe("Northern Ireland Curriculum statutory requirements");
  });

  test("a Key Stage 3 and a Key Stage 4 teacher send their own stage's statements, word for word", () => {
    const ks3 = [nicText("nic-ks3", "alking, to include debate, role play, interviews, presentations and group discussions")];
    expect(ks3[0].text).toBe("Talking, to include debate, role play, interviews, presentations and group discussions");
    const p3 = alignParamFor("northern-ireland", true, "Year 8", sel0, ks3)!;
    expect(p3).toMatchObject({ stage: "Key Stage 3", year: "Year 8", subject: "Language and Literacy", strand: "English with Media Education" });
    expect(p3.statements).toEqual([{ id: ks3[0].id, text: ks3[0].text }]);
    const ks4 = [nicText("nic-ks4", "xplore self employment")];
    const p4 = alignParamFor("northern-ireland", true, "Year 11", sel0, ks4)!;
    expect(p4).toMatchObject({ stage: "Key Stage 4", year: "Year 11", subject: "Learning for Life and Work", strand: "Employability" });
    // The card lists by age, so a Key Stage 3 statement is never offered in Year 3, nor a
    // Key Stage 1 one in Year 8.
    expect(statementsForAge([NIC["nic-ks3"]], 7)).toEqual([]);
    expect(statementsForAge([NIC["nic-ks1"]], 12)).toEqual([]);
  });

  test("the prompt block names the curriculum and stage and quotes the requirement", () => {
    const picked = [nicText("nic-ks2", "Develop strategies to add and subtract mentally")];
    const p = alignParamFor("northern-ireland", true, "Year 5", sel0, picked)!;
    const block = curriculumPromptBlock(p, "Year 5", "worksheet", worksheetCurriculumRules("Year 5"));
    expect(block).toContain("Northern Ireland Curriculum statutory requirements · Key Stage 2 · Year 5");
    expect(block).toContain("  1. Develop strategies to add and subtract mentally");
  });

  test("nothing is sent when off, empty, uncovered, or from another nation", () => {
    const one = [nicText("nic-ks1", "Use prepositions to state position")];
    expect(alignParamFor("northern-ireland", false, "Year 3", sel0, one)).toBeUndefined();
    expect(alignParamFor("northern-ireland", true, "Year 3", sel0, [])).toBeUndefined();
    // Reception has no Foundation Stage statements here; Year 12 is past Key Stage 4.
    expect(alignParamFor("northern-ireland", true, "Reception", sel0, one)).toBeUndefined();
    expect(alignParamFor("northern-ireland", true, "Year 12", sel0, [nicText("nic-ks4", "xplore self employment")])).toBeUndefined();
    // England's and Scotland's statements are not Northern Ireland's, and the other way round.
    expect(alignParamFor("northern-ireland", true, "Year 3", sel0, englandStatements)).toBeUndefined();
    expect(alignParamFor("northern-ireland", true, "Year 4", sel0, [byCode("MNU 1-02a")])).toBeUndefined();
    expect(alignParamFor("scotland", true, "Year 3", sel0, one)).toBeUndefined();
    expect(alignParamFor("us-ca", true, "Grade 3", sel0, one)).toBeUndefined();
  });

  test("the stage names and framework name are set, and the registry offers no stage at the edges", () => {
    for (const f of NIC_IDS) expect(FRAMEWORK_NAME[f as FrameworkId]).toBe("Northern Ireland Curriculum statutory requirements");
    expect(FRAMEWORK_STAGE["nic-fs"]).toBe("Foundation Stage");
    expect(FRAMEWORK_STAGE["nic-ks1"]).toBe("Key Stage 1");
    expect(FRAMEWORK_STAGE["nic-ks2"]).toBe("Key Stage 2");
    expect(FRAMEWORK_STAGE["nic-ks3"]).toBe("Key Stage 3");
    expect(FRAMEWORK_STAGE["nic-ks4"]).toBe("Key Stage 4");
    expect(usable(getCurriculum("wales")!)).toEqual([]);
  });
});
