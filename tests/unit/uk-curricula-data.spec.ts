import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  FRAMEWORK_AGES,
  FRAMEWORK_CREDIT,
  frameworkOf,
  type FrameworkData,
  type FrameworkId,
} from "@/app/lib/standards";
import ccssMath from "@/app/lib/standards/data/ccss-math.json";
import ccssEla from "@/app/lib/standards/data/ccss-ela.json";
import ngss from "@/app/lib/standards/data/ngss.json";
import ac9 from "@/app/lib/standards/data/ac9.json";
import cfeEarly from "@/app/lib/standards/data/cfe-early.json";
import cfeFirst from "@/app/lib/standards/data/cfe-first.json";
import cfeSecond from "@/app/lib/standards/data/cfe-second.json";
import cfeThirdFourth from "@/app/lib/standards/data/cfe-third-fourth.json";
import nicFs from "@/app/lib/standards/data/nic-fs.json";
import nicKs1 from "@/app/lib/standards/data/nic-ks1.json";
import nicKs2 from "@/app/lib/standards/data/nic-ks2.json";

/*
 * The data behind "Align to curriculum" for Scotland and Northern Ireland,
 * built by scripts/build-uk-curricula.mjs from the fixed source copies in
 * docs/standards/uk/. Checked here: the shape of every framework's data, the
 * clean-text rules, pinned counts, known statements word for word, and every
 * statement and strand against its source (skipped when a source is missing).
 *
 * The source checks read the PDFs a second, independent way (pdf.js reading
 * order), not by the positions the build script uses, so a cell the build put
 * in the wrong place or a word it dropped shows up here.
 *
 * No en or em dash is written in this file: they are built from their code points.
 */

const DATA: Partial<Record<FrameworkId, FrameworkData>> = {
  "ccss-math": ccssMath as FrameworkData,
  "ccss-ela": ccssEla as FrameworkData,
  ngss: ngss as FrameworkData,
  ac9: ac9 as FrameworkData,
  "cfe-early": cfeEarly as FrameworkData,
  "cfe-first": cfeFirst as FrameworkData,
  "cfe-second": cfeSecond as FrameworkData,
  "cfe-third-fourth": cfeThirdFourth as FrameworkData,
  "nic-fs": nicFs as FrameworkData,
  "nic-ks1": nicKs1 as FrameworkData,
  "nic-ks2": nicKs2 as FrameworkData,
};
const ALL = Object.keys(DATA) as FrameworkId[];
const CFE = ["cfe-early", "cfe-first", "cfe-second", "cfe-third-fourth"] as const;
/** Frameworks built by scripts/build-uk-curricula.mjs: they follow its text rules. */
const NIC = ["nic-fs", "nic-ks1", "nic-ks2"] as const;
const UK_BUILT: FrameworkId[] = [...CFE, ...NIC];
const get = (f: FrameworkId) => DATA[f]!;

const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const DASH = new RegExp(`[${EN}${EM}]`);
// Letters only, as tests/unit/standards.spec.ts does.
const letters = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
const skipWithout = (path: string) => test.skip(!existsSync(path), `${path} is missing from this checkout`);

// ── Every framework's data ──────────────────────────────────────────────────

test.describe("every framework's data", () => {
  test("ids are unique across every framework, and each round-trips through frameworkOf", () => {
    const all = ALL.flatMap((f) => get(f).statements.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    for (const f of ALL) for (const s of get(f).statements) expect(frameworkOf(s.id), s.id).toBe(f);
  });

  // Violations are collected and compared with [], one expect for the lot:
  // thousands of statements make a per-statement expect slow.
  test("every statement is complete, with ages its framework covers", () => {
    const bad: string[] = [];
    for (const f of ALL) {
      for (const s of get(f).statements) {
        // Two words is the least a requirement has ("Create patterns", "Make music").
        if (s.text.trim().split(/\s+/).length < 2) bad.push(`${s.id}: under two words`);
        if (!s.subject) bad.push(`${s.id}: no subject`);
        if (!s.strand) bad.push(`${s.id}: no strand`);
        if (typeof s.code !== "string") bad.push(`${s.id}: no code field`);
        if (!s.ages.length) bad.push(`${s.id}: no ages`);
        for (const a of s.ages) {
          if (!Number.isInteger(a) || a < 3 || a > 17) bad.push(`${s.id}: age ${a}`);
          if (!FRAMEWORK_AGES[f].includes(a)) bad.push(`${s.id}: age ${a} is outside ${f}`);
        }
      }
    }
    // The UK nations teach to 15 here: nothing older.
    for (const f of UK_BUILT) for (const s of get(f).statements) if (Math.max(...s.ages) > 15) bad.push(`${s.id}: older than 15`);
    expect(bad).toEqual([]);
  });

  test("text is clean", () => {
    const bad: string[] = [];
    for (const f of UK_BUILT) {
      for (const s of get(f).statements) {
        for (const field of [s.text, s.strand, s.subject, s.code]) {
          if (DASH.test(field)) bad.push(`${s.id}: a dash`);
          if (field.includes("<")) bad.push(`${s.id}: markup`);
          if (/&[a-z#0-9]+;/i.test(field)) bad.push(`${s.id}: an entity`);
          if (field.includes("�")) bad.push(`${s.id}: a replacement character`);
          if (/ {2}|\t|\n/.test(field)) bad.push(`${s.id}: odd whitespace`);
          if (field !== field.trim()) bad.push(`${s.id}: untrimmed`);
        }
        if (/;$/.test(s.text)) bad.push(`${s.id}: trailing semicolon`);
        if (s.text[0] !== s.text[0].toUpperCase()) bad.push(`${s.id}: lowercase first letter`);
        // A page footnote marker stuck to the end of a word or sentence ("me1").
        if (/[a-z]{3,}\d{1,2}(?=\s|$)/.test(s.text)) bad.push(`${s.id}: a footnote marker`);
        // A code that was read as text.
        if (/\b[A-Z]{3,4} \d-\d{2}[a-z]?\b/.test(s.text)) bad.push(`${s.id}: a code in the text`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("each file carries the credit the card shows", () => {
    for (const f of ALL) expect(get(f).source.credit, f).toBe(FRAMEWORK_CREDIT[f]);
    for (const f of UK_BUILT) {
      expect(get(f).source.credit, f).toContain("Open Government Licence");
      expect(get(f).source.url, f).toMatch(/^https:\/\//);
    }
  });

  test("no stage overlaps a sibling stage", () => {
    for (const group of [CFE, NIC]) {
      for (const a of group) for (const b of group) {
        if (a !== b) expect(FRAMEWORK_AGES[a].filter((x) => FRAMEWORK_AGES[b].includes(x)), `${a} vs ${b}`).toEqual([]);
      }
    }
  });
});

// ── Scotland ────────────────────────────────────────────────────────────────

const SCOT_DIR = "docs/standards/uk/scotland";
/** The curriculum areas, each with the PDF it comes from. */
const AREAS: [string, string][] = [
  ["Expressive arts", "expressive-arts-eo.pdf"],
  ["Health and wellbeing", "health-and-wellbeing-eo.pdf"],
  ["Classical languages", "classical-languages-eo.pdf"],
  ["Gaelic (learners)", "gaelic-learners-eo.pdf"],
  ["Literacy and English", "literacy-english-eo.pdf"],
  ["Modern languages", "modern-languages-eo.pdf"],
  ["Numeracy and mathematics", "numeracy-maths-eo.pdf"],
  ["Religious and moral education", "rme-eo.pdf"],
  ["Religious education in Roman Catholic schools", "rerc-eo.pdf"],
  ["Sciences", "sciences-eo.pdf"],
  ["Social studies", "social-studies-eo.pdf"],
  ["Technologies", "technologies-es-os.pdf"],
];
const LEVELS: Record<(typeof CFE)[number], number[]> = {
  "cfe-early": [0],
  "cfe-first": [1],
  "cfe-second": [2],
  "cfe-third-fourth": [3, 4],
};
const scot = () => CFE.flatMap((f) => get(f).statements);
const text = (id: string) => scot().find((s) => s.id === id)!.text;

test.describe("Scotland", () => {
  test("codes follow Education Scotland's scheme and match their level", () => {
    // Area prefix, level digit, outcome number, and a letter (two outcomes in
    // the source have none: "MLAN 1-03" and "MLAN 1-13", kept as printed).
    const one = /^[A-Z]{3,4} [0-4]-\d{2}[a-z]?$/;
    for (const f of CFE) {
      for (const s of get(f).statements) {
        const codes = s.code.split(" / ");
        expect(codes.length, s.id).toBeGreaterThan(0);
        for (const c of codes) {
          expect(c, s.id).toMatch(one);
          expect(LEVELS[f], `${s.id}: ${c}`).toContain(Number(c.match(/ (\d)-/)![1]));
        }
        // The id is the framework and the first code.
        expect(s.id.startsWith(`${f}-${codes[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`), s.id).toBe(true);
      }
    }
  });

  test("subjects are the curriculum areas", () => {
    const named = new Set(AREAS.map(([name]) => name));
    expect(named.size).toBe(12);
    for (const s of scot()) expect(named.has(s.subject), s.id).toBe(true);
    // Every area has statements at its levels: Classical languages is third and fourth only.
    const at = (f: (typeof CFE)[number]) => new Set(get(f).statements.map((s) => s.subject));
    for (const f of CFE) for (const [name] of AREAS) {
      if (name === "Classical languages" && f !== "cfe-third-fourth") expect(at(f).has(name), `${name} in ${f}`).toBe(false);
      else if (name === "Modern languages" && f === "cfe-early") expect(at(f).has(name), `${name} in ${f}`).toBe(false);
      else expect(at(f).has(name), `${name} in ${f}`).toBe(true);
    }
  });

  test("the Gaelic-medium documents and Benchmarks are left out", () => {
    for (const s of scot()) {
      expect(s.code, s.id).not.toMatch(/^GAI/);
      expect(s.subject, s.id).not.toMatch(/Gàidhlig|Gaidhlig/i);
      expect(s.text, s.id).not.toMatch(/benchmark/i);
    }
    // Gaelic (learners) is English-medium, with its own LGL codes, and stays.
    expect(scot().filter((s) => s.subject === "Gaelic (learners)").every((s) => s.code.startsWith("LGL"))).toBe(true);
  });

  test("counts are pinned to the build", () => {
    expect(get("cfe-early").statements).toHaveLength(173);
    expect(get("cfe-first").statements).toHaveLength(255);
    expect(get("cfe-second").statements).toHaveLength(301);
    expect(get("cfe-third-fourth").statements).toHaveLength(567);
    const codes = new Set(scot().flatMap((s) => s.code.split(" / ")));
    expect(codes.size).toBe(1367);
  });

  test("a code used more than once has its own strand or wording each time", () => {
    // The Early level outcomes for talking, reading and writing share codes.
    for (const f of CFE) {
      const seen = new Map<string, string>();
      for (const s of get(f).statements) {
        const key = `${s.code}|${s.strand}|${s.text}`;
        expect(seen.has(key), `${s.id} repeats ${seen.get(key)}`).toBe(false);
        seen.set(key, s.id);
      }
    }
    const lit = get("cfe-early").statements.filter((s) => s.code === "LIT 0-01a / LIT 0-11a / LIT 0-20a");
    expect(lit.map((s) => s.strand.split(": ")[0]).sort()).toEqual(["Listening and talking", "Reading", "Writing"]);
    // Ids stay unique: a code that repeats gets a short hash after it.
    expect(new Set(lit.map((s) => s.id)).size).toBe(3);
    expect(get("cfe-first").statements.find((s) => s.code === "MNU 1-02a")!.id).toBe("cfe-first-mnu-1-02a");
  });

  test("known outcomes landed at the right level, word for word", () => {
    expect(text("cfe-early-mnu-0-02a")).toBe(
      "I have explored numbers, understanding that they represent quantities, and I can use them to count, create sequences and describe order.",
    );
    expect(text("cfe-first-mnu-1-02a")).toBe(
      "I have investigated how whole numbers are constructed, can understand the importance of zero within the system and can use my knowledge to explain the link between a digit, its place and its value.",
    );
    const feelings = "I am aware of and able to express my feelings and am developing the ability to talk about them.";
    expect(get("cfe-early").statements.find((s) => s.text === feelings)!.code).toBe("HWB 0-01a");
    expect(get("cfe-third-fourth").statements.find((s) => s.text === feelings)!.code).toBe("HWB 3-01a / HWB 4-01a");
  });

  test("an outcome common to every level is on every list, with each list's own codes", () => {
    const rights = "As I explore the rights to which I and others are entitled";
    const codes = CFE.map((f) => get(f).statements.find((s) => s.text.startsWith(rights))?.code);
    expect(codes).toEqual(["HWB 0-09a", "HWB 1-09a", "HWB 2-09a", "HWB 3-09a / HWB 4-09a"]);
    // A Fourth level outcome is on the third and fourth list only.
    const fourthOnly = scot().filter((s) => s.code === "MNU 4-01a");
    expect(fourthOnly.map((s) => frameworkOf(s.id))).toEqual(["cfe-third-fourth"]);
  });

  test("the source's printing slips are written the way every other code is", () => {
    const all = new Set(scot().flatMap((s) => s.code.split(" / ")));
    expect(all.has("TCH 2-02a")).toBe(true); // printed "TCH 02-02a"
    expect(all.has("TCH 02-02a")).toBe(false);
    expect(all.has("RME 1-07a")).toBe(true); // printed "1-07a", the RME left off
    expect(all.has("MLAN 1-03")).toBe(true); // no letter in the source, kept as printed
  });

  test("a word split at a line end is joined, and list bullets are kept", () => {
    expect(scot().find((s) => s.code === "CLAN 3-02a")!.text).toContain("a grammatically-straightforward passage");
    expect(scot().find((s) => s.code === "HWB 4-23a")!.text).toContain("I can: • experience different roles");
  });

  test("strands read '<heading>: <row name>', or the heading alone", () => {
    const n = scot().find((s) => s.code === "MNU 1-01a")!;
    expect(n.strand).toBe("Number, money and measure: Estimation and rounding");
    expect(scot().find((s) => s.code === "SOC 1-01a")!.strand).toBe("People, past events and societies");
    expect(scot().find((s) => s.code === "CLAN 3-01a")!.strand).toBe("Translating texts");
    // A section inside a section names both; a heading set in smaller type is still a heading.
    expect(scot().find((s) => s.code === "HWB 0-21a")!.strand).toMatch(/^Physical education, physical activity and sport: Physical education: /);
    expect(scot().find((s) => s.code === "RME 0-07a")!.strand).toBe("Development of beliefs and values");
    for (const s of scot()) {
      expect(s.strand, s.id).not.toMatch(/continued/i);
      expect(s.strand.startsWith(":") || s.strand.endsWith(":"), s.id).toBe(false);
    }
  });
});

// ── Scotland against the PDFs, read a second way ───────────────────────────

/** The text of an area PDF in reading order, one string per page, up to its Appendix page. */
async function areaPages(file: string): Promise<string[]> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`${SCOT_DIR}/${file}`)));
  const { text } = await extractText(pdf, { mergePages: false });
  const end = text.findIndex((t) => new RegExp(`^\\s*Appendix\\s*[-${EN}${EM}]`, "m").test(t));
  return end < 0 ? text : text.slice(0, end);
}
let cache: Promise<Map<string, string[]>> | null = null;
const sources = () => (cache ??= (async () => new Map(await Promise.all(AREAS.map(async ([name, file]) => [name, await areaPages(file)] as [string, string[]]))))());

test.describe("Scotland against the PDFs", () => {
  test.setTimeout(180_000);

  test("every code in the source is in the data, and no other", async () => {
    skipWithout(`${SCOT_DIR}/numeracy-maths-eo.pdf`);
    const found = new Set<string>();
    for (const pages of (await sources()).values()) {
      // "L IT 0-11a": the PDF sets a few codes with a gap after the first letter.
      const raw = pages.join("\n").replace(/(^|[/,\s])([A-Z]) ([A-Z]{2,3} \d)/g, "$1$2$3");
      for (const m of raw.matchAll(/\b([A-Z]{3,4}) ?(\d{1,2}) ?- ?(\d{2}[a-z]?)(?![a-z])/g)) found.add(`${m[1]} ${Number(m[2])}-${m[3]}`);
    }
    const data = new Set(scot().flatMap((s) => s.code.split(" / ")));
    // RME 1-07a is printed "1-07a" after a slash, which this pattern cannot see.
    expect([...data].filter((c) => !found.has(c) && c !== "RME 1-07a")).toEqual([]);
    expect([...found].filter((c) => !data.has(c))).toEqual([]);
  });

  test("every statement is in its source, word for word", async () => {
    skipWithout(`${SCOT_DIR}/numeracy-maths-eo.pdf`);
    const map = await sources();
    const hay = new Map([...map].map(([name, pages]) => [name, letters(pages.join("\n"))]));
    // Three outcomes have a word printed as a separate piece that the PDF's
    // reading order puts somewhere else ("as", "to", "I can select"). They
    // were read off the page by position and checked by hand, so they are
    // held to the exact text here instead.
    const OUT_OF_ORDER: Record<string, string> = {
      "cfe-first-lit-1-10a": "I can communicate clearly when engaging with others within and beyond my place of learning, using selected resources as required.",
      "cfe-first-lit-1-26a": "By considering the type of text I am creating, I can select ideas and relevant information, organise these in a logical sequence and use words which will be interesting and/or useful for others.",
      "cfe-third-fourth-lit-3-11a":
        "I regularly select and read, listen to or watch texts for enjoyment and interest, and I can express how well they meet my needs and expectations and give reasons, with evidence, for my personal response. I can identify sources to develop the range of my reading.",
    };
    for (const [id, expected] of Object.entries(OUT_OF_ORDER)) expect(text(id), id).toBe(expected);
    const wrong = scot()
      .filter((s) => !(s.id in OUT_OF_ORDER) && !hay.get(s.subject)!.includes(letters(s.text)))
      .map((s) => `${s.id}: ${s.text.slice(0, 100)}`);
    expect(wrong).toEqual([]);
  });

  test("every strand is in its source", async () => {
    skipWithout(`${SCOT_DIR}/numeracy-maths-eo.pdf`);
    const map = await sources();
    const hay = new Map([...map].map(([name, pages]) => [name, letters(pages.join("\n"))]));
    const wrong = new Set<string>();
    for (const s of scot()) {
      if (s.strand === s.subject) continue;
      for (const part of s.strand.split(": ")) if (!hay.get(s.subject)!.includes(letters(part))) wrong.add(`${s.subject}: ${part}`);
    }
    expect([...wrong]).toEqual([]);
  });

  test("the source lines no statement or strand contains are the ones counted when the data was built", async () => {
    skipWithout(`${SCOT_DIR}/numeracy-maths-eo.pdf`);
    // A line of an outcome that a statement lost would show up here as one
    // more uncovered line. What is left over, by design, is the page header,
    // each area's introduction, the level labels, row descriptions and
    // footnotes. The counts were reviewed by hand when the data was built.
    const PINNED: Record<string, number> = {
      "Expressive arts": 54,
      "Health and wellbeing": 111,
      "Classical languages": 20,
      "Gaelic (learners)": 41,
      "Literacy and English": 133,
      "Modern languages": 36,
      "Numeracy and mathematics": 71,
      "Religious and moral education": 49,
      "Religious education in Roman Catholic schools": 203,
      "Sciences": 290,
      "Social studies": 60,
      "Technologies": 41,
    };
    const CODE_LINE = /^(?:[A-Z] )?[A-Z]{2,4} ?\d{1,2} ?- ?\d{2}[a-z]?(?: ?[/,] ?(?:[A-Z]{3,4} ?)?\d{1,2} ?- ?\d{2}[a-z]?)*(?: ?\/)?$/;
    const got: Record<string, number> = {};
    for (const [name, pages] of await sources()) {
      const mine = scot().filter((st) => st.subject === name);
      const hay = letters(mine.map((st) => st.text).join(" "));
      const hayStrands = letters(mine.map((st) => st.strand).join(" "));
      let uncovered = 0;
      for (const line of pages.flatMap((p) => p.split("\n")).map((l) => l.trim())) {
        const l = letters(line);
        if (!l || CODE_LINE.test(line) || /^(Early|First|Second|Third|Fourth|Organiser)$/.test(line)) continue;
        if (!hay.includes(l) && !hayStrands.includes(l)) uncovered++;
      }
      got[name] = uncovered;
    }
    expect(got).toEqual(PINNED);
  });
});

// ── Northern Ireland ────────────────────────────────────────────────────────

const NI_XML = "docs/standards/uk/northern-ireland/nisr-2007-46-schedule-2.xml";
const nic = () => NIC.flatMap((f) => get(f).statements);
/** Where each stage sits in the Order: Part 2, 3 and 4 of Schedule 2. */
const NI_PART: Record<(typeof NIC)[number], number> = { "nic-fs": 2, "nic-ks1": 3, "nic-ks2": 4 };
const AREAS_FS = [
  "Language and Literacy",
  "Mathematics and Numeracy",
  "The Arts",
  "The World Around Us",
  "Personal Development and Mutual Understanding",
  "Physical Development and Movement",
];
const AREAS_KS = [
  "Language and Literacy",
  "Mathematics and Numeracy",
  "The Arts",
  "The World Around Us",
  "Personal Development and Mutual Understanding",
  "Physical Education",
];

/** The Order's XML as text, one string per Part, tags gone and entities read. */
function orderParts(): string[] {
  const xml = readFileSync(NI_XML, "utf8");
  return xml
    .split(/<Part /)
    .slice(1)
    .map((p) =>
      p
        .replace(/<Commentaries[\s\S]*$/, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))),
    );
}
/** List items with no list inside them, counted straight off the XML. */
function leafItems(part: string): number {
  let leaves = 0;
  const open: boolean[] = [];
  for (const m of part.matchAll(/<(\/?)(ListItem|UnorderedList)\b/g)) {
    if (m[2] === "UnorderedList") {
      if (!m[1] && open.length) open[open.length - 1] = true;
      continue;
    }
    if (!m[1]) open.push(false);
    else if (!open.pop()) leaves++;
  }
  return leaves;
}
/** A statement is one list item, or a lead-in with "(a) ..." parts: leaves it covers. */
const leavesOf = (text: string) => (text.match(/\([a-z]\) /g) ?? [""]).length;

test.describe("Northern Ireland", () => {
  test("subjects are the Areas of Learning the Order names for that stage", () => {
    for (const f of NIC) {
      const expected = f === "nic-fs" ? AREAS_FS : AREAS_KS;
      expect([...new Set(get(f).statements.map((s) => s.subject))], f).toEqual(expected);
    }
  });

  test("the Order's own table names those Areas for the stages", () => {
    skipWithout(NI_XML);
    const part1 = orderParts()[0];
    for (const name of new Set([...AREAS_FS, ...AREAS_KS])) expect(letters(part1).includes(letters(name)), name).toBe(true);
    // Foundation Stage has Physical Development and Movement, the Key Stages Physical Education.
    expect(letters(part1).includes(letters("Physical Development and Movement"))).toBe(true);
  });

  test("code is empty, and the id is a hash of subject, strand and text", () => {
    for (const f of NIC) {
      for (const s of get(f).statements) {
        expect(s.code, s.id).toBe("");
        const want = `${f}-${createHash("sha1").update(`${s.subject}|${s.strand}|${s.text}`).digest("hex").slice(0, 10)}`;
        expect(s.id).toBe(want);
      }
    }
  });

  test("counts are pinned to the build, and Key Stages 3 and 4 are not here", () => {
    expect(get("nic-fs").statements).toHaveLength(239);
    expect(get("nic-ks1").statements).toHaveLength(150);
    expect(get("nic-ks2").statements).toHaveLength(150);
    expect(Object.keys(DATA).filter((f) => f.startsWith("nic-")).sort()).toEqual(["nic-fs", "nic-ks1", "nic-ks2"]);
  });

  test("known requirements, word for word", () => {
    const ks1 = get("nic-ks1").statements.find((s) => s.text === "Use prepositions to state position")!;
    expect(ks1.subject).toBe("Mathematics and Numeracy");
    expect(ks1.strand).toBe("Shape and Space: Position, Movement and Direction");
    const ks2 = get("nic-ks2").statements.find((s) => s.text === "Develop strategies to add and subtract mentally")!;
    expect(ks2.subject).toBe("Mathematics and Numeracy");
    expect(ks2.strand).toBe("Number: Operations and their Applications");
    // A list inside a list: the lead-in, then its parts lettered, in the Order's words.
    const nested = get("nic-fs").statements.find((s) => s.text.startsWith("Attention and listening skills through"))!;
    expect(nested.text).toBe(
      "Attention and listening skills through: (a) listening to a wide range of stories, poems, songs and music (b) following instructions (c) identifying environmental sounds (d) repeating familiar phrases/sound sequences (e) recalling sequence and detail.",
    );
    // The same words at the other stages are not borrowed: the stages have their own lists.
    expect(get("nic-ks1").statements.some((s) => s.text === ks2.text)).toBe(false);
  });

  test("ALL-CAPS titles are written the way the Order writes them elsewhere", () => {
    const strands = new Set(nic().map((s) => s.strand));
    expect(strands.has("Talking and Listening")).toBe(true);
    expect(strands.has("Shape and Space")).toBe(true);
    expect(strands.has("Handling Data: Collecting, Representing and Interpreting Data")).toBe(true);
    // A Progression section belongs to its strand when every strand has one, otherwise to the Area.
    expect(strands.has("Reading (progression)")).toBe(true);
    expect(strands.has("Mathematics and Numeracy (progression)")).toBe(true);
    expect(strands.has("Number (progression)")).toBe(false);
    for (const s of nic()) expect(s.strand, s.id).not.toBe(s.strand.toUpperCase());
  });

  test("lead-in lines are not statements", () => {
    for (const s of nic()) {
      expect(s.text, s.id).not.toMatch(/^(Pupils|Teachers|Through modelled|As pupils progress)\b/);
      expect(s.text, s.id).not.toMatch(/:$/);
    }
  });

  test("every statement is in the Order, word for word, in its own Part", () => {
    skipWithout(NI_XML);
    const parts = orderParts();
    const wrong: string[] = [];
    for (const f of NIC) {
      const hay = letters(parts[NI_PART[f] - 1]);
      // The lettered parts (a), (b) are ours, so each part is checked on its own,
      // as tests/unit/standards.spec.ts does for Common Core.
      for (const s of get(f).statements) {
        if (s.text.split(/ \([a-z]\) /).some((part) => !hay.includes(letters(part)))) wrong.push(`${s.id}: ${s.text.slice(0, 90)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("every strand and subject is in its Part of the Order", () => {
    skipWithout(NI_XML);
    const parts = orderParts();
    const wrong = new Set<string>();
    for (const f of NIC) {
      const hay = letters(parts[NI_PART[f] - 1]);
      for (const s of get(f).statements) {
        if (!hay.includes(letters(s.subject))) wrong.add(`${f}: ${s.subject}`);
        for (const part of s.strand.replace(/ \(progression\)/, "").split(": ")) if (!hay.includes(letters(part))) wrong.add(`${f}: ${part}`);
      }
    }
    expect([...wrong]).toEqual([]);
  });

  test("no list item of the Order was left out: leaves counted off the XML equal the statements' leaves", () => {
    skipWithout(NI_XML);
    const xml = readFileSync(NI_XML, "utf8").split(/<Part /).slice(1);
    for (const f of NIC) {
      const fromXml = leafItems(xml[NI_PART[f] - 1].replace(/<Commentaries[\s\S]*$/, ""));
      const ours = get(f).statements.reduce((n, s) => n + leavesOf(s.text), 0);
      expect(ours, f).toBe(fromXml);
    }
    // Key Stages 3 and 4 hold list items too (146 and 26) that are not statements by
    // themselves: they are the same skills lists under every subject.
    expect(leafItems(xml[4])).toBe(146);
    expect(leafItems(xml[5])).toBe(26);
  });
});
