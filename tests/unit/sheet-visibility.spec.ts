import { test, expect } from "@playwright/test";
import { hasDifferentiationNote, isDifferentiationNote, showsIntro, showsObjective, visibleNotes } from "@/app/lib/sheets/visibility";
import { hasAnswersPage } from "@/app/lib/sheets/markdown";
import { defaultDesign } from "@/app/lib/sheets/normalize";
import { SHEET_KIND, SHEET_VERSION, type SheetDesign, type SheetDoc } from "@/app/lib/sheets/types";

/*
 * The Design panel's toggles for the learning objective, the "Did you know?"
 * box and the differentiation note. Sheets saved before these toggles have no
 * value for them, and must look as they always did.
 */

const PITCHED = { title: "How this version is pitched: Working towards", points: ["Fewer steps."] };
const BLENDED = { title: "Differentiation", points: ["Support with a word bank."] };
const MISCONCEPTIONS = { title: "Common misconceptions", points: ["Adding the denominators."] };

function sheet(design: Partial<SheetDesign> = {}, teacherNotes = [MISCONCEPTIONS, PITCHED]): SheetDoc {
  return {
    kind: SHEET_KIND,
    version: SHEET_VERSION,
    tool: "worksheet",
    title: "Fractions",
    subtitle: "Year 5 · Maths",
    objective: "I am learning to add fractions.",
    intro: { variant: "fact", label: "Did you know?", emoji: "📢", text: "Pizza is cut in fractions." },
    sections: [],
    teacherNotes,
    design: { ...defaultDesign("worksheet", "classic"), ...design },
  };
}

test.describe("what the design toggles leave on the page", () => {
  test("the differentiation note is the one the prompts title for a band or a blended sheet", () => {
    expect(isDifferentiationNote(PITCHED)).toBe(true);
    expect(isDifferentiationNote(BLENDED)).toBe(true);
    expect(isDifferentiationNote(MISCONCEPTIONS)).toBe(false);
    expect(hasDifferentiationNote(sheet())).toBe(true);
    expect(hasDifferentiationNote(sheet({}, [MISCONCEPTIONS]))).toBe(false);
  });

  test("new sheets start with everything on", () => {
    const d = defaultDesign("comprehension", "classic");
    expect([d.objective, d.intro, d.diffNote]).toEqual([true, true, true]);
  });

  test("a sheet saved before the toggles shows everything", () => {
    const old = sheet();
    delete old.design.objective;
    delete old.design.intro;
    delete old.design.diffNote;
    expect(showsObjective(old)).toBe(true);
    expect(showsIntro(old)).toBe(true);
    expect(visibleNotes(old).map((n) => n.note.title)).toEqual([MISCONCEPTIONS.title, PITCHED.title]);
  });

  test("switching each one off hides only that piece", () => {
    expect(showsObjective(sheet({ objective: false }))).toBe(false);
    expect(showsIntro(sheet({ intro: false }))).toBe(false);
    // The note keeps its index in the sheet, so an edit lands on the right one.
    expect(visibleNotes(sheet({ diffNote: false }))).toEqual([{ note: MISCONCEPTIONS, index: 0 }]);
    expect(visibleNotes(sheet({ diffNote: false }, [PITCHED, MISCONCEPTIONS]))).toEqual([{ note: MISCONCEPTIONS, index: 1 }]);
  });

  test("with no questions and only the differentiation note, hiding it leaves no answers page", () => {
    expect(hasAnswersPage(sheet({}, [BLENDED]))).toBe(true);
    expect(hasAnswersPage(sheet({ diffNote: false }, [BLENDED]))).toBe(false);
  });
});
