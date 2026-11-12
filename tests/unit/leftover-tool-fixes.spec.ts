import { test, expect } from "@playwright/test";
import { buildEctReportPrompt } from "@/app/lib/ect-report-prompt";
import { buildPerformanceManagementPrompt } from "@/app/lib/performance-management-prompt";
import { buildSipPrompt } from "@/app/lib/sip-prompt";
import { buildLessonObservationPrompt } from "@/app/lib/lesson-observation-prompt";
import { buildMeetingPlannerPrompt } from "@/app/lib/meeting-planner-prompt";
import { carriesStaffName, ECT_PLACEHOLDER, nameParts, scrubStaffName, staffNamePrivacy, swapStaffName } from "@/app/lib/staff-privacy";

/*
 * Tool uplift batch 4, step 0a: fixes to tools not yet uplifted.
 * ECT name kept off the model, the ITTECF, no lesson grades, the renewed
 * Ofsted framework in the SIP narrative, and no invented names.
 */

function text(r: { system: string; user: string } | { error: string }): string {
  if ("error" in r) throw new Error(r.error);
  return `${r.system}\n${r.user}`;
}

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

test.describe("ECT report prompt", () => {
  const body = { curriculum: "2014 National Curriculum", subject: "Maths", strengths: "Clear modelling", areasForDevelopment: "Adaptive teaching", includeProfessionalDevelopmentPlan: true };

  test("refuses a request carrying the ECT's name", () => {
    expect(buildEctReportPrompt({ ...body, ectName: "Sarah Johnson" })).toEqual({ error: expect.stringMatching(/never sent/) });
  });

  test("refuses missing evidence", () => {
    expect("error" in buildEctReportPrompt({ ...body, strengths: "  " })).toBe(true);
    expect("error" in buildEctReportPrompt({ ...body, curriculum: "" })).toBe(true);
  });

  test("writes the placeholder, never a name, and names colleagues by role only", () => {
    const t = text(buildEctReportPrompt(body));
    expect(t).toContain(`# ECT Progress Report: ${ECT_PLACEHOLDER}`);
    expect(t).toMatch(/never name any other person/i);
    expect(t).not.toMatch(/colleague's\]/);
  });

  test("uses the ITTECF, not the old Early Career Framework", () => {
    const t = text(buildEctReportPrompt(body));
    expect(t).toContain("Initial Teacher Training and Early Career Framework (ITTECF");
    expect(t).not.toMatch(/\(ECF\)|Early Career Framework \(ECF/);
  });

  test("never invents evidence or makes the formal judgement", () => {
    const t = text(buildEctReportPrompt(body));
    expect(t).toMatch(/Do not invent observations/);
    expect(t).toMatch(/Do not make the formal induction judgement yourself/);
    expect(t).not.toMatch(/drawn from lesson observations, pupil work, assessment data/);
  });

  test("the development plan is only there when asked for", () => {
    expect(text(buildEctReportPrompt(body))).toContain("## Professional Development Plan");
    expect(text(buildEctReportPrompt({ ...body, includeProfessionalDevelopmentPlan: false }))).not.toContain("## Professional Development Plan");
  });
});

test.describe("performance management prompt", () => {
  const body = { curriculum: "2014 National Curriculum", staffMember: "Year 4 class teacher", responsibilities: "Maths lead", payScale: "M4", schoolType: "Primary" };

  test("never asks for lesson observation grades", () => {
    const t = text(buildPerformanceManagementPrompt(body));
    expect(t).not.toMatch(/observation grades?\b(?!:)/i);
    expect(t).toMatch(/Never lesson observation grades: lessons are not graded/);
  });

  test("speaks of appraisal and names both sets of standards", () => {
    const t = text(buildPerformanceManagementPrompt(body));
    expect(t).toMatch(/appraisal/i);
    expect(t).toContain("Headteachers' Standards (2020)");
    expect(t).toContain("Teachers' Standards (2011)");
  });

  test("refuses missing fields", () => {
    expect("error" in buildPerformanceManagementPrompt({ ...body, staffMember: " " })).toBe(true);
    expect("error" in buildPerformanceManagementPrompt({ ...body, responsibilities: undefined })).toBe(true);
  });
});

test.describe("school improvement plan prompt", () => {
  const body = { areasToImprove: "Reading fluency", schoolType: "Primary", planTimeframe: 1 };

  test("narrative mode no longer uses intent, implementation and impact", () => {
    const t = text(buildSipPrompt({ ...body, outputFormat: "narrative" }));
    expect(t).not.toMatch(/\bIntent\b|\*\*Implementation:\*\*|\*\*Impact:\*\*/);
    expect(t).toContain("**Evaluation areas:**");
    expect(t).toContain("**Measures of success:**");
  });

  test("both modes leave unknown facts as placeholders instead of inventing them", () => {
    for (const outputFormat of ["table", "narrative"]) {
      const t = text(buildSipPrompt({ ...body, outputFormat }));
      expect(t).not.toMatch(/infer appropriate context|construct appropriate context/);
      expect(t).toContain("[school to add:");
    }
  });

  test("the system prompt carries the renewed framework", () => {
    expect(text(buildSipPrompt(body))).toMatch(/report card/i);
  });

  test("refuses no areas to improve", () => {
    expect("error" in buildSipPrompt({ ...body, areasToImprove: "  " })).toBe(true);
  });
});

test.describe("prompts that used to invite names", () => {
  test("lesson observation names nobody and suggests colleagues by role", () => {
    const t = text(buildLessonObservationPrompt({ curriculum: "2014 National Curriculum", strengths: "a", areasForDevelopment: "b", includeFollowUpSupport: true }));
    expect(t).toMatch(/Never name the teacher or any other person/);
    expect(t).toMatch(/colleagues by role only/);
    expect(t).not.toMatch(/approaches, or colleagues where possible/);
  });

  test("meeting actions go to roles, never invented names", () => {
    const t = text(buildMeetingPlannerPrompt({ purpose: "p", participants: "Head, TAs", duration: "60", includeActionItems: true }));
    expect(t).not.toContain("[Name of responsible person]");
    expect(t).toContain("[Role responsible");
    expect(t).toMatch(/never invent names/);
  });

  test("both still refuse missing required fields", () => {
    expect("error" in buildLessonObservationPrompt({ curriculum: "x", strengths: "", areasForDevelopment: "b" })).toBe(true);
    expect("error" in buildMeetingPlannerPrompt({ purpose: "p", participants: "", duration: "60" })).toBe(true);
  });
});
