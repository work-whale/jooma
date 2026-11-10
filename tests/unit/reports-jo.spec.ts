import { test, expect } from "@playwright/test";
import { applyJoReports, normalizeJoReport, scrubChat, toJoReports, writtenPupils, type ReportJoItem } from "@/app/lib/reports/jo";
import { defaultSettings, newPupil, type PupilRow } from "@/app/lib/reports/reports";
import { payloadStrings, PLACEHOLDER } from "@/app/lib/reports/privacy";
import { carriesName } from "@/app/lib/reports/prompt";
import { applyListOp, listSnapshot, toListItems, typedField } from "@/app/lib/jo/list-ops";
import { joListResponseFormat } from "@/app/lib/jo/list-schema";
import { joListSystem } from "@/app/lib/jo/prompts";

/*
 * Ask Jo on a class's reports: Jo sees numbered reports with [PUPIL], the
 * teacher's messages lose their names on the way out, and Jo may only
 * rewrite a report.
 */

const settings = { ...defaultSettings("Year 4"), subjects: ["Maths"] };
const pupil = (name: string, patch: Partial<PupilRow> = {}): PupilRow => ({ ...newPupil(name), ...patch });

function klass(): PupilRow[] {
  return [
    pupil("Amira", { id: "p1", pronouns: "she", attainment: { Maths: "Greater depth" }, effort: "Excellent", note: "Amira helps Ben.", comment: `${PLACEHOLDER} has worked hard.`, target: `${PLACEHOLDER} to read daily.`, status: "done" }),
    // Not written yet: not in Jo's list.
    pupil("Ben", { id: "p2" }),
    // A report edited by hand with a classmate's name in it.
    pupil("Chloe", { id: "p3", pronouns: "they", comment: `${PLACEHOLDER} sits with Amira and Ben.`, target: "", status: "done" }),
  ];
}

test.describe("what Jo is shown", () => {
  test("only written reports, in order, with every name out", () => {
    const items = toJoReports(klass(), settings);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ pronouns: "she/her", judgements: "Maths: Greater depth; effort: Excellent", note: `${PLACEHOLDER} helps a classmate.`, comment: `${PLACEHOLDER} has worked hard.`, nextStep: `${PLACEHOLDER} to read daily.` });
    expect(items[1].comment).toBe(`${PLACEHOLDER} sits with a classmate and a classmate.`);
    expect(items[1].judgements).toBe("none given");
    const snapshot = listSnapshot("reports", toListItems("reports", items));
    expect(snapshot.items.map((i) => i.id)).toEqual(["r1", "r2"]);
    expect(carriesName(snapshot)).toBe(false);
    expect(payloadStrings(snapshot).join(" ")).not.toMatch(/Amira|Ben|Chloe/);
  });
});

test.describe("what the teacher types", () => {
  test("a written pupil becomes their number, anyone else a classmate", () => {
    const ps = klass();
    expect(scrubChat("Make Amira's report warmer", ps)).toBe("Make pupil 1's report warmer");
    expect(scrubChat("chloe and AMIRA", ps)).toBe("pupil 2 and pupil 1");
    expect(scrubChat("Mention that Ben helped", ps)).toBe("Mention that a classmate helped");
  });

  test("a name inside a longer word is left alone, and longer names go first", () => {
    const ps = [pupil("Ali", { comment: "x" }), pupil("Ann Marie", { comment: "y" }), pupil("Ann", { comment: "z" })];
    expect(scrubChat("Alison asked about Ali, Ann Marie and Ann", ps)).toBe("Alison asked about pupil 1, pupil 2 and pupil 3");
  });

  test("two pupils with one name: the first written one's number", () => {
    const ps = [pupil("Sam", { comment: "a" }), pupil("Sam", { comment: "b" })];
    expect(scrubChat("Sam", ps)).toBe("pupil 1");
  });

  test("no class, no change", () => {
    expect(scrubChat("Shorten them all", [])).toBe("Shorten them all");
  });
});

test.describe("what comes back", () => {
  test("each report lands on its own pupil; judgements and notes cannot change", () => {
    const ps = klass();
    const before = toJoReports(ps, settings);
    const after: ReportJoItem[] = [{ ...before[0], comment: `${PLACEHOLDER} is a joy.`, nextStep: "", note: "changed", judgements: "Maths: 9" }, before[1]];
    const out = applyJoReports(ps, after, before);
    expect(out[0]).toMatchObject({ comment: `${PLACEHOLDER} is a joy.`, target: "", note: "Amira helps Ben.", attainment: { Maths: "Greater depth" } });
    // Unchanged by Jo: the teacher's own words, names and all, are kept.
    expect(out[2].comment).toBe(`${PLACEHOLDER} sits with Amira and Ben.`);
    expect(out[1]).toEqual(ps[1]);
  });

  test("an empty report from Jo keeps what was there", () => {
    const ps = klass();
    const before = toJoReports(ps, settings);
    const out = applyJoReports(ps, [{ ...before[0], comment: "  " }, before[1]], before);
    expect(out[0].comment).toBe(ps[0].comment);
  });

  test("writtenPupils skips a pupil with no report", () => {
    expect(writtenPupils(klass()).map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  test("normalizing Jo's report", () => {
    expect(normalizeJoReport({ comment: " Hi ", nextStep: 3 })).toEqual({ pronouns: "", judgements: "", note: "", comment: "Hi", nextStep: "" });
    expect(normalizeJoReport({ comment: "" })).toBeNull();
    expect(normalizeJoReport(null)).toBeNull();
  });
});

test.describe("Jo may only rewrite", () => {
  const items = toListItems("reports", toJoReports(klass(), settings));
  const item = { pronouns: "she/her", judgements: "", note: "", comment: "New", nextStep: "" };

  test("replaceItem works; insert, delete and move do nothing", () => {
    expect(applyListOp("reports", items, { op: "replaceItem", label: "x", itemId: "r1", item })!.items[0].value.comment).toBe("New");
    expect(applyListOp("reports", items, { op: "insertItem", label: "x", afterItemId: "r1", item })).toBeNull();
    expect(applyListOp("reports", items, { op: "deleteItem", label: "x", itemId: "r1" })).toBeNull();
    expect(applyListOp("reports", items, { op: "moveItem", label: "x", itemId: "r2", afterItemId: "" })).toBeNull();
    expect(typedField("reports")).toBe("comment");
  });

  test("the schema offers replaceItem only, strict", () => {
    const f = joListResponseFormat("reports");
    expect(f.json_schema.strict).toBe(true);
    const ops = (f.json_schema.schema as unknown as { properties: { ops: { items: { anyOf: { properties: { op: { enum: string[] } } }[] } } } }).properties.ops.items.anyOf;
    expect(ops.map((o) => o.properties.op.enum[0])).toEqual(["replaceItem"]);
    // The quiz keeps all four.
    const quizOps = (joListResponseFormat("quiz").json_schema.schema as unknown as { properties: { ops: { items: { anyOf: unknown[] } } } }).properties.ops.items.anyOf;
    expect(quizOps).toHaveLength(4);
  });

  test("the prompt: [PUPIL] only, nothing invented, no long dashes", () => {
    const sys = joListSystem({ canAsk: true, guest: false, tool: "reports" });
    expect(sys).toContain("Write [PUPIL], exactly like that");
    expect(sys).toContain("Never state an attainment");
    expect(sys).toContain("You cannot add, remove or reorder pupils");
    expect(sys).not.toMatch(/[–—]/);
  });
});
