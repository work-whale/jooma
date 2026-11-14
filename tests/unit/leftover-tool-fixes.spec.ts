import { test, expect } from "@playwright/test";
import { ectReportRequest } from "@/app/lib/ect-report-prompt";
import { performanceManagementRequest } from "@/app/lib/performance-management-prompt";
import { sipRequest } from "@/app/lib/sip-prompt";
import { lessonObservationRequest } from "@/app/lib/lesson-observation-prompt";
import { meetingRequest } from "@/app/lib/meeting-planner-prompt";
import { carriesStaffName, ECT_PLACEHOLDER, nameParts, scrubStaffName, staffNamePrivacy, swapStaffName } from "@/app/lib/staff-privacy";

/*
 * Tool uplift batch 4, step 0a: fixes to tools not yet uplifted.
 * ECT name kept off the model, the ITTECF, no lesson grades, the renewed
 * Ofsted framework in the SIP narrative, and no invented names.
 */


test.describe("staff name privacy", () => {
  test("the whole name and each part are found, longest first, single letters skipped", () => {
    expect(nameParts("  Sarah   Johnson ")).toEqual(["Sarah Johnson", "Johnson", "Sarah"]);
    expect(nameParts("J Smith")).toEqual(["J Smith", "Smith"]);
    expect(nameParts("")).toEqual([]);
  });

  test("scrubs the full name, each part, possessives and any case, but not inside other words", () => {
    const out = scrubStaffName("Sarah Johnson planned well. SARAH's questioning improved; Mr Johnson agreed. Sarahs and Johnsonville stay.", "Sarah Johnson");
    expect(out).toBe("[ECT] planned well. [ECT]'s questioning improved; Mr [ECT] agreed. Sarahs and Johnsonville stay.");
  });

  test("swaps back: full name in headings and at first mention, surname after", () => {
    const md = "# ECT Progress Report: [ECT]\n\n[ECT] explains clearly. [ECT]'s routines are secure.\n\n## Summary\n\n[ECT] is making progress.";
    expect(swapStaffName(md, "Sarah Johnson")).toBe(
      "# ECT Progress Report: Sarah Johnson\n\nSarah Johnson explains clearly. Johnson's routines are secure.\n\n## Summary\n\nJohnson is making progress.",
    );
  });

  test("a single name is used throughout, and no name gives 'the ECT'", () => {
    expect(swapStaffName("[ECT] and [ECT]", "Priya")).toBe("Priya and Priya");
    expect(swapStaffName("[ECT] and [ECT]", "  ")).toBe("the ECT and the ECT");
  });

  test("scrub then swap keeps a report readable", () => {
    const p = staffNamePrivacy("Sarah Johnson")!;
    const scrubbed = p.scrub("Sarah Johnson leads well. Johnson plans carefully.");
    expect(scrubbed).not.toMatch(/Sarah|Johnson/);
    expect(p.swap(scrubbed)).toBe("Sarah Johnson leads well. Johnson plans carefully.");
    expect(staffNamePrivacy("")).toBeUndefined();
  });

  test("name keys are found at any depth", () => {
    expect(carriesStaffName({ ectName: "x" })).toBe(true);
    expect(carriesStaffName({ nested: [{ teacherName: "x" }] })).toBe(true);
    expect(carriesStaffName({ strengths: "Sarah" })).toBe(false);
  });
});

// Batch 5 made the ECT report a sheet (ectReportRequest); these guarantees
// from batch 4 still hold. The development plan is no longer optional: the
// induction guidance has every review state agreed targets.
test.describe("ECT report prompt", () => {
  const body = { curriculum: "2014 National Curriculum", subject: "Maths", strengths: "Clear modelling", areasForDevelopment: "Adaptive teaching" };
  const ectText = (b: Record<string, unknown>) => {
    const r = ectReportRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join("\n");
  };

  test("refuses a request carrying the ECT's name", () => {
    expect(ectReportRequest({ ...body, ectName: "Sarah Johnson" })).toEqual({ error: expect.stringMatching(/never sent/) });
  });

  test("refuses missing evidence", () => {
    expect("error" in ectReportRequest({ ...body, strengths: "  " })).toBe(true);
    expect("error" in ectReportRequest({ ...body, curriculum: "" })).toBe(true);
  });

  test("writes the placeholder, never a name, and names colleagues by role only", () => {
    const t = ectText(body);
    expect(t).toContain(`write "${ECT_PLACEHOLDER}" exactly`);
    expect(t).toMatch(/never name any other person/i);
    expect(t).not.toMatch(/colleague's\]/);
  });

  test("uses the ITTECF, not the old Early Career Framework", () => {
    const t = ectText(body);
    expect(t).toContain("Initial Teacher Training and Early Career Framework (ITTECF)");
    expect(t).not.toMatch(/\(ECF\)|Early Career Framework \(ECF/);
  });

  test("never invents evidence or makes the judgement", () => {
    const t = ectText(body);
    expect(t).toMatch(/Do not invent observations/);
    expect(t).toMatch(/The judgement is the induction tutor's/);
    expect(t).not.toMatch(/drawn from lesson observations, pupil work, assessment data/);
  });
});

// Batch 5 made appraisal objectives a sheet (performanceManagementRequest).
test.describe("performance management prompt", () => {
  const body = { curriculum: "2014 National Curriculum", staffMember: "Year 4 class teacher", responsibilities: "Maths lead", payScale: "M4", schoolType: "Primary" };
  const pmText = (b: Record<string, unknown>) => {
    const r = performanceManagementRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join(" ");
  };

  test("never asks for lesson observation grades", () => {
    const t = pmText(body);
    expect(t).not.toMatch(/observation grades?\b(?!:)/i);
    expect(t).toMatch(/Never lesson observation grades: lessons are not graded/);
  });

  test("speaks of appraisal and names both sets of standards", () => {
    const t = pmText(body);
    expect(t).toMatch(/appraisal/i);
    expect(t).toContain("Headteachers' Standards (2020)");
    expect(t).toContain("Teachers' Standards (2011)");
  });

  test("refuses missing fields", () => {
    expect("error" in performanceManagementRequest({ ...body, staffMember: " " })).toBe(true);
    expect("error" in performanceManagementRequest({ ...body, responsibilities: undefined })).toBe(true);
  });
});

// Batch 5 made the SIP one plan as a sheet (sipRequest): no table or
// narrative format any more. The batch 4 guarantees still hold.
test.describe("school improvement plan prompt", () => {
  const body = { areasToImprove: "Reading fluency", schoolType: "Primary", planTimeframe: 1 };
  const sipText = (b: Record<string, unknown>) => {
    const r = sipRequest(b);
    if ("error" in r) throw new Error(r.error);
    return r.messages.map((m) => m.content).join(" ");
  };

  test("no longer uses intent, implementation and impact", () => {
    expect(sipText({ ...body, outputFormat: "narrative" })).not.toMatch(/\bIntent\b|Implementation:|Impact:/);
  });

  test("leaves unknown facts as placeholders instead of inventing them", () => {
    const t = sipText(body);
    expect(t).not.toMatch(/infer appropriate context|construct appropriate context/);
    expect(t).toContain("[school to add]");
  });

  test("carries the renewed framework", () => {
    expect(sipText(body)).toMatch(/report card/i);
  });

  test("refuses no areas to improve", () => {
    expect("error" in sipRequest({ ...body, areasToImprove: "  " })).toBe(true);
  });
});

test.describe("prompts that used to invite names", () => {
  test("lesson observation names nobody and suggests colleagues by role", () => {
    // Batch 5 made the observation a sheet (lessonObservationRequest).
    const r = lessonObservationRequest({ curriculum: "2014 National Curriculum", strengths: "a", areasForDevelopment: "b", includeFollowUpSupport: true });
    if ("error" in r) throw new Error(r.error);
    const t = r.messages.map((m) => m.content).join(" ");
    expect(t).toMatch(/Never name any person/);
    expect(t).toMatch(/colleagues by role only/);
    expect(t).not.toMatch(/approaches, or colleagues where possible/);
  });

  // Batch 6 made the meeting a sheet with a blank action log: actions are
  // never assigned by the model at all (tool-uplift-batch6.spec.ts).
  test("meeting plans name roles, never invented names", () => {
    const r = meetingRequest({ purpose: "p", participants: "Head, TAs", duration: "60", includeActionItems: true });
    if ("error" in r) throw new Error(r.error);
    const t = r.messages.map((m) => m.content).join(" ");
    expect(t).not.toContain("[Name of responsible person]");
    expect(t).toMatch(/never invent names/);
    expect(t).toMatch(/Never assign actions to people/);
  });

  test("both still refuse missing required fields", () => {
    expect("error" in lessonObservationRequest({ curriculum: "x", strengths: "", areasForDevelopment: "b" })).toBe(true);
    expect("error" in meetingRequest({ purpose: "p", participants: "", duration: "60" })).toBe(true);
  });
});
