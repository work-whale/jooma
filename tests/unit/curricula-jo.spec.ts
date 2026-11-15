import { test, expect } from "@playwright/test";

import { CURRICULA_REGISTRY, yearsFor } from "@/app/lib/curricula";
import { fitPrefillToCurriculum, JO_CURRICULUM_VALUES, JO_YEAR_VALUES } from "@/app/lib/curricula/jo";
import { CURRICULA, YEAR_GROUPS } from "@/app/lib/formOptions";

/*
 * Jo opening a tool for a teacher on any school system.
 *
 * Jo is told to default the curriculum to "2014 National Curriculum" and to
 * use England's year names. For a teacher whose own curriculum is something
 * else, the prefill is fitted afterwards, in code: their curriculum unless
 * they named England's, and the year at the same age in their system.
 */

const fit = (fields: Record<string, unknown>, teacher: string | null, said: string) => {
  const copy = { ...fields };
  fitPrefillToCurriculum(copy, teacher, said);
  return copy;
};

test("Jo's lists start with exactly today's UK values, then every other system's", () => {
  expect(JO_CURRICULUM_VALUES.slice(0, CURRICULA.length)).toEqual(CURRICULA.map((c) => c.value));
  expect(JO_YEAR_VALUES.slice(0, YEAR_GROUPS.length)).toEqual(YEAR_GROUPS);
  for (const c of CURRICULA_REGISTRY) {
    expect(JO_CURRICULUM_VALUES).toContain(c.promptLabel);
    for (const y of c.years) expect(JO_YEAR_VALUES).toContain(y.label);
  }
  expect(new Set(JO_YEAR_VALUES).size).toBe(JO_YEAR_VALUES.length);
});

test("an England teacher's prefill is left exactly as Jo made it", () => {
  const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 4", topic: "Fractions" };
  for (const teacher of ["england", null, "nonsense"]) expect(fit(fields, teacher, "Year 4 fractions worksheet")).toEqual(fields);
});

test("the England default becomes the teacher's own curriculum, with the year at the same age", () => {
  expect(fit({ curriculum: "2014 National Curriculum", yearGroup: "Year 4" }, "ireland", "a fractions worksheet for my class")).toEqual({
    curriculum: "Irish Curriculum (NCCA)",
    yearGroup: "3rd Class",
  });
  expect(fit({ curriculum: "2014 National Curriculum", yearGroup: "Year 9" }, "ib-myp", "rivers quiz")).toEqual({
    curriculum: "IB Middle Years Programme (MYP)",
    yearGroup: "MYP 3",
  });
  expect(fit({ curriculum: "2014 National Curriculum", yearGroup: "Year 5" }, "scotland", "a lesson on the Romans")).toEqual({
    curriculum: "Scottish Curriculum for Excellence",
    yearGroup: "Year 5",
  });
});

test("a teacher who names England's curriculum gets it, whatever their own", () => {
  for (const said of ["KS2 SATs practice", "a GCSE biology paper", "using the National Curriculum in England", "for my EYFS class"]) {
    expect(fit({ curriculum: "2014 National Curriculum", yearGroup: "Year 6" }, "ireland", said), said).toEqual({ curriculum: "2014 National Curriculum", yearGroup: "Year 6" });
  }
});

test("a curriculum Jo chose on purpose is kept, and its year fitted", () => {
  expect(fit({ curriculum: "Welsh Curriculum", yearGroup: "Year 3" }, "ireland", "a Welsh school's worksheet")).toEqual({ curriculum: "Welsh Curriculum", yearGroup: "Year 3" });
  expect(fit({ curriculum: "IB Diploma Programme (DP)", yearGroup: "Year 12" }, "ireland", "an IB DP essay plan")).toEqual({ curriculum: "IB Diploma Programme (DP)", yearGroup: "DP 1" });
});

test("a year with no match at that age is dropped rather than left wrong", () => {
  expect(fit({ curriculum: "2014 National Curriculum", yearGroup: "Year 1" }, "ib-dp", "essay")).toEqual({ curriculum: "IB Diploma Programme (DP)" });
});

test("a year that is already right is kept, and a missing one stays missing", () => {
  expect(fit({ curriculum: "2014 National Curriculum", yearGroup: "3rd Class" }, "ireland", "x")).toEqual({ curriculum: "Irish Curriculum (NCCA)", yearGroup: "3rd Class" });
  expect(fit({ curriculum: "2014 National Curriculum" }, "ireland", "x")).toEqual({ curriculum: "Irish Curriculum (NCCA)" });
});

test("a tool with no curriculum field is left alone", () => {
  expect(fit({ yearGroup: "Year 4", topic: "Kindness" }, "ireland", "x")).toEqual({ yearGroup: "Year 4", topic: "Kindness" });
});

test("every fitted year is one the form will show", () => {
  for (const c of CURRICULA_REGISTRY) {
    for (const y of YEAR_GROUPS) {
      const out = fit({ curriculum: "2014 National Curriculum", yearGroup: y }, c.id, "x");
      if (out.yearGroup !== undefined) expect(yearsFor(out.curriculum).map((v) => v.label), `${c.id} ${y}`).toContain(out.yearGroup);
    }
  }
});

test("the slides wizard's year is fitted too, for a teacher outside the UK", () => {
  expect(fit({ topic: "Volcanoes", year: "Year 4" }, "ireland", "volcano slides")).toEqual({ topic: "Volcanoes", year: "3rd Class" });
  expect(fit({ topic: "Volcanoes", year: "Year 4" }, "us-ca", "volcano slides")).toEqual({ topic: "Volcanoes", year: "Grade 3" });
  expect(fit({ topic: "Volcanoes", year: "Adult learners" }, "us-ca", "x")).toEqual({ topic: "Volcanoes", year: "Adult learners" });
  // UK-like teachers keep the wizard's own list.
  for (const t of ["england", "scotland", "jersey", null]) expect(fit({ topic: "Volcanoes", year: "Year 4" }, t, "x")).toEqual({ topic: "Volcanoes", year: "Year 4" });
  // England's Year 13 starts at 17, which is Year 12 in Queensland.
  expect(fit({ topic: "Volcanoes", year: "Year 13" }, "au-qld", "x")).toEqual({ topic: "Volcanoes", year: "Year 12" });
  // No year at that age: dropped, so the wizard shows "Any year".
  expect(fit({ topic: "Volcanoes", year: "Nursery" }, "au-qld", "x")).toEqual({ topic: "Volcanoes" });
});
