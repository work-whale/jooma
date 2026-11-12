import { test, expect } from "@playwright/test";
import { actionRows, actionTable, cellText, detailsTable, type ActionColumn } from "@/app/lib/sheets/action-plan";
import { decodePrefill, prefillHref, validatePrefill } from "@/app/lib/toolPrefill";
import { arrangePupilPremium, challengeLines, challengeNumbers } from "@/app/lib/sheets/pupil-premium";
import { pupilPremiumRequest } from "@/app/lib/pupil-premium-prompt";
import { arrangeEyfsActionPlan } from "@/app/lib/sheets/eyfs-action-plan";
import { eyfsActionPlanRequest } from "@/app/lib/eyfs-action-plan-prompt";
import { arrangeRisk, hazardRow, riskBand, riskPoint, riskScore, staffRatio } from "@/app/lib/sheets/risk";
import { riskAssessmentRequest } from "@/app/lib/risk-assessment-prompt";
import { arrangeSensory } from "@/app/lib/sheets/sensory";
import { sensoryRequest } from "@/app/lib/sensory-prompt";
import { scrubRoster, swapRoster } from "@/app/lib/sheets/roster";
import { withPupilName, withPupilPlaceholder } from "@/app/lib/sheets/pupil";
import { arrangeNewsletter } from "@/app/lib/sheets/newsletter";
import { newsletterRequest } from "@/app/lib/newsletter-prompt";
import { isoFromLongDate, riskHandoffs } from "@/app/lib/lesson-handoffs";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Tool uplift batch 4: Pupil Premium, EYFS Action Plan, Risk Assessment,
 * Sensory Activities and Newsletter, and the shared pieces they stand on.
 */

// ── Step 0c: action-plan tables ─────────────────────────────────────────────

test.describe("action-plan tables", () => {
  const COLUMNS: ActionColumn[] = [
    { key: "activity", label: "Activity" },
    { key: "evidence", label: "Evidence" },
    { key: "cost", label: "Budgeted cost", blank: true },
    { key: "challenges", label: "Challenges addressed" },
  ];

  test("school-filled columns are always blank, whatever the model sent", () => {
    const rows = actionRows([{ activity: "Tutoring", evidence: "EEF: small group tuition", cost: "£12,000", challenges: [1, 2] }], COLUMNS);
    expect(rows).toEqual([["Tutoring", "EEF: small group tuition", "", "1; 2"]]);
  });

  test("a row with nothing the model fills is dropped, so a part-streamed row is no gap", () => {
    expect(actionRows([{ cost: "£5" }, {}, { activity: "Reading" }, "junk", null], COLUMNS)).toEqual([["Reading", "", "", ""]]);
  });

  test("no rows yet is no table", () => {
    expect(actionTable([], COLUMNS)).toBeNull();
    expect(actionTable(undefined, COLUMNS)).toBeNull();
    expect(actionTable([{ activity: "A" }], COLUMNS)).toEqual({ type: "table", headers: ["Activity", "Evidence", "Budgeted cost", "Challenges addressed"], rows: [["A", "", "", ""]] });
  });

  test("cells take strings, numbers and lists, and drop anything else", () => {
    expect(cellText("  a ")).toBe("a");
    expect(cellText(3)).toBe("3");
    expect(cellText(["a", "", 2, null])).toBe("a; 2");
    expect(cellText({ x: 1 })).toBe("");
    expect(cellText(Number.NaN)).toBe("");
  });

  test("details are one label and value to a row, a missing value left blank", () => {
    expect(detailsTable([["School", " Oakfield "], ["Lead", ""]])).toEqual({ type: "table", headers: [], rows: [["School", "Oakfield"], ["Lead", ""]] });
  });
});

// ── Step 0d: Letter Writer takes a trip prefill ─────────────────────────────

test.describe("trip letter prefill", () => {
  const fields = { recipient: "Parents and carers", content: "Year 4 trip to the Natural History Museum", letterType: "trip", group: "Year 4", destination: "the Natural History Museum, London", tripDate: "2027-03-04" };

  test("a trip prefill validates and survives the round trip through a link", () => {
    const prefill = validatePrefill({ slug: "letter-writer", fields });
    expect(prefill?.fields).toMatchObject(fields);
    const href = prefillHref(prefill!);
    expect(decodePrefill(new URL(href, "http://x").searchParams.get("prefill"))?.fields).toMatchObject(fields);
  });

  test("a letter type about one child is never set from a link", () => {
    const prefill = validatePrefill({ slug: "letter-writer", fields: { ...fields, letterType: "behaviour" } });
    expect(prefill?.fields.letterType).toBeUndefined();
  });

  test("the trip fields stay optional", () => {
    expect(validatePrefill({ slug: "letter-writer", fields: { recipient: "Parents", content: "Sports day" } })).not.toBeNull();
  });
});

// ── Step 1: Pupil Premium ───────────────────────────────────────────────────

test.describe("pupil premium statement", () => {
  const DRAFT = {
    intent: ["We aim high for every disadvantaged pupil."],
    challenges: [{ detail: "Reading fluency is low in KS2." }, { detail: "Oral language is weak on entry." }],
    outcomes: [{ outcome: "Improved fluency", successCriteria: "Fluency assessments show the gap closing." }],
    teaching: [{ activity: "Fluency CPD for all staff", evidence: "EEF: Improving literacy in KS2", challenges: [1, 7, 1] }],
    targeted: [{ activity: "Oral language intervention", evidence: "EEF Toolkit: Oral language interventions", challenges: [2] }],
    wider: [],
    cost: "£40,000",
  };

  test("the teacher's numbering and bullets are stripped, blank lines dropped, at most 8", () => {
    expect(challengeLines("1. Reading\n\n2) Attendance\n- Oracy\n• Wellbeing\n(5) Maths")).toEqual(["Reading", "Attendance", "Oracy", "Wellbeing", "Maths"]);
    expect(challengeLines(Array.from({ length: 12 }, (_, i) => `c${i}`).join("\n"))).toHaveLength(8);
  });

  test("challenge numbers that point at no challenge are dropped, repeats once, in order", () => {
    expect(challengeNumbers([3, 1, 7, 1, "2", 0, 1.5], 3)).toBe("1, 2, 3");
    expect(challengeNumbers("1", 3)).toBe("");
  });

  test("the template's order and headings, with costs blank and never the model's", () => {
    const d = arrangePupilPremium(DRAFT, { schoolName: "Oakfield", facts: { pupils: "412" }, challenges: 2 }) as { title: string; sections: { role: string; title: string; blocks: { type: string; text?: string; rows?: string[][] }[] }[] };
    expect(d.title).toBe("Pupil premium strategy statement: Oakfield");
    expect(d.sections.map((s) => s.role)).toEqual(["note", "overview", "funding", "intent", "challenges", "outcomes", "area-teaching", "area-targeted", "total", "review", "service", "further"]);
    expect(JSON.stringify(d)).not.toContain("40,000");
    const teaching = d.sections.find((s) => s.role === "area-teaching")!;
    expect(teaching.title).toBe("Teaching (for example, CPD, recruitment and retention)");
    expect(teaching.blocks[0].text).toBe("**Budgeted cost:** £ ________");
    expect(teaching.blocks[1].rows).toEqual([["Fluency CPD for all staff", "EEF: Improving literacy in KS2", "1"]]);
    // The school's facts on the page, blanks left blank.
    const overview = d.sections.find((s) => s.role === "overview")!.blocks[1].rows!;
    expect(overview[0]).toEqual(["Number of pupils in school", "412"]);
    expect(overview[1]).toEqual(["Proportion (%) of pupil premium eligible pupils", ""]);
  });

  test("an empty area is left out, and before any writing only the school's parts show", () => {
    const d = arrangePupilPremium(DRAFT) as { sections: { role: string }[] };
    expect(d.sections.some((s) => s.role === "area-wider")).toBe(false);
    const empty = arrangePupilPremium({}) as { title: string; sections: { role: string }[] };
    expect(empty.sections.map((s) => s.role)).toEqual(["note", "overview", "funding"]);
    expect(empty.title).toBe("Pupil premium strategy statement");
  });

  test("the request sends the challenges and phase only, with no bands", () => {
    const r = pupilPremiumRequest({ challenges: "1. Reading\n2. Oracy", educationPhase: "Secondary" });
    if ("error" in r) throw new Error(r.error);
    const all = r.messages.map((m) => m.content).join("\n");
    expect(all).toContain("1. Reading\n2. Oracy");
    expect(all).toContain("Secondary school");
    expect(all).toMatch(/Never give months of progress, effect sizes, costs/);
    expect(all).toMatch(/Never write a cost or a budget/);
    expect(all).not.toMatch(/WBS|WTS|EXS|GDS/);
    expect(r.response_format.json_schema.strict).toBe(true);
  });

  test("no challenges is refused before the model sees it", () => {
    expect(pupilPremiumRequest({ challenges: " \n - \n" })).toEqual({ error: "Missing required fields" });
    expect(pupilPremiumRequest({})).toEqual({ error: "Missing required fields" });
  });

  test("an old prefill carrying bands still opens the form", () => {
    const p = validatePrefill({ slug: "pupil-premium-planner", fields: { challenges: "Reading", differentiate: "yes", differentiationLevels: ["WTS"] } });
    expect(p?.fields.challenges).toBe("Reading");
    expect(p?.fields.differentiate).toBeUndefined();
  });
});

// ── Step 2: EYFS Action Plan ────────────────────────────────────────────────

test.describe("EYFS action plan", () => {
  const action = (n: number) => ({ action: `Action ${n}`, lead: "EYFS lead", resources: "Staff meeting time", monitoring: "Learning walks", rag: "Green", impact: "Invented" });
  const DRAFT = {
    title: "Communication and language: action plan",
    objective: "More children reach the ELGs for Speaking.",
    rationale: "Talk underpins everything.",
    successCriteria: ["Staff model new words daily"],
    phases: [1, 2, 3, 4, 5].map((n) => ({ title: `Step ${n}`, when: `Autumn ${n}`, actions: [action(n)] })),
    outcomes: ["Children use new vocabulary in play"],
  };

  test("four phases at most, each a table with RAG and evidence left blank for the school", () => {
    const d = arrangeEyfsActionPlan(DRAFT) as { title: string; sections: { role: string; title: string; blocks: { type: string; headers?: string[]; rows?: string[][] }[] }[] };
    const phases = d.sections.filter((s) => s.role === "phase");
    expect(phases).toHaveLength(4);
    expect(phases[0].title).toBe("Phase 1: Step 1 (Autumn 1)");
    expect(phases[0].blocks[0].headers).toEqual(["Action", "Lead", "Resources", "Monitoring", "RAG", "Evidence of impact"]);
    expect(phases[0].blocks[0].rows).toEqual([["Action 1", "EYFS lead", "Staff meeting time", "Learning walks", "", ""]]);
    expect(JSON.stringify(d)).not.toContain("Invented");
  });

  test("the review table is built in code, one row per phase, blank", () => {
    const d = arrangeEyfsActionPlan(DRAFT) as { sections: { role: string; blocks: { rows?: string[][] }[] }[] };
    const review = d.sections.find((s) => s.role === "review")!.blocks[0].rows!;
    expect(review).toEqual([1, 2, 3, 4].map((n) => [`End of phase ${n}`, "", "", ""]));
  });

  test("mid-stream: nothing yet is no sections, and a phase with no actions has no table", () => {
    expect((arrangeEyfsActionPlan({}) as { sections: unknown[]; title: string })).toMatchObject({ sections: [], title: "EYFS action plan" });
    const d = arrangeEyfsActionPlan({ phases: [{ title: "Audit", when: "", actions: [] }] }) as { sections: { role: string }[] };
    expect(d.sections.map((s) => s.role)).toEqual(["review"]);
  });

  test("the request names the 2025 framework, keeps leads to roles, and has no bands", () => {
    const r = eyfsActionPlanRequest({ curriculum: "Early Years Foundation Stage (EYFS)", objective: "Improve talk", timescale: "One term" });
    if ("error" in r) throw new Error(r.error);
    const all = r.messages.map((m) => m.content).join("\n");
    expect(all).toContain("September 2025");
    expect(all).not.toMatch(/\(2021\)/);
    expect(all).toMatch(/Never a person's name/);
    expect(all).toContain("Timescale: One term");
    expect(all).not.toMatch(/WBS|WTS|EXS|GDS/);
  });

  test("an unknown timescale falls back to a year; a missing objective is refused", () => {
    const r = eyfsActionPlanRequest({ curriculum: "EYFS", objective: "x", timescale: "Forever" });
    if ("error" in r) throw new Error(r.error);
    expect(r.messages[1].content).toContain("Timescale: One year");
    expect(eyfsActionPlanRequest({ curriculum: "EYFS", objective: "  " })).toEqual({ error: "Missing required fields" });
  });
});

// ── Step 3: Risk Assessment ─────────────────────────────────────────────────

test.describe("risk assessment", () => {
  test("every likelihood and severity pair scores and bands correctly", () => {
    for (let l = 1; l <= 5; l++) {
      for (let s = 1; s <= 5; s++) {
        const score = riskScore(l, s);
        expect(score).toBe(l * s);
        expect(riskBand(score)).toBe(score <= 6 ? "Low" : score <= 12 ? "Medium" : "High");
      }
    }
    expect([1, 5, 6, 8, 12, 15, 25].map((n) => riskBand(n))).toEqual(["Low", "Low", "Low", "Medium", "Medium", "High", "High"]);
    expect(riskBand(0)).toBeNull();
  });

  test("out-of-range and odd scores are clamped or dropped, never trusted", () => {
    expect(riskPoint(9)).toBe(5);
    expect(riskPoint(-2)).toBe(1);
    expect(riskPoint(2.6)).toBe(3);
    expect(riskPoint("4")).toBe(4);
    expect(riskPoint("high")).toBe(0);
    expect(riskScore(undefined, 3)).toBe(0);
  });

  test("a hazard row: scores computed in code, residual too, half-streamed hazards wait", () => {
    expect(hazardRow({ hazard: "Busy road", harm: "Struck by a vehicle", whoAtRisk: "Pupils", likelihood: 4, severity: 5, controls: ["Cross at lights", "Staff at front and back"], residualLikelihood: 1, residualSeverity: 5, furtherActions: [] })).toEqual([
      "Busy road", "Pupils: Struck by a vehicle", "20 High (4 × 5)", "Cross at lights. Staff at front and back.", "5 Low (1 × 5)", "",
    ]);
    expect(hazardRow({ harm: "x" })).toBeNull();
    expect(hazardRow({ hazard: "Slip", likelihood: 2 })![2]).toBe("");
  });

  test("off site: details, emergency box and an EVC line; on site: neither", () => {
    const draft = { summary: "A day at the museum.", hazards: [{ hazard: "Getting lost", likelihood: 2, severity: 3 }] };
    const off = arrangeRisk(draft, { activity: "Museum trip", offsite: true, place: "Natural History Museum", pupils: "30", staff: "4", leader: "Ms Patel", date: "2027-03-04" }) as { title: string; sections: { role: string; blocks: { rows?: string[][] }[] }[] };
    expect(off.title).toBe("Risk assessment: Museum trip");
    expect(off.sections.map((s) => s.role)).toEqual(["details", "summary", "hazards", "key", "emergency", "signoff"]);
    const details = new Map(off.sections[0].blocks[0].rows!.map((r) => [r[0], r[1]]));
    expect(details.get("Destination")).toBe("Natural History Museum");
    expect(details.get("Staff to pupil ratio")).toBe("1:8");
    expect(details.get("Date")).toBe("4 March 2027");
    expect(details.get("Trip leader")).toBe("Ms Patel");
    expect(off.sections.find((s) => s.role === "signoff")!.blocks[0].rows!.map((r) => r[0])).toEqual(["Trip leader", "Educational Visits Coordinator (EVC)", "Headteacher"]);

    const on = arrangeRisk(draft, { activity: "Science practical", offsite: false, place: "Lab 2" }) as { sections: { role: string; blocks: { rows?: string[][] }[] }[] };
    expect(on.sections.some((s) => s.role === "emergency")).toBe(false);
    expect(new Map(on.sections[0].blocks[0].rows!.map((r) => [r[0], r[1]])).get("Location")).toBe("Lab 2");
    expect(on.sections.find((s) => s.role === "signoff")!.blocks[0].rows!.map((r) => r[0])).toEqual(["Activity leader", "Headteacher"]);
  });

  test("the ratio needs both numbers", () => {
    expect(staffRatio("4", "30")).toBe("1:8");
    expect(staffRatio("", "30")).toBe("");
    expect(staffRatio("0", "30")).toBe("");
  });

  test("the request never carries the leader's name, and asks for numbers, not sums", () => {
    expect(riskAssessmentRequest({ curriculum: "NC", yearGroup: "Year 4", activity: "Trip", leader: "Ms Patel" })).toEqual({ error: expect.stringMatching(/never sent/) });
    expect(riskAssessmentRequest({ curriculum: "NC", yearGroup: "Year 4", activity: "Trip", teacherName: "x" })).toEqual({ error: expect.stringMatching(/never sent/) });
    const r = riskAssessmentRequest({ curriculum: "NC", yearGroup: "Year 4", activity: "Museum trip", offsite: true, transport: "Coach" });
    if ("error" in r) throw new Error(r.error);
    const all = r.messages.map((m) => m.content).join("\n");
    expect(all).toContain("off site, a trip or visit");
    expect(all).toMatch(/Do not calculate the scores or bands/);
    expect(all).toContain("OEAP National Guidance");
    expect(riskAssessmentRequest({ curriculum: "NC", yearGroup: "", activity: "Trip" })).toEqual({ error: "Missing required fields" });
  });

  test("the trip letter handoff carries the trip, never the leader, and only off site", () => {
    const doc = (offsite: boolean) => normalizeDraft(
      { hazards: [{ hazard: "Getting lost", likelihood: 2, severity: 3 }] },
      sheetContext("riskAssessment", { risk: { activity: "Museum trip", yearGroup: "Year 4", offsite, place: "Natural History Museum", date: "2027-03-04", leader: "Ms Patel" } }),
    );
    const [h] = riskHandoffs(doc(true));
    expect(h.label).toBe("Write the trip letter");
    const fields = decodePrefill(new URL(h.href, "http://x").searchParams.get("prefill"))!.fields;
    expect(fields).toMatchObject({ letterType: "trip", group: "Year 4", destination: "Natural History Museum", tripDate: "2027-03-04", content: "Museum trip" });
    expect(JSON.stringify(fields)).not.toContain("Patel");
    expect(riskHandoffs(doc(false))).toEqual([]);
  });

  test("long dates read back to ISO, anything else to nothing", () => {
    expect(isoFromLongDate("4 March 2027")).toBe("2027-03-04");
    expect(isoFromLongDate("Next Tuesday")).toBe("");
  });
});

// ── Step 4: Sensory Activities ──────────────────────────────────────────────

test.describe("sensory activities", () => {
  const act = (n: number, senses: string[]) => ({
    title: `Activity ${n}`, objective: "Pupils will be able to sort materials.", senses, focus: "Sorting by feel.", resources: ["Feely bag"], steps: ["Feel", "Sort"], vocabulary: ["rough"],
    sensitive: ["Offer gloves"], seeking: ["Add heavier objects"], sendNote: `Note ${n}`, crossCurricular: ["Maths: sorting"], support: "ignored", challenge: "ignored",
  });

  test("each activity has its objective, senses as tags, the shared blocks and a sensitive or seeking box", () => {
    const d = arrangeSensory({ title: "Materials", activities: [act(1, ["touch", "Sight", "Sight", "Smelly"])] }) as { sections: { role: string; title: string; blocks: { type: string; text?: string; left?: { title: string } }[] }[] };
    const a = d.sections.find((s) => s.role === "activity")!;
    expect(a.title).toBe("1. Activity 1");
    expect(a.blocks[0].text).toBe("**Learning objective:** Pupils will be able to sort materials.");
    expect(a.blocks[1].text).toBe("**Senses:** Sight · Touch");
    expect(a.blocks.map((b) => b.type)).toEqual(["text", "text", "text", "list", "list", "wordbank", "twocol"]);
    expect(a.blocks[6].left!.title).toBe("For pupils who are sensory-sensitive");
    expect(JSON.stringify(a)).not.toContain("ignored");
  });

  test("the allergy reminder opens the sheet only when taste or smell is used", () => {
    const withTaste = arrangeSensory({ activities: [act(1, ["Touch"]), act(2, ["Taste"])] }) as { sections: { role: string }[] };
    expect(withTaste.sections[0].role).toBe("safety");
    const without = arrangeSensory({ activities: [act(1, ["Touch", "Hearing"])] }) as { sections: { role: string }[] };
    expect(without.sections.some((s) => s.role === "safety")).toBe(false);
  });

  test("SEND notes and links are gathered at the end, numbered to their activity; at most five", () => {
    const d = arrangeSensory({ activities: [1, 2, 3, 4, 5, 6].map((n) => act(n, ["Touch"])) }) as { sections: { role: string; blocks: { items?: string[] }[] }[] };
    expect(d.sections.filter((s) => s.role === "activity")).toHaveLength(5);
    expect(d.sections.find((s) => s.role === "send")!.blocks[0].items![0]).toBe("1. Activity 1: Note 1");
    expect(d.sections.find((s) => s.role === "links")!.blocks[0].items![4]).toBe("5. Activity 5: Maths: sorting");
  });

  test("the prompt drops the Code of Practice claim and asks for five", () => {
    const r = sensoryRequest({ curriculum: "NC", yearGroup: "Year 2", subject: "Science", topic: "Materials" });
    if ("error" in r) throw new Error(r.error);
    const all = r.messages.map((m) => m.content).join("\n");
    expect(all).not.toMatch(/endorsed/i);
    expect(all).toContain("exactly 5");
    expect(sensoryRequest({ curriculum: "NC", yearGroup: "Year 2", subject: "", topic: "x" })).toEqual({ error: "Missing required fields" });
  });
});

// ── Step 5: Newsletter ──────────────────────────────────────────────────────

test.describe("newsletter names", () => {
  const roster = ["Amira", "Leo Grant"];

  test("each pupil becomes their numbered placeholder: possessives, any case, whole names first", () => {
    expect(scrubRoster("Well done Amira! AMIRA's kindness and Leo Grant's maths. Leo again.", roster)).toBe(
      "Well done [PUPIL 1]! [PUPIL 1]'s kindness and [PUPIL 2]'s maths. [PUPIL 2] again.",
    );
  });

  test("a name inside another word, or a one-letter part, is left alone", () => {
    expect(scrubRoster("Leopold and Amiras visited", roster)).toBe("Leopold and Amiras visited");
    expect(scrubRoster("Plan A", ["A Smith"])).toBe("Plan A");
  });

  test("a name shared by two pupils goes to the first; an empty table changes nothing", () => {
    expect(scrubRoster("Sam won", ["Sam", "Sam"])).toBe("[PUPIL 1] won");
    expect(scrubRoster("Sam won", [])).toBe("Sam won");
    expect(scrubRoster("Sam won", ["  "])).toBe("Sam won");
  });

  test("the names go back as typed; an invented number reads 'a pupil'", () => {
    expect(swapRoster("[PUPIL 1] and [PUPIL 2] and [PUPIL 9]", roster)).toBe("Amira and Leo Grant and a pupil");
  });

  test("the saved document keeps placeholders, the page shows names, and an edit stores placeholders again", () => {
    const doc = normalizeDraft(
      { sections: [{ heading: "Sport", paragraphs: ["[PUPIL 2] scored twice."] }] },
      sheetContext("newsletter", { newsletter: { celebrations: [{ name: "Amira", className: "3K", reason: "Kindness" }, { name: "Leo Grant", className: "5B", reason: "Maths" }] } }),
    );
    expect(doc.roster).toEqual(["Amira", "Leo Grant"]);
    const shown = withPupilName(doc);
    expect(JSON.stringify(shown.sections)).toContain("Leo Grant scored twice.");
    expect(shown.roster).toEqual(["Amira", "Leo Grant"]);
    const edited = withPupilPlaceholder(shown);
    expect(JSON.stringify(edited.sections)).not.toMatch(/Amira|Leo/);
  });
});

test.describe("newsletter", () => {
  const info = {
    title: "Autumn Term Newsletter",
    schoolName: "Oakfield",
    date: "2026-12-12",
    celebrations: [{ name: "Amira", className: "Year 3", reason: "Amira was kind to a new classmate" }, { name: "", className: "x", reason: "no name" }],
    diary: [{ date: "2026-12-16", event: "Year 2 nativity, 2pm" }, { date: "", event: "" }],
  };

  test("celebrations and dates are built in code, names as placeholders, empty rows dropped", () => {
    const d = arrangeNewsletter({ intro: ["Welcome."], sections: [{ heading: "Harvest", paragraphs: ["Thank you."] }], celebrationsIntro: "Our stars:", signOff: "Best wishes" }, info) as { title: string; sections: { role: string; instructions: string; blocks: { rows?: string[][] }[] }[] };
    expect(d.title).toBe("Autumn Term Newsletter");
    expect(d.sections.map((s) => s.role)).toEqual(["intro", "section", "celebrations", "diary", "signoff"]);
    expect(d.sections[2].blocks[0].rows).toEqual([["[PUPIL 1]", "Year 3", "[PUPIL 1] was kind to a new classmate"]]);
    expect(d.sections[2].instructions).toBe("Our stars:");
    expect(d.sections[3].blocks[0].rows).toEqual([["Wednesday 16 December", "Year 2 nativity, 2pm"]]);
  });

  test("the tables wait until the writing arrives", () => {
    const d = arrangeNewsletter({}, info) as { sections: unknown[] };
    expect(d.sections).toEqual([]);
  });

  test("the request refuses names, a bad sections list, or no tone", () => {
    expect(newsletterRequest({ tone: "Warm and friendly", sections: ["a"], celebrations: [] })).toEqual({ error: expect.stringMatching(/never sent/) });
    expect(newsletterRequest({ tone: "Warm and friendly", sections: ["a"], pupilName: "x" })).toEqual({ error: expect.stringMatching(/never sent/) });
    expect(newsletterRequest({ tone: "Warm and friendly", sections: "a" })).toEqual({ error: "Missing required fields" });
    expect(newsletterRequest({ tone: "Warm and friendly", sections: [1] })).toEqual({ error: "Missing required fields" });
    expect(newsletterRequest({ tone: "Warm and friendly" })).toEqual({ error: "Missing required fields" });
    expect(newsletterRequest({ tone: "Shouty", sections: ["a"] })).toEqual({ error: "Missing required fields" });
  });

  test("the prompt keeps placeholders and never invents names or dates", () => {
    const r = newsletterRequest({ tone: "Warm and friendly", sections: ["Stars: [PUPIL 1] was kind"], celebrated: 1 });
    if ("error" in r) throw new Error(r.error);
    const all = r.messages.map((m) => m.content).join("\n");
    expect(all).toContain("Stars: [PUPIL 1] was kind");
    expect(all).toMatch(/never invent, guess or add a name/);
    expect(all).toMatch(/never invent a fact, date, time or event/);
  });
});
