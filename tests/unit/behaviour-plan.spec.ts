import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { sheetContext } from "@/app/lib/sheets/context";
import { normalizeBlock, normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetToMarkdown, sheetOutline } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { BEHAVIOUR_LIST_FIELDS, INCIDENT_LOG_ROWS, factDate, type PupilFact } from "@/app/lib/sheets/behaviour";
import { behaviourRequest, behaviourResponseFormat, carriesPupilName, type BehaviourPlanRequest } from "@/app/lib/behaviour-prompt";
import { pronounsFromInput, scrubPupilText, withPupilName } from "@/app/lib/sheets/pupil";
import { applySheetOp, sheetSnapshot } from "@/app/lib/jo/sheet-ops";
import { payloadStrings } from "@/app/lib/reports/privacy";
import type { SheetDoc, TableBlock, TwoColBlock } from "@/app/lib/sheets/types";

/*
 * Behaviour Support Plan as a sheet: the familiar two-column plan, the child
 * as [PUPIL] everywhere a model could see, and the details, incident log and
 * signatures built in code from what the teacher typed, never sent. Pure;
 * nothing reaches a model.
 */

const DASHES = /[–—]/;

/** What the model would send. */
const MODEL_PLAN: Record<string, unknown> = {
  ...Object.fromEntries(BEHAVIOUR_LIST_FIELDS.map((f) => [f, [`${f} point for [PUPIL]`]])),
  escalation: "Tell the head of year if [PUPIL] leaves the room.",
};

const FACTS: PupilFact[] = [
  { label: "Year group", value: "Year 7" },
  { label: "Class", value: "7R" },
  { label: "Additional needs", value: "ADHD" },
  { label: "Staff working with [PUPIL]", value: "Mrs Okafor, Mr Lane" },
  { label: "Plan starts", value: factDate("2026-11-11") },
  { label: "Next review", value: factDate("2027-01-20") },
];

const planFor = (draft: unknown = MODEL_PLAN, name = "Sam"): SheetDoc =>
  normalizeDraft(draft, sheetContext("behaviourPlan", { yearGroup: "Year 7", pupil: { name, pronouns: "he" }, pupilFacts: FACTS }));

test.describe("arranging the plan", () => {
  test("details first, the paired boxes in their sections, then the log and signatures", () => {
    const d = planFor();
    expect(d.sections.map((s) => s.title)).toEqual([
      "Pupil details",
      "Behaviours and targets",
      "Keeping things positive",
      "If an incident happens",
      "Strengths and dislikes",
      "Reviewing the plan",
      "Log of incidents",
      "Agreement",
    ]);
    expect(d.sections.map((s) => s.role ?? "")).toEqual(["details", "", "", "", "", "", "log", "signatures"]);
  });

  test("the boxes pair what staff expect to see side by side", () => {
    const box = planFor().sections[1].blocks[0] as TwoColBlock;
    expect(box.type).toBe("twocol");
    expect(box.left).toEqual({ title: "What does the behaviour look like?", items: ["behaviours point for [PUPIL]"] });
    expect(box.right.title).toBe("What are we working towards?");
  });

  test("high-risk times and when to tell another adult are in the plan", () => {
    const d = planFor();
    const positive = d.sections.find((s) => s.title === "Keeping things positive")!;
    expect(positive.blocks.at(-1)).toMatchObject({ type: "list", title: "Situations and times likely to trigger a reaction" });
    const incident = d.sections.find((s) => s.title === "If an incident happens")!;
    expect(incident.blocks.at(-1)).toMatchObject({ type: "callout", label: "Tell another adult when:" });
  });

  test("the details table holds [PUPIL] and the form's facts; the log is blank rows to write in", () => {
    const d = planFor();
    const details = d.sections[0].blocks[0] as TableBlock;
    expect(details.headers).toEqual([]);
    expect(details.rows[0]).toEqual(["Pupil", "[PUPIL]"]);
    expect(details.rows).toContainEqual(["Class", "7R"]);
    expect(details.rows).toContainEqual(["Plan starts", "11 November 2026"]);
    const log = d.sections.at(-2)!.blocks[0] as TableBlock;
    expect(log.rows).toHaveLength(INCIDENT_LOG_ROWS);
    expect(log.rows.every((r) => r.every((c) => c === ""))).toBe(true);
  });

  test("a box with nothing on either side yet (mid-stream) is left out", () => {
    const d = planFor({ behaviours: ["Shouts out"] });
    expect(d.sections.map((s) => s.title)).toEqual(["Pupil details", "Behaviours and targets", "Log of incidents", "Agreement"]);
    expect(d.sections[1].blocks).toHaveLength(1);
    expect(normalizeBlock({ type: "twocol", left: { title: "", items: [] }, right: {} }, "b1")).toBeNull();
  });

  test("the page shows the child's name; the stored plan does not have it", () => {
    const d = planFor();
    expect(JSON.stringify({ ...d, pupil: undefined })).not.toContain("Sam");
    const shown = withPupilName(d);
    expect(shown.title).toBe("Behaviour Support Plan: Sam");
    expect(sheetOutline(d)).toContain("# Behaviour Support Plan: Sam");
    expect(sheetToMarkdown(d)).toContain("**Pupil:** Sam");
    expect(sheetToMarkdown(d)).toContain("behaviours point for Sam");
  });

  test("bound for a model, the plan keeps [PUPIL] and leaves the details, log and signatures out", () => {
    const md = sheetToMarkdown(planFor(), { forModel: true });
    expect(md).not.toContain("Sam");
    expect(md).not.toContain("Mrs Okafor");
    expect(md).not.toContain("7R");
    expect(md).not.toContain("Log of incidents");
    expect(md).toContain("behaviours point for [PUPIL]");
  });

  test("the log and signatures can be switched off in Design", () => {
    const d = planFor();
    const md = sheetToMarkdown({ ...d, design: { ...d.design, hidden: ["log", "signatures"] } });
    expect(md).not.toContain("Log of incidents");
    expect(md).not.toContain("Agreement");
    expect(md).toContain("Pupil details");
  });

  test("Word: the details have no header row, and blank log rows have room to write", async () => {
    const zip = await JSZip.loadAsync(await (await buildSheetDocx(planFor())).arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Behaviour Support Plan: Sam");
    expect(xml).not.toContain("[PUPIL]");
    // Six blank log rows, each at least 620 twips tall.
    expect((xml.match(/<w:trHeight w:val="620" w:hRule="atLeast"\/>/g) ?? []).length).toBe(INCIDENT_LOG_ROWS);
  });
});

test.describe("Jo and the plan", () => {
  test("Jo's copy has no name, no staff and none of the parts built from the form", () => {
    const strings = payloadStrings(sheetSnapshot(planFor()));
    const all = strings.join(" ");
    expect(all).not.toMatch(/\bSam\b/);
    expect(all).not.toContain("Okafor");
    expect(all).not.toContain("7R");
    expect(all).not.toContain("Log of incidents");
    expect(all).toContain("[PUPIL]");
  });

  test("an op aimed at a private part is refused even if Jo guesses its id", () => {
    const d = planFor();
    const details = d.sections[0];
    const tableId = details.blocks[0].id;
    expect(applySheetOp(d, { op: "deleteSection", sectionId: details.id, label: "x" })).toBeNull();
    expect(applySheetOp(d, { op: "setText", target: `${details.id}.title`, text: "x", label: "x" })).toBeNull();
    expect(applySheetOp(d, { op: "deleteBlock", blockId: tableId, label: "x" })).toBeNull();
    expect(applySheetOp(d, { op: "insertBlock", sectionId: d.sections.at(-1)!.id, afterBlockId: "", block: { type: "text", text: "x" }, label: "x" })).toBeNull();
  });

  test("Jo can still rewrite a box", () => {
    const d = planFor();
    const box = d.sections[1].blocks[0];
    const next = applySheetOp(d, { op: "replaceBlock", blockId: box.id, block: { type: "twocol", left: { title: "A", items: ["one"] }, right: { title: "B", items: ["two"] } }, label: "x" });
    expect(next?.doc.sections[1].blocks[0]).toMatchObject({ type: "twocol", left: { items: ["one"] } });
  });
});

test.describe("the request", () => {
  const body: BehaviourPlanRequest = {
    yearGroup: "Year 7",
    pronouns: "he",
    behaviourDescription: "[PUPIL] shouts out",
    behaviouralTriggers: "Noise",
  };
  const text = (r: ReturnType<typeof behaviourRequest>) => ("error" in r ? "" : r.messages.map((m) => m.content).join("\n"));

  test("refuses any body that carries a name, a class or staff, at any depth", () => {
    for (const key of ["studentName", "name", "pupilName", "firstName", "surname", "keyStaff", "studentClass", "pupil"]) {
      expect(behaviourRequest({ ...body, [key]: "x" } as BehaviourPlanRequest), key).toEqual({ error: expect.stringContaining("never sent") });
    }
    expect(carriesPupilName({ notes: [{ name: "Sam" }] })).toBe(true);
    expect(carriesPupilName(body)).toBe(false);
  });

  test("refuses a request missing the year, the behaviour or the triggers", () => {
    for (const missing of ["yearGroup", "behaviourDescription", "behaviouralTriggers"] as const) {
      expect(behaviourRequest({ ...body, [missing]: " " })).toEqual({ error: "Missing required fields" });
    }
  });

  test("tells the model to write [PUPIL], with the pronouns given; unknown pronouns are they", () => {
    expect(text(behaviourRequest(body))).toContain('write "[PUPIL]" exactly where you would use their name');
    expect(text(behaviourRequest(body))).toContain("he/him/his");
    expect(text(behaviourRequest({ ...body, pronouns: "it" as "he" }))).toContain("they/them/their");
  });

  test("what the form sends after scrubbing has no name in it", () => {
    const name = "Sam";
    const notes = { behaviourDescription: "Sam throws chairs when Sam's routine changes", strengths: "Sam loves art", dislikes: "Being called SAM in front of others" };
    const sent = { ...body, ...Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, scrubPupilText(v, name)])) };
    const all = payloadStrings(behaviourRequest(sent as BehaviourPlanRequest)).join(" ");
    expect(all).not.toMatch(/\bsam\b/i);
    expect(all).toContain("[PUPIL] throws chairs when [PUPIL]'s routine changes");
  });

  test("no long dashes in what the model is told", () => {
    expect(text(behaviourRequest({ ...body, supportNeeds: "x", strengths: "y" }))).not.toMatch(DASHES);
  });

  test("the schema asks for every field, strictly", () => {
    const schema = behaviourResponseFormat().json_schema.schema as { required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual([...BEHAVIOUR_LIST_FIELDS, "escalation"].sort());
  });
});

test.describe("runs saved before pronouns", () => {
  test("a gender becomes pronouns: Male he, Female she, anything else they", () => {
    expect(pronounsFromInput({ studentGender: "Male" })).toBe("he");
    expect(pronounsFromInput({ studentGender: "Female" })).toBe("she");
    expect(pronounsFromInput({ studentGender: "Non-Binary" })).toBe("they");
    expect(pronounsFromInput({})).toBe("they");
    expect(pronounsFromInput({ pronouns: "she", studentGender: "Male" })).toBe("she");
  });
});
