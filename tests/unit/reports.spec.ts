import { test, expect } from "@playwright/test";
import {
  activeSubjects,
  applyAnswer,
  chunk,
  defaultSettings,
  isReportsOutput,
  makeReports,
  newPupil,
  parseReports,
  phaseFor,
  reportsCsv,
  reportsMarkdown,
  reportUsageStep,
  runLimited,
  serializeReports,
  type PupilRow,
} from "@/app/lib/reports/reports";
import { PLACEHOLDER, payloadStrings, scrubForModel, scrubText, swapIn } from "@/app/lib/reports/privacy";
import { carriesName, MAX_PER_REQUEST, reportsRequest, reportsResponseFormat } from "@/app/lib/reports/prompt";
import { legacyReportSeed, lengthFromWords, pronounsFromGender, toneFromText } from "@/app/lib/reports/legacy";
import { readableOutput } from "@/app/lib/printable";

const pupil = (name: string, patch: Partial<PupilRow> = {}): PupilRow => ({ ...newPupil(name), ...patch });

test.describe("scrubText: names out of what is sent", () => {
  test("the pupil's own name becomes the placeholder, possessive kept", () => {
    expect(scrubText("Amira's reading is strong. Amira helps others.", "Amira", [])).toBe(`${PLACEHOLDER}'s reading is strong. ${PLACEHOLDER} helps others.`);
  });

  test("any case", () => {
    expect(scrubText("AMIRA and amira", "Amira", [])).toBe(`${PLACEHOLDER} and ${PLACEHOLDER}`);
  });

  test("a classmate's name becomes 'a classmate'", () => {
    expect(scrubText("Works well with Ben and Chloe.", "Amira", ["Amira", "Ben", "Chloe"])).toBe("Works well with a classmate and a classmate.");
  });

  test("a name inside a longer word is left alone (Ali in Alison, Ben in Bench)", () => {
    expect(scrubText("Alison sat on the bench with Ben.", "Ali", ["Ali", "Ben"])).toBe("Alison sat on the bench with a classmate.");
  });

  test("longer names first, so 'Ann Marie' is not left half done by 'Ann'", () => {
    expect(scrubText("Ann Marie and Ann", "Ann Marie", ["Ann Marie", "Ann"])).toBe(`${PLACEHOLDER} and a classmate`);
  });

  test("two pupils with the same first name: their own name wins", () => {
    expect(scrubText("Sam was kind to Sam.", "Sam", ["Sam", "Sam"])).toBe(`${PLACEHOLDER} was kind to ${PLACEHOLDER}.`);
  });

  test("names with regex characters and accents", () => {
    expect(scrubText("Zoë (and Jean-Luc) did well.", "Zoë", ["Zoë", "Jean-Luc"])).toBe(`${PLACEHOLDER} (and a classmate) did well.`);
    expect(scrubText("Zoe is not Zoë", "Zoë", [])).toBe(`Zoe is not ${PLACEHOLDER}`);
  });

  test("an empty name changes nothing", () => {
    expect(scrubText("Some text.", "", ["", "  "])).toBe("Some text.");
  });
});

test.describe("scrubForModel: the payload never holds a name", () => {
  test("refs, not names, and no name key", () => {
    const ps = [pupil("Amira", { note: "Amira and Ben read together.", nextStep: "Help Ben" }), pupil("Ben", { note: "Ben's handwriting" })];
    const sent = scrubForModel(ps);
    expect(sent.map((p) => p.ref)).toEqual(ps.map((p) => p.id));
    expect(Object.keys(sent[0]).sort()).toEqual(["attainment", "effort", "nextStep", "note", "pronouns", "ref"]);
    expect(sent[0].note).toBe(`${PLACEHOLDER} and a classmate read together.`);
    expect(sent[0].nextStep).toBe("Help a classmate");
    expect(sent[1].note).toBe(`${PLACEHOLDER}'s handwriting`);
    expect(carriesName(sent)).toBe(false);
  });

  test("blank judgements are not sent", () => {
    const [sent] = scrubForModel([pupil("A", { attainment: { Maths: "Expected standard", English: "" } })]);
    expect(sent.attainment).toEqual({ Maths: "Expected standard" });
  });

  test("a randomised roster: no name survives anywhere in the request", () => {
    const first = ["Amira", "Ben", "Chloe", "Daniyal", "Eve", "Freya", "George", "Hana", "Isaac", "Jade", "Kai", "Leo", "Mia", "Noor", "Olu", "Priya"];
    let seed = 7;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let round = 0; round < 25; round++) {
      const roster = first.filter(() => rand() > 0.4);
      if (!roster.length) continue;
      const ps = roster.map((n) => {
        const other = roster[Math.floor(rand() * roster.length)];
        return pupil(n, { note: `${n} sits next to ${other.toUpperCase()}. ${other}'s idea helped ${n}.`, nextStep: `${n} to read with ${other}` });
      });
      // As the form sends them: five at a time, scrubbed against the whole class.
      for (const group of chunk(ps)) {
        const body = { yearGroup: "Year 4", subjects: ["Maths"], pupils: scrubForModel(group, roster) };
        const strings = payloadStrings(body).join(" ");
        for (const n of roster) expect(strings, `round ${round}`).not.toMatch(new RegExp(`\\b${n}\\b`, "i"));
        expect(reportsRequest(body)).not.toHaveProperty("error");
      }
    }
  });
});

test.describe("swapIn", () => {
  test("puts the name back, possessive included", () => {
    expect(swapIn(`${PLACEHOLDER}'s reading. ${PLACEHOLDER} tries hard.`, "Amira")).toBe("Amira's reading. Amira tries hard.");
  });
  test("a nameless row reads 'This pupil'", () => {
    expect(swapIn(`${PLACEHOLDER} tries hard.`, " ")).toBe("This pupil tries hard.");
  });
});

test.describe("the request", () => {
  const body = () => ({ yearGroup: "Year 4", subjects: ["Maths"], pupils: scrubForModel([pupil("Amira"), pupil("Ben")]) });

  test("refuses any name key, however deep", () => {
    expect(reportsRequest({ ...body(), name: "Amira" } as never)).toEqual({ error: expect.stringMatching(/never sent/) });
    const b = body();
    (b.pupils[0] as unknown as Record<string, unknown>).firstName = "Amira";
    expect(reportsRequest(b)).toHaveProperty("error");
    expect(carriesName({ a: [{ b: { pupilName: "x" } }] })).toBe(true);
    expect(carriesName({ note: "name" })).toBe(false);
  });

  test("refuses missing year group, no pupils, too many, no subject, shared refs", () => {
    expect(reportsRequest({ ...body(), yearGroup: " " })).toHaveProperty("error");
    expect(reportsRequest({ ...body(), pupils: [] })).toHaveProperty("error");
    const many = Array.from({ length: MAX_PER_REQUEST + 1 }, (_, i) => pupil(`P${i}`));
    expect(reportsRequest({ ...body(), pupils: scrubForModel(many) })).toHaveProperty("error");
    expect(reportsRequest({ ...body(), subjects: ["", "  "] })).toHaveProperty("error");
    const b = body();
    b.pupils[1].ref = b.pupils[0].ref;
    expect(reportsRequest(b)).toHaveProperty("error");
  });

  test("the schema asks for exactly these pupils", () => {
    const f = reportsResponseFormat(["p1", "p2"]);
    const reports = (f.json_schema.schema as { properties: { reports: { minItems: number; maxItems: number; items: { properties: { ref: { enum: string[] } } } } } }).properties.reports;
    expect(reports.minItems).toBe(2);
    expect(reports.maxItems).toBe(2);
    expect(reports.items.properties.ref.enum).toEqual(["p1", "p2"]);
    expect(f.json_schema.strict).toBe(true);
  });

  test("the prompt forbids invented judgements and names, and has no long dashes", () => {
    const built = reportsRequest(body());
    if ("error" in built) throw new Error(built.error);
    const user = built.messages[1].content;
    expect(user).toContain("Never state an attainment");
    expect(user).toContain(PLACEHOLDER);
    expect(user).toMatch(/Never invent or use a name/);
    expect(user).not.toMatch(/[–—]/);
    expect(user).not.toMatch(/Amira|Ben/);
  });

  test("next steps off asks for an empty next step", () => {
    const built = reportsRequest({ ...body(), nextSteps: false });
    if ("error" in built) throw new Error(built.error);
    expect(built.messages[1].content).toContain('nextStep: "" (no next steps this time).');
  });
});

test.describe("chunking and counting", () => {
  test("1, 5, 6 and 40 pupils", () => {
    expect(chunk([1]).map((c) => c.length)).toEqual([1]);
    expect(chunk([1, 2, 3, 4, 5]).map((c) => c.length)).toEqual([5]);
    expect(chunk([1, 2, 3, 4, 5, 6]).map((c) => c.length)).toEqual([5, 1]);
    expect(chunk(Array.from({ length: 40 }, (_, i) => i)).map((c) => c.length)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(chunk([])).toEqual([]);
  });

  test("only a class's first request counts; a rewrite is an edit", () => {
    expect(reportUsageStep(0, undefined)).toBeNull();
    expect(reportUsageStep(undefined, undefined)).toBeNull();
    expect(reportUsageStep(1, undefined)).toBe("Report batch");
    expect(reportUsageStep(7, false)).toBe("Report batch");
    expect(reportUsageStep(0, true)).toBe("Report redo");
    expect(reportUsageStep("3", undefined)).toBeNull();
  });

  test("runLimited keeps at most two in flight and every result in order", async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 7 }, (_, i) => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 + ((i * 3) % 7)));
      inFlight--;
      return i;
    });
    expect(await runLimited(tasks, 2)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(2);
    expect(await runLimited([], 2)).toEqual([]);
  });
});

test.describe("applyAnswer", () => {
  test("fills only the pupils asked about", () => {
    const ps = [pupil("A", { id: "p1" }), pupil("B", { id: "p2" }), pupil("C", { id: "p3" })];
    const out = applyAnswer(ps, ["p1", "p2"], { reports: [{ ref: "p1", comment: "c1", nextStep: "n1" }, { ref: "p3", comment: "sneaky", nextStep: "" }] });
    expect(out.map((p) => p.comment)).toEqual(["c1", "", ""]);
    expect(out[0].target).toBe("n1");
  });

  test("a partial answer (no nextStep yet) and junk are safe", () => {
    const ps = [pupil("A", { id: "p1" })];
    expect(applyAnswer(ps, ["p1"], { reports: [{ ref: "p1", comment: "half" }] })[0]).toMatchObject({ comment: "half", target: "" });
    expect(applyAnswer(ps, ["p1"], null)).toEqual(ps);
    expect(applyAnswer(ps, ["p1"], { reports: "x" })).toEqual(ps);
    expect(applyAnswer(ps, ["p1"], { reports: [null, 3, { ref: 1 }] })).toEqual(ps);
  });
});

test.describe("the class document", () => {
  const doc = () =>
    makeReports({ ...defaultSettings("Year 4") }, [
      pupil("Amira", { id: "p1", comment: `${PLACEHOLDER} said "yes", then, more.\nNew line.`, target: `${PLACEHOLDER} to read daily.`, status: "done" }),
      pupil("Ben", { id: "p2" }),
    ]);

  test("round trips and is told apart from markdown", () => {
    const s = serializeReports(doc());
    expect(isReportsOutput(s)).toBe(true);
    expect(parseReports(s)).toEqual(doc());
    expect(isReportsOutput("# A report")).toBe(false);
    expect(parseReports("# A report")).toBeNull();
    expect(parseReports('{"kind":"jooma-reports", broken')).toBeNull();
  });

  test("CSV escapes quotes, commas and newlines, names in, unwritten pupils out", () => {
    const csv = reportsCsv(doc(), swapIn);
    expect(csv.split("\r\n")[0]).toBe('"Name","Report","Next step"');
    expect(csv).toContain('"Amira","Amira said ""yes"", then, more.\nNew line.","Amira to read daily."');
    expect(csv).not.toContain("Ben");
    expect(csv).not.toContain(PLACEHOLDER);
  });

  test("markdown for Copy all and Word", () => {
    const md = reportsMarkdown(doc(), swapIn);
    expect(md).toContain("# Reports: Year 4, English, Maths, Science");
    expect(md).toContain("## Amira");
    expect(md).toContain("**Next step:** Amira to read daily.");
    expect(md).not.toContain("## Ben");
  });

  test("readers: names in for the teacher, out when the text goes to a model", () => {
    const s = serializeReports(doc());
    expect(readableOutput(s)).toContain("## Amira");
    const forModel = readableOutput(s, { forModel: true });
    expect(forModel).not.toContain("Amira");
    expect(forModel).toContain("## Pupil 1");
    expect(forModel).toContain(PLACEHOLDER);
    expect(readableOutput("# Plain")).toBe("# Plain");
  });

  test("phase and subjects", () => {
    expect(phaseFor("Reception")).toBe("primary");
    expect(phaseFor("Year 6")).toBe("primary");
    expect(phaseFor("Year 7")).toBe("secondary");
    expect(phaseFor("")).toBe("secondary");
    expect(activeSubjects({ ...defaultSettings("Year 9"), subjects: [" Geography ", "History"] })).toEqual(["Geography"]);
    expect(activeSubjects({ ...defaultSettings("Year 3"), subjects: ["Maths", "", "Art"] })).toEqual(["Maths", "Art"]);
  });
});

test.describe("old single pupil reports", () => {
  test("seed the grid with that pupil", () => {
    const { settings, pupil: p } = legacyReportSeed({
      name: "Amira",
      gender: "Female",
      wordCount: "150",
      includeTargets: false,
      tone: "Warm and encouraging",
      subjects: [
        { subject: "Maths", strengths: "Strong number sense", areasForDevelopment: "Show working", targets: "Practise times tables" },
        { subject: "English", strengths: "Reads widely", areasForDevelopment: "", targets: "" },
      ],
    });
    expect(p.name).toBe("Amira");
    expect(p.pronouns).toBe("she");
    expect(p.note).toBe("Maths: Strong number sense. To develop: Show working\nEnglish: Reads widely");
    expect(p.nextStep).toBe("Practise times tables");
    expect(settings).toMatchObject({ phase: "primary", scale: "primary", subjects: ["Maths", "English"], length: "long", tone: "encouraging", nextSteps: false, yearGroup: "" });
  });

  test("odd or missing input", () => {
    const { settings, pupil: p } = legacyReportSeed({});
    expect(p.name).toBe("");
    expect(p.pronouns).toBe("they");
    expect(settings.subjects).toEqual([""]);
    expect(settings.phase).toBe("secondary");
    expect(pronounsFromGender("Male")).toBe("he");
    expect(pronounsFromGender("Non-Binary")).toBe("they");
    expect(toneFromText("Formal and measured")).toBe("formal");
    expect(toneFromText("")).toBe("warm");
    expect(lengthFromWords("50")).toBe("short");
    expect(lengthFromWords("100")).toBe("standard");
    expect(lengthFromWords("abc")).toBe("standard");
  });
});
