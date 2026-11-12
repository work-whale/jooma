import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { sheetContext } from "@/app/lib/sheets/context";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { shownSections } from "@/app/lib/sheets/visibility";
import { scrubPupilText, withPupilName } from "@/app/lib/sheets/pupil";
import { sheetSnapshot } from "@/app/lib/jo/sheet-ops";
import { payloadStrings } from "@/app/lib/reports/privacy";
import { SMART_COLUMNS } from "@/app/lib/sheets/targets";
import { targetsRequest, type SmartTargetsRequest } from "@/app/lib/targets-prompt";
import { PRACTICE_ROLE } from "@/app/lib/sheets/intervention";
import { interventionRequest, type TargetedInterventionRequest } from "@/app/lib/intervention-prompt";
import { interventionHandoffs } from "@/app/lib/lesson-handoffs";
import { decodePrefill } from "@/app/lib/toolPrefill";
import type { SheetDoc, TableBlock } from "@/app/lib/sheets/types";

/*
 * Tool uplift batch 3: SMART Targets and Interventions, two documents about
 * one child. The name stays in the browser and the saved run; everything a
 * model sees has "[PUPIL]". Pure; nothing reaches a model.
 */

const DASHES = /[–—]/;
const promptText = (r: unknown) => ((r as { messages?: { content: string }[] }).messages ?? []).map((m) => m.content).join("\n");

const facts = [
  { label: "Year group", value: "Year 3" },
  { label: "Targets set", value: "1 November 2026" },
  { label: "Review date", value: "" },
];

// ── SMART Targets ───────────────────────────────────────────────────────────

const TARGETS = {
  targets: [
    { target: "Read ten tricky words", specific: "I will read ten tricky words", measurable: "I can read them all twice", achievable: "Daily flashcards with a TA", relevant: "Helps [PUPIL] read books", timeBound: "By half term" },
    { target: "Ask for help", specific: "I will use my help card", measurable: "4 days out of 5", achievable: "A help card on the desk", relevant: "Less shouting out", timeBound: "Within six weeks" },
    { target: "", specific: "mid-stream row with no target yet" },
  ],
};
const named = { yearGroup: "Year 3", pupil: { name: "Ali", pronouns: "he" as const }, pupilFacts: facts };
const targetsFor = (info: Record<string, unknown> = named, draft: unknown = TARGETS): SheetDoc => normalizeDraft(draft, sheetContext("targets", info));

test.describe("SMART targets as a sheet", () => {
  test("details, the targets table, a review table, then signatures", () => {
    const d = targetsFor();
    expect(d.sections.map((s) => s.role)).toEqual(["details", "targets", "review", "signatures"]);
    const table = d.sections[1].blocks[0] as TableBlock;
    expect(table.headers).toEqual(SMART_COLUMNS.map(([, h]) => h));
    expect(table.rows).toHaveLength(2);
  });

  test("the review table lists each target with blank cells to fill in", () => {
    const review = targetsFor().sections[2].blocks[0] as TableBlock;
    expect(review.headers).toEqual(["Target", "Achieved", "Partly", "Not yet", "Notes"]);
    expect(review.rows).toEqual([["Read ten tricky words", "", "", "", ""], ["Ask for help", "", "", "", ""]]);
  });

  test("the details are one row holding [PUPIL] and the dates the form gave; an empty date is left out", () => {
    const details = targetsFor().sections[0].blocks[0] as TableBlock;
    expect(details.headers).toEqual(["Pupil", "Year group", "Targets set"]);
    expect(details.rows).toEqual([["[PUPIL]", "Year 3", "1 November 2026"]]);
  });

  test("named: the page shows the name, the stored sheet never holds it", () => {
    const d = targetsFor();
    expect(d.title).toBe("SMART targets: [PUPIL]");
    expect(JSON.stringify({ ...d, pupil: undefined })).not.toMatch(/\bAli\b/);
    expect(withPupilName(d).title).toBe("SMART targets: Ali");
    expect(sheetToMarkdown(d)).toContain("Helps Ali read books");
  });

  test("no name given: no [PUPIL] in the title and an empty pupil cell to write in", () => {
    const d = targetsFor({ yearGroup: "Year 3", pupilFacts: facts });
    expect(d.pupil).toBeUndefined();
    expect(d.title).toBe("SMART targets");
    expect((d.sections[0].blocks[0] as TableBlock).rows[0][0]).toBe("");
  });

  test("before the first target, only the details show: no empty tables", () => {
    expect(targetsFor(named, { targets: [] }).sections.map((s) => s.role)).toEqual(["details"]);
  });

  test("landscape, plainly printed, and the review and signatures switch off", () => {
    const d = targetsFor();
    expect(d.design).toMatchObject({ landscape: true, nameDate: false, answers: false });
    expect(shownSections({ ...d, design: { ...d.design, hidden: ["review", "signatures"] } }).map((s) => s.role)).toEqual(["details", "targets"]);
  });

  test("bound for a model or Jo: no name and no details or signatures", () => {
    const d = targetsFor();
    const all = payloadStrings(sheetSnapshot(d)).join(" ");
    expect(all).not.toMatch(/\bAli\b/);
    expect(all).not.toContain("1 November 2026");
    expect(all).toContain("[PUPIL]");
    expect(sheetToMarkdown(d, { forModel: true })).not.toMatch(/\bAli\b/);
  });

  test("Word: the name is swapped in, never [PUPIL]; pages are landscape", async () => {
    const xml = await (await JSZip.loadAsync(await (await buildSheetDocx(targetsFor())).arrayBuffer())).file("word/document.xml")!.async("string");
    expect(xml).toContain("SMART targets: Ali");
    expect(xml).not.toContain("[PUPIL]");
    expect(xml).toContain('w:orient="landscape"');
  });
});

test.describe("the targets request", () => {
  const body: SmartTargetsRequest = { curriculum: "2014 National Curriculum", yearGroup: "Year 3", targets: "Read tricky words", named: true, pronouns: "he" };

  test("refuses any body with a name field, at any depth", () => {
    for (const k of ["name", "studentName", "pupilName", "firstName", "surname"]) {
      expect(targetsRequest({ ...body, [k]: "Ali" } as never)).toHaveProperty("error");
    }
    expect(targetsRequest({ ...body, extra: { pupilName: "Ali" } } as never)).toHaveProperty("error");
  });

  test("required fields", () => {
    expect(targetsRequest({ ...body, targets: "  " })).toHaveProperty("error");
    expect(targetsRequest({ ...body, yearGroup: "" })).toHaveProperty("error");
  });

  test("named: the model writes [PUPIL] with the pronouns; unnamed: 'the pupil'", () => {
    expect(promptText(targetsRequest(body))).toContain('write "[PUPIL]" exactly');
    expect(promptText(targetsRequest(body))).toContain("he/him/his");
    expect(promptText(targetsRequest({ ...body, named: false, pronouns: "nonsense" as never }))).toContain('"the pupil", with they/them/their');
  });

  test("what the form sends after scrubbing has no name in it, in any case or possessive", () => {
    const typed = "Ali needs to read. ALI's spelling. Help ali. Alison is a classmate.";
    const sent = scrubPupilText(typed, "Ali");
    expect(sent).not.toMatch(/\bali\b/i);
    expect(sent).toContain("Alison");
    expect(promptText(targetsRequest({ ...body, targets: sent }))).not.toMatch(/\bAli\b/);
  });

  test("the schema asks for every column, strictly; no long dashes", () => {
    const r = targetsRequest(body) as { response_format: { json_schema: { strict: boolean; schema: unknown } } };
    expect(r.response_format.json_schema.strict).toBe(true);
    for (const [f] of SMART_COLUMNS) expect(JSON.stringify(r.response_format.json_schema.schema)).toContain(`"${f}"`);
    expect(promptText(r)).not.toMatch(DASHES);
  });
});

// ── Interventions ───────────────────────────────────────────────────────────

const STRATEGIES = {
  findings: ["Confident orally, avoids writing"],
  strategies: [
    { name: "Times table drills", summary: "Short daily practice for [PUPIL].", steps: ["Five minutes daily", "Track scores"], whoAndWhen: "TA, daily", measure: "Scores rise each week" },
    { name: "Practical maths", summary: "Use objects.", steps: [], whoAndWhen: "", measure: "" },
    { name: "", summary: "mid-stream" },
  ],
  practiceFocus: "Recall of the 7, 8 and 9 times tables for [PUPIL]",
};
const ivInfo = { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths", topic: "Maths", pupil: { name: "Ali", pronouns: "he" as const }, pupilFacts: [{ label: "Year group", value: "Year 5" }] };
const ivFor = (info: Record<string, unknown> = ivInfo, draft: unknown = STRATEGIES) => normalizeDraft(draft, sheetContext("intervention", info));

test.describe("intervention ideas as a sheet", () => {
  test("details, what the information suggests, each strategy, practice, then the tracking table", () => {
    const d = ivFor();
    expect(d.sections.map((s) => s.role)).toEqual(["details", "findings", "strategy", "strategy", PRACTICE_ROLE, "monitoring"]);
    expect(d.sections[2].title).toBe("1. Times table drills");
  });

  test("a strategy: summary, steps, who and how often, then how you will know; empty parts left out", () => {
    const [first, second] = ivFor().sections.filter((s) => s.role === "strategy");
    expect(first.blocks.map((b) => b.type)).toEqual(["text", "list", "text", "callout"]);
    expect(second.blocks.map((b) => b.type)).toEqual(["text"]);
  });

  test("the tracking table lists every strategy with blank cells", () => {
    const t = ivFor().sections.at(-1)!.blocks[0] as TableBlock;
    expect(t.headers).toEqual(["Strategy", "Start date", "Who", "Review date", "Impact"]);
    expect(t.rows.map((r) => r[0])).toEqual(["Times table drills", "Practical maths"]);
    expect(t.rows.every((r) => r.slice(1).every((c) => c === ""))).toBe(true);
  });

  test("Make a practice worksheet: Worksheets with the curriculum, year, subject and focus, never the name", () => {
    // The workspace builds its links from the stored copy, which holds
    // [PUPIL]; the link says "the pupil" instead.
    const [h] = interventionHandoffs(ivFor());
    expect(h?.label).toBe("Make a practice worksheet");
    const p = decodePrefill(new URL(`http://x${h.href}`).searchParams.get("prefill"));
    expect(p).toEqual({
      slug: "worksheet-generator",
      fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths", learningObjective: "Recall of the 7, 8 and 9 times tables for the pupil" },
    });
    expect(h.href).not.toMatch(/Ali|PUPIL/);
  });

  test("no practice focus, or another tool's document, offers no worksheet", () => {
    expect(interventionHandoffs(ivFor(ivInfo, { ...STRATEGIES, practiceFocus: "" }))).toEqual([]);
    expect(interventionHandoffs({ ...ivFor(), tool: "targets" })).toEqual([]);
  });

  test("bound for Jo: no name, no details", () => {
    const all = payloadStrings(sheetSnapshot(ivFor())).join(" ");
    expect(all).not.toMatch(/\bAli\b/);
    expect(all).toContain("[PUPIL]");
  });

  test("plainly printed; details and tracking switch off", () => {
    const d = ivFor();
    expect(d.design).toMatchObject({ nameDate: false, answers: false });
    expect(shownSections({ ...d, design: { ...d.design, hidden: ["details", "monitoring"] } }).map((s) => s.role)).not.toContain("monitoring");
  });
});

test.describe("the interventions request", () => {
  const body: TargetedInterventionRequest = { curriculum: "x", yearGroup: "Year 5", subject: "Maths", attitudinalData: "Low confidence", named: true, pronouns: "she" };

  test("refuses a name field; requires the attitudes box", () => {
    expect(interventionRequest({ ...body, studentName: "Ali" } as never)).toHaveProperty("error");
    expect(interventionRequest({ ...body, attitudinalData: "" })).toHaveProperty("error");
  });

  test("optional boxes appear only when filled; [PUPIL] with her pronouns", () => {
    const t = promptText(interventionRequest({ ...body, attainmentData: "Working towards" }));
    expect(t).toContain("Attainment: Working towards");
    expect(t).not.toContain("Aptitudes");
    expect(t).toContain("she/her/her");
    expect(t).toContain("8 to 10 strategies");
    expect(t).not.toMatch(DASHES);
  });

  test("every box the form sends is scrubbed of the name first", () => {
    const boxes = ["Ali hates maths", "ALI scored 92", "Ali's attendance 78%", "Alison sits next to Ali"].map((b) => scrubPupilText(b, "Ali"));
    const t = promptText(interventionRequest({ ...body, attitudinalData: boxes[0], aptitudinalData: boxes[1], attainmentData: boxes[2], otherData: boxes[3] }));
    expect(t).not.toMatch(/\bAli\b/i);
    expect(t).toContain("Alison");
  });
});
