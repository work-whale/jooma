import { test, expect } from "@playwright/test";

import { comprehensionMessages } from "@/app/lib/comprehension-prompt";
import { getCurriculum } from "@/app/lib/curricula";
import { suggestedPassageWords } from "@/app/lib/curricula/tool-scope";

/*
 * The comprehension passage's default length follows the year's starting age,
 * so a Nursery or Reception child is not handed 300 words (approved 2026-11-25).
 *
 *   age 3 or 4 -> 100    age 5 -> 150    age 6 -> 200    age 7 or more -> 300
 *
 * Unknown year, empty year and a mixed class stay at 300. UK-like curricula
 * read England's ages through the year label (Northern Ireland through its own
 * list); every other system reads the age on its own year list.
 */

test.describe("by age, on England's list", () => {
  // Every row would fail if the thresholds moved by one year either way.
  const rows: Array<[string, number]> = [
    ["Nursery", 100], // age 3
    ["Reception", 100], // age 4
    ["Year 1", 150], // age 5
    ["Year 2", 200], // age 6
    ["Year 3", 300], // age 7
    ["Year 6", 300],
    ["Year 11", 300],
  ];
  for (const [year, words] of rows) {
    test(`${year} -> ${words}`, () => {
      expect(suggestedPassageWords(year, false, "england")).toBe(words);
    });
  }

  test("no curriculum, an unknown id and EYFS read England's ages too", () => {
    for (const id of [null, undefined, "", "not-a-curriculum", "england-eyfs", "scotland", "wales", "jersey"]) {
      expect(suggestedPassageWords("Reception", false, id), String(id)).toBe(100);
      expect(suggestedPassageWords("Year 1", false, id), String(id)).toBe(150);
      expect(suggestedPassageWords("Year 2", false, id), String(id)).toBe(200);
      expect(suggestedPassageWords("Year 3", false, id), String(id)).toBe(300);
    }
  });
});

test.describe("Northern Ireland, on its own year list", () => {
  // Year N starts at age N + 3 in England's terms, so NI Year 1 is 4 years old.
  const rows: Array<[string, number]> = [
    ["Nursery", 100], // age 3
    ["Year 1", 100], // age 4
    ["Year 2", 150], // age 5
    ["Year 3", 200], // age 6
    ["Year 4", 300], // age 7
    ["Year 8", 300],
  ];
  for (const [year, words] of rows) {
    test(`${year} -> ${words}`, () => {
      expect(suggestedPassageWords(year, false, "northern-ireland")).toBe(words);
    });
  }

  test("the same label differs from England's: Year 1 is 150 there and 100 here", () => {
    expect(suggestedPassageWords("Year 1", false, "england")).toBe(150);
    expect(suggestedPassageWords("Year 1", false, "northern-ireland")).toBe(100);
  });
});

test.describe("other systems, by the age on their own list", () => {
  test("Kenya: PP1 4, PP2 5, Grade 1 6, Grade 2 7", () => {
    expect(suggestedPassageWords("PP1", false, "kenya")).toBe(100);
    expect(suggestedPassageWords("PP2", false, "kenya")).toBe(150);
    expect(suggestedPassageWords("Grade 1", false, "kenya")).toBe(200);
    expect(suggestedPassageWords("Grade 2", false, "kenya")).toBe(300);
  });

  test("Ireland: Junior Infants 4, Senior Infants 5, 1st Class 6, 2nd Class 7", () => {
    expect(suggestedPassageWords("Junior Infants", false, "ireland")).toBe(100);
    expect(suggestedPassageWords("Senior Infants", false, "ireland")).toBe(150);
    expect(suggestedPassageWords("1st Class", false, "ireland")).toBe(200);
    expect(suggestedPassageWords("2nd Class", false, "ireland")).toBe(300);
  });

  test("an England label is not read on a non-UK list", () => {
    // "Reception" is not a Kenyan year, so it must not borrow England's age 4.
    expect(suggestedPassageWords("Reception", false, "kenya")).toBe(300);
    expect(suggestedPassageWords("Year 1", false, "ireland")).toBe(300);
  });

  test("every year of every non-UK system follows its own age", () => {
    for (const id of ["kenya", "ireland", "south-africa", "singapore"]) {
      const c = getCurriculum(id);
      expect(c, id).toBeTruthy();
      if (!c) continue;
      for (const y of c.years) {
        const want = y.age <= 4 ? 100 : y.age === 5 ? 150 : y.age === 6 ? 200 : 300;
        expect(suggestedPassageWords(y.label, false, id), `${id} ${y.label}`).toBe(want);
      }
    }
  });
});

test.describe("what stays at 300", () => {
  test("a mixed-year class, even when the year is a young one", () => {
    expect(suggestedPassageWords("Reception", true, "england")).toBe(300);
    expect(suggestedPassageWords("PP1", true, "kenya")).toBe(300);
    expect(suggestedPassageWords("", true, "england")).toBe(300);
  });

  test("no year chosen yet, and a label the list does not have", () => {
    expect(suggestedPassageWords("", false, "england")).toBe(300);
    expect(suggestedPassageWords("", false, "kenya")).toBe(300);
    expect(suggestedPassageWords("Year 99", false, "england")).toBe(300);
    expect(suggestedPassageWords("Mixed", false, "england")).toBe(300);
    expect(suggestedPassageWords("reception", false, "england")).toBe(300);
  });
});

// A 100 word passage in 3 to 7 paragraphs is nonsense for a 4 year old, so the
// prompt asks for fewer when the passage is short. Longer passages keep the
// wording the golden requests pin.
test.describe("the prompt for a short passage", () => {
  const userText = (passageWordCount: number, band?: string) => {
    const built = comprehensionMessages({
      curriculum: "2014 National Curriculum",
      yearGroup: "Reception",
      textSource: "generate",
      topic: "Ducks",
      passageWordCount,
      contentDomains: ["1a: draw on vocabulary"],
      numQuestions: 2,
      complexity: "Simple",
      band,
    });
    if ("error" in built) throw new Error(built.error);
    return built.messages[1].content;
  };

  test("100 words asks for 1 to 3 short paragraphs and says so for simple readers", () => {
    const t = userText(100);
    expect(t).toContain("about 100 words, for simple readers in Reception");
    expect(t).toContain("1 to 3 short paragraphs");
    expect(t).not.toContain("3 to 7 paragraphs");
  });

  test("150 words is still short, 200 and over keep 3 to 7 paragraphs", () => {
    expect(userText(150)).toContain("1 to 3 short paragraphs");
    expect(userText(200)).toContain("3 to 7 paragraphs");
    expect(userText(300)).toContain("3 to 7 paragraphs");
  });

  test("a supported version of a 300 word passage (210 words) keeps 3 to 7; of a 200 word one (140) goes short", () => {
    expect(userText(300, "WTS")).toContain("3 to 7 paragraphs");
    expect(userText(200, "WTS")).toContain("1 to 3 short paragraphs");
  });
});
