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
import jpCos from "@/app/lib/standards/data/jp-cos.json";

/*
 * Statements under open government licences, in the source's own language
 * (owner, 2026-11-28: official text only, never a translation by Jooma).
 * Built by scripts/build-asia-standards.mjs.
 *
 *   jp-cos  Japan: Course of Study (MEXT), 2017 elementary and junior high,
 *           2018 senior high (compulsory first courses only), in Japanese.
 *
 * Checked here: the shape and counts, known statements word for word, what
 * must never be a statement, every statement against its PDF (read a second,
 * independent way: pdf.js reading order, furigana and all), and how the
 * curriculum, the card, the matcher and the prompt use it.
 *
 * No en or em dash is written in this file.
 */

const JP = jpCos as FrameworkData;

test.describe("Japan: the data", () => {
  test("ids are unique and each names its framework", () => {
    const ids = JP.statements.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^jp-cos-[0-9a-f]{10}$/);
      expect(frameworkOf(id)).toBe("jp-cos");
    }
  });

  test("every statement is complete, in the four core subjects, at ages the framework covers", () => {
    for (const s of JP.statements) {
      expect(["Japanese", "Mathematics", "Science", "English"]).toContain(s.subject);
      expect(s.code).toBe("");
      // Some English items are one word: コンマ (comma), 連語 (collocations).
      expect(s.text.length).toBeGreaterThanOrEqual(2);
      expect(s.ages.length).toBeGreaterThan(0);
      for (const a of s.ages) expect(FRAMEWORK_AGES["jp-cos"]).toContain(a);
    }
  });

  test("counts per subject and age are pinned to the build", () => {
    const counts: Record<string, Record<number, number>> = {};
    for (const s of JP.statements) for (const a of s.ages) ((counts[s.subject] ??= {})[a] = (counts[s.subject][a] ?? 0) + 1);
    expect(JP.statements.length).toBe(865);
    expect(counts).toEqual({
      Japanese: { 6: 31, 7: 31, 8: 33, 9: 33, 10: 35, 11: 35, 12: 28, 13: 28, 14: 25, 15: 41, 16: 41, 17: 41 },
      Mathematics: { 6: 25, 7: 30, 8: 42, 9: 49, 10: 43, 11: 27, 12: 34, 13: 30, 14: 34, 15: 25, 16: 25, 17: 25 },
      Science: { 8: 23, 9: 25, 10: 24, 11: 31, 12: 85, 13: 85, 14: 85, 15: 74, 16: 74, 17: 74 },
      English: { 8: 6, 9: 6, 10: 14, 11: 14, 12: 14, 13: 14, 14: 14, 15: 14, 16: 14, 17: 14 },
    });
  });

  test("known statements, word for word, at the right ages and strands", () => {
    const known = [
      { subject: "Japanese", strand: "〔知識及び技能〕", ages: [6, 7], text: "文の中における主語と述語との関係に気付くこと。" },
      { subject: "Mathematics", strand: "Ｃ 測定", ages: [6], text: "日常生活の中で時刻を読むこと。" },
      {
        subject: "Science",
        strand: "第１分野 身近な物理現象",
        ages: [12, 13, 14],
        text: "光の反射・屈折：光の反射や屈折の実験を行い，光が水やガラスなどの物質の境界面で反射，屈折するときの規則性を見いだして理解すること。",
      },
      {
        subject: "Science",
        strand: "地学基礎 地球のすがた",
        ages: [15, 16, 17],
        text: "プレートの運動：プレートの分布と運動について理解するとともに，大地形の形成と地質構造をプレートの運動と関連付けて理解すること。",
      },
      { subject: "Mathematics", strand: "数学Ⅰ 数と式", ages: [15, 16, 17], text: "数を実数まで拡張する意義を理解し，簡単な無理数の四則計算をすること。" },
      {
        subject: "English",
        strand: "外国語 〔知識及び技能〕 英語の特徴やきまりに関する事項",
        ages: [10, 11],
        text: "慣用表現のうち，excuse me，I see，I'm sorry，thank you，you're welcome などの活用頻度の高い基本的なもの",
      },
    ];
    for (const k of known) {
      const s = JP.statements.find((x) => x.text === k.text);
      expect(s, k.text).toBeTruthy();
      expect({ subject: s!.subject, strand: s!.strand, ages: s!.ages, text: s!.text }).toEqual(k);
    }
  });

  test("pictures in the PDF are written in: fractions, superscripts and formulas", () => {
    const has = (t: string) => JP.statements.some((s) => s.text === t);
    expect(has("1/2，1/3など簡単な分数について知ること。")).toBe(true);
    expect(has("ある数の 10 倍，100 倍，1000 倍，1/10，1/100などの大きさの数を，小数点の位置を移してつくること。")).toBe(true);
    expect(has("面積の単位（平方センチメートル（cm²），平方メートル（m²），平方キロメートル（km²））について知ること。")).toBe(true);
    expect(
      has(
        "簡単な一次式の乗法の計算及び次の公式を用いる簡単な式の展開や因数分解をすること。（a＋b）²＝a²＋2ab＋b²（a－b）²＝a²－2ab＋b²（a＋b）（a－b）＝a²－b²（x＋a）（x＋b）＝x²＋（a＋b）x＋ab",
      ),
    ).toBe(true);
    for (const s of JP.statements) expect(s.text, s.text).not.toMatch(/[\u{FFFC}\u0000-\u001f]|\[\?\]/u);
  });

  test("never a statement: goals, lead-ins, example activities, handling notes, furigana, other courses", () => {
    const texts = JP.statements.map((s) => s.text);
    // Lead-ins that only introduce a list.
    expect(texts.filter((t) => /^次のような/.test(t) || /指導する。$/.test(t))).toEqual([]);
    // Goals (１ 目標) aim at abilities ("...を養う。", "...目指す。").
    expect(texts.filter((t) => /を養う。$|目指す。$/.test(t))).toEqual([]);
    // Example language activities (Elementary 1 and 2 Japanese, ⑵ ア) and mathematical activities.
    expect(texts).not.toContain("紹介や説明，報告など伝えたいことを話したり，それらを聞いて声に出して確かめたり感想を述べたりする活動。");
    expect(texts.filter((t) => /活動。?$/.test(t) && /^身の回りの事象を観察したり/.test(t))).toEqual([]);
    // The situations and functions lists of the English language activities.
    expect(texts.filter((t) => /^特有の表現がよく使われる場面/.test(t))).toEqual([]);
    // Furigana is dropped: 拗音, not 拗よう音.
    expect(texts.some((t) => t.includes("長音，拗音，促音，撥音"))).toBe(true);
    expect(texts.some((t) => /拗よう|撥はつ/.test(t))).toBe(false);
    // Senior high: only the compulsory first courses, never the advanced ones.
    const courses = new Set(JP.statements.filter((s) => s.ages.includes(15)).map((s) => s.strand.split(" ")[0]));
    expect([...courses].sort()).toEqual(["化学基礎", "地学基礎", "数学Ⅰ", "物理基礎", "現代の国語", "生物基礎", "科学と人間生活", "英語コミュニケーションⅠ", "言語文化"].sort());
  });

  test("text is clean: no dashes, no doubled spaces, no stray spaces in Japanese", () => {
    const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    for (const s of JP.statements) {
      expect(s.text, s.text).not.toMatch(DASHES);
      expect(s.text, s.text).not.toMatch(/\s{2,}|^\s|\s$/);
      // A space only next to Latin letters or digits ("be 動詞", "10 倍"), never between two Japanese characters.
      expect(s.text, s.text).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}] [\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
    }
  });

  test("the file carries the credit the card shows", () => {
    expect(JP.source.credit).toBe(FRAMEWORK_CREDIT["jp-cos"]);
    expect(FRAMEWORK_CREDIT["jp-cos"]).toContain("Government of Japan Standard Terms of Use (Ver. 2.0)");
    expect(FRAMEWORK_CREDIT["jp-cos"]).toContain("edited");
  });
});

test.describe("Japan: every statement is in its PDF", () => {
  test.setTimeout(240_000);
  const FILES = ["mext-cos-01.pdf", "mext-cos-02.pdf", "mext-cos-03.pdf"].map((f) => `docs/standards/japan/${f}`);
  test.skip(!FILES.every(existsSync), "source PDFs not present");

  test("word for word, read in pdf.js reading order (furigana may follow a kanji there)", async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");
    let source = "";
    for (const f of FILES) {
      const pdf = await getDocumentProxy(new Uint8Array(readFileSync(f)));
      const { text } = await extractText(pdf, { mergePages: true });
      source += "|" + text.replace(/[\s\u0000-\u001f]/g, "");
    }
    const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // In reading order a kanji's furigana follows it ("拗よう音"), so up to four
    // hiragana may sit after any kanji.
    const pattern = (t: string) => new RegExp([...t].map((c) => (/\p{Script=Han}/u.test(c) ? `${esc(c)}[ぁ-ゖ]{0,4}` : esc(c))).join(""), "u");
    // Not in the text layer, written in by the build (see JP_FIX and the
    // superscripts): checked piece by piece around them. A title joins its
    // description with a colon the source does not print.
    const pieces = (t: string) => t.replace(/\s/g, "").split("：").flatMap((p) => p.split(/[²³ⁿ]|1\/10{0,2}|1\/[23]/)).filter(Boolean);
    // One statement runs over a page break in reading order (page number and
    // running head between "見" and "いだして").
    const ACROSS_A_PAGE = new Set(["jp-cos-eafce70f4e"]);
    const missing = JP.statements.filter((s) => !ACROSS_A_PAGE.has(s.id) && !pieces(s.text).every((p) => pattern(p).test(source)));
    expect(missing.map((s) => s.text)).toEqual([]);
    expect(JP.statements.some((s) => ACROSS_A_PAGE.has(s.id))).toBe(true);
  });
});

test.describe("Japan: the curriculum uses it", () => {
  test("Japan aligns to the Course of Study, permitted, at every year it lists", () => {
    const c = getCurriculum("japan")!;
    expect(c.alignment).toEqual({ frameworks: ["jp-cos"], adapted: false });
    expect(FRAMEWORK_PERMITTED["jp-cos"]).toBe(true);
    expect(alignmentMode("japan")).toBe("standards");
    expect(alignmentYears(c).map((y) => y.label)).toEqual(c.years.map((y) => y.label));
  });

  test("every year has its core subjects: Japanese and maths throughout, science and English from Elementary 3", () => {
    const c = getCurriculum("japan")!;
    for (const y of c.years) {
      const subjects = new Set(statementsForAge([JP], y.age).map((s) => s.subject));
      const expected = y.age >= 8 ? ["English", "Japanese", "Mathematics", "Science"] : ["Japanese", "Mathematics"];
      expect([...subjects].sort(), y.label).toEqual(expected);
    }
  });

  test("Elementary 1 is age 6 and Senior High 3 is 17, so a year never gets its neighbour's statements", () => {
    const c = getCurriculum("japan")!;
    expect(c.years.find((y) => y.label === "Elementary 1")?.age).toBe(6);
    expect(c.years.find((y) => y.label === "Senior High 3")?.age).toBe(17);
    expect(frameworksForYear(c, "Elementary 1")).toEqual(["jp-cos"]);
    // Grade 2's fractions are not Grade 1's.
    const e1 = statementsForAge([JP], 6).map((s) => s.text);
    expect(e1).not.toContain("1/2，1/3など簡単な分数について知ること。");
    expect(statementsForAge([JP], 7).map((s) => s.text)).toContain("1/2，1/3など簡単な分数について知ること。");
  });

  test("the card sends the ticked statements and names the framework", () => {
    const picked = statementsForAge([JP], 9).filter((s) => s.subject === "Mathematics").slice(0, 2);
    const p = alignParamFor("japan", true, "Elementary 4", { subject: "", strand: "" }, picked)!;
    expect(p).toMatchObject({ countryId: "jp", countryName: "Japan", year: "Elementary 4", subject: "Mathematics" });
    expect(p.curriculumName).toBe("Course of Study (MEXT)");
    expect(p.statements.map((s) => s.text)).toEqual(picked.map((s) => s.text));
  });

  test("with permission off, nothing is listed or sent", () => {
    const saved = FRAMEWORK_PERMITTED["jp-cos"];
    (FRAMEWORK_PERMITTED as Record<string, boolean>)["jp-cos"] = false;
    try {
      expect(alignmentMode("japan")).toBe("none");
      const picked = statementsForAge([JP], 9).slice(0, 1);
      expect(alignParamFor("japan", true, "Elementary 4", { subject: "", strand: "" }, picked)).toBeUndefined();
    } finally {
      (FRAMEWORK_PERMITTED as Record<string, boolean>)["jp-cos"] = saved;
    }
  });

  test("the card says the statements are in Japanese, with no dash and no 'AI'", () => {
    const note = FRAMEWORK_LANGUAGE_NOTE["jp-cos"]!;
    expect(note).toContain("Japanese");
    expect(note).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]|\\bAI\\b`));
    expect(FRAMEWORK_LANGUAGE_NOTE["ccss-math"]).toBeUndefined();
  });

  test("the terms page credits it", () => {
    expect(readFileSync("app/terms/page.tsx", "utf8")).toMatch(/FRAMEWORK_CREDIT\["jp-cos"\]/);
  });
});

test.describe("Japan: the topic matcher", () => {
  const jh2 = statementsForAge([JP], 13);

  test("a typed subject picks its subject, in English or in Japanese", () => {
    const subjects = [...new Set(jh2.map((s) => s.subject))];
    expect(matchingSubjects("Maths", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("数学", subjects)).toEqual(["Mathematics"]);
    expect(matchingSubjects("Science", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("理科", subjects)).toEqual(["Science"]);
    expect(matchingSubjects("Japanese", subjects)).toEqual(["Japanese"]);
    expect(matchingSubjects("国語", subjects)).toEqual(["Japanese"]);
    expect(matchingSubjects("English", subjects)).toEqual(["English"]);
    expect(matchingSubjects("英語", subjects)).toEqual(["English"]);
    expect(matchingSubjects("算数", [...new Set(statementsForAge([JP], 9).map((s) => s.subject))])).toEqual(["Mathematics"]);
  });

  test("in England, Japanese still means modern languages", () => {
    expect(matchingSubjects("Japanese", ["Languages", "Mathematics"])).toEqual(["Languages"]);
  });

  test("an English topic shares no words with Japanese text, and still gets a capped, non-empty list", () => {
    const list = capCandidates(filterBySubject(jh2, "Science", "photosynthesis"), "photosynthesis");
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(list.every((s) => s.subject === "Science")).toBe(true);
  });
});

test.describe("statements in the school's own language never set the output language", () => {
  const rules = worksheetCurriculumRules("Elementary 4");

  test("Japanese statements get the line: content and level only, write in the output language", () => {
    const block = curriculumPromptBlock(
      { curriculumName: "Course of Study (MEXT)", subject: "Mathematics", statements: [{ text: "日常生活の中で時刻を読むこと。" }] },
      "Elementary 4",
      "worksheet",
      rules,
    );
    expect(block).toContain("The statements above are quoted in the curriculum's own language.");
    expect(block).toMatch(/write the whole worksheet in the output language/);
    expect(block).not.toMatch(/\bJapanese\b/);
  });

  test("English statements get no such line, so every other curriculum's prompt is unchanged", () => {
    const block = curriculumPromptBlock(
      { curriculumName: "Common Core State Standards for Mathematics", statements: [{ text: "3.NBT.A.1: Use place value understanding to round whole numbers." }] },
      "Grade 3",
      "worksheet",
      rules,
    );
    expect(block).not.toContain("own language");
  });
});
