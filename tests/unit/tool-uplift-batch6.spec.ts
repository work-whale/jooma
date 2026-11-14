import { test, expect } from "@playwright/test";
import { scrubStaffTitles } from "@/app/lib/staff-privacy";
import { timedItems } from "@/app/lib/sheets/timing";
import { inspectionPrepRequest, inspectionResponseFormat } from "@/app/lib/inspection-prep-prompt";
import { arrangeInspection, inspectionAreas, resolveInspectionBody, INSPECTION_BODIES, INSPECTION_PARTS } from "@/app/lib/sheets/inspection";
import { OFSTED_GRADED_AREAS, OFSTED_GRADES, OFSTED_TOOLKIT_VERSION } from "@/app/lib/ofsted";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { validatePrefill } from "@/app/lib/toolPrefill";
import { findPolicy, POLICY_CATALOGUE, POLICY_GROUPS, policyStatusText } from "@/app/lib/policy-catalogue";
import { arrangePolicy, isEnglandCurriculum, POLICY_PARTS } from "@/app/lib/sheets/policy";
import { policyRequest, policyResponseFormat } from "@/app/lib/policy-prompt";
import { meetingRequest, meetingResponseFormat } from "@/app/lib/meeting-planner-prompt";
import { arrangeMeeting, MEETING_PARTS } from "@/app/lib/sheets/meeting";
import { withPupilName } from "@/app/lib/sheets/pupil";
import { assemblyRequest, assemblyResponseFormat } from "@/app/lib/assembly-prompt";
import { arrangeAssembly, assemblyDeckParams, ASSEMBLY_PARTS, ASSEMBLY_SHEET_PARTS } from "@/app/lib/sheets/assembly";
import { assemblyHandoffs } from "@/app/lib/lesson-handoffs";

/*
 * Tool uplift batch 6: Inspection Prep, Policy, Meeting Planner, Staff
 * Slides and Assembly, and the shared pieces they stand on. Written before
 * the code (TDD).
 */

const sum = (xs: { minutes: number }[]) => xs.reduce((n, x) => n + x.minutes, 0);

// ── Step 0b: timed items ────────────────────────────────────────────────────

test.describe("timedItems", () => {
  test("scales the model's minutes so they always add up to the length", () => {
    const under = timedItems([{ label: "Welcome", minutes: 5 }, { label: "Data", minutes: 10 }, { label: "Close", minutes: 5 }], 60);
    expect(sum(under)).toBe(60);
    expect(under.map((i) => i.label)).toEqual(["Welcome", "Data", "Close"]);
    const over = timedItems([{ label: "A", minutes: 40 }, { label: "B", minutes: 40 }], 45);
    expect(sum(over)).toBe(45);
  });

  test("rounds to 5 minutes from a 30 minute length, to 1 below it", () => {
    const long = timedItems([{ label: "A", minutes: 7 }, { label: "B", minutes: 13 }, { label: "C", minutes: 22 }], 60);
    for (const i of long) expect(i.minutes % 5).toBe(0);
    expect(sum(long)).toBe(60);
    const short = timedItems([{ label: "A", minutes: 3 }, { label: "B", minutes: 4 }, { label: "C", minutes: 8 }], 20);
    expect(sum(short)).toBe(20);
    expect(short.some((i) => i.minutes % 5 !== 0)).toBe(true);
  });

  test("never squeezes an item to nothing, even a tiny one", () => {
    const out = timedItems([{ label: "Welcome", minutes: 1 }, { label: "Main", minutes: 100 }], 60);
    expect(out[0].minutes).toBeGreaterThanOrEqual(5);
    expect(sum(out)).toBe(60);
  });

  test("one item takes the whole length", () => {
    expect(timedItems([{ label: "Only", minutes: 3 }], 25)).toEqual([{ label: "Only", minutes: 25 }]);
  });

  test("missing or silly minutes share the time evenly", () => {
    const out = timedItems([{ label: "A", minutes: Number.NaN }, { label: "B", minutes: -4 }, { label: "C", minutes: 0 }], 30);
    expect(sum(out)).toBe(30);
    expect(out.map((i) => i.minutes)).toEqual([10, 10, 10]);
  });

  test("a length of 0 or nonsense keeps the model's own minutes", () => {
    expect(timedItems([{ label: "A", minutes: 4 }, { label: "B", minutes: 6 }], 0).map((i) => i.minutes)).toEqual([4, 6]);
    expect(timedItems([{ label: "A", minutes: 4 }], Number.NaN).map((i) => i.minutes)).toEqual([4]);
  });

  test("more items than minutes gives each one minute", () => {
    const out = timedItems(Array.from({ length: 6 }, (_, i) => ({ label: `I${i}`, minutes: 2 })), 4);
    expect(out.every((i) => i.minutes === 1)).toBe(true);
  });

  test("no items, no rows", () => {
    expect(timedItems([], 60)).toEqual([]);
  });

  test("clock times run from the start time, across the hour", () => {
    const out = timedItems([{ label: "A", minutes: 20 }, { label: "B", minutes: 25 }, { label: "C", minutes: 15 }], 60, "15:30");
    expect(out.map((i) => [i.from, i.to])).toEqual([["15:30", "15:50"], ["15:50", "16:15"], ["16:15", "16:30"]]);
  });

  test("a single digit hour and late meetings past midnight", () => {
    expect(timedItems([{ label: "A", minutes: 30 }], 30, "8:45")[0]).toMatchObject({ from: "08:45", to: "09:15" });
    expect(timedItems([{ label: "A", minutes: 30 }], 30, "23:50")[0]).toMatchObject({ from: "23:50", to: "00:20" });
  });

  test("no or bad start time, no clock times", () => {
    for (const start of [undefined, "", "soon", "25:00", "12:75"]) {
      const out = timedItems([{ label: "A", minutes: 10 }], 10, start);
      expect(out[0].from).toBeUndefined();
      expect(out[0].to).toBeUndefined();
    }
  });
});

// ── Step 0c: the title scrub's replacement word ─────────────────────────────

test.describe("scrubStaffTitles replacement word", () => {
  test("defaults to teacher, as the Learning Walk has it", () => {
    expect(scrubStaffTitles("in Mr Patel's room")).toBe("in a teacher's room");
  });

  test("a meeting says colleague, capitalised at a sentence start", () => {
    expect(scrubStaffTitles("Mrs Lee to present. Then Dr. Ahmed's data.", "colleague")).toBe("A colleague to present. Then a colleague's data.");
  });
});

// ── Step 1: Inspection Prep ─────────────────────────────────────────────────

type Block = { type: string; title?: string; style?: string; items?: string[]; headers?: string[]; rows?: string[][]; text?: string; label?: string };
type Arranged = { title: string; sections: { role: string; title: string; instructions: string; blocks: Block[] }[] };
const sec = (d: unknown, role: string) => (d as Arranged).sections.find((s) => s.role === role);
const secs = (d: unknown, role: string) => (d as Arranged).sections.filter((s) => s.role === role);
const DASHES = /[–—]/;

test.describe("inspection bodies", () => {
  test("the dropdown: Ofsted first, each UK nation's body, ISI, SIAMS, then Other", () => {
    expect(INSPECTION_BODIES.map((b) => b.id)).toEqual(["ofsted", "isi", "siams", "estyn", "education-scotland", "eti", "other"]);
  });

  test("an id, or an old free-text body however typed, maps to the body", () => {
    expect(resolveInspectionBody("ofsted")).toEqual({ id: "ofsted", name: "Ofsted" });
    expect(resolveInspectionBody("an OFSTED section 5")).toEqual({ id: "ofsted", name: "Ofsted" });
    expect(resolveInspectionBody("Estyn")!.id).toBe("estyn");
    expect(resolveInspectionBody("isi")!.id).toBe("isi");
    expect(resolveInspectionBody("SIAMS inspection")!.id).toBe("siams");
    expect(resolveInspectionBody("Education Scotland")!.id).toBe("education-scotland");
  });

  test("an unknown typed body is Other, under its own name", () => {
    expect(resolveInspectionBody("KHDA")).toEqual({ id: "other", name: "KHDA" });
    expect(resolveInspectionBody("other", "  CIS accreditation ")).toEqual({ id: "other", name: "CIS accreditation" });
  });

  test("no body, or Other with no name, is nothing", () => {
    expect(resolveInspectionBody(undefined)).toBeNull();
    expect(resolveInspectionBody("   ")).toBeNull();
    expect(resolveInspectionBody("other", "  ")).toBeNull();
    expect(resolveInspectionBody("other")).toBeNull();
  });

  test("Ofsted areas: safeguarding first, framework order, early years and post-16 only when the school has them", () => {
    const always = OFSTED_GRADED_AREAS.filter((a) => !a.whereRelevant).map((a) => a.name);
    expect(inspectionAreas({})).toEqual(["Safeguarding", ...always]);
    const all = inspectionAreas({ earlyYears: true, postSixteen: true });
    expect(all).toEqual(["Safeguarding", ...OFSTED_GRADED_AREAS.map((a) => a.name)]);
    expect(inspectionAreas({ earlyYears: true })).toContain("Early years");
    expect(inspectionAreas({ earlyYears: true })).not.toContain("Post-16 provision");
  });
});

test.describe("Inspection Prep request", () => {
  const sent = (b: Record<string, unknown>) => {
    const r = inspectionPrepRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses no body, and Other with no name", () => {
    expect("error" in inspectionPrepRequest({})).toBe(true);
    expect("error" in inspectionPrepRequest({ inspectionBody: "  " })).toBe(true);
    expect("error" in inspectionPrepRequest({ inspectionBody: "other", otherBody: "" })).toBe(true);
  });

  test("Ofsted: the renewed framework, every area in order with what inspectors look at", () => {
    const t = sent({ inspectionBody: "ofsted" });
    expect(t).toMatch(/no single overall effectiveness grade/);
    for (const a of inspectionAreas({})) expect(t).toContain(a);
    expect(t).toMatch(/exactly 7 areas/);
    expect(t).not.toContain("Early years:");
    expect(sent({ inspectionBody: "ofsted", earlyYears: true })).toMatch(/exactly 8 areas/);
  });

  test("the model never grades: leaders tick that themselves", () => {
    for (const b of [{ inspectionBody: "ofsted" }, { inspectionBody: "estyn" }]) {
      expect(sent(b)).toMatch(/never (grade|predict)/i);
    }
  });

  test("no recent policy developments, even from an old prefill asking for them", () => {
    const t = sent({ inspectionBody: "ofsted", includePolicyChanges: true });
    expect(t).not.toMatch(/policy developments/i);
    expect(t).toBe(sent({ inspectionBody: "ofsted" }));
  });

  test("evidence and success criteria are asked for only when ticked", () => {
    expect(sent({ inspectionBody: "ofsted" })).toMatch(/evidence: an empty list/);
    expect(sent({ inspectionBody: "ofsted", includeEvidence: true })).not.toMatch(/evidence: an empty list/);
    expect(sent({ inspectionBody: "ofsted" })).toMatch(/successCriteria: an empty list/);
    expect(sent({ inspectionBody: "ofsted", includeSuccessCriteria: true })).not.toMatch(/successCriteria: an empty list/);
  });

  test("another body uses its own framework, never Ofsted's areas", () => {
    const t = sent({ inspectionBody: "estyn" });
    expect(t).toContain("Estyn");
    expect(t).toMatch(/Wales/);
    expect(t).not.toContain("Attendance and behaviour");
    expect(t).not.toContain("renewed education inspection framework (from");
  });

  test("the focus is carried; roles never names; no dashes in what we write", () => {
    const t = sent({ inspectionBody: "ofsted", inspectionFocus: "early reading" });
    expect(t).toContain("early reading");
    expect(t).toMatch(/by role only/);
    expect(sent({ inspectionBody: "ofsted", includeEvidence: true, includeSuccessCriteria: true })).not.toMatch(DASHES);
    expect(sent({ inspectionBody: "other", otherBody: "KHDA" })).not.toMatch(DASHES);
  });

  test("schema: Ofsted areas are a fixed list; other bodies name their own; no grade field", () => {
    const ofsted = inspectionResponseFormat(inspectionAreas({}));
    const s = ofsted.json_schema.schema as { properties: Record<string, { items?: { properties: Record<string, { enum?: string[] }> } }> };
    expect(Object.keys(s.properties).sort()).toEqual(["areas", "intro"]);
    const area = s.properties.areas.items!.properties;
    expect(Object.keys(area).sort()).toEqual(["actions", "area", "evidence", "questions", "successCriteria"]);
    expect(area.area.enum).toEqual(inspectionAreas({}));
    const other = inspectionResponseFormat(null).json_schema.schema as typeof s;
    expect(other.properties.areas.items!.properties.area.enum).toBeUndefined();
    expect(JSON.stringify(ofsted)).not.toMatch(/grade|rating|judgement/i);
  });

  test("an old prefill with a typed body still opens", () => {
    const p = validatePrefill({ slug: "inspection-prep", fields: { inspectionBody: "Ofsted", includePolicyChanges: true } });
    expect(p).not.toBeNull();
    expect(resolveInspectionBody(p!.fields.inspectionBody as string)!.id).toBe("ofsted");
    expect(p!.fields).not.toHaveProperty("includePolicyChanges");
  });
});

test.describe("arrangeInspection", () => {
  const AREA = (area: string, extra: Record<string, unknown> = {}) => ({
    area,
    questions: ["How do you know?", "What has changed?"],
    actions: [{ action: "Review the single central record", leadRole: "DSL", byWhen: "Before half term" }, { action: "", leadRole: "", byWhen: "" }],
    evidence: ["Safeguarding logs"],
    successCriteria: ["Every record complete"],
    ...extra,
  });
  const RAW = {
    intro: "A guide for leaders — ahead of inspection.",
    areas: [AREA("Achievement"), AREA("Safeguarding"), AREA("Quality of education"), AREA("Achievement"), AREA("Early years"), AREA("")],
  };
  const OFSTED = { bodyId: "ofsted", bodyName: "Ofsted", focus: "", includeEvidence: true, includeSuccessCriteria: true };

  test("Ofsted: only framework areas, once each, in framework order", () => {
    expect(secs(arrangeInspection(RAW, OFSTED), "area").map((s) => s.title)).toEqual(["Safeguarding", "Achievement"]);
    expect(secs(arrangeInspection(RAW, { ...OFSTED, earlyYears: true }), "area").map((s) => s.title)).toEqual(["Safeguarding", "Achievement", "Early years"]);
  });

  test("each area: questions, an action table with a blank Done column, evidence and criteria", () => {
    const a = secs(arrangeInspection(RAW, OFSTED), "area")[1];
    expect(a.instructions).toMatch(/^Inspectors look at whether the school/);
    expect(a.blocks[0]).toMatchObject({ type: "list", style: "number", items: ["How do you know?", "What has changed?"] });
    expect(a.blocks[1]).toEqual({ type: "table", headers: ["Action", "Lead", "By when", "Done"], rows: [["Review the single central record", "DSL", "Before half term", ""]] });
    expect(a.blocks.find((b) => b.title === "Evidence you already keep")!.items).toEqual(["Safeguarding logs"]);
    expect(a.blocks.find((b) => b.title === "What strong preparation looks like")!.style).toBe("check");
  });

  test("a blank tick row of the five grades per graded area; met or not met for safeguarding", () => {
    const [sg, ach] = secs(arrangeInspection(RAW, OFSTED), "area");
    const row = (s: typeof sg) => s.blocks.find((b) => b.title === "Where are we now?")!;
    expect(row(ach)).toEqual({ type: "list", title: "Where are we now?", style: "check", items: [...OFSTED_GRADES] });
    expect(row(sg).items).toEqual(["Met", "Not met"]);
    expect(sg.instructions).toBe("Judged as met or not met, not graded.");
  });

  test("unticked evidence and criteria are dropped even if the model sent them", () => {
    const a = secs(arrangeInspection(RAW, { ...OFSTED, includeEvidence: false, includeSuccessCriteria: false }), "area")[0];
    expect(a.blocks.map((b) => b.title)).not.toContain("Evidence you already keep");
    expect(a.blocks.map((b) => b.title)).not.toContain("What strong preparation looks like");
  });

  test("the framework note comes from code", () => {
    const f = sec(arrangeInspection(RAW, OFSTED), "framework")!.blocks[0];
    expect(f.type).toBe("callout");
    expect(f.text).toContain(OFSTED_TOOLKIT_VERSION);
  });

  test("another body: its own headings, deduplicated, no tick row, and a check-your-framework note", () => {
    const raw = { intro: "x", areas: [AREA("Standards"), AREA("standards"), AREA("Wellbeing, care, support and guidance")] };
    const d = arrangeInspection(raw, { bodyId: "estyn", bodyName: "Estyn", focus: "", includeEvidence: false, includeSuccessCriteria: false });
    expect(secs(d, "area").map((s) => s.title)).toEqual(["Standards", "Wellbeing, care, support and guidance"]);
    expect(JSON.stringify(d)).not.toContain("Where are we now?");
    expect(sec(d, "framework")!.blocks[0].text).toMatch(/Check these headings against Estyn's current framework/);
  });

  test("details: the body and the focus; blanks for the school", () => {
    const rows = sec(arrangeInspection(RAW, { ...OFSTED, focus: "early reading" }), "details")!.blocks[0].rows;
    expect(rows).toEqual([["School", ""], ["Inspection", "Ofsted"], ["Focus", "early reading"], ["Prepared by", ""], ["Date", ""]]);
    expect(sec(arrangeInspection(RAW, OFSTED), "details")!.blocks[0].rows!.map((r) => r[0])).not.toContain("Focus");
  });

  test("mid-stream: details and the framework note only; dashes undone", () => {
    expect((arrangeInspection({}, OFSTED) as Arranged).sections.map((s) => s.role)).toEqual(["details", "framework"]);
    expect(JSON.stringify(arrangeInspection(RAW, OFSTED))).not.toMatch(DASHES);
  });

  test("the profile: a portrait document with Design parts", () => {
    const doc = normalizeDraft(RAW, sheetContext("inspection", { inspection: OFSTED }));
    expect(doc.tool).toBe("inspection");
    expect(doc.design.landscape).toBeFalsy();
    expect(INSPECTION_PARTS.map((p) => p.id)).toEqual(["details", "framework", "intro"]);
  });
});

// ── Step 2: Policy ──────────────────────────────────────────────────────────

test.describe("policy catalogue", () => {
  test("the 35 policies of the side panel, in 8 groups, each with status, review and approver", () => {
    expect(POLICY_CATALOGUE).toHaveLength(35);
    expect(POLICY_GROUPS).toHaveLength(8);
    expect(POLICY_GROUPS.flatMap((g) => g.policies)).toHaveLength(35);
    for (const p of POLICY_CATALOGUE) {
      expect(p.review.length).toBeGreaterThan(3);
      expect(p.approver.length).toBeGreaterThan(3);
      expect(policyStatusText(p).length).toBeGreaterThan(10);
    }
    expect(JSON.stringify(POLICY_CATALOGUE)).not.toMatch(DASHES);
  });

  test("facts that matter: child protection yearly for all schools, accessibility every 3 years, pay for maintained only", () => {
    expect(findPolicy("Child Protection & Safeguarding Policy")).toMatchObject({ statutory: "all", review: expect.stringMatching(/annually/i) });
    expect(findPolicy("Accessibility Plan")!.review).toMatch(/3 years/);
    expect(findPolicy("Pay Policy")!.statutory).toBe("maintained");
    expect(findPolicy("Homework Policy")!.statutory).toBe("no");
  });

  test("found by exact name, any case, & or and, with or without the word policy, or a common alias", () => {
    const cp = findPolicy("Child Protection & Safeguarding Policy");
    expect(findPolicy("child protection and safeguarding policy")).toBe(cp);
    expect(findPolicy("  Child Protection & Safeguarding ")).toBe(cp);
    expect(findPolicy("Safeguarding policy")).toBe(cp);
    expect(findPolicy("GDPR")).toBe(findPolicy("Data Protection Policy (GDPR)"));
    expect(findPolicy("send")).toBe(findPolicy("SEND Policy"));
  });

  test("a typed policy not in the catalogue is not guessed", () => {
    expect(findPolicy("School Uniform Policy")).toBeNull();
    expect(findPolicy("")).toBeNull();
    expect(findPolicy("Policy")).toBeNull();
  });

  test("England is the national curriculum or EYFS; the other nations are not", () => {
    expect(isEnglandCurriculum("2014 National Curriculum")).toBe(true);
    expect(isEnglandCurriculum("Early Years Foundation Stage (EYFS)")).toBe(true);
    for (const c of ["Scottish Curriculum for Excellence", "Welsh Curriculum", "Northern Ireland Curriculum"]) expect(isEnglandCurriculum(c)).toBe(false);
  });
});

test.describe("Policy request", () => {
  const BODY = { curriculum: "2014 National Curriculum", policy: "Behaviour Policy", additionalRequirements: "", outputType: "full" };
  const sent = (b: Record<string, unknown>) => {
    const r = policyRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses no policy or no curriculum; an old refine action is not a way round it", () => {
    expect("error" in policyRequest({ ...BODY, policy: " " })).toBe(true);
    expect("error" in policyRequest({ ...BODY, curriculum: "" })).toBe(true);
    expect("error" in policyRequest({ action: "refine", result: "x", instruction: "y" })).toBe(true);
  });

  test("the model is never asked for status, review dates or approval: code prints those", () => {
    const keys = Object.keys((policyResponseFormat().json_schema.schema as { properties: Record<string, unknown> }).properties).sort();
    expect(keys).toEqual(["linkedPolicies", "references", "roles", "sections", "summary"]);
    expect(JSON.stringify(policyResponseFormat())).not.toMatch(/review|approv|statutory|version/i);
  });

  test("England gets the renewed Ofsted framework; Wales does not", () => {
    expect(sent(BODY)).toMatch(/report card/);
    expect(sent({ ...BODY, curriculum: "Welsh Curriculum" })).not.toMatch(/Ofsted/);
    expect(sent({ ...BODY, curriculum: "Welsh Curriculum" })).toMatch(/Wales/);
  });

  test("full drafts clauses; outline drafts guidance notes", () => {
    expect(sent(BODY)).toMatch(/clauses: the policy text/);
    expect(sent({ ...BODY, outputType: "structure" })).toMatch(/clauses: 2 or 3 notes on what the school should write/);
    expect(sent({ ...BODY, outputType: "bogus" })).toBe(sent(BODY));
  });

  test("roles never names: titled names in the requirements are scrubbed; references listed honestly", () => {
    const t = sent({ ...BODY, additionalRequirements: "Mrs Khan is our DSL and Mr. Lee leads behaviour." });
    expect(t).not.toMatch(/Khan|Lee/);
    expect(t).toContain("A colleague is our DSL");
    expect(t).toMatch(/by role only/);
    expect(t).toMatch(/only (laws|legislation) and guidance you are sure exist/i);
  });

  test("no long dashes in what we write", () => {
    expect(sent(BODY)).not.toMatch(DASHES);
    expect(sent({ ...BODY, outputType: "structure", curriculum: "Scottish Curriculum for Excellence" })).not.toMatch(DASHES);
  });

  test("an old prefill still opens", () => {
    expect(validatePrefill({ slug: "policy-generator", fields: { curriculum: "2014 National Curriculum", policy: "SEND", outputType: "structure" } })!.fields.outputType).toBe("structure");
  });
});

test.describe("arrangePolicy", () => {
  const RAW = {
    summary: "This policy sets out how we promote good behaviour — for every pupil.",
    sections: [
      { title: "Our approach", clauses: ["We teach routines explicitly.", "We praise effort."] },
      { title: "", clauses: ["Orphan clause"] },
      { title: "Empty section", clauses: [] },
      { title: "Sanctions", clauses: ["Sanctions are fair and consistent."] },
    ],
    roles: [{ role: "Headteacher", duties: "Publishes the policy." }, { role: "", duties: "x" }],
    references: [{ title: "Behaviour in schools (DfE, 2024)", note: "Statutory guidance." }],
    linkedPolicies: ["Anti-Bullying Policy", ""],
  };
  const INFO = { policy: "Behaviour Policy", curriculum: "2014 National Curriculum", outputType: "full" };
  type Doc = Arranged & { title: string };
  const numbered = (d: unknown) => (d as Doc).sections.filter((s) => /^\d+\. /.test(s.title)).map((s) => s.title);

  test("titled by the policy; details from the catalogue with blanks for the school", () => {
    const d = arrangePolicy(RAW, INFO) as Doc;
    expect(d.title).toBe("Behaviour Policy");
    const rows = Object.fromEntries(sec(d, "details")!.blocks[0].rows!);
    expect(rows.Status).toBe(policyStatusText(findPolicy("Behaviour Policy")!));
    expect(rows.Review).toBe(findPolicy("Behaviour Policy")!.review);
    expect(rows["Approved by"]).toBe(findPolicy("Behaviour Policy")!.approver);
    for (const k of ["School", "Policy owner", "Date adopted", "Next review", "Version"]) expect(rows[k]).toBe("");
  });

  test("a typed policy, or a school outside England, is told to check", () => {
    for (const info of [{ ...INFO, policy: "School Uniform Policy" }, { ...INFO, curriculum: "Welsh Curriculum" }]) {
      const rows = Object.fromEntries(sec(arrangePolicy(RAW, info), "details")!.blocks[0].rows!);
      expect(rows.Status).toMatch(/check whether this policy is statutory/i);
      expect(rows.Review).toBe("");
      expect(rows["Approved by"]).toBe("");
    }
  });

  test("sections numbered in order, clauses 2.1, 2.2; empty sections dropped", () => {
    const d = arrangePolicy(RAW, INFO);
    expect(numbered(d)).toEqual(["1. Purpose", "2. Our approach", "3. Sanctions", "4. Roles and responsibilities", "5. Legislation and guidance", "6. Linked policies"]);
    const approach = (d as Doc).sections.find((s) => s.title === "2. Our approach")!;
    expect(approach.blocks.map((b) => b.text)).toEqual(["2.1 We teach routines explicitly.", "2.2 We praise effort."]);
  });

  test("roles as a table, references with a fixed check note, linked policies as a list", () => {
    const d = arrangePolicy(RAW, INFO) as Doc;
    const roles = d.sections.find((s) => s.title === "4. Roles and responsibilities")!.blocks[0];
    expect(roles).toEqual({ type: "table", headers: ["Role", "Responsibilities"], rows: [["Headteacher", "Publishes the policy."]] });
    const refs = d.sections.find((s) => s.title === "5. Legislation and guidance")!;
    expect(refs.blocks[0].type).toBe("callout");
    expect(refs.blocks[0].text).toMatch(/check these are the current versions/i);
    expect(refs.blocks[1].items).toEqual(["Behaviour in schools (DfE, 2024): Statutory guidance."]);
    expect(d.sections.find((s) => s.title === "6. Linked policies")!.blocks[0].items).toEqual(["Anti-Bullying Policy"]);
  });

  test("the check note stays even when the model cites nothing", () => {
    const d = arrangePolicy({ ...RAW, references: [] }, INFO) as Doc;
    const refs = d.sections.find((s) => /Legislation and guidance/.test(s.title))!;
    expect(refs.blocks).toHaveLength(1);
  });

  test("a blank version history for the school, switchable in Design", () => {
    const h = sec(arrangePolicy(RAW, INFO), "history")!.blocks[0];
    expect(h.headers).toEqual(["Version", "Date", "Changes", "Approved by"]);
    expect(h.rows!.length).toBeGreaterThan(1);
    for (const r of h.rows!) expect(r.every((c) => c === "")).toBe(true);
    expect(POLICY_PARTS.map((p) => p.id)).toEqual(["details", "history"]);
  });

  test("an outline says what each section should cover", () => {
    const d = arrangePolicy(RAW, { ...INFO, outputType: "structure" }) as Doc;
    expect(d.sections.find((s) => s.title === "2. Our approach")!.instructions).toMatch(/cover/i);
    expect((arrangePolicy(RAW, INFO) as Doc).sections.find((s) => s.title === "2. Our approach")!.instructions).toBe("");
  });

  test("mid-stream: details only; dashes undone", () => {
    expect((arrangePolicy({}, INFO) as Doc).sections.map((s) => s.role)).toEqual(["details"]);
    expect(JSON.stringify(arrangePolicy(RAW, INFO))).not.toMatch(DASHES);
  });

  test("the profile: portrait", () => {
    const doc = normalizeDraft(RAW, sheetContext("policy", { policy: INFO }));
    expect(doc.tool).toBe("policy");
    expect(doc.design.landscape).toBeFalsy();
  });
});

// ── Step 3: Meeting Planner ─────────────────────────────────────────────────

test.describe("Meeting request", () => {
  const BODY = { purpose: "Pupil progress review for Year 6", participants: "Headteacher, Year 6 teachers, SENCo", topics: "Reading; Maths", duration: 60 };
  const sent = (b: Record<string, unknown>) => {
    const r = meetingRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses a missing purpose, participants or a silly length", () => {
    expect("error" in meetingRequest({ ...BODY, purpose: " " })).toBe(true);
    expect("error" in meetingRequest({ ...BODY, participants: "" })).toBe(true);
    for (const duration of [0, 4, 481, "x"]) expect("error" in meetingRequest({ ...BODY, duration })).toBe(true);
    expect("error" in meetingRequest({ ...BODY, duration: "45" })).toBe(false);
  });

  test("refuses a pupil's name in any key, however it arrives", () => {
    for (const k of ["pupilName", "pupil", "name"]) expect("error" in meetingRequest({ ...BODY, [k]: "Amira" })).toBe(true);
    expect("error" in meetingRequest({ ...BODY, extra: { firstName: "Amira" } })).toBe(true);
  });

  test("titled names are scrubbed in every field, as a colleague", () => {
    const t = sent({ ...BODY, purpose: "Mrs Lee's Year 6 review", participants: "Mr Patel, SENCo", topics: "Dr. Ahmed's data" });
    expect(t).not.toMatch(/Lee|Patel|Ahmed/);
    expect(t).toContain("A colleague's Year 6 review");
    expect(t).toContain("A colleague's data");
  });

  test("the pupil placeholder is explained, never filled", () => {
    expect(sent({ ...BODY, purpose: "Annual review for [PUPIL]" })).toMatch(/\[PUPIL\] is the pupil the meeting is about: keep \[PUPIL\] exactly/);
    expect(sent(BODY)).not.toContain("[PUPIL]");
  });

  test("agenda minutes are asked to fill the length; roles only; no dashes", () => {
    const t = sent(BODY);
    expect(t).toMatch(/come to 60 minutes/);
    expect(t).toMatch(/by role only/);
    expect(t).not.toMatch(DASHES);
  });

  test("the icebreaker only when ticked", () => {
    expect(sent(BODY)).toMatch(/icebreaker: an empty string/);
    expect(sent({ ...BODY, includeIcebreaker: true })).not.toMatch(/icebreaker: an empty string/);
  });

  test("schema: purpose is inform, discuss or decide; minutes a whole number; no names, dates or action owners", () => {
    const s = meetingResponseFormat().json_schema.schema as { properties: Record<string, { items?: { properties: Record<string, { enum?: string[]; type?: string }> } }> };
    expect(Object.keys(s.properties).sort()).toEqual(["followUp", "icebreaker", "items", "overview", "preparation", "title"]);
    const item = s.properties.items.items!.properties;
    expect(item.purpose.enum).toEqual(["inform", "discuss", "decide"]);
    expect(item.minutes.type).toBe("integer");
    expect(JSON.stringify(s)).not.toMatch(/name|date|owner|assigned/i);
  });
});

test.describe("arrangeMeeting", () => {
  const RAW = {
    title: "Year 6 pupil progress review",
    overview: "A review of [PUPIL]'s progress — with next steps.",
    preparation: ["Share the data a week before"],
    icebreaker: "",
    items: [
      { title: "Welcome", minutes: 5, leadRole: "Headteacher", purpose: "inform", notes: ["Set the aims"] },
      { title: "Reading data", minutes: 30, leadRole: "English lead", purpose: "discuss", notes: ["Look at fluency"] },
      { title: "Next steps", minutes: 10, leadRole: "SENCo", purpose: "decide", notes: [] },
      { title: "", minutes: 10, leadRole: "x", purpose: "inform", notes: [] },
    ],
    followUp: ["Minutes to staff within two days"],
  };
  const INFO = { duration: 60, startTime: "15:30", participants: "Headteacher, Year 6 teachers", includeActionItems: true };

  test("a timed agenda that fills the length, with clock times from the start", () => {
    const a = sec(arrangeMeeting(RAW, INFO), "agenda")!.blocks[0];
    expect(a.headers).toEqual(["Time", "Item", "Lead", "Purpose"]);
    expect(a.rows!.map((r) => r[0])).toEqual(["15:30 to 15:35", "15:35 to 16:15", "16:15 to 16:30"]);
    expect(a.rows!.map((r) => r[3])).toEqual(["Inform", "Discuss", "Decide"]);
  });

  test("without a start time, minutes instead of clock times", () => {
    const a = sec(arrangeMeeting(RAW, { ...INFO, startTime: "" }), "agenda")!.blocks[0];
    expect(a.headers![0]).toBe("Minutes");
    expect(a.rows!.map((r) => r[0])).toEqual(["5", "40", "15"]);
  });

  test("details: blanks for the school, the participants, the time and the pupil placeholder when named", () => {
    const rows = Object.fromEntries(sec(arrangeMeeting(RAW, { ...INFO, pupilNamed: true }), "details")!.blocks[0].rows!);
    expect(rows).toMatchObject({ Date: "", Time: "15:30 to 16:30", Venue: "", Chair: "", "Minutes taken by": "", Participants: "Headteacher, Year 6 teachers", Pupil: "[PUPIL]" });
    expect(Object.keys(Object.fromEntries(sec(arrangeMeeting(RAW, INFO), "details")!.blocks[0].rows!))).not.toContain("Pupil");
  });

  test("facilitator notes, a minutes box per item, and a blank action log", () => {
    const d = arrangeMeeting(RAW, INFO);
    const notes = sec(d, "notes")!;
    expect(notes.blocks.map((b) => b.title)).toEqual(["Before the meeting", "Welcome", "Reading data", "After the meeting"]);
    const minutes = sec(d, "minutes")!;
    expect(minutes.blocks.map((b) => b.headers![0])).toEqual(["Welcome", "Reading data", "Next steps"]);
    const log = sec(d, "actions")!.blocks[0];
    expect(log.headers).toEqual(["Action", "Who", "By when"]);
    expect(log.rows!.length).toBeGreaterThanOrEqual(5);
    for (const r of log.rows!) expect(r.every((c) => c === "")).toBe(true);
  });

  test("no action log when not asked for", () => {
    expect(sec(arrangeMeeting(RAW, { ...INFO, includeActionItems: false }), "actions")).toBeUndefined();
  });

  test("an icebreaker joins the notes when the model wrote one", () => {
    const notes = sec(arrangeMeeting({ ...RAW, icebreaker: "Two truths and a lie." }, INFO), "notes")!;
    expect(notes.blocks.find((b) => b.title === "Icebreaker")!.items).toEqual(["Two truths and a lie."]);
  });

  test("mid-stream: details only; dashes undone; titled by the meeting", () => {
    expect((arrangeMeeting({}, INFO) as Arranged).sections.map((s) => s.role)).toEqual(["details"]);
    expect(JSON.stringify(arrangeMeeting(RAW, INFO))).not.toMatch(DASHES);
    expect((arrangeMeeting(RAW, INFO) as Arranged).title).toBe("Year 6 pupil progress review");
    expect(MEETING_PARTS.map((p) => p.id)).toEqual(["details", "overview", "notes", "minutes", "actions"]);
  });

  test("the profile keeps the pupil's name on the document, never in the text", () => {
    const doc = normalizeDraft(RAW, sheetContext("meeting", { meeting: INFO, pupil: { name: "Amira", pronouns: "they" } }));
    expect(doc.tool).toBe("meeting");
    expect(doc.pupil?.name).toBe("Amira");
    expect(JSON.stringify(doc.sections)).not.toContain("Amira");
    expect(JSON.stringify(withPupilName(doc).sections)).toContain("Amira's progress");
  });
});

// ── Step 5: Assembly ────────────────────────────────────────────────────────

test.describe("Assembly request", () => {
  const BODY = { theme: "Kindness", stageOfSchool: "KS2", lengthMinutes: 20, reflection: "reflection" };
  const sent = (b: Record<string, unknown>) => {
    const r = assemblyRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses no theme, and a faith school with no faith named", () => {
    expect("error" in assemblyRequest({ ...BODY, theme: " " })).toBe(true);
    expect("error" in assemblyRequest({ ...BODY, reflection: "faith", faith: "" })).toBe(true);
    expect("error" in assemblyRequest({ ...BODY, reflection: "faith", faith: "Catholic" })).toBe(false);
  });

  test("the closing follows the picker: a reflection never prays; worship is broadly Christian; a faith school its own tradition", () => {
    expect(sent(BODY)).toMatch(/quiet reflection/);
    expect(sent(BODY)).toMatch(/No prayer/);
    expect(sent({ ...BODY, reflection: "worship" })).toMatch(/broadly Christian/);
    expect(sent({ ...BODY, reflection: "worship" })).toMatch(/any faith or none/);
    expect(sent({ ...BODY, reflection: "faith", faith: "Catholic" })).toMatch(/Catholic tradition/);
    // Anything unknown, or an old run without the picker, is a reflection.
    expect(sent({ ...BODY, reflection: "bogus" })).toBe(sent(BODY));
    expect(sent({ theme: "Kindness", stageOfSchool: "KS2", lengthMinutes: 20 })).toBe(sent(BODY));
  });

  test("the length is 5 to 120 minutes, 20 when missing; the stage is carried", () => {
    expect(sent({ ...BODY, lengthMinutes: 300 })).toMatch(/120 minutes/);
    expect(sent({ ...BODY, lengthMinutes: "x" })).toMatch(/20 minutes/);
    expect(sent(BODY)).toContain("KS2");
  });

  test("never names pupils; titled names in the notes are scrubbed; no dashes", () => {
    const t = sent({ ...BODY, additionalNotes: "Mention Mrs Lee's charity run" });
    expect(t).not.toContain("Lee");
    expect(t).toMatch(/never name a pupil/i);
    expect(t).not.toMatch(DASHES);
    expect(sent({ ...BODY, reflection: "worship" })).not.toMatch(DASHES);
  });

  test("schema: the six parts, whole minutes, and nothing for names", () => {
    const s = assemblyResponseFormat().json_schema.schema as { properties: Record<string, { items?: { properties: Record<string, { enum?: string[]; type?: string }> } }> };
    expect(Object.keys(s.properties).sort()).toEqual(["message", "parts", "preparation", "questions", "resources", "title"]);
    const part = s.properties.parts.items!.properties;
    expect(part.part.enum).toEqual([...ASSEMBLY_PARTS]);
    expect(part.minutes.type).toBe("integer");
  });
});

test.describe("arrangeAssembly", () => {
  const RAW = {
    title: "Small acts, big difference",
    message: "Kindness changes a day — yours and theirs.",
    parts: [
      { part: "intro", title: "Welcome", minutes: 2, say: ["Good morning, everyone."], delivery: ["Smile and wait for quiet"] },
      { part: "story", title: "The lost glove", minutes: 6, say: ["Tell the story"], delivery: ["Pause at the twist"] },
      { part: "questions", title: "Let's think together", minutes: 4, say: ["Ask the questions"], delivery: [] },
      { part: "reflection", title: "A quiet moment", minutes: 3, say: ["Close your eyes"], delivery: [] },
      { part: "bogus", title: "Not a part", minutes: 3, say: ["x"], delivery: [] },
      { part: "main", title: "", minutes: 3, say: ["y"], delivery: [] },
    ],
    questions: ["When did someone help you?", ""],
    resources: ["A glove", "Slides"],
    preparation: ["Practise the story"],
  };
  const INFO = { stage: "KS2", lengthMinutes: 20, reflection: "reflection" };

  test("the running order always adds up to the length", () => {
    const t = sec(arrangeAssembly(RAW, INFO), "order")!.blocks[0];
    expect(t.headers).toEqual(["Minutes", "Part"]);
    expect(t.rows!.map((r) => r[1])).toEqual(["Welcome", "The lost glove", "Let's think together", "A quiet moment"]);
    expect(t.rows!.reduce((n, r) => n + Number(r[0]), 0)).toBe(20);
  });

  test("each part: what to say and how to deliver it, with its minutes", () => {
    const parts = secs(arrangeAssembly(RAW, INFO), "part");
    expect(parts.map((s) => s.title)).toEqual(["Welcome", "The lost glove", "Let's think together", "Reflection"]);
    expect(parts[1].instructions).toMatch(/^\d+ minutes$/);
    expect(parts[1].blocks.map((b) => b.title)).toEqual(["What to say", "Delivery"]);
    expect(parts[2].blocks.find((b) => b.title === "Questions to ask")!.items).toEqual(["When did someone help you?"]);
  });

  test("the reflection's heading follows the picker, never the model", () => {
    const heading = (reflection: string) => secs(arrangeAssembly(RAW, { ...INFO, reflection }), "part").at(-1)!.title;
    expect(heading("reflection")).toBe("Reflection");
    expect(heading("worship")).toBe("Collective worship");
    expect(heading("faith")).toBe("Prayer and reflection");
  });

  test("details, the key message, and the resources as a checklist", () => {
    const d = arrangeAssembly(RAW, { ...INFO, reflection: "faith", faith: "Catholic" });
    const rows = Object.fromEntries(sec(d, "details")!.blocks[0].rows!);
    expect(rows).toMatchObject({ Stage: "KS2", Length: "20 minutes", Closing: "Prayer and reflection (Catholic)", "Led by": "", Date: "" });
    expect(sec(d, "message")!.blocks[0].text).toBe("Kindness changes a day, yours and theirs.");
    const res = sec(d, "resources")!;
    expect(res.blocks.map((b) => [b.title, b.style])).toEqual([["Resources", "check"], ["Before the assembly", "check"]]);
  });

  test("mid-stream: details only; titled by the assembly", () => {
    expect((arrangeAssembly({}, INFO) as Arranged).sections.map((s) => s.role)).toEqual(["details"]);
    expect((arrangeAssembly(RAW, INFO) as Arranged).title).toBe("Small acts, big difference");
    expect(ASSEMBLY_SHEET_PARTS.map((p) => p.id)).toEqual(["details", "message", "order", "resources"]);
  });

  test("the profile: portrait", () => {
    expect(normalizeDraft(RAW, sheetContext("assembly", { assembly: INFO })).tool).toBe("assembly");
  });
});

test.describe("Make assembly slides", () => {
  const RAW = {
    title: "Small acts, big difference",
    message: "Kindness changes a day.",
    parts: [
      { part: "intro", title: "Welcome", minutes: 2, say: ["Good morning, everyone."], delivery: [] },
      { part: "story", title: "The lost glove", minutes: 8, say: ["Tell the story of the glove."], delivery: [] },
      { part: "reflection", title: "Quiet", minutes: 3, say: ["Close your eyes."], delivery: [] },
    ],
    questions: [], resources: [], preparation: [],
  };
  const doc = () => normalizeDraft(RAW, sheetContext("assembly", { assembly: { stage: "KS2", lengthMinutes: 15, reflection: "reflection" } }));

  test("offered once the script is saved, by the run's id", () => {
    expect(assemblyHandoffs(doc(), null)).toEqual([]);
    expect(assemblyHandoffs(doc(), "run-1")).toEqual([{ id: "assemblySlides", label: "Make assembly slides", href: "/tools/assembly-planner/slides?from=run-1" }]);
    const other = normalizeDraft({ summary: "x" }, sheetContext("policy", { policy: { policy: "Behaviour Policy" } }));
    expect(assemblyHandoffs(other, "run-1")).toEqual([]);
  });

  test("the deck: an assembly deck from the script, a slide a part plus the title, web pictures", () => {
    const p = assemblyDeckParams(doc(), "en-GB");
    expect(p).toMatchObject({ deckKind: "assembly", topic: "Small acts, big difference", year: "KS2", slideCount: 4, imageSource: "web", language: "en-GB" });
    expect(p.resourceText).toContain("Tell the story of the glove.");
    expect(p.resourceText).not.toContain("Led by");
  });

  test("the slide count stays 3 to 10 however many parts", () => {
    const many = normalizeDraft({ ...RAW, parts: Array.from({ length: 14 }, (_, i) => ({ part: "main", title: `Part ${i}`, minutes: 1, say: ["x"], delivery: [] })) }, sheetContext("assembly", { assembly: { stage: "KS2", lengthMinutes: 30 } }));
    expect(assemblyDeckParams(many, "en-GB").slideCount).toBe(10);
  });
});
