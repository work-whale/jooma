import { test, expect } from "@playwright/test";
import {
  arrangeLetter,
  factsForModel,
  formatLetterDate,
  formatLetterTime,
  letterMetaFor,
  replySlipFor,
  salutationFor,
  signOffFor,
  tripDetails,
  type LetterInfo,
} from "@/app/lib/sheets/letter";
import { letterRequest, letterResponseFormat } from "@/app/lib/letter-prompt";
import { finishSheet } from "@/app/lib/sheets/context";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { sheetOutline, sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { payloadStrings, PLACEHOLDER } from "@/app/lib/reports/privacy";

const TRIP: LetterInfo = {
  type: "trip",
  date: "2027-02-26",
  recipient: "Parents and carers",
  tone: "Formal",
  senderName: "Mrs J Patel",
  senderRole: "Year 5 teacher",
  school: "Oakfield Primary",
  facts: {
    group: "Year 5",
    destination: "the Natural History Museum",
    tripDate: "2027-03-12",
    leave: "08:45",
    back: "15:30",
    cost: "£12",
    payment: "ParentPay",
    kit: "",
    lunch: "A packed lunch",
    consentBy: "2027-03-05",
  },
};

const ATTENDANCE: LetterInfo = {
  type: "attendance",
  date: "2026-11-10",
  recipient: "",
  tone: "Semi-formal",
  pupil: "Amira",
  facts: { period: "this autumn term", attendance: "88%", concern: "Amira has missed eight days, mostly Mondays. Amira's Monday absences began in October." },
};

test.describe("salutation and sign-off", () => {
  test("Parents and Carers is capitalised however it was typed", () => {
    for (const r of ["parents and carers", "Parents and carers", "PARENTS & CARERS", "parents/carers", "Parent and carer"]) {
      expect(salutationFor({ recipient: r, type: "general" }), r).toBe("Dear Parents and Carers,");
    }
    expect(salutationFor({ recipient: "parents and carers of Year 6", type: "trip" })).toBe("Dear Parents and Carers of Year 6,");
  });

  test("other recipients keep their wording with a capital letter", () => {
    expect(salutationFor({ recipient: "governors", type: "general" })).toBe("Dear governors,".replace("g", "G"));
    expect(salutationFor({ recipient: "Year 10 pupils.", type: "general" })).toBe("Dear Year 10 pupils,");
  });

  test("nobody named is Sir or Madam; one child's parent is Parent/Carer; a name wins", () => {
    expect(salutationFor({ recipient: "", type: "general" })).toBe("Dear Sir or Madam,");
    expect(salutationFor({ recipient: "sir/madam", type: "general" })).toBe("Dear Sir or Madam,");
    expect(salutationFor({ recipient: "", type: "attendance" })).toBe("Dear Parent/Carer,");
    expect(salutationFor({ recipient: "Parents and carers", type: "behaviour" })).toBe("Dear Parent/Carer,");
    expect(salutationFor({ recipient: "", recipientName: " Mrs Khan ", type: "behaviour" })).toBe("Dear Mrs Khan,");
    expect(salutationFor({ recipient: "Parents and carers", recipientName: "Mr Jones", type: "general" })).toBe("Dear Mr Jones,");
  });

  test("the sign-off follows the salutation and tone", () => {
    expect(signOffFor("Dear Parents and Carers,", "Formal")).toBe("Yours sincerely,");
    expect(signOffFor("Dear Mrs Khan,", "Semi-formal")).toBe("Yours sincerely,");
    expect(signOffFor("Dear Sir or Madam,", "Formal")).toBe("Yours faithfully,");
    expect(signOffFor("Dear Sir or Madam,", "Informal")).toBe("Kind regards,");
    expect(signOffFor("Dear Parents and Carers,", "Informal")).toBe("Kind regards,");
  });
});

test.describe("dates and times, the UK way", () => {
  test("a calendar date never moves a day", () => {
    expect(formatLetterDate("2027-03-12")).toBe("12 March 2027");
    expect(formatLetterDate("2027-03-12", true)).toBe("Friday 12 March 2027");
    expect(formatLetterDate("2028-02-29", true)).toBe("Tuesday 29 February 2028");
    expect(formatLetterDate("2026-12-31", true)).toBe("Thursday 31 December 2026");
  });

  test("anything that is not a date comes back as typed", () => {
    expect(formatLetterDate("next Friday")).toBe("next Friday");
    expect(formatLetterDate("2027-13-01")).toBe("2027-13-01");
    expect(formatLetterDate(" ")).toBe("");
  });

  test("times", () => {
    expect(formatLetterTime("08:45")).toBe("8.45am");
    expect(formatLetterTime("15:30")).toBe("3.30pm");
    expect(formatLetterTime("12:00")).toBe("12pm");
    expect(formatLetterTime("00:15")).toBe("12.15am");
    expect(formatLetterTime("after lunch")).toBe("after lunch");
    expect(formatLetterTime("25:00")).toBe("25:00");
  });
});

test.describe("built in code: details and slip", () => {
  test("trip details in order, formatted, empty ones left out", () => {
    const rows = tripDetails(TRIP.facts);
    expect(rows.map((r) => r[0])).toEqual(["Where", "Date of the trip", "Leaving school", "Back at school", "Cost", "How to pay", "Lunch", "Reply by"]);
    expect(rows[1][1]).toBe("Friday 12 March 2027");
    expect(rows[2][1]).toBe("8.45am");
    expect(tripDetails({})).toEqual([]);
  });

  test("only a trip has a consent slip, and it says only what was given", () => {
    const slip = replySlipFor("trip", TRIP.facts)!;
    expect(slip.statement).toBe("I give permission for my child to go on the trip to the Natural History Museum on Friday 12 March 2027. I understand the cost is £12.");
    expect(slip.returnBy).toBe("Friday 5 March 2027");
    expect(slip.fields).toContain("Signature");
    const bare = replySlipFor("trip", {})!;
    expect(bare.statement).toBe("I give permission for my child to go on the trip.");
    expect(bare.returnBy).toBe("");
    expect(bare.title).toBe("Consent slip");
    for (const t of ["attendance", "behaviour", "general"] as const) expect(replySlipFor(t, TRIP.facts)).toBeNull();
  });

  test("letter meta: the child is kept only on a letter about one child", () => {
    expect(letterMetaFor(TRIP)).toMatchObject({ salutation: "Dear Parents and Carers,", signOff: "Yours sincerely,", pupil: "", school: "Oakfield Primary" });
    expect(letterMetaFor(ATTENDANCE)).toMatchObject({ salutation: "Dear Parent/Carer,", pupil: "Amira", slip: null });
    expect(letterMetaFor({ ...TRIP, pupil: "Amira" }).pupil).toBe("");
  });
});

test.describe("what the model is sent", () => {
  test("the child's name is out of the facts, possessive and all", () => {
    const facts = factsForModel("attendance", ATTENDANCE.facts, "Amira");
    expect(facts.find((f) => f.label === "The concern")!.value).toBe(`${PLACEHOLDER} has missed eight days, mostly Mondays. ${PLACEHOLDER}'s Monday absences began in October.`);
    expect(payloadStrings(facts).join(" ")).not.toMatch(/amira/i);
  });

  test("empty facts are dropped and dates are written out", () => {
    const facts = factsForModel("trip", TRIP.facts);
    expect(facts.map((f) => f.label)).not.toContain("What to bring");
    expect(facts.find((f) => f.label === "Date of the trip")!.value).toBe("Friday 12 March 2027");
  });

  test("the request refuses names, a missing type, no facts and no recipient", () => {
    const facts = factsForModel("trip", TRIP.facts);
    expect(letterRequest({ type: "trip", recipient: "Parents", facts })).not.toHaveProperty("error");
    expect(letterRequest({ type: "trip", recipient: "Parents", facts, pupilName: "Amira" } as never)).toHaveProperty("error");
    expect(letterRequest({ type: "trip", recipient: "Parents", facts: [{ label: "x", value: "y", name: "Amira" }] as never })).toHaveProperty("error");
    expect(letterRequest({ type: "poem", recipient: "Parents", facts })).toHaveProperty("error");
    expect(letterRequest({ type: "trip", recipient: "Parents", facts: [{ label: "Where", value: "  " }] })).toHaveProperty("error");
    expect(letterRequest({ type: "general", recipient: " ", facts: [{ label: "Notes", value: "x" }] })).toHaveProperty("error");
    // A letter about one child needs no recipient: it is to that child's parent.
    expect(letterRequest({ type: "attendance", facts: factsForModel("attendance", ATTENDANCE.facts, "Amira") })).not.toHaveProperty("error");
  });

  test("the prompt: no invention, no salutation or sign-off, the placeholder only for one child, no long dashes", () => {
    const trip = letterRequest({ type: "trip", recipient: "Parents and carers", facts: factsForModel("trip", TRIP.facts) });
    const one = letterRequest({ type: "behaviour", facts: [{ label: "What happened", value: `${PLACEHOLDER} pushed in the lunch queue.` }] });
    if ("error" in trip || "error" in one) throw new Error("refused");
    const t = trip.messages[1].content;
    const o = one.messages[1].content;
    expect(t).toContain("Never invent a date, a time, a cost, a name");
    expect(t).toContain("Do not write a date, an address, a salutation");
    expect(t).not.toContain("Refer to the child only as");
    // The table comes after paragraph 1, so paragraph 1 never points at it.
    expect(t).toContain('Paragraph 1 must not mention the table or any details "above" or "below"');
    expect(o).toContain(`Refer to the child only as ${PLACEHOLDER}`);
    expect(o).toContain(`To: the parent or carer of ${PLACEHOLDER}`);
    expect(o).toContain("never mention a sanction or exclusion that is not in the facts");
    for (const m of [...trip.messages, ...one.messages]) expect(m.content).not.toMatch(/[–—]/);
  });

  test("the schema is strict: a subject and 2 to 6 paragraphs", () => {
    const f = letterResponseFormat();
    expect(f.json_schema.strict).toBe(true);
    const props = (f.json_schema.schema as { properties: { paragraphs: { minItems: number; maxItems: number } } }).properties;
    expect(props.paragraphs.minItems).toBe(2);
    expect(props.paragraphs.maxItems).toBe(6);
  });
});

test.describe("the letter on the page", () => {
  const streamed = JSON.stringify({ subject: "Year 5 trip to the Natural History Museum", paragraphs: ["We are delighted to tell you about a trip.", "Please complete the slip below.", "  "] });

  test("arranged: the subject is the Re line, the details table follows paragraph 1", () => {
    const a = arrangeLetter(JSON.parse(streamed), TRIP) as { title: string; sections: { title: string; blocks: { type: string }[] }[] };
    expect(a.title).toBe("Year 5 trip to the Natural History Museum");
    expect(a.sections).toHaveLength(1);
    expect(a.sections[0].title).toBe("");
    expect(a.sections[0].blocks.map((b) => b.type)).toEqual(["text", "table", "text"]);
    expect((arrangeLetter(JSON.parse(streamed), { ...TRIP, type: "general" }) as typeof a).sections[0].blocks.map((b) => b.type)).toEqual(["text", "text"]);
  });

  test("the child's name goes back in, and never 'Amira' when no name was given", () => {
    const raw = { subject: `${PLACEHOLDER}'s attendance`, paragraphs: [`${PLACEHOLDER} has missed eight days.`, "We would like to help."] };
    const a = arrangeLetter(raw, ATTENDANCE) as { title: string; sections: { blocks: { text: string }[] }[] };
    expect(a.title).toBe("Amira's attendance");
    expect(a.sections[0].blocks[0].text).toBe("Amira has missed eight days.");
    const b = arrangeLetter(raw, { ...ATTENDANCE, pupil: "" }) as typeof a;
    expect(b.sections[0].blocks[0].text).toBe("your child has missed eight days.");
  });

  test("a partial or junk stream is safe", () => {
    expect(arrangeLetter(null, TRIP)).toEqual({ title: "", sections: [] });
    expect(arrangeLetter({ subject: 3, paragraphs: "x" }, TRIP)).toEqual({ title: "", sections: [] });
    // While the stream is still arriving, a trip's table waits for a paragraph.
    expect((arrangeLetter({ subject: "Trip" }, TRIP) as { sections: unknown[] }).sections).toHaveLength(0);
    const one = arrangeLetter({ subject: "Trip", paragraphs: ["First."] }, TRIP) as { sections: { blocks: { type: string }[] }[] };
    expect(one.sections[0].blocks.map((b) => b.type)).toEqual(["text", "table"]);
  });

  test("the stored sheet: letter meta, a plain design, no answers page, no H1 in the text", () => {
    const doc = parseSheet(finishSheet("letter", streamed, { letter: TRIP }))!;
    expect(doc.tool).toBe("letter");
    expect(doc.letter).toMatchObject({ salutation: "Dear Parents and Carers,", signOff: "Yours sincerely,", senderName: "Mrs J Patel" });
    expect(doc.design).toMatchObject({ themeId: "classic", answers: false, nameDate: false });
    const md = sheetToMarkdown(doc);
    expect(md).not.toMatch(/^# |\n# /);
    expect(md).toContain("Dear Parents and Carers,");
    expect(md).toContain("**Re: Year 5 trip to the Natural History Museum**");
    expect(md).toContain("| Where | the Natural History Museum |");
    expect(md).toContain("Yours sincerely,");
    expect(md).toContain("Mrs J Patel  \nYear 5 teacher");
    expect(md).toContain("### Consent slip: the Natural History Museum");
    expect(md).toContain("**Please return by:** Friday 5 March 2027");
    expect(sheetOutline(doc)).toBe("# Year 5 trip to the Natural History Museum");
    // The slip switched off in Design is gone from the text too.
    expect(sheetToMarkdown({ ...doc, design: { ...doc.design, slip: false } })).not.toContain("Consent slip");
  });

  test("Word builds, with and without the slip", async () => {
    const doc = parseSheet(finishSheet("letter", streamed, { letter: TRIP }))!;
    expect((await buildSheetDocx(doc)).size).toBeGreaterThan(5000);
    expect((await buildSheetDocx({ ...doc, design: { ...doc.design, slip: false } })).size).toBeGreaterThan(5000);
  });
});
