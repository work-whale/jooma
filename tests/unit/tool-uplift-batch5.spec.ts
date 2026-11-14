import { test, expect } from "@playwright/test";
import { responseBox, signOffTable } from "@/app/lib/sheets/signoff";
import { arrangeRisk } from "@/app/lib/sheets/risk";
import {
  carriesStaffName,
  scrubStaff,
  scrubStaffTitles,
  staffPrivacy,
  swapStaff,
  type StaffName,
} from "@/app/lib/staff-privacy";
import { withPupilName, withPupilPlaceholder } from "@/app/lib/sheets/pupil";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import type { SheetDoc } from "@/app/lib/sheets/types";
import { ectReportRequest, ectResponseFormat } from "@/app/lib/ect-report-prompt";
import { arrangeEct, ectOutcomeLabel, ectOutcomes, ectPeriods, ECT_STANDARDS } from "@/app/lib/sheets/ect";
import { performanceManagementRequest, performanceManagementResponseFormat } from "@/app/lib/performance-management-prompt";
import { arrangeAppraisal } from "@/app/lib/sheets/appraisal";
import { lessonObservationRequest, lessonObservationResponseFormat } from "@/app/lib/lesson-observation-prompt";
import { arrangeLearningWalk, arrangeLessonObservation, LESSON_OBS_PARTS } from "@/app/lib/sheets/observation";
import { learningWalkRequest, learningWalkResponseFormat } from "@/app/lib/learning-walk-prompt";
import { sipRequest, sipResponseFormat } from "@/app/lib/sip-prompt";
import { arrangeSip, SIP_HALF_TERMS, SIP_PARTS } from "@/app/lib/sheets/sip";
import { validatePrefill } from "@/app/lib/toolPrefill";

/*
 * Tool uplift batch 5: ECT Report, Performance Management, Lesson
 * Observation, Learning Walk and School Improvement Plan as designed sheets,
 * and the shared pieces they stand on. Written before the code (TDD).
 */

type Table = { type: string; headers: string[]; rows: string[][] };

// ── Step 0a/0b: sign-off and response box ───────────────────────────────────

test.describe("sign-off and response box", () => {
  test("a sign-off row per role, the name printed when given, signature and date always blank", () => {
    const t = signOffTable([["ECT", "Sarah Johnson"], ["Induction tutor"], ["Headteacher", "  "]]) as Table;
    expect(t.type).toBe("table");
    expect(t.headers).toEqual(["Role", "Name", "Signature", "Date"]);
    expect(t.rows).toEqual([
      ["ECT", "Sarah Johnson", "", ""],
      ["Induction tutor", "", "", ""],
      ["Headteacher", "", "", ""],
    ]);
  });

  test("one role is one row; no roles is no table", () => {
    expect((signOffTable([["Appraisee"]]) as Table).rows).toEqual([["Appraisee", "", "", ""]]);
    expect(signOffTable([])).toBeNull();
  });

  test("a response box is a one column table of blank rows to write in", () => {
    const box = responseBox("Teacher's response") as Table;
    expect(box).toEqual({ type: "table", headers: ["Teacher's response"], rows: [[""], [""], [""], [""], [""]] });
    expect((responseBox("ECT's comments", 3) as Table).rows).toHaveLength(3);
  });

  test("risk assessment sign-off is unchanged by the move to the shared helper", () => {
    const raw = { summary: "", hazards: [{ hazard: "Road", harm: "Hit", whoAtRisk: "Pupils", likelihood: 3, severity: 4, controls: ["Cross at lights"], residualLikelihood: 1, residualSeverity: 4, furtherActions: [] }] };
    const off = arrangeRisk(raw, { activity: "Museum", leader: "Ms Patel", offsite: true }) as { sections: { role: string; blocks: Table[] }[] };
    const on = arrangeRisk(raw, { activity: "Lab", leader: "", offsite: false }) as { sections: { role: string; blocks: Table[] }[] };
    expect(off.sections.find((s) => s.role === "signoff")!.blocks[0]).toEqual({
      type: "table",
      headers: ["Role", "Name", "Signature", "Date"],
      rows: [["Trip leader", "Ms Patel", "", ""], ["Educational Visits Coordinator (EVC)", "", "", ""], ["Headteacher", "", "", ""]],
    });
    expect(on.sections.find((s) => s.role === "signoff")!.blocks[0].rows).toEqual([["Activity leader", "", "", ""], ["Headteacher", "", "", ""]]);
  });
});

// ── Step 0c: two members of staff kept away from the model ─────────────────

test.describe("staff privacy for several people", () => {
  const STAFF: StaffName[] = [
    { placeholder: "[TEACHER]", name: "Sarah Johnson" },
    { placeholder: "[OBSERVER]", name: "David Okafor" },
  ];

  test("each person, whole or in part, becomes their own placeholder", () => {
    expect(scrubStaff("Sarah Johnson modelled well; David Okafor noted that Sarah's stems helped. Okafor agreed with Johnson.", STAFF)).toBe(
      "[TEACHER] modelled well; [OBSERVER] noted that [TEACHER]'s stems helped. [OBSERVER] agreed with [TEACHER].",
    );
  });

  test("a name inside another word is left alone; case does not matter", () => {
    expect(scrubStaff("Davidson met SARAH in the Okaforian room", STAFF)).toBe("Davidson met [TEACHER] in the Okaforian room");
  });

  test("a surname two people share goes to the first listed; full names still go to their own", () => {
    const shared: StaffName[] = [
      { placeholder: "[TEACHER]", name: "Sarah Johnson" },
      { placeholder: "[OBSERVER]", name: "Tom Johnson" },
    ];
    expect(scrubStaff("Tom Johnson watched Sarah Johnson. Johnson smiled. Tom left.", shared)).toBe("[OBSERVER] watched [TEACHER]. [TEACHER] smiled. [OBSERVER] left.");
  });

  test("swap puts each name back: full name first, surname after; a role when no name was given", () => {
    expect(swapStaff("[TEACHER] modelled well. [TEACHER] used stems. [OBSERVER] agreed.", STAFF)).toBe(
      "Sarah Johnson modelled well. Johnson used stems. David Okafor agreed.",
    );
    expect(swapStaff("[TEACHER] modelled; [OBSERVER] watched; [ECT] taught.", [])).toBe("the teacher modelled; the observer watched; the ECT taught.");
  });

  test("staffPrivacy is a scrub and swap pair, and undefined when no names were given", () => {
    const p = staffPrivacy(STAFF)!;
    expect(p.swap(p.scrub("Sarah Johnson and David Okafor"))).toBe("Sarah Johnson and David Okafor");
    expect(staffPrivacy([{ placeholder: "[TEACHER]", name: " " }])).toBeUndefined();
    expect(staffPrivacy([])).toBeUndefined();
  });

  test("the route refuses a body carrying a teacher's or observer's name key, at any depth", () => {
    expect(carriesStaffName({ teacherName: "Sarah" })).toBe(true);
    expect(carriesStaffName({ meta: { observerName: "David" } })).toBe(true);
    expect(carriesStaffName({ subject: "English", strengths: "[TEACHER] modelled" })).toBe(false);
  });
});

// ── Step 0d: staff titles scrubbed from free text ───────────────────────────

test.describe("scrubStaffTitles", () => {
  test("title plus surname becomes 'a teacher', possessives kept", () => {
    expect(scrubStaffTitles("Visited Mr Patel's Year 7 class and Mrs O'Neil's Year 9.")).toBe("Visited a teacher's Year 7 class and a teacher's Year 9.");
    expect(scrubStaffTitles("cold calling by Ms Smith-Jones and Dr. Ahmed")).toBe("cold calling by a teacher and a teacher");
    expect(scrubStaffTitles("met Miss Kaur and Mx Rivers")).toBe("met a teacher and a teacher");
    expect(scrubStaffTitles("with Mr Patel’s group")).toBe("with a teacher’s group");
  });

  test("at the start of a sentence it is capitalised", () => {
    expect(scrubStaffTitles("Mr Patel cold called. Mrs Lee did not.")).toBe("A teacher cold called. A teacher did not.");
  });

  test("lower case titles are caught too", () => {
    expect(scrubStaffTitles("in mr patel's room")).toBe("in a teacher's room");
  });

  test("a title with no name, or a title inside a word, is left alone", () => {
    expect(scrubStaffTitles("Mrs and Mr were the options; MSc students; Drama; Mister")).toBe("Mrs and Mr were the options; MSc students; Drama; Mister");
    expect(scrubStaffTitles("Mr 7 and Dr. 5")).toBe("Mr 7 and Dr. 5");
  });

  test("text without titles is unchanged, empty stays empty", () => {
    expect(scrubStaffTitles("Do Now quizzes in every room")).toBe("Do Now quizzes in every room");
    expect(scrubStaffTitles("")).toBe("");
  });
});

// ── Step 0c: staff on the saved sheet ───────────────────────────────────────

test.describe("staff names on a sheet", () => {
  const base = { kind: "jooma-sheet", version: 1, tool: "lessonObservation", title: "Lesson observation: [TEACHER]", subtitle: "", objective: "", intro: null, teacherNotes: [], design: {} };

  test("the page shows the names; the stored document keeps the placeholders", () => {
    const stored = {
      ...base,
      staff: [{ placeholder: "[TEACHER]", name: "Sarah Johnson" }],
      sections: [{ id: "s0", title: "Strengths", emoji: "", instructions: "", blocks: [{ id: "b", type: "text", text: "[TEACHER] modelled well." }] }],
    } as unknown as SheetDoc;
    const shown = withPupilName(stored);
    expect(shown.title).toBe("Lesson observation: Sarah Johnson");
    expect((shown.sections[0].blocks[0] as { text: string }).text).toBe("Sarah Johnson modelled well.");
    // The staff list itself is never rewritten.
    expect(shown.staff).toEqual([{ placeholder: "[TEACHER]", name: "Sarah Johnson" }]);
    // A name the teacher types on the page is stored as the placeholder.
    const edited = { ...shown, sections: [{ ...shown.sections[0], blocks: [{ id: "b", type: "text", text: "Johnson modelled well." }] }] } as unknown as SheetDoc;
    expect((withPupilPlaceholder(edited).sections[0].blocks[0] as { text: string }).text).toBe("[TEACHER] modelled well.");
  });

  test("no names given: placeholders read as roles", () => {
    const stored = { ...base, staff: [], sections: [{ id: "s0", title: "", emoji: "", instructions: "", blocks: [{ id: "b", type: "text", text: "[TEACHER] and [OBSERVER]" }] }] } as unknown as SheetDoc;
    expect((withPupilName(stored).sections[0].blocks[0] as { text: string }).text).toBe("the teacher and the observer");
  });

  test("the request context carries the staff onto the normalised document", () => {
    // Any tool: staff ride on the request, not the profile.
    const ctx = sheetContext("riskAssessment", { staff: [{ placeholder: "[TEACHER]", name: "Sarah Johnson" }] });
    const doc = normalizeDraft({ summary: "", hazards: [] }, ctx);
    expect(doc.staff).toEqual([{ placeholder: "[TEACHER]", name: "Sarah Johnson" }]);
  });
});

// ── Step 1: ECT report ──────────────────────────────────────────────────────

type Sec = { role?: string; title: string; instructions?: string; blocks: (Table & { text?: string })[] };
type Arranged = { title: string; sections: Sec[] };
const sec = (d: unknown, role: string) => (d as Arranged).sections.find((s) => s.role === role);

test.describe("ECT report request", () => {
  const BODY = {
    curriculum: "2014 National Curriculum",
    subject: "Maths",
    reportType: "review",
    period: "t2",
    strengths: "[ECT] uses worked examples well.",
    areasForDevelopment: "Checks for understanding.",
  };
  const sent = (b: Record<string, unknown>) => {
    const r = ectReportRequest(b);
    if ("error" in r) throw new Error(r.error);
    return JSON.stringify(r.messages);
  };

  test("refuses a body with the ECT's name key, and needs the evidence", () => {
    expect("error" in ectReportRequest({ ...BODY, ectName: "Sarah Johnson" })).toBe(true);
    expect("error" in ectReportRequest({ ...BODY, strengths: " " })).toBe(true);
    expect("error" in ectReportRequest({ ...BODY, areasForDevelopment: "" })).toBe(true);
    expect("error" in ectReportRequest({ ...BODY, curriculum: "" })).toBe(true);
  });

  test("the outcome the tutor picked is never sent to the model", () => {
    const text = sent({ ...BODY, outcome: "not-on-track" });
    expect(text).not.toContain(ectOutcomeLabel("review", "t2", "not-on-track"));
    const final = sent({ ...BODY, reportType: "assessment", period: "t6", outcome: "extension" });
    expect(final).not.toContain(ectOutcomeLabel("assessment", "t6", "extension"));
  });

  test("the schema has no field for a judgement", () => {
    const f = ectResponseFormat();
    expect(f.json_schema.strict).toBe(true);
    const schema = f.json_schema.schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties).sort()).toEqual(["conduct", "standards", "summary", "targets"]);
    expect(JSON.stringify(schema)).not.toMatch(/outcome|judg|verdict|satisf|onTrack/i);
  });

  test("current framework: ITTECF and the Teachers' Standards, never the old ECF alone", () => {
    const text = sent(BODY);
    expect(text).toContain("ITTECF");
    expect(text).toContain("Teachers' Standards");
    expect(text).not.toMatch(/\(ECF\)/);
    expect(text).toContain("[ECT]");
    expect(text).toMatch(/never (state|say)[^"]*on track/i);
  });

  test("a progress review and a formal assessment are asked for differently, with the period", () => {
    const review = sent(BODY);
    expect(review).toMatch(/progress review/i);
    expect(review).toContain(ectPeriods("review").find((p) => p.id === "t2")!.label);
    const assess = sent({ ...BODY, reportType: "assessment", period: "t3" });
    expect(assess).toMatch(/formal assessment/i);
    expect(assess).toContain(ectPeriods("assessment").find((p) => p.id === "t3")!.label);
  });

  test("an unknown report type or period falls back to a progress review, not an error", () => {
    expect(sent({ ...BODY, reportType: "nonsense", period: "t9" })).toMatch(/progress review/i);
  });

  test("old prefill fields (includeProfessionalDevelopmentPlan) are ignored, not refused", () => {
    expect("error" in ectReportRequest({ ...BODY, includeProfessionalDevelopmentPlan: true })).toBe(false);
  });
});

test.describe("ECT periods and outcomes (DfE induction guidance, June 2026)", () => {
  test("progress reviews in terms 1, 2, 4, 5; formal assessments at the end of terms 3 and 6", () => {
    expect(ectPeriods("review").map((p) => p.id)).toEqual(["t1", "t2", "t4", "t5"]);
    expect(ectPeriods("assessment").map((p) => p.id)).toEqual(["t3", "t6"]);
  });

  test("outcomes follow the guidance wording for each point", () => {
    expect(ectOutcomes("review", "t1").map((o) => o.label)).toEqual(["On track to complete induction successfully", "Not on track to complete induction successfully"]);
    expect(ectOutcomes("assessment", "t3").map((o) => o.id)).toEqual(["satisfactory-progress", "not-satisfactory-progress"]);
    expect(ectOutcomes("assessment", "t6").map((o) => o.id)).toEqual(["satisfactory", "unsatisfactory", "extension"]);
    expect(ectOutcomeLabel("review", "t1", "bogus")).toBe("");
    expect(ectOutcomeLabel("assessment", "t3", "satisfactory")).toBe("");
  });

  test("eight Teachers' Standards, numbered and titled", () => {
    expect(ECT_STANDARDS).toHaveLength(8);
    expect(ECT_STANDARDS[1]).toBe("Promote good progress and outcomes by pupils");
  });
});

test.describe("arrangeEct", () => {
  const RAW = {
    summary: "[ECT] has made a strong start.",
    standards: [
      { standard: 4, strengths: "Well structured lessons.", nextSteps: "Tighter plenaries." },
      { standard: 2, strengths: "Worked examples.", nextSteps: "" },
      { standard: 9, strengths: "Not a standard.", nextSteps: "x" },
      { standard: 0, strengths: "Nor this.", nextSteps: "x" },
      { standard: 2, strengths: "A duplicate.", nextSteps: "x" },
      { standard: 6, strengths: "", nextSteps: "" },
    ],
    conduct: "[ECT] upholds public trust.",
    targets: [{ target: "Check understanding before moving on", support: "Mentor modelling", byWhen: "February half term" }, { target: "", support: "", byWhen: "" }],
  };
  const INFO = { reportType: "review", period: "t2", outcome: "on-track", subject: "Maths", named: true };

  test("standards in number order, titled, invalid numbers and empty rows dropped, the first of a duplicate kept", () => {
    const t = sec(arrangeEct(RAW, INFO), "standards")!.blocks[0];
    expect(t.headers).toEqual(["Teachers' Standard", "Strengths", "Next steps"]);
    expect(t.rows).toEqual([
      ["2. Promote good progress and outcomes by pupils", "Worked examples.", ""],
      ["4. Plan and teach well structured lessons", "Well structured lessons.", "Tighter plenaries."],
    ]);
  });

  test("the outcome is the tutor's choice from the form, printed by code; blank when not chosen", () => {
    expect(sec(arrangeEct(RAW, INFO), "outcome")!.blocks[0].rows[0]).toEqual(["Outcome (recorded by the induction tutor)", "On track to complete induction successfully"]);
    expect(sec(arrangeEct(RAW, { ...INFO, outcome: "" }), "outcome")!.blocks[0].rows[0][1]).toBe("");
  });

  test("details, title and sign-off use [ECT] only when a name was given", () => {
    const named = arrangeEct(RAW, INFO) as Arranged;
    expect(named.title).toBe("ECT progress review: [ECT]");
    expect(sec(named, "details")!.blocks[0].rows[0]).toEqual(["ECT", "[ECT]"]);
    expect(sec(named, "signoff")!.blocks[0].rows).toEqual([["ECT", "[ECT]", "", ""], ["Induction tutor", "", "", ""], ["Headteacher", "", "", ""]]);
    const unnamed = arrangeEct(RAW, { ...INFO, named: false }) as Arranged;
    expect(unnamed.title).toBe("ECT progress review");
    expect(sec(unnamed, "details")!.blocks[0].rows[0]).toEqual(["ECT", ""]);
    expect(sec(unnamed, "signoff")!.blocks[0].rows[0]).toEqual(["ECT", "", "", ""]);
  });

  test("a formal assessment is titled as one and says to copy onto the appropriate body's form", () => {
    const d = arrangeEct(RAW, { ...INFO, reportType: "assessment", period: "t6", outcome: "extension" }) as Arranged;
    expect(d.title).toBe("ECT formal assessment: [ECT]");
    expect(sec(d, "outcome")!.blocks[0].rows[0][1]).toBe(ectOutcomeLabel("assessment", "t6", "extension"));
    expect(sec(d, "signoff")!.instructions).toMatch(/appropriate body/);
  });

  test("targets have a blank Review column for the school; empty targets dropped", () => {
    const t = sec(arrangeEct(RAW, INFO), "targets")!.blocks[0];
    expect(t.headers).toEqual(["Target", "Support", "By when", "Review"]);
    expect(t.rows).toEqual([["Check understanding before moving on", "Mentor modelling", "February half term", ""]]);
  });

  test("the ECT's comments box and conduct section are there", () => {
    const d = arrangeEct(RAW, INFO);
    expect(sec(d, "comments")!.blocks[0].headers).toEqual(["ECT's comments"]);
    expect(sec(d, "conduct")!.blocks[0].text).toBe("[ECT] upholds public trust.");
  });

  test("a part-streamed draft renders without the empty sections; dashes are undone", () => {
    const d = arrangeEct({ summary: "A start — so far" }, INFO) as Arranged;
    const roles = d.sections.map((s) => s.role);
    expect(roles).toContain("details");
    expect(roles).toContain("summary");
    expect(roles).not.toContain("standards");
    expect(roles).not.toContain("targets");
    expect(JSON.stringify(d)).not.toMatch(/[–—]/);
  });

  test("the profile normalises it with the name kept off the text", () => {
    const ctx = sheetContext("ectReport", { staff: [{ placeholder: "[ECT]", name: "Sarah Johnson" }], ect: INFO });
    const doc = normalizeDraft(RAW, ctx);
    expect(doc.tool).toBe("ectReport");
    expect(JSON.stringify(doc.sections)).not.toContain("Sarah");
    expect(withPupilName(doc).title).toBe("ECT progress review: Sarah Johnson");
  });
});

// ── Step 2: performance management (appraisal) ─────────────────────────────

test.describe("appraisal request", () => {
  const BODY = { curriculum: "2014 National Curriculum", schoolType: "Primary", staffMember: "Year 4 class teacher and maths lead", payScale: "M4", responsibilities: "Times tables fluency; maths CPD" };
  const sent = (b: Record<string, unknown>) => {
    const r = performanceManagementRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses a name key and missing fields", () => {
    expect("error" in performanceManagementRequest({ ...BODY, staffName: "Sarah Johnson" })).toBe(true);
    expect("error" in performanceManagementRequest({ ...BODY, name: "Sarah" })).toBe(true);
    expect("error" in performanceManagementRequest({ ...BODY, staffMember: " " })).toBe(true);
    expect("error" in performanceManagementRequest({ ...BODY, responsibilities: "" })).toBe(true);
  });

  test("asks for the number of objectives the form chose: 3 by default, kept between 1 and 5", () => {
    expect(sent(BODY)).toContain("exactly 3 objectives");
    expect(sent({ ...BODY, objectiveCount: 4 })).toContain("exactly 4 objectives");
    expect(sent({ ...BODY, objectiveCount: 9 })).toContain("exactly 5 objectives");
    expect(sent({ ...BODY, objectiveCount: 0 })).toContain("exactly 1 objective");
    expect(sent({ ...BODY, objectiveCount: "x" })).toContain("exactly 3 objectives");
  });

  test("school priorities go in when given", () => {
    expect(sent({ ...BODY, priorities: "Reading fluency in KS2" })).toContain("Reading fluency in KS2");
    expect(sent(BODY)).not.toContain("School priorities");
  });

  test("no lesson grades; the role is all it hears about the person", () => {
    const t = sent(BODY);
    expect(t).toMatch(/never lesson observation grades/i);
    expect(t).toContain("Role: Year 4 class teacher and maths lead");
    expect(t).toContain("Teachers' Standards (2011)");
    expect(t).toContain("Headteachers' Standards (2020)");
  });

  test("the schema has the model's four columns and nothing for the reviews", () => {
    const f = performanceManagementResponseFormat();
    expect(f.json_schema.strict).toBe(true);
    const schema = f.json_schema.schema as { properties: { objectives: { items: { properties: Record<string, unknown> } } } & Record<string, unknown> };
    expect(Object.keys(schema.properties).sort()).toEqual(["objectives", "rationale"]);
    expect(Object.keys(schema.properties.objectives.items.properties).sort()).toEqual(["evidence", "objective", "successCriteria", "support"]);
    expect(JSON.stringify(schema)).not.toMatch(/review|grade/i);
  });
});

test.describe("arrangeAppraisal", () => {
  const RAW = {
    rationale: "Linked to Teachers' Standards 2 and 8 — and the school's maths priority.",
    objectives: [
      { objective: "Raise times tables fluency", successCriteria: "90% pass the MTC check", support: "Maths hub CPD", evidence: "Pupil progress data", midYear: "INVENTED", endOfYear: "INVENTED" },
      { objective: "Lead maths CPD", successCriteria: "Three sessions", support: "Release time", evidence: "Staff voice" },
      { objective: "", successCriteria: "", support: "", evidence: "" },
      { objective: "A fourth one", successCriteria: "x", support: "x", evidence: "x" },
    ],
  };
  const INFO = { role: "Year 4 class teacher", payScale: "M4", count: 3 };

  test("objectives table with blank review columns, whatever the model sent", () => {
    const t = sec(arrangeAppraisal(RAW, INFO), "objectives")!.blocks[0];
    expect(t.headers).toEqual(["Objective", "Success criteria", "Support and CPD", "Evidence", "Mid-year review", "End-of-year review"]);
    for (const row of t.rows) expect(row.slice(4)).toEqual(["", ""]);
    expect(JSON.stringify(t)).not.toContain("INVENTED");
  });

  test("the count chosen is honoured; empty objectives do not count", () => {
    const rows = sec(arrangeAppraisal(RAW, INFO), "objectives")!.blocks[0].rows;
    expect(rows.map((r) => r[0])).toEqual(["1. Raise times tables fluency", "2. Lead maths CPD", "3. A fourth one"]);
    expect(sec(arrangeAppraisal(RAW, { ...INFO, count: 2 }), "objectives")!.blocks[0].rows).toHaveLength(2);
  });

  test("details, rationale and sign-off; names blank for the school", () => {
    const d = arrangeAppraisal(RAW, INFO) as Arranged;
    expect(d.title).toBe("Appraisal objectives: Year 4 class teacher");
    expect(sec(d, "details")!.blocks[0].rows).toEqual([["Role", "Year 4 class teacher"], ["Pay range", "M4"], ["Appraisal cycle", ""], ["Appraisee", ""], ["Appraiser", ""]]);
    expect(sec(d, "rationale")!.blocks[0].text).not.toMatch(/[–—]/);
    expect(sec(d, "signoff")!.blocks[0].rows).toEqual([["Appraisee", "", "", ""], ["Appraiser", "", "", ""]]);
  });

  test("mid-stream: details only, no empty table", () => {
    const d = arrangeAppraisal({}, INFO) as Arranged;
    expect(d.sections.map((s) => s.role)).toEqual(["details"]);
  });

  test("the profile starts landscape and plain", () => {
    const doc = normalizeDraft(RAW, sheetContext("appraisal", { appraisal: INFO }));
    expect(doc.tool).toBe("appraisal");
    expect(doc.design.landscape).toBe(true);
  });
});

// ── Step 3: lesson observation ──────────────────────────────────────────────

test.describe("lesson observation request", () => {
  const BODY = {
    curriculum: "2014 National Curriculum",
    yearGroup: "Year 5",
    subject: "English",
    learningObjective: "To use relative clauses to add detail",
    strengths: "[TEACHER] modelled relative clauses under the visualiser.",
    areasForDevelopment: "Questioning relied on volunteers.",
  };
  const sent = (b: Record<string, unknown>) => {
    const r = lessonObservationRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses the teacher's or observer's name key, and missing evidence", () => {
    expect("error" in lessonObservationRequest({ ...BODY, teacherName: "Sarah Johnson" })).toBe(true);
    expect("error" in lessonObservationRequest({ ...BODY, observerName: "David Okafor" })).toBe(true);
    expect("error" in lessonObservationRequest({ ...BODY, strengths: "" })).toBe(true);
    expect("error" in lessonObservationRequest({ ...BODY, areasForDevelopment: " " })).toBe(true);
    expect("error" in lessonObservationRequest({ ...BODY, curriculum: "" })).toBe(true);
  });

  test("placeholders, roles only, and never a grade", () => {
    const t = sent(BODY);
    expect(t).toContain("[TEACHER]");
    expect(t).toMatch(/never name/i);
    expect(t).toMatch(/never (give|grade)[^.]*grade/i);
    expect(t).toContain("To use relative clauses to add detail");
  });

  test("the action plan and follow-up are asked for only when ticked", () => {
    expect(sent(BODY)).toMatch(/actionPlan: an empty list/);
    expect(sent(BODY)).toMatch(/followUp: an empty list/);
    expect(sent({ ...BODY, includeActionPlan: true })).toMatch(/actionPlan: 2 or 3/);
    expect(sent({ ...BODY, includeFollowUpSupport: true })).toMatch(/followUp: 3 or 4/);
  });

  test("schema", () => {
    const f = lessonObservationResponseFormat();
    expect(f.json_schema.strict).toBe(true);
    const schema = f.json_schema.schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties).sort()).toEqual(["actionPlan", "areas", "context", "followUp", "recommendations", "strengths"]);
    expect(JSON.stringify(schema)).not.toMatch(/grade|judgement|rating/i);
  });
});

test.describe("arrangeLessonObservation", () => {
  const RAW = {
    context: "A Year 5 English lesson — relative clauses.",
    strengths: [{ title: "Clear modelling", evidence: "[TEACHER] modelled under the visualiser." }, { title: "", evidence: "" }],
    areas: [{ title: "Questioning", evidence: "Volunteers only.", impact: "Some pupils were passive." }],
    recommendations: [{ title: "Cold call", how: "Use no hands up." }],
    actionPlan: [{ target: "Cold call in every lesson", actions: "Plan questions", support: "Mentor", byWhen: "Half term" }],
    followUp: ["Watch a colleague by role: the English lead"],
  };
  const INFO = { date: "2026-11-12", yearGroup: "Year 5", subject: "English", learningObjective: "To use relative clauses", focus: "", teacherNamed: true, observerNamed: false };

  test("details with the names only as placeholders, and only when given", () => {
    const d = arrangeLessonObservation(RAW, INFO) as Arranged;
    expect(d.title).toBe("Lesson observation: [TEACHER]");
    expect(sec(d, "details")!.blocks[0].rows).toEqual([
      ["Date", "12 November 2026"],
      ["Class", "Year 5"],
      ["Subject", "English"],
      ["Learning objective", "To use relative clauses"],
      ["Teacher observed", "[TEACHER]"],
      ["Observer", ""],
    ]);
    const unnamed = arrangeLessonObservation(RAW, { ...INFO, teacherNamed: false }) as Arranged;
    expect(unnamed.title).toBe("Lesson observation: English");
  });

  test("strengths and areas as evidence tables; empty rows dropped", () => {
    const d = arrangeLessonObservation(RAW, INFO);
    expect(sec(d, "strengths")!.blocks[0]).toEqual({ type: "table", headers: ["Strength", "What was seen"], rows: [["Clear modelling", "[TEACHER] modelled under the visualiser."]] });
    expect(sec(d, "areas")!.blocks[0].headers).toEqual(["Area for development", "What was seen", "Impact on pupils"]);
  });

  test("the action plan has a blank Review column; no plan, no section", () => {
    const t = sec(arrangeLessonObservation(RAW, INFO), "actionPlan")!.blocks[0];
    expect(t.headers).toEqual(["Target", "Actions", "Support", "By when", "Review"]);
    expect(t.rows[0][4]).toBe("");
    expect(sec(arrangeLessonObservation({ ...RAW, actionPlan: [] }, INFO), "actionPlan")).toBeUndefined();
  });

  test("teacher's response box and sign-off (observer and teacher) close the report", () => {
    const d = arrangeLessonObservation(RAW, INFO) as Arranged;
    const roles = d.sections.map((s) => s.role);
    expect(roles.slice(-2)).toEqual(["response", "signoff"]);
    expect(sec(d, "response")!.blocks[0].headers).toEqual(["Teacher's response"]);
    expect(sec(d, "signoff")!.blocks[0].rows).toEqual([["Observer", "", "", ""], ["Teacher", "[TEACHER]", "", ""]]);
    for (const id of ["details", "response", "signoff"]) expect(LESSON_OBS_PARTS.map((p) => p.id)).toContain(id);
  });

  test("mid-stream: no response box or sign-off until there is a report; dashes undone", () => {
    const d = arrangeLessonObservation({ context: "So far — good" }, INFO) as Arranged;
    expect(d.sections.map((s) => s.role)).toEqual(["details", "context"]);
    expect(JSON.stringify(d)).not.toMatch(/[–—]/);
  });

  test("the profile swaps both names back on the page", () => {
    const staff = [{ placeholder: "[TEACHER]", name: "Sarah Johnson" }, { placeholder: "[OBSERVER]", name: "David Okafor" }];
    const doc = normalizeDraft(RAW, sheetContext("lessonObservation", { staff, observation: { ...INFO, observerNamed: true } }));
    expect(doc.tool).toBe("lessonObservation");
    expect(JSON.stringify(doc.sections)).not.toMatch(/Sarah|Okafor/);
    const shown = withPupilName(doc);
    expect(shown.title).toBe("Lesson observation: Sarah Johnson");
    expect(JSON.stringify(shown.sections)).toContain("David Okafor");
  });
});

// ── Step 4: learning walk ───────────────────────────────────────────────────

test.describe("learning walk request", () => {
  const BODY = {
    curriculum: "2014 National Curriculum",
    classesVisited: "Year 7 and Year 9 English",
    focus: "Retrieval practice",
    strengths: "Do Now quizzes in every room.",
    areasForDevelopment: "Feedback on answers was brief.",
    includeRecommendations: true,
    includeNextSteps: true,
  };
  const sent = (b: Record<string, unknown>) => {
    const r = learningWalkRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses name keys and missing evidence", () => {
    expect("error" in learningWalkRequest({ ...BODY, teacherName: "Mr Patel" })).toBe(true);
    expect("error" in learningWalkRequest({ ...BODY, strengths: "" })).toBe(true);
    expect("error" in learningWalkRequest({ ...BODY, areasForDevelopment: " " })).toBe(true);
    expect("error" in learningWalkRequest({ ...BODY, curriculum: "" })).toBe(true);
  });

  test("staff named by title are scrubbed on the server too, in every free-text field", () => {
    const t = sent({ ...BODY, classesVisited: "Mr Patel's Year 7", focus: "Mrs Lee's questioning", strengths: "Dr Ahmed cold called.", areasForDevelopment: "Ms Kaur's feedback was brief." });
    expect(t).not.toMatch(/Patel|Lee\b|Ahmed|Kaur/);
    expect(t).toContain("Classes visited: A teacher's Year 7");
    expect(t).toContain("Focus: A teacher's questioning");
    expect(t).toContain("Areas for development: A teacher's feedback was brief.");
  });

  test("never names, never grades", () => {
    const t = sent(BODY);
    expect(t).toMatch(/never name/i);
    expect(t).toMatch(/never grade/i);
  });

  test("recommendations and next steps only when ticked", () => {
    expect(sent({ ...BODY, includeRecommendations: false })).toMatch(/recommendations: an empty list/);
    expect(sent({ ...BODY, includeNextSteps: false })).toMatch(/nextSteps: an empty list/);
    expect(sent(BODY)).not.toMatch(/an empty list/);
  });

  test("schema: overall picture and next-step timing are fixed choices", () => {
    const f = learningWalkResponseFormat();
    const schema = f.json_schema.schema as { properties: Record<string, { enum?: string[]; items?: { properties: Record<string, { enum?: string[] }> } }> };
    expect(Object.keys(schema.properties).sort()).toEqual(["areas", "nextSteps", "overall", "recommendations", "strengths", "summary"]);
    expect(schema.properties.overall.enum).toEqual(["positive", "mixed", "concerning"]);
    expect(schema.properties.nextSteps.items!.properties.when.enum).toEqual(["immediate", "halfTerm", "term"]);
  });
});

test.describe("arrangeLearningWalk", () => {
  const RAW = {
    summary: "Retrieval practice is well established.",
    overall: "positive",
    strengths: [{ title: "Do Now quizzes", evidence: "Seen in every room." }],
    areas: [{ title: "Feedback", evidence: "Brief.", impact: "Misconceptions persist." }],
    recommendations: [{ title: "Model full answers", how: "Show a strong answer after each quiz." }],
    nextSteps: [
      { action: "Share a feedback routine", when: "term", leadRole: "Head of English" },
      { action: "Brief staff", when: "immediate", leadRole: "Head of English" },
      { action: "Revisit", when: "someday", leadRole: "Deputy head" },
      { action: "Plan CPD", when: "halfTerm", leadRole: "CPD lead" },
      { action: "", when: "term", leadRole: "" },
    ],
  };
  const INFO = { date: "2026-11-12", classesVisited: "Year 7 and Year 9 English", focus: "Retrieval practice" };

  test("details with 'Carried out by' blank for the school", () => {
    const d = arrangeLearningWalk(RAW, INFO) as Arranged;
    expect(d.title).toBe("Learning walk: Retrieval practice");
    expect(sec(d, "details")!.blocks[0].rows).toEqual([["Date", "12 November 2026"], ["Classes visited", "Year 7 and Year 9 English"], ["Focus", "Retrieval practice"], ["Carried out by", ""]]);
  });

  test("summary with the overall picture; an unknown picture is left out", () => {
    expect(sec(arrangeLearningWalk(RAW, INFO), "summary")!.blocks[0].rows).toEqual([["Overall picture", "Positive"]]);
    const odd = sec(arrangeLearningWalk({ ...RAW, overall: "outstanding" }, INFO), "summary")!;
    expect(odd.blocks).toEqual([{ type: "text", text: "Retrieval practice is well established." }]);
  });

  test("next steps grouped in time order with a blank Done column; unknown timing goes last; empty dropped", () => {
    const t = sec(arrangeLearningWalk(RAW, INFO), "nextSteps")!.blocks[0];
    expect(t.headers).toEqual(["When", "Action", "Led by", "Done"]);
    expect(t.rows).toEqual([
      ["Within two weeks", "Brief staff", "Head of English", ""],
      ["By the end of this half term", "Plan CPD", "CPD lead", ""],
      ["By the end of the term", "Share a feedback routine", "Head of English", ""],
      ["By the end of the term", "Revisit", "Deputy head", ""],
    ]);
  });

  test("response box and sign-off close the report; no sign-off mid-stream", () => {
    const d = arrangeLearningWalk(RAW, INFO) as Arranged;
    expect(d.sections.map((s) => s.role).slice(-2)).toEqual(["response", "signoff"]);
    expect(sec(d, "signoff")!.blocks[0].rows.map((r) => r[0])).toEqual(["Carried out by", "Subject or phase lead"]);
    expect((arrangeLearningWalk({ summary: "So far" }, INFO) as Arranged).sections.map((s) => s.role)).toEqual(["details", "summary"]);
  });

  test("the profile", () => {
    const doc = normalizeDraft(RAW, sheetContext("learningWalk", { learningWalk: INFO }));
    expect(doc.tool).toBe("learningWalk");
  });
});

// ── Wide landscape tables: smaller type and short cells (as Risk Assessment) ─

test.describe("wide tables fit more to a page", () => {
  test("appraisal and SIP start with small type", () => {
    expect(sheetContext("appraisal", {}).design.fontScale).toBe("s");
    expect(sheetContext("sip", {}).design.fontScale).toBe("s");
  });

  test("their prompts cap each cell's length", () => {
    const pm = performanceManagementRequest({ curriculum: "x", staffMember: "Teacher", responsibilities: "Maths" });
    const sip = sipRequest({ areasToImprove: "Reading" });
    if ("error" in pm || "error" in sip) throw new Error("refused");
    expect(pm.messages[1].content).toMatch(/at most 30 words/);
    expect(sip.messages[1].content).toMatch(/at most 20 words/);
  });
});

// ── Old prefill links still open, minus the fields that went ───────────────

test.describe("old prefills", () => {
  test("a SIP link with outputFormat opens, without it", () => {
    const p = validatePrefill({ slug: "school-improvement-plan", fields: { areasToImprove: "Reading", outputFormat: "narrative" } });
    expect(p).not.toBeNull();
    expect(p!.fields).not.toHaveProperty("outputFormat");
  });

  test("an ECT link with includePDP opens, without it; reportType is kept", () => {
    const p = validatePrefill({ slug: "ect-report-writer", fields: { ectName: "Sarah Johnson", includePDP: true, reportType: "assessment" } });
    expect(p).not.toBeNull();
    expect(p!.fields).not.toHaveProperty("includePDP");
    expect(p!.fields.reportType).toBe("assessment");
    expect(validatePrefill({ slug: "ect-report-writer", fields: { ectName: "S", reportType: "bogus" } })!.fields).not.toHaveProperty("reportType");
  });
});

// ── Step 5: school improvement plan ─────────────────────────────────────────

test.describe("SIP request", () => {
  const BODY = { schoolType: "Primary", areasToImprove: "1. KS2 reading fluency for disadvantaged pupils\n2. Attendance of disadvantaged pupils", planTimeframe: 1 };
  const sent = (b: Record<string, unknown>) => {
    const r = sipRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses no priorities; an old outputFormat is ignored, not refused", () => {
    expect("error" in sipRequest({ ...BODY, areasToImprove: "  " })).toBe(true);
    expect("error" in sipRequest({ ...BODY, outputFormat: "narrative" })).toBe(false);
    expect(sent({ ...BODY, outputFormat: "narrative" })).toBe(sent(BODY));
  });

  test("the priorities as numbered, one priority each", () => {
    const t = sent(BODY);
    expect(t).toContain("1. KS2 reading fluency for disadvantaged pupils");
    expect(t).toContain("2. Attendance of disadvantaged pupils");
    expect(t).toMatch(/exactly 2 priorities/);
  });

  test("renewed framework only; never invented data or costs", () => {
    const t = sent(BODY);
    expect(t).toMatch(/report card/i);
    expect(t).not.toMatch(/\bIntent\b|Implementation:|Impact:/);
    expect(t).toContain("[school to add]");
    expect(t).toMatch(/never (invent|write)[^.]*cost/i);
  });

  test("timeframe 1 to 5 years, as the form allows; anything else is 1", () => {
    expect(sent({ ...BODY, planTimeframe: 2 })).toContain("over 2 years");
    expect(sent({ ...BODY, planTimeframe: 5 })).toContain("over 5 years");
    expect(sent({ ...BODY, planTimeframe: 7 })).toContain("over 5 years");
    expect(sent({ ...BODY, planTimeframe: "x" })).toContain("over 1 year");
  });

  test("schema: Ofsted areas and half terms are fixed lists; no cost or RAG field", () => {
    const f = sipResponseFormat();
    const schema = f.json_schema.schema as { properties: Record<string, { items?: { properties: Record<string, { enum?: string[]; items?: { properties: Record<string, unknown> } }> } }> };
    expect(Object.keys(schema.properties).sort()).toEqual(["context", "monitoring", "priorities", "rationale", "summary"]);
    const pr = schema.properties.priorities.items!.properties;
    expect(pr.ofstedArea.enum).toContain("Attendance and behaviour");
    expect(pr.ofstedArea.enum).not.toContain("Quality of education");
    expect(Object.keys(pr.actions.items!.properties).sort()).toEqual(["action", "leadRole", "monitoring", "successCriteria", "timescale"]);
    expect(schema.properties.monitoring.items!.properties.halfTerm.enum).toEqual(SIP_HALF_TERMS);
    expect(JSON.stringify(schema)).not.toMatch(/cost|budget|rag/i);
  });
});

test.describe("arrangeSip", () => {
  const RAW = {
    summary: "Two priorities for 2026 to 2027 — reading and attendance.",
    context: "[school to add] context.",
    rationale: "Why these priorities.",
    priorities: [
      { title: "Reading fluency", ofstedArea: "Curriculum and teaching", actions: [{ action: "Daily fluency practice", leadRole: "English lead", timescale: "From September", monitoring: "Termly reading checks", successCriteria: "Words per minute rises" }, { action: "", leadRole: "", timescale: "", monitoring: "", successCriteria: "" }] },
      { title: "Attendance", ofstedArea: "Quality of education", actions: [{ action: "First day calling", leadRole: "Attendance lead", timescale: "Autumn", monitoring: "Weekly data", successCriteria: "Persistent absence falls" }] },
      { title: "", ofstedArea: "Inclusion", actions: [] },
    ],
    monitoring: [
      { halfTerm: "Spring 1", activity: "Reading data review" },
      { halfTerm: "Autumn 1", activity: "Baseline checks" },
      { halfTerm: "Winter", activity: "Not a half term" },
      { halfTerm: "Autumn 2", activity: "" },
    ],
  };
  const INFO = { schoolType: "Primary", timeframe: 1 };

  test("one landscape action table per priority, with blank Cost and RAG for the school", () => {
    const d = arrangeSip(RAW, INFO) as Arranged;
    const ps = d.sections.filter((s) => s.role === "priority");
    expect(ps.map((s) => s.title)).toEqual(["Priority 1: Reading fluency", "Priority 2: Attendance"]);
    const t = ps[0].blocks[0];
    expect(t.headers).toEqual(["Action", "Lead", "Timescale", "Monitoring", "Success criteria", "Cost", "RAG"]);
    expect(t.rows).toEqual([["Daily fluency practice", "English lead", "From September", "Termly reading checks", "Words per minute rises", "", ""]]);
  });

  test("a valid Ofsted area is named; an invalid one is dropped, the priority kept", () => {
    const ps = (arrangeSip(RAW, INFO) as Arranged).sections.filter((s) => s.role === "priority");
    expect(ps[0].instructions).toBe("Ofsted evaluation area: Curriculum and teaching");
    expect(ps[1].instructions).toBe("");
  });

  test("monitoring calendar in half-term order; unknown or empty dropped", () => {
    const t = sec(arrangeSip(RAW, INFO), "monitoring")!.blocks[0];
    expect(t.headers).toEqual(["Half term", "Monitoring", "Done"]);
    expect(t.rows).toEqual([["Autumn 1", "Baseline checks", ""], ["Spring 1", "Reading data review", ""]]);
  });

  test("details and a baseline line per priority for the school to fill in", () => {
    const d = arrangeSip(RAW, INFO) as Arranged;
    expect(sec(d, "details")!.blocks[0].rows).toEqual([["School", ""], ["Type", "Primary"], ["Plan period", "1 year"], ["Headteacher", ""], ["Agreed by governors on", ""]]);
    expect(sec(d, "baseline")!.blocks[0]).toEqual({ type: "table", headers: ["Priority", "Where we are now (school to add)"], rows: [["Reading fluency", ""], ["Attendance", ""]] });
  });

  test("narrative parts are their own sections, switchable in Design; dashes undone", () => {
    const d = arrangeSip(RAW, INFO) as Arranged;
    for (const role of ["summary", "context", "rationale"]) expect(sec(d, role)).toBeTruthy();
    for (const id of ["summary", "context", "rationale", "baseline", "monitoring"]) expect(SIP_PARTS.map((p) => p.id)).toContain(id);
    expect(JSON.stringify(d)).not.toMatch(/[–—]/);
  });

  test("mid-stream: details only", () => {
    expect((arrangeSip({}, INFO) as Arranged).sections.map((s) => s.role)).toEqual(["details"]);
  });

  test("the profile starts landscape", () => {
    const doc = normalizeDraft(RAW, sheetContext("sip", { sip: INFO }));
    expect(doc.tool).toBe("sip");
    expect(doc.design.landscape).toBe(true);
  });
});
