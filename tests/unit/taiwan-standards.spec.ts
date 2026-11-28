import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

import { getCurriculum } from "@/app/lib/curricula";
import {
  FRAMEWORK_AGES,
  FRAMEWORK_CREDIT,
  FRAMEWORK_LANGUAGE_NOTE,
  FRAMEWORK_PERMITTED,
  alignmentMode,
  alignmentYears,
  frameworkOf,
  frameworksForYear,
  statementsForAge,
  type FrameworkData,
} from "@/app/lib/standards";
import { alignParamFor } from "@/app/lib/standards/align";
import { MAX_CANDIDATES, capCandidates, filterBySubject, matchingSubjects } from "@/app/lib/standards/suggest";
import { curriculumPromptBlock, worksheetCurriculumRules } from "@/app/lib/national-curriculum/prompt";
import tw108 from "@/app/lib/standards/data/tw-108-zh.json";
import tw108en from "@/app/lib/standards/data/tw-108-en.json";

/*
 * Taiwan: Curriculum Guidelines of 12-Year Basic Education (Ministry of
 * Education, published by NAER), under NAER's open data declaration. Built
 * by scripts/build-asia-standards.mjs --country=taiwan. Official text only
 * (owner, 2026-11-28):
 *
 *   tw-108-zh     Mandarin and mathematics, in the original Chinese.
 *   tw-108-en  English and science, in NAER's official English translation.
 *
 * Checked here: the shape and counts, codes complete with no serial number
 * missing, known statements word for word, the symbols the PDF draws (√) or
 * sets small (exponents) written in, every statement against its PDF, and
 * how the curriculum, the card, the matcher and the prompt use them.
 *
 * No en or em dash is written in this file.
 */

const ZH = tw108 as FrameworkData;
const EN = tw108en as FrameworkData;
const ALL = [ZH, EN];
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
const byCode = (d: FrameworkData, subject: string, code: string) => d.statements.find((s) => s.subject === subject && s.code === code);

test.describe("Taiwan: the data", () => {
  test("ids are unique and each names its own framework, even though one id is the start of the other", () => {
    for (const [d, fw] of [
      [ZH, "tw-108-zh"],
      [EN, "tw-108-en"],
    ] as const) {
      const ids = d.statements.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(new RegExp(`^${fw}-[0-9a-f]{10}$`));
        expect(frameworkOf(id), id).toBe(fw);
      }
    }
  });

  test("Chinese and English sources hold the subjects each publishes", () => {
    expect([...new Set(ZH.statements.map((s) => s.subject))].sort()).toEqual(["Mandarin", "Mathematics"]);
    expect([...new Set(EN.statements.map((s) => s.subject))].sort()).toEqual(["English", "Science"]);
  });

  test("every statement has a full code, text and ages the framework covers", () => {
    for (const [d, fw] of [
      [ZH, "tw-108-zh"],
      [EN, "tw-108-en"],
    ] as const) {
      for (const s of d.statements) {
        // Category, stage (I to V, "Vc" for senior high required science) or
        // grade (maths content, 1 to 10, 11A, 11B), serial number.
        expect(s.code, s.text).toMatch(/^([1-9]|[A-Za-z]{1,3})-(I|II|III|IV|V|Vc|[1-9]|10|11A|11B)-[0-9]{1,2}$/);
        expect(s.text.length, s.code).toBeGreaterThanOrEqual(3);
        expect(s.ages.length).toBeGreaterThan(0);
        for (const a of s.ages) expect(FRAMEWORK_AGES[fw]).toContain(a);
      }
    }
  });

  test("no serial number is missing: each category, stage or grade runs 1, 2, 3 ... with no gap", () => {
    for (const d of ALL) {
      const runs: Record<string, number[]> = {};
      for (const s of d.statements) (runs[`${s.subject} ${s.code.replace(/-[0-9]+$/, "")}`] ??= []).push(Number(s.code.split("-").pop()));
      for (const [run, ns] of Object.entries(runs)) {
        expect(
          ns.sort((a, b) => a - b),
          run,
        ).toEqual(Array.from({ length: ns.length }, (_, i) => i + 1));
      }
    }
  });

  test("ages follow the stage: I = Grades 1 and 2 (6, 7) ... V = Grades 10 to 12; maths content by grade", () => {
    const stageAges: Record<string, number[]> = { I: [6, 7], II: [8, 9], III: [10, 11], IV: [12, 13, 14], V: [15, 16, 17], Vc: [15, 16, 17] };
    for (const d of ALL) {
      for (const s of d.statements) {
        const stage = s.code.split("-")[1];
        if (stageAges[stage]) expect(s.ages, s.code).toEqual(stageAges[stage]);
        else if (stage === "11A" || stage === "11B") expect(s.ages, s.code).toEqual([16]);
        else expect(s.ages, s.code).toEqual([Number(stage) + 5]);
      }
    }
    // A shifted band would fail here: Grade 3's content is age 8 only.
    expect(byCode(ZH, "Mathematics", "N-3-10")!.ages).toEqual([8]);
    expect(byCode(ZH, "Mathematics", "n-II-1")!.ages).toEqual([8, 9]);
  });

  test("counts per subject and age are pinned to the build", () => {
    const count = (d: FrameworkData) => {
      const c: Record<string, Record<number, number>> = {};
      for (const s of d.statements) for (const a of s.ages) ((c[s.subject] ??= {})[a] = (c[s.subject][a] ?? 0) + 1);
      return c;
    };
    expect(ZH.statements.length).toBe(724);
    expect(EN.statements.length).toBe(997);
    expect(count(ZH)).toEqual({
      Mandarin: { 6: 59, 7: 59, 8: 79, 9: 79, 10: 74, 11: 74, 12: 62, 13: 62, 14: 62, 15: 57, 16: 57, 17: 57 },
      Mathematics: { 6: 25, 7: 38, 8: 44, 9: 46, 10: 51, 11: 43, 12: 63, 13: 67, 14: 57, 15: 58, 16: 70, 17: 35 },
    });
    expect(count(EN)).toEqual({
      English: { 8: 50, 9: 50, 10: 88, 11: 88, 12: 116, 13: 116, 14: 116, 15: 147, 16: 147, 17: 147 },
      Science: { 8: 75, 9: 75, 10: 92, 11: 92, 12: 246, 13: 246, 14: 246, 15: 183, 16: 183, 17: 183 },
    });
  });

  test("known statements, word for word, with their code, strand and ages", () => {
    const known: [FrameworkData, { subject: string; code: string; strand: string; ages: number[]; text: string }][] = [
      [ZH, { subject: "Mandarin", code: "1-I-1", strand: "學習表現 聆聽", ages: [6, 7], text: "養成專心聆聽的習慣，尊重對方的發言。" }],
      [ZH, { subject: "Mandarin", code: "Ab-II-6", strand: "學習內容 字詞", ages: [8, 9], text: "2,000個常用語詞的使用。" }],
      [
        ZH,
        {
          subject: "Mandarin",
          code: "Ad-V-3",
          strand: "學習內容 篇章",
          ages: [15, 16, 17],
          text: "韻文：如辭賦、古體詩、樂府詩、近體詩、詞、散曲、戲曲等。",
        },
      ],
      [
        ZH,
        {
          subject: "Mathematics",
          code: "n-II-6",
          strand: "學習表現 數與量",
          ages: [8, 9],
          text: "理解同分母分數的加、減、整數倍的意義、計算與應用。認識等值分數的意義，並應用於認識簡單異分母分數之比較與加減的意義。",
        },
      ],
      [
        ZH,
        {
          subject: "Mathematics",
          code: "N-1-1",
          strand: "學習內容 數與量",
          ages: [6],
          text: "一百以內的數：含操作活動。用數表示多少與順序。結合數數、位值表徵、位值表。位值單位「個」和「十」。位值單位換算。認識0的位值意義。",
        },
      ],
      [
        EN,
        {
          subject: "English",
          code: "2-II-1",
          strand: "Learner performance: Language proficiency in speaking",
          ages: [8, 9],
          text: "Can say the 26 letters of the English alphabet.",
        },
      ],
      [EN, { subject: "English", code: "Aa-II-1", strand: "Learning content: Linguistic knowledge, alphabet", ages: [8, 9], text: "Names of letters." }],
      [
        EN,
        {
          subject: "Science",
          code: "INa-II-1",
          strand: "Learning content: Matter and energy",
          ages: [8, 9],
          text: "The natural world (including biotic and abiotic) is made up of different substances.",
        },
      ],
      [
        EN,
        {
          subject: "Science",
          code: "BDa-Vc-1",
          strand: "Learning content: Biology, Structure and function of organisms",
          ages: [15, 16, 17],
          text: "Different cells have different functions, morphologies, and structures.",
        },
      ],
      [
        EN,
        {
          subject: "Science",
          code: "Nc-IV-6",
          strand: "Learning content: Resources and sustainable development",
          ages: [12, 13, 14],
          text: "The current situation and future prospects of Taiwan's energy use.",
        },
      ],
    ];
    for (const [d, k] of known) {
      const s = byCode(d, k.subject, k.code);
      expect(s, k.code).toBeTruthy();
      expect({ subject: s!.subject, code: s!.code, strand: s!.strand, ages: s!.ages, text: s!.text }).toEqual(k);
    }
  });

  test("symbols the PDF draws or sets small are written in: √, exponents, ×", () => {
    const text = (code: string) => byCode(ZH, "Mathematics", code)!.text;
    expect(text("S-9-4")).toContain("「1:√3:2」");
    expect(text("S-9-4")).toContain("「1:1:√2」");
    expect(text("G-8-1")).toContain("𝐴̅𝐵̅=√((𝑎−𝑐)²+(𝑏−𝑑)²)");
    expect(text("N-7-7")).toContain("𝑎ᵐ×𝑎ⁿ=𝑎ᵐ⁺ⁿ");
    expect(text("N-10-4")).toContain("10ˣ鍵");
    expect(text("S-7-2")).toContain("3×3×3的正方體");
    for (const d of ALL) for (const s of d.statements) expect(s.text, s.code).not.toMatch(/[-豈-﫿\u0000-\u001f]/);
  });

  test("never a statement: senior high electives, the repeated maths listing, the marks ◎ * ※ ★ ＃, headers", () => {
    // Maths electives (12甲, 12乙) and science electives ("Va") are left out.
    for (const d of ALL) for (const s of d.statements) expect(s.code, s.code).not.toMatch(/^[A-Za-z]+-12|-Va-/);
    // The maths performances are listed twice (by stage, by category): once here.
    expect(ZH.statements.filter((s) => s.code === "n-I-1")).toHaveLength(1);
    for (const d of ALL) {
      for (const s of d.statements) {
        expect(s.text, s.code).not.toMatch(/[◎※★＃]|^\*/);
        expect(s.text, s.code).not.toMatch(/學習階段$|學習表現|Learning Contents?$|Learner Performance|Stage (II|III|IV|V)$/);
      }
    }
  });

  test("text is clean: no dashes, no doubled spaces, no space between two Chinese characters", () => {
    for (const d of ALL) {
      for (const s of d.statements) {
        expect(s.text, s.code).not.toMatch(DASHES);
        expect(s.text, s.code).not.toMatch(/\s{2,}|^\s|\s$/);
        expect(s.text, s.code).not.toMatch(/\p{Script=Han} \p{Script=Han}/u);
      }
    }
  });

  test("each file carries the credit the card shows, naming NAER's declaration and the edit", () => {
    expect(ZH.source.credit).toBe(FRAMEWORK_CREDIT["tw-108-zh"]);
    expect(EN.source.credit).toBe(FRAMEWORK_CREDIT["tw-108-en"]);
    for (const c of [FRAMEWORK_CREDIT["tw-108-zh"], FRAMEWORK_CREDIT["tw-108-en"]]) {
      expect(c).toContain("https://www.naer.edu.tw/PageDoc?fid=324");
      expect(c).toContain("edited");
    }
    expect(FRAMEWORK_CREDIT["tw-108-en"]).toContain("official English translation");
  });
});

test.describe("Taiwan: every statement is in its PDF", () => {
  test.setTimeout(240_000);
  const FILES: [FrameworkData, string][] = [
    [ZH, "docs/standards/taiwan/naer-mandarin-zh.pdf"],
    [ZH, "docs/standards/taiwan/naer-maths-zh.pdf"],
    [EN, "docs/standards/taiwan/naer-english-en.pdf"],
    [EN, "docs/standards/taiwan/naer-science-en.pdf"],
  ];
  test.skip(!FILES.every(([, f]) => existsSync(f)), "source PDFs not present");

  test("word for word, read in pdf.js reading order with every space taken out", async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const read = async (f: string) => {
      const pdf = await getDocumentProxy(new Uint8Array(readFileSync(f)));
      const { text } = await extractText(pdf, { mergePages: false });
      return text.map((t) => t.normalize("NFC").replace(/[\s\u0000-\u001f]/g, "").replace(//g, "×"));
    };
    const zhPages = [...(await read(FILES[0][1])), ...(await read(FILES[1][1]))];
    const enPages = [...(await read(FILES[2][1])), ...(await read(FILES[3][1]))];
    // Written in by the build, not in the text layer: superscripts, the √ of
    // S-9-4, G-8-1's bar and brackets. Those statements are checked piece by
    // piece between them. A statement may run over a page turn, so each
    // piece is looked for on one page and the next together.
    const WRITTEN_IN = /[⁰¹²³⁴-⁹⁺⁻ᵃ-ᶻⁱⁿˣʸ]+|√|̅|\(\(|\)\)/u;
    // pdf.js reads a table row by row, so a statement's lines can have the
    // next column's lines between them. Each line still reads straight
    // through: the statement must be found as runs of at least four
    // characters (or what is left), one after another, in order.
    const inOrder = (page: string, t: string) => {
      let at = 0;
      let i = 0;
      while (i < t.length) {
        let best = 0;
        let where = -1;
        for (let j = t.length; j > i; j--) {
          const k = page.indexOf(t.slice(i, j), at);
          if (k >= 0) {
            best = j - i;
            where = k;
            break;
          }
        }
        if (where < 0 || best < Math.min(4, t.length - i)) return false;
        at = where + best;
        i += best;
      }
      return true;
    };
    const found = (pages: string[], t: string) => {
      const pieces = t.replace(/\s/g, "").split(WRITTEN_IN).filter(Boolean);
      return pages.some((p, i) => {
        const two = p + (pages[i + 1] ?? "");
        return pieces.every((piece) => inOrder(two, piece));
      });
    };
    // Fixed from the rendered page (TW_FIX in the builder, which also stops
    // if the text it reads for them changes): S-9-4's "1:3:2" is drawn right
    // to left around two lost √, and G-8-1's formula is rebuilt.
    const FIXED = new Set(["G-8-1", "S-9-4"]);
    const missingZh = ZH.statements.filter((s) => !FIXED.has(s.code) && !found(zhPages, s.text)).map((s) => `${s.code} ${s.text}`);
    expect(ZH.statements.filter((s) => FIXED.has(s.code))).toHaveLength(2);
    // In English a word is sometimes set in two pieces with a hyphen or a
    // line end between them; spaces are out on both sides, so only the
    // build's own joins could differ.
    const missingEn = EN.statements.filter((s) => !found(enPages, s.text)).map((s) => `${s.code} ${s.text}`);
    expect(missingZh).toEqual([]);
    expect(missingEn).toEqual([]);
  });

  test("nothing is left out: every code the guidelines print is a statement, electives aside", async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const roman: Record<string, string> = { "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V" };
    for (const [d, file] of FILES) {
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(readFileSync(file))), { mergePages: true });
      const flat = text.replace(/[\s\u0000-\u001f*◎]/g, "").replace(/[ⅠⅡⅢⅣⅤ]/g, (c) => roman[c]);
      const printed = new Set(
        [...flat.matchAll(/(?<![A-Za-z0-9])([1-9]|IN[a-g]|[BPCE]?[A-N][a-f]?|[nsgrafd]|t[ircm]|p[oeac]|a[ihn]|[NSGRAFD])-(IV|V|III|II|I|Vc|[1-9]|10|11A|11B)-([0-9]{1,2})(?![0-9])/g)].map(
          (m) => `${m[1]}-${m[2]}-${m[3]}`,
        ),
      );
      const subject = file.includes("mandarin") ? "Mandarin" : file.includes("maths") ? "Mathematics" : file.includes("english") ? "English" : "Science";
      const have = new Set(d.statements.filter((s) => s.subject === subject).map((s) => s.code));
      // Mandarin's codes are digits or two letters; the English guideline's
      // too; maths and science have their own letters.
      const own = (c: string) =>
        subject === "Mandarin" || subject === "English" ? /^([1-9]|[A-E][a-e]?)-/.test(c) : subject === "Mathematics" ? /^[nsgrafdNSGRAFD]-/.test(c) : !/^[1-9]-/.test(c);
      // With spaces out, a code can run into the number its statement starts
      // with ("Ab-Ⅰ-1" "1,000個..." reads "Ab-I-11"): one digit less is it.
      const missing = [...printed].filter((c) => own(c) && !have.has(c) && !have.has(c.slice(0, -1)));
      expect(missing, file).toEqual([]);
      expect(printed.size, file).toBeGreaterThan(100);
    }
  });

  test("the category names the strands use are the guidelines' own", async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const all = async (f: string) => {
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(readFileSync(f))), { mergePages: true });
      return text.normalize("NFC").replace(/[\s\u0000-\u001f]/g, "").replace(new RegExp(DASHES.source, "g"), "-");
    };
    for (const [d, file] of FILES) {
      const source = await all(file);
      const subjectOfFile = file.includes("mandarin") ? "Mandarin" : file.includes("maths") ? "Mathematics" : file.includes("english") ? "English" : "Science";
      const names = new Set(
        d.statements
          .filter((s) => s.subject === subjectOfFile)
          .flatMap((s) => s.strand.replace(/^(學習表現|學習內容|Learner performance:|Learning performance:|Learning content:) ?/, "").split(", ")),
      );
      // "Linguistic knowledge, alphabet" names a category and a subcategory:
      // the source prints each in its own cell ("a. Alphabet"), so compare
      // without case. "Biology, ..." names the subject heading ("i. Biology").
      const lower = source.toLowerCase();
      const missing = [...names].filter((n) => !lower.includes(n.replace(/\s/g, "").toLowerCase()));
      expect(missing, file).toEqual([]);
    }
  });
});

test.describe("Taiwan: the curriculum uses it", () => {
  test("Taiwan aligns to both frameworks, permitted, at every year it lists", () => {
    const c = getCurriculum("taiwan")!;
    expect(c.alignment).toEqual({ frameworks: ["tw-108-zh", "tw-108-en"], adapted: false });
    expect(FRAMEWORK_PERMITTED["tw-108-zh"]).toBe(true);
    expect(FRAMEWORK_PERMITTED["tw-108-en"]).toBe(true);
    expect(alignmentMode("taiwan")).toBe("standards");
    expect(alignmentYears(c).map((y) => y.label)).toEqual(c.years.map((y) => y.label));
  });

  test("every year has its core subjects: Mandarin and maths throughout, English and science from Grade 3", () => {
    const c = getCurriculum("taiwan")!;
    for (const y of c.years) {
      const subjects = new Set(statementsForAge(ALL, y.age).map((s) => s.subject));
      const expected = y.age >= 8 ? ["English", "Mandarin", "Mathematics", "Science"] : ["Mandarin", "Mathematics"];
      expect([...subjects].sort(), y.label).toEqual(expected);
    }
    expect(c.years.find((y) => y.label === "Grade 1")?.age).toBe(6);
    expect(c.years.find((y) => y.label === "Grade 12")?.age).toBe(17);
    expect(frameworksForYear(c, "Grade 1")).toEqual(["tw-108-zh"]);
    expect(frameworksForYear(c, "Grade 8")).toEqual(["tw-108-zh", "tw-108-en"]);
  });

  test("the card sends the ticked statements, with their codes, and names the guidelines", () => {
    const picked = statementsForAge(ALL, 13).filter((s) => s.subject === "Mathematics").slice(0, 2);
    const p = alignParamFor("taiwan", true, "Grade 8", { subject: "", strand: "" }, picked)!;
    expect(p).toMatchObject({ countryName: "Taiwan", year: "Grade 8", subject: "Mathematics" });
    expect(p.curriculumName).toBe("Curriculum Guidelines of 12-Year Basic Education");
    expect(p.statements.map((s) => s.id)).toEqual(picked.map((s) => s.id));
    expect(p.statements[0].text.startsWith(`${picked[0].code}: `)).toBe(true);
  });

  test("with permission off, nothing is listed or sent", () => {
    const saved = { ...FRAMEWORK_PERMITTED };
    (FRAMEWORK_PERMITTED as Record<string, boolean>)["tw-108-zh"] = false;
    (FRAMEWORK_PERMITTED as Record<string, boolean>)["tw-108-en"] = false;
    try {
      expect(alignmentMode("taiwan")).toBe("none");
      const picked = statementsForAge(ALL, 13).slice(0, 1);
      expect(alignParamFor("taiwan", true, "Grade 8", { subject: "", strand: "" }, picked)).toBeUndefined();
    } finally {
      Object.assign(FRAMEWORK_PERMITTED, saved);
    }
  });

  test("the card says which statements are in Chinese; the English ones need no note", () => {
    const note = FRAMEWORK_LANGUAGE_NOTE["tw-108-zh"]!;
    expect(note).toContain("Chinese");
    expect(note).toContain("Mandarin and mathematics");
    expect(note).not.toMatch(new RegExp(`${DASHES.source}|\\bAI\\b`));
    expect(FRAMEWORK_LANGUAGE_NOTE["tw-108-en"]).toBeUndefined();
  });

  test("the terms page credits both", () => {
    const terms = readFileSync("app/terms/page.tsx", "utf8");
    expect(terms).toMatch(/FRAMEWORK_CREDIT\["tw-108-zh"\]/);
    expect(terms).toMatch(/FRAMEWORK_CREDIT\["tw-108-en"\]/);
  });
});

test.describe("Taiwan: the topic matcher", () => {
  const g8 = statementsForAge(ALL, 13);
  const subjects = [...new Set(g8.map((s) => s.subject))];

  test("a typed subject picks its subject, in English or in Chinese", () => {
    expect(matchingSubjects("Maths", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("數學", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("Mandarin", subjects)).toEqual(["Mandarin"]);
    expect(matchingSubjects("Chinese", subjects)).toEqual(["Mandarin"]);
    expect(matchingSubjects("國語", subjects)).toEqual(["Mandarin"]);
    expect(matchingSubjects("國文", subjects)).toEqual(["Mandarin"]);
    expect(matchingSubjects("English", subjects)).toEqual(["English"]);
    expect(matchingSubjects("英文", subjects)).toEqual(["English"]);
    expect(matchingSubjects("Science", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("自然", subjects)).toEqual(["Science"]);
  });

  test("in England, Mandarin and Chinese still mean modern languages", () => {
    expect(matchingSubjects("Mandarin", ["Languages", "Mathematics"])).toEqual(["Languages"]);
    expect(matchingSubjects("Chinese", ["Languages", "Mathematics"])).toEqual(["Languages"]);
  });

  test("an English topic on Chinese statements still gets a capped, non-empty list of the subject", () => {
    const list = capCandidates(filterBySubject(g8, "Maths", "Pythagoras"), "Pythagoras");
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(list.every((s) => s.subject === "Mathematics")).toBe(true);
  });
});

test.describe("Taiwan: statements in Chinese never set the output language", () => {
  const rules = worksheetCurriculumRules("Grade 8");

  test("Chinese statements get the line: content and level only, write in the output language", () => {
    const block = curriculumPromptBlock(
      { curriculumName: "Curriculum Guidelines of 12-Year Basic Education", subject: "Mathematics", statements: [{ text: "n-IV-1: 理解因數、倍數、質數、最大公因數、最小公倍數的意義及熟練其計算，並能應用於日常生活。" }] },
      "Grade 8",
      "worksheet",
      rules,
    );
    expect(block).toContain("The statements above are quoted in the curriculum's own language.");
    expect(block).not.toMatch(/\b(Chinese|Mandarin)\b/);
  });

  test("Taiwan's English statements get no such line", () => {
    const block = curriculumPromptBlock(
      { curriculumName: "Curriculum Guidelines of 12-Year Basic Education", subject: "Science", statements: [{ text: "INa-II-1: The natural world (including biotic and abiotic) is made up of different substances." }] },
      "Grade 3",
      "worksheet",
      rules,
    );
    expect(block).not.toContain("own language");
  });
});
