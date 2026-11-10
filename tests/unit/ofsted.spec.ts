import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { OFSTED_GRADED_AREAS, OFSTED_GRADES, ofstedFrameworkSummary } from "@/app/lib/ofsted";
import { inspectionPrepRequest } from "@/app/lib/inspection-prep-prompt";

/*
 * Ofsted's renewed framework (from November 2025) grades evaluation areas on a
 * report card. The old four judgements and the single overall grade are gone.
 * Several prompts used to name them; app/lib/ofsted.ts is now the one source.
 */

const DASHES = /[–—]/;

function userPrompt(body: Parameters<typeof inspectionPrepRequest>[0]): string {
  const r = inspectionPrepRequest(body);
  if ("error" in r) throw new Error(r.error);
  return r.messages.map((m) => m.content).join("\n");
}

test.describe("the framework description", () => {
  test("names the toolkit's graded areas in order, with early years and post-16 only where relevant", () => {
    expect(OFSTED_GRADED_AREAS.map((a) => a.name)).toEqual([
      "Inclusion",
      "Curriculum and teaching",
      "Achievement",
      "Attendance and behaviour",
      "Personal development and wellbeing",
      "Early years",
      "Post-16 provision",
      "Leadership and governance",
    ]);
    expect(OFSTED_GRADED_AREAS.filter((a) => a.whereRelevant).map((a) => a.name)).toEqual(["Early years", "Post-16 provision"]);
  });

  test("the five grades run lowest to highest, and safeguarding is met or not met", () => {
    expect(OFSTED_GRADES).toEqual(["Urgent improvement", "Needs attention", "Expected standard", "Strong standard", "Exceptional"]);
    const summary = ofstedFrameworkSummary();
    expect(summary).toContain("met or not met");
    expect(summary).toContain("no single overall effectiveness grade");
    expect(summary).not.toMatch(DASHES);
  });
});

test.describe("Inspection Prep", () => {
  test("an Ofsted guide is organised by the current areas, not the old judgements", () => {
    const p = userPrompt({ inspectionBody: "Ofsted" });
    for (const a of ["Safeguarding", ...OFSTED_GRADED_AREAS.map((x) => x.name)]) expect(p).toContain(`### ${a}`);
    for (const old of ["### Quality of Education", "### Behaviour and Attitudes", "### Leadership and Management", "### Personal Development\n"]) {
      expect(p).not.toContain(old);
    }
    expect(p).toContain("### Early years (where applicable)");
    expect(p).not.toMatch(/Big Listen|\bEIF\b/);
    for (const g of OFSTED_GRADES) expect(p).toContain(g);
  });

  test("Ofsted is recognised however the teacher types it", () => {
    expect(userPrompt({ inspectionBody: "an OFSTED section 5" })).toContain("### Curriculum and teaching");
  });

  test("another body gets the generic headings and no Ofsted framework text", () => {
    const p = userPrompt({ inspectionBody: "ISI" });
    expect(p).toContain("### Quality of Teaching and Learning");
    expect(p).not.toContain("renewed education inspection framework (from");
    expect(p).not.toContain("### Curriculum and teaching");
  });

  test("a missing or blank inspection body is refused before the model sees it", () => {
    expect(inspectionPrepRequest({})).toEqual({ error: "Missing required fields" });
    expect(inspectionPrepRequest({ inspectionBody: "   " })).toEqual({ error: "Missing required fields" });
  });

  test("the optional sections appear only when asked for, and the focus is carried through", () => {
    const bare = userPrompt({ inspectionBody: "Ofsted" });
    expect(bare).not.toContain("## Recommended Evidence");
    expect(bare).not.toContain("## Success Criteria");
    expect(bare).not.toContain("## Recent Policy Developments");

    const full = userPrompt({ inspectionBody: "Ofsted", inspectionFocus: "early reading", includeEvidence: true, includeSuccessCriteria: true, includePolicyChanges: true });
    expect(full).toContain("## Recommended Evidence");
    expect(full).toContain("## Success Criteria");
    expect(full).toContain("## Recent Policy Developments");
    expect(full).toContain("with a specific focus on **early reading**");
  });

  test("the text we write has no long dashes", () => {
    expect(userPrompt({ inspectionBody: "Ofsted", includeEvidence: true, includeSuccessCriteria: true, includePolicyChanges: true })).not.toMatch(DASHES);
    expect(userPrompt({ inspectionBody: "ISI" })).not.toMatch(DASHES);
  });
});

// A source scan, so the old framework cannot creep back into any prompt,
// form or help page. ofsted.ts itself names the old judgements to ban them.
test("no tool still names the pre-2025 Ofsted judgements", () => {
  const root = join(process.cwd(), "app");
  const allowed = new Set(["lib/ofsted.ts"]);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) {
        const rel = relative(root, full).replace(/\\/g, "/");
        if (allowed.has(rel)) continue;
        const src = readFileSync(full, "utf8");
        if (/Quality of Education|quality of education|Behaviour and Attitudes|behaviour and attitudes|Big Listen|\bOfsted EIF\b|Education Inspection Framework \(EIF\)/.test(src)) offenders.push(rel);
      }
    }
  };
  walk(root);
  expect(offenders).toEqual([]);
});
