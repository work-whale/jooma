import { test, expect } from "@playwright/test";

import { getCurriculum } from "@/app/lib/curricula";
import { FRAMEWORK_AGES, statementsForAge, type FrameworkData, type FrameworkId, type Statement } from "@/app/lib/standards";
import ccssMath from "@/app/lib/standards/data/ccss-math.json";
import ccssEla from "@/app/lib/standards/data/ccss-ela.json";
import ac9 from "@/app/lib/standards/data/ac9.json";
import cfeThirdFourth from "@/app/lib/standards/data/cfe-third-fourth.json";
import nicKs1 from "@/app/lib/standards/data/nic-ks1.json";
import {
  MAX_CANDIDATES,
  MAX_PROMPT_CHARS,
  capCandidates,
  filterBySubject,
  matchingSubjects,
  resolvePicks,
  suggestBody,
  suggestKey,
  suggestPrompt,
} from "@/app/lib/standards/suggest";
import primary from "@/app/lib/national-curriculum/data/primary.json";
import earlyYears from "@/app/lib/national-curriculum/data/early-years.json";

/*
 * The topic matcher (/api/suggest-subject) sends a numbered list of candidate
 * statements to the model. Two things keep that list small, whatever a guest
 * types: the teacher's subject narrows it to that subject's statements, and a
 * hard cap holds it to MAX_CANDIDATES and the whole prompt to MAX_PROMPT_CHARS.
 */

type S = Pick<Statement, "id" | "subject" | "strand" | "text">;

// The unit runner cannot dynamic-import JSON, so the files the tests use are
// imported here, as the other standards specs do.
const DATA: Partial<Record<FrameworkId, unknown>> = {
  "ccss-math": ccssMath,
  "ccss-ela": ccssEla,
  ac9,
  "cfe-third-fourth": cfeThirdFourth,
  "nic-ks1": nicKs1,
};

async function year(ids: FrameworkId[], age: number): Promise<S[]> {
  for (const f of ids) expect(FRAMEWORK_AGES[f], f).toContain(age);
  return statementsForAge(ids.map((f) => DATA[f] as FrameworkData), age);
}

const england = (y: number | "Reception") =>
  (y === "Reception" ? (earlyYears as { statements: (S & { years: unknown[] })[] }) : (primary as { statements: (S & { years: unknown[] })[] })).statements.filter((s) =>
    s.years.includes(y),
  );

const subjectsOf = (list: S[]) => [...new Set(list.map((s) => s.subject))];

test.describe("filterBySubject: the teacher's subject narrows the candidates", () => {
  test("Scotland, Third and fourth level (Years 8 to 10, 567 statements)", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    expect(all.length).toBe(567);
    for (const [typed, subject] of [
      ["Maths", "Numeracy and mathematics"],
      ["maths", "Numeracy and mathematics"],
      ["Mathematics", "Numeracy and mathematics"],
      ["Numeracy", "Numeracy and mathematics"],
      ["English", "Literacy and English"],
      ["Science", "Sciences"],
      ["Biology", "Sciences"],
      ["History", "Social studies"],
      ["Geography", "Social studies"],
      ["French", "Modern languages"],
      ["Latin", "Classical languages"],
      ["Music", "Expressive arts"],
      ["PE", "Health and wellbeing"],
      ["RE", "Religious and moral education"],
      ["Computing", "Technologies"],
    ] as const) {
      const got = filterBySubject(all, typed);
      expect(got.length, typed).toBeGreaterThan(0);
      expect(subjectsOf(got), typed).toContain(subject);
      // Never the whole year: the point is a smaller list.
      expect(got.length, typed).toBeLessThan(all.length);
    }
    // Exactly that subject's statements, all of them, in the data's order.
    const maths = filterBySubject(all, "Maths");
    expect(maths).toEqual(all.filter((s) => s.subject === "Numeracy and mathematics"));
    expect(maths.length).toBe(66);
  });

  test("Scotland: RE names both religious education areas, and English never pulls in a language", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    expect(subjectsOf(filterBySubject(all, "Religious education")).sort()).toEqual(
      ["Religious and moral education", "Religious education in Roman Catholic schools"],
    );
    expect(subjectsOf(filterBySubject(all, "English"))).toEqual(["Literacy and English"]);
    expect(subjectsOf(filterBySubject(all, "French"))).toEqual(["Modern languages"]);
  });

  test("Northern Ireland, Key Stage 1 (Year 3)", async () => {
    const all = await year(["nic-ks1"], 6);
    expect(subjectsOf(filterBySubject(all, "Maths"))).toEqual(["Mathematics and Numeracy"]);
    expect(subjectsOf(filterBySubject(all, "English"))).toEqual(["Language and Literacy"]);
    // Science, history and geography are all The World Around Us at this stage.
    for (const typed of ["Science", "History", "Geography"]) {
      expect(subjectsOf(filterBySubject(all, typed)), typed).toEqual(["The World Around Us"]);
    }
    expect(subjectsOf(filterBySubject(all, "PE"))).toEqual(["Physical Education"]);
    expect(subjectsOf(filterBySubject(all, "PSHE"))).toEqual(["Personal Development and Mutual Understanding"]);
    expect(subjectsOf(filterBySubject(all, "Art"))).toEqual(["The Arts"]);
  });

  test("England, Year 4 and Reception", () => {
    const y4 = england(4);
    expect(subjectsOf(filterBySubject(y4, "Maths"))).toEqual(["Maths"]);
    expect(subjectsOf(filterBySubject(y4, "History"))).toEqual(["History"]);
    expect(subjectsOf(filterBySubject(y4, "Science"))).toEqual(["Science"]);
    // English is not Languages, and French is not English.
    expect(subjectsOf(filterBySubject(y4, "English"))).toEqual(["English"]);
    expect(subjectsOf(filterBySubject(y4, "French"))).toEqual(["Languages"]);
    expect(subjectsOf(filterBySubject(y4, "Design and technology"))).toEqual(["Design and technology"]);
    const reception = england("Reception");
    expect(subjectsOf(filterBySubject(reception, "Maths"))).toEqual(["Mathematics"]);
    expect(subjectsOf(filterBySubject(reception, "English")).sort()).toEqual(["Communication and Language", "Literacy"]);
  });

  test("United States (Grade 3: Common Core maths and ELA) and Australia (Year 5)", async () => {
    const us = await year(["ccss-math", "ccss-ela"], 8);
    expect(subjectsOf(filterBySubject(us, "Math"))).toEqual(["Mathematics"]);
    expect(subjectsOf(filterBySubject(us, "ELA"))).toEqual(["English Language Arts"]);
    expect(subjectsOf(filterBySubject(us, "Reading"))).toEqual(["English Language Arts"]);
    const au = await year(["ac9"], 10);
    expect(subjectsOf(filterBySubject(au, "Science"))).toEqual(["Science"]);
    expect(subjectsOf(filterBySubject(au, "Maths"))).toEqual(["Mathematics"]);
  });

  test("no match, an empty subject, or a subject this year lacks: every statement, never none", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    for (const typed of ["Underwater basket weaving", "", "   ", undefined, null, "xyz"]) {
      expect(filterBySubject(all, typed), String(typed)).toEqual(all);
    }
    // French is a real subject, but NI Key Stage 1 has no languages: all of it.
    const ni = await year(["nic-ks1"], 6);
    expect(filterBySubject(ni, "French")).toEqual(ni);
    // An empty list stays empty.
    expect(filterBySubject([], "Maths")).toEqual([]);
  });

  test("a subject word must be a word: 'Art' is not 'Earth', 'Maths' is not 'aftermath'", () => {
    const subjects = ["Expressive arts", "Sciences", "Numeracy and mathematics"];
    expect(matchingSubjects("Earth science", subjects)).toEqual(["Sciences"]);
    expect(matchingSubjects("Aftermath of war", subjects)).toEqual([]);
    expect(matchingSubjects("Art", subjects)).toEqual(["Expressive arts"]);
  });

  test("the subject wins over the topic; the topic is used only when the subject names nothing", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    expect(subjectsOf(filterBySubject(all, "Maths", "The history of zero"))).toEqual(["Numeracy and mathematics"]);
    expect(subjectsOf(filterBySubject(all, "", "Year 9 science: cells and microscopes"))).toEqual(["Sciences"]);
    expect(subjectsOf(filterBySubject(all, "Underwater basket weaving", "History of Scotland"))).toEqual(["Social studies"]);
    expect(filterBySubject(all, "", "Fractions")).toEqual(all);
  });
});

test.describe("capCandidates: a hard cap whatever the filter does", () => {
  test("never more than MAX_CANDIDATES, each one from the input, none repeated, in the input's order", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    expect(MAX_CANDIDATES).toBeLessThanOrEqual(150);
    const capped = capCandidates(all, "anything at all");
    expect(capped.length).toBe(MAX_CANDIDATES);
    expect(new Set(capped.map((s) => s.id)).size).toBe(capped.length);
    const index = capped.map((s) => all.indexOf(s));
    expect(index.every((i) => i >= 0)).toBe(true);
    expect(index).toEqual([...index].sort((a, b) => a - b));
  });

  test("the statements that share the topic's words are the ones kept", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    // Late in the list, so a plain slice(0, 150) would drop them.
    const late = all.filter((s, i) => i > 300 && /photosynthesis|algorithms/i.test(s.text));
    expect(late.length).toBe(2);
    const capped = capCandidates(all, "Photosynthesis and algorithms");
    for (const s of late) expect(capped, s.id).toContain(s);
    // And a plain slice would not have kept them.
    for (const s of late) expect(all.slice(0, MAX_CANDIDATES)).not.toContain(s);
  });

  test("a list already under the cap is returned whole and unchanged", async () => {
    const ni = await year(["nic-ks1"], 7);
    expect(ni.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(capCandidates(ni, "fractions")).toEqual(ni);
    expect(capCandidates([], "fractions")).toEqual([]);
  });

  test("an empty topic still caps", () => {
    const many: S[] = Array.from({ length: 1000 }, (_, i) => ({ id: `x-${i}`, subject: "S", strand: "T", text: `Statement ${i}` }));
    expect(capCandidates(many, "").length).toBe(MAX_CANDIDATES);
  });
});

test.describe("suggestPrompt: the list sent to the model", () => {
  const huge: S[] = Array.from({ length: 2000 }, (_, i) => ({
    id: `x-${i}`,
    subject: "A very long subject name ".repeat(4),
    strand: "A very long strand name ".repeat(4),
    text: `Statement ${i} `.padEnd(2000, "w"),
  }));

  test("the whole prompt stays under MAX_PROMPT_CHARS, even for 2,000 long statements and a long topic", () => {
    const p = suggestPrompt({ topic: "t".repeat(5000), year: "Year 9", statements: huge });
    expect(p.system.length + p.user.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(p.candidates.length).toBeGreaterThan(0);
    expect(p.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    // Every candidate is numbered in the prompt, and nothing beyond them is.
    expect(p.user).toContain(`\n${p.candidates.length}. [`);
    expect(p.user).not.toContain(`\n${p.candidates.length + 1}. [`);
  });

  test("the real Scotland Years 8 to 10 list, with no subject, fits", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    const p = suggestPrompt({ topic: "Pythagoras", year: "Year 8", statements: all });
    expect(p.candidates.length).toBe(MAX_CANDIDATES);
    expect(p.system.length + p.user.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });

  test("with a subject, only that subject's statements are numbered", async () => {
    const all = await year(["cfe-third-fourth"], 12);
    const p = suggestPrompt({ topic: "Pythagoras", year: "Year 8", statements: all, subject: "Maths" });
    expect(subjectsOf(p.candidates)).toEqual(["Numeracy and mathematics"]);
    expect(p.candidates.length).toBe(66);
    expect(p.user).not.toContain("[Sciences >");
  });

  test("the topic and year are in the prompt; the topic is cut to 300 characters", () => {
    const p = suggestPrompt({ topic: "Volcanoes", year: "Year 4", statements: huge.slice(0, 3) });
    expect(p.user).toContain('Lesson topic: "Volcanoes"');
    expect(p.user).toContain("Year group: Year 4");
    const long = suggestPrompt({ topic: "v".repeat(400), year: "Year 4", statements: huge.slice(0, 3) });
    expect(long.user).toContain(`"${"v".repeat(300)}"`);
    expect(long.user).not.toContain("v".repeat(301));
  });
});

test.describe("resolvePicks: numbers point into the candidates, not the whole year", () => {
  const all: S[] = Array.from({ length: 10 }, (_, i) => ({ id: `s-${i}`, subject: i < 5 ? "Maths" : "English", strand: "x", text: `t${i}` }));
  const candidates = all.slice(5);

  test("1 is the first candidate", () => {
    expect(resolvePicks([1, 2], candidates).map((s) => s.id)).toEqual(["s-5", "s-6"]);
  });

  test("out of range, zero, negative, fractional, repeated and non-numbers are dropped", () => {
    expect(resolvePicks([0, -1, 6, 99, 1.5, 1, 1, "2" as unknown as number, null as unknown as number], candidates).map((s) => s.id)).toEqual(["s-5"]);
    expect(resolvePicks("nope" as unknown as number[], candidates)).toEqual([]);
  });
});

test("the registry still names Scotland's Year 8 as Third and fourth level (the list these tests use)", () => {
  expect(getCurriculum("scotland")?.years.find((y) => y.label === "Year 8")?.age).toBe(12);
});

test.describe("suggestBody: what the card sends to the matcher", () => {
  test("England's body is exactly as before, with or without a subject (the deck spec pins it)", () => {
    expect(suggestBody({ topic: "Fractions", year: "Year 4", england: true })).toEqual({ topic: "Fractions", year: "Year 4", curriculumId: undefined });
    expect(suggestBody({ topic: "Fractions", year: "Year 4", england: true, subject: "Maths" })).toEqual({ topic: "Fractions", year: "Year 4", curriculumId: undefined });
    // JSON drops the undefined id: what reaches the server is topic and year alone.
    expect(JSON.parse(JSON.stringify(suggestBody({ topic: "Fractions", year: "Year 4", england: true, subject: "Maths", curriculumId: "england" })))).toEqual({ topic: "Fractions", year: "Year 4" });
  });

  test("another curriculum adds the subject only when the card has one", () => {
    expect(suggestBody({ topic: "Place value", year: "Year 4", england: false, curriculumId: "scotland", subject: " Maths " })).toEqual({
      topic: "Place value", year: "Year 4", curriculumId: "scotland", subject: "Maths",
    });
    for (const subject of [undefined, "", "   "]) {
      const body = suggestBody({ topic: "Place value", year: "Year 4", england: false, curriculumId: "scotland", subject });
      expect(body, String(subject)).toEqual({ topic: "Place value", year: "Year 4", curriculumId: "scotland" });
      expect("subject" in body, String(subject)).toBe(false);
    }
  });
});

test.describe("suggestKey: when the card may ask the matcher, and when it has already asked", () => {
  // Regression, found by the live run on 2026-11-20: in the slides wizard the
  // teacher's curriculum loads after the card opens. The card asked with
  // England's body (the hook's default) and never asked again for Scotland.
  test("not before the teacher's curriculum is known", () => {
    expect(suggestKey({ curriculumKnown: false, curriculumId: "england", year: "Year 4", topic: "Place value" })).toBeNull();
    expect(suggestKey({ curriculumKnown: true, curriculumId: "scotland", year: "Year 4", topic: "Place value" })).not.toBeNull();
  });

  test("a change of curriculum is a new question; the same one, however typed, is not", () => {
    const k = (curriculumId: string, topic = "Place value", year = "Year 4") => suggestKey({ curriculumKnown: true, curriculumId, year, topic });
    expect(k("scotland")).not.toBe(k("england"));
    expect(k("scotland")).not.toBe(k("northern-ireland"));
    expect(k("scotland", "  PLACE value ")).toBe(k("scotland"));
    expect(k("scotland", "Place value", "Year 5")).not.toBe(k("scotland"));
  });

  test("an empty topic never asks", () => {
    expect(suggestKey({ curriculumKnown: true, curriculumId: "scotland", year: "Year 4", topic: "   " })).toBeNull();
  });
});
