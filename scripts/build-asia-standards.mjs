#!/usr/bin/env node
/**
 * Builds the statements the "Align to curriculum" card offers to teachers in
 * Japan and Taiwan, from the official texts under open government licences.
 *
 *   node scripts/build-asia-standards.mjs --country=japan [--debug=<stage>:<subject>]
 *   node scripts/build-asia-standards.mjs --country=taiwan
 *
 * Reads the fixed source copies in docs/standards/<country>/ and writes
 * app/lib/standards/data/<framework>.json, plus a count report on stdout. The
 * JSON is committed; run this again only when a source changes. Never
 * hand-edit the JSON: fix this script. Sources, sha256 and decisions are in
 * docs/curricula-open-statements-build.md.
 *
 * Do NOT import scripts/build-standards.mjs: it runs its whole build at top
 * level and would rewrite the US and Australian data.
 *
 * Official text only (owner, 2026-11-28): a statement is the source's own
 * words, never a translation by Jooma. Japan has no official English for the
 * 2017-18 subject content, so its statements are Japanese. `subject` is an
 * English label (the matcher reads it); `strand` is the source's own heading.
 *
 * ── Japan: Course of Study (学習指導要領), MEXT
 * https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm (fetched 2026-11-28):
 *   mext-cos-01.pdf  小学校学習指導要領（平成29年告示）
 *   mext-cos-02.pdf  中学校学習指導要領（平成29年告示）
 *   mext-cos-03.pdf  高等学校学習指導要領（平成30年告示）
 * Licence: MEXT's site follows the Government of Japan Standard Terms of Use
 * 2.0 (commercial use allowed with the source named; an edited work must say
 * it was edited). Pulling single items out of the text is editing, so the
 * credit says so.
 *
 * What a statement is: a leaf of the numbered content list under "２ 内容"
 * (items ア, （ア）, ㋐ and so on, nested by their indent), for each grade or
 * grade band. Not statements: goals (１ 目標), the lead-ins that only introduce
 * a list ("次のような知識及び技能を身に付けること。"), the example language
 * activities (言語活動), 〔数学的活動〕, 〔用語・記号〕 and the handling notes
 * (３ 内容の取扱い). Furigana (half-size ruby), running heads, thumb tabs and
 * page numbers are dropped by size and position.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

const OUT = "app/lib/standards/data";
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").slice(name.length + 3);
const country = arg("country");
const debug = arg("debug");

// The en and em dash are built from their code points: the brand rule keeps
// them out of every file, this one included.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, "g");
const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const write = (name, data) => writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 1) + "\n");

/** A space between two pieces of text? Japanese and Chinese run on with no
 *  space. A Latin letter or digit keeps one from a word on either side ("be
 *  動詞", "文 a 単文"), but never next to a symbol or bracket ("（a＋b）²"). */
function spaced(a, b) {
  const last = a.slice(-1);
  const first = b.slice(0, 1);
  if (!last || !first || /\s/.test(last) || /\s/.test(first)) return false;
  const symbol = /[＋－＝×÷（）()［］「」，。、・：；,.;:!?'"＜＞≦≧/〜~²³ⁿ]/;
  if (symbol.test(last) || symbol.test(first)) return /[A-Za-z0-9][,.;:]$/.test(a) && /^[A-Za-z0-9]/.test(b);
  return /[A-Za-z0-9]/.test(last) || /[A-Za-z0-9]/.test(first);
}

/** Join two pieces of text from consecutive lines. */
function joinText(a, b) {
  if (!a) return b;
  return spaced(a, b) ? `${a} ${b}` : a + b;
}

/** Whitespace tidied, nothing else changed. A dash, if any, becomes a hyphen
 *  (the brand rule); the build reports how many. */
let dashesReplaced = 0;
function tidy(s) {
  const t = s.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return t.replace(DASHES, () => (dashesReplaced++, "-"));
}

// ── Reading a page into lines ───────────────────────────────────────────────

/** The body of a page in each MEXT book. Furigana is half size (5.5 pt
 *  against 11) and dropped; superscripts (the 2 of cm2) are 6.4 to 7.1 pt and kept.
 *  The page number, running head and thumb tabs sit outside the box. Every
 *  page is shifted so its justified right edge is at `right`. The senior high
 *  book is set larger on a wider page, with its handling notes in 8.5 pt
 *  (`notes`: dropped). */
const LAYOUT = {
  "mext-cos-01.pdf": { minH: 6, minX: 60, maxX: 530, minY: 40, maxY: 790, right: 477 },
  "mext-cos-02.pdf": { minH: 6, minX: 60, maxX: 530, minY: 40, maxY: 790, right: 477 },
  "mext-cos-03.pdf": { minH: 6, minX: 45, maxX: 560, minY: 40, maxY: 800, right: 568, notes: true },
};
/** Marks a gap in a line where the PDF draws something instead of setting
 *  text (fractions are pictures). Filled from JP_HOLES, or the build stops. */
const HOLE = "\u{FFFC}";
/** The katakana in the order of the circled ones, ㋐ (U+32D0) to ㋾. */
const KANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲ";
const SUPERSCRIPT = { 2: "²", 3: "³", n: "ⁿ" };

/** The lines of one page, in reading order. In a part with `pictures` (the
 *  mathematics sections) a gap inside a line is marked HOLE; elsewhere it is
 *  spacing in a table or list, and becomes a space. */
async function pageLines(pdf, p, pictures, box) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  const raw = tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], h: i.height, w: i.width }));
  // The senior high book draws ㋐ as a circle (a control character, \u001a)
  // with a small ア set inside it: the two become one marker.
  for (const circle of raw.filter((i) => i.str === "\u001a")) {
    const kana = raw.find((i) => i.h < 9 && KANA.includes(i.str.trim()) && Math.abs(i.x - circle.x) < 4 && Math.abs(i.y - circle.y) < 3);
    if (!kana) continue;
    circle.str = String.fromCodePoint(0x32d0 + KANA.indexOf(kana.str.trim()));
    kana.str = "";
  }
  const items = raw
    // Other control characters ("ア\u0007") are spacing.
    .map((i) => ({ ...i, str: i.str.replace(/[\u0000-\u001f]/g, " ") }))
    .filter((i) => i.str.trim() !== "")
    .filter((i) => i.h >= box.minH && i.x >= box.minX && i.x <= box.maxX && i.y >= box.minY && i.y <= box.maxY);
  if (!items.length) return [];
  // The text block sits at a different x on each page, but its lines are
  // justified to one width: each page is shifted so its right edge is at
  // RIGHT_EDGE, and indents compare across a page turn.
  // The edge is the one most long items end at: a line can overhang it.
  const edges = new Map();
  for (const i of items) if (i.w > 150) edges.set(Math.round(i.x + i.w), (edges.get(Math.round(i.x + i.w)) ?? 0) + 1);
  const edge = edges.size ? [...edges].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] : box.right;
  const shift = box.right - edge;
  for (const i of items) i.x += shift;
  const rows = [];
  const full = items.filter((i) => i.h >= 9).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of full) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  // A small 2, 3 or n raised a few points over a row is its superscript.
  // Any other small item is furigana over a word, or (senior high) a
  // handling note, and is dropped.
  for (const it of items.filter((i) => i.h < 9)) {
    const row = rows.find((r) => it.y - r.y > 0 && it.y - r.y <= 6);
    const sup = SUPERSCRIPT[it.str.trim()];
    if (row && sup) row.items.push({ ...it, str: sup, sup: true });
  }
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    // A gap between two pieces of text, other than the one after a marker
    // standing on its own, is a picture (or spacing) in the line.
    const lead = MARKER.exec(r.items[0].str.trim());
    const skip = lead && lead[0] === r.items[0].str.trim() ? 1 : 0;
    // A picture straight after a marker: the gap is wider than a marker's
    // usual 6 to 11 points ("（カ）" then 1/2 then "，").
    if (skip && pictures && r.items.length > 1 && r.items[1].x - (r.items[0].x + r.items[0].w) > 16) r.items[1].str = HOLE + r.items[1].str;
    for (let k = skip + 1; k < r.items.length; k++) {
      const prev = r.items[k - 1];
      if (r.items[k].sup || prev.sup) continue;
      if (r.items[k].x - (prev.x + prev.w) > 3) prev.str += pictures ? HOLE : " ";
    }
    return { page: p, y: r.y, x: r.items[0].x, items: r.items };
  });
}

// ── The list markers ────────────────────────────────────────────────────────

// ⑴ to ⒇, （1） (senior high), ア (and the plain ア the junior high books print
// for a parenthesised one), （ア）, （ｱ） (half width, senior high), ㋐, ①.
const MARKER = /^(?:[⑴-⒇]|（[0-9０-９]{1,2}）|\([0-9]{1,2}\)|[ア-ン]|（[ア-ンｱ-ﾝ]）|[㋐-㋾]|[①-⑳])/;

/** One line's items as text: pieces the print sets apart (a gap over 1.5
 *  points) are spaced by the same rule as lines ("2" "ab" stays "2ab"). */
function joinItems(items) {
  let out = "";
  let prev = null;
  for (const it of items) {
    const gap = prev ? it.x - (prev.x + prev.w) : 0;
    out += prev && gap > 1.5 && spaced(out, it.str) ? ` ${it.str}` : it.str;
    prev = it;
  }
  return out;
}

/** Split a line into its marker (if it starts with one) and its text. */
function splitMarker(line) {
  const raw = line.items[0].str;
  const first = raw.trim();
  const m = first.match(MARKER);
  const plain = { marker: null, text: joinItems(line.items), textX: line.x };
  if (!m) return plain;
  const rest = first.slice(m[0].length);
  const others = line.items.slice(1);
  // 1. The marker is an item of its own, with the text after it: "ア" "次の...".
  if (rest === "" && others.length) return { marker: m[0], text: joinItems(others), textX: line.items[1].x };
  // 2. A bracketed or circled marker run into its text: "（ｱ）数を実数まで...".
  //    A bare katakana counts only with a space after it, since a word can
  //    start with one ("アクセント").
  const bare = /^[ア-ン]$/.test(m[0]);
  if (rest !== "" && (!bare || /^\s/.test(rest))) {
    return { marker: m[0], text: rest.trim() + joinItems(others), textX: line.x + 22 };
  }
  // 3. Anything else is text.
  return plain;
}

// ── Japan ───────────────────────────────────────────────────────────────────

const JP_DIR = "docs/standards/japan";
const JP_PAGE = "https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm";
const JP_CREDIT =
  "Course of Study (学習指導要領) for elementary, junior high and senior high schools: Ministry of Education, Culture, Sports, Science and Technology (MEXT), https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm. Statements are excerpts from the official Japanese text, edited by Jooma into a list. Used under the Government of Japan Standard Terms of Use (Ver. 2.0).";

const FW = (s) => s.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10));

/**
 * The parts read. Pages are PDF pages (printed page + 2). `ages` is the
 * default when the part has no grade headings (the English sections, junior
 * high science's two fields). `base` turns a grade number into an age.
 * `courses` (senior high) keeps only those courses.
 */
const JP_PARTS = [
  { file: "mext-cos-01.pdf", stage: "elementary", subject: "Japanese", pages: [30, 47], base: 5 },
  { file: "mext-cos-01.pdf", stage: "elementary", subject: "Mathematics", pages: [66, 95], base: 5 },
  { file: "mext-cos-01.pdf", stage: "elementary", subject: "Science", pages: [96, 113], base: 5 },
  { file: "mext-cos-01.pdf", stage: "elementary", subject: "English", pages: [158, 166], ages: [10, 11], strand: "外国語" },
  { file: "mext-cos-01.pdf", stage: "elementary", subject: "English", pages: [175, 180], ages: [8, 9], strand: "外国語活動" },
  { file: "mext-cos-02.pdf", stage: "junior-high", subject: "Japanese", pages: [31, 42], base: 11 },
  { file: "mext-cos-02.pdf", stage: "junior-high", subject: "Mathematics", pages: [67, 79], base: 11 },
  { file: "mext-cos-02.pdf", stage: "junior-high", subject: "Science", pages: [80, 100], ages: [12, 13, 14] },
  { file: "mext-cos-02.pdf", stage: "junior-high", subject: "English", pages: [146, 155], ages: [12, 13, 14] },
  { file: "mext-cos-03.pdf", stage: "senior-high", subject: "Japanese", pages: [35, 40], ages: [15, 16, 17], courses: ["現代の国語", "言語文化"] },
  { file: "mext-cos-03.pdf", stage: "senior-high", subject: "Mathematics", pages: [93, 95], ages: [15, 16, 17], courses: ["数学Ⅰ"] },
  {
    file: "mext-cos-03.pdf",
    stage: "senior-high",
    subject: "Science",
    pages: [105, 131],
    ages: [15, 16, 17],
    courses: ["科学と人間生活", "物理基礎", "化学基礎", "生物基礎", "地学基礎"],
  },
  { file: "mext-cos-03.pdf", stage: "senior-high", subject: "English", pages: [165, 169], ages: [15, 16, 17], courses: ["英語コミュニケーションⅠ"] },
];

const GRADE = /^〔第([１-９])学年(?:及び第([１-９])学年)?〕$/;
const FIELD = /^〔第([１２])分野〕$/;
const CONTENT_START = /^２\s*内\s*容$/;
const CONTENT_STOP = [/^[１1]\s*指導計画の作成に当たって/, /^第[２2]の内容の取扱いについて/, /^３\s*内容の取扱い/, /^〔数学的活動〕/, /^第３\s*指導計画/, /^１\s*目\s*標$/, /^３\s*指導計画/];
const TERMS = /^[〔［]用語・記号[〕］]/;
/** A senior high course heading, "第１ 数学Ⅰ" or letter-spaced "第３ 物 理".
 *  Matched with the spaces taken out; the name is short and has no
 *  punctuation, so "第１の⑴及び⑵に示す..." is not one. */
const COURSE = /^第([１-９0-9]{1,2})(?!の)([^０-９0-9，。、（）]{1,12})$/;
const DOMAIN = /^[Ａ-Ｚ]\s*\S/;
/** Lists of example activities, not things to learn: dropped with their items. */
const ACTIVITIES = [/言語活動を通して指導する/, /^言語活動及び言語の働きに関する事項/, /^言語活動に関する事項/, /^言語の働きに関する事項/];

async function japanPart(part, problems) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`${JP_DIR}/${part.file}`)));
  const lines = [];
  for (let p = part.pages[0]; p <= part.pages[1]; p++) lines.push(...(await pageLines(pdf, p, part.subject === "Mathematics", LAYOUT[part.file])));

  const found = [];
  let ages = part.ages ?? null;
  let inContent = false;
  let course = part.courses ? null : "";
  let heading = "";
  let terms = false;
  let stack = []; // open list items, outermost first
  const roots = [];

  const close = () => {
    stack = [];
  };
  for (const line of lines) {
    const { marker, text, textX } = splitMarker(line);
    const raw = tidy(joinItems(line.items));
    // Headings are matched without the picture marks (a spaced heading has gaps).
    const whole = raw.split(HOLE).join("");
    const g = whole.match(GRADE);
    const f = whole.match(FIELD);
    const c = part.courses && !marker ? whole.replace(/\s/g, "").match(COURSE) : null;
    if (c) {
      course = part.courses.includes(c[2]) ? c[2] : null;
      inContent = false;
      heading = "";
      close();
      continue;
    }
    // A part with fixed ages (the English sections) has a grade heading after
    // "２ 内容"; it changes nothing.
    if (g && part.base === undefined) continue;
    if (g) {
      const a = Number(FW(g[1]));
      const b = g[2] ? Number(FW(g[2])) : a;
      ages = Array.from({ length: b - a + 1 }, (_, i) => part.base + a + i);
      inContent = false;
      heading = "";
      close();
      continue;
    }
    if (f) {
      heading = `第${f[1]}分野`;
      inContent = false;
      close();
      continue;
    }
    if (CONTENT_START.test(whole)) {
      inContent = course !== null;
      close();
      continue;
    }
    if (CONTENT_STOP.some((r) => r.test(whole))) {
      inContent = false;
      close();
      continue;
    }
    if (!inContent) continue;
    // 〔用語・記号〕 lists terms after a domain (junior high) or a grade
    // (elementary): its lines are skipped until the next heading or item.
    if (TERMS.test(whole)) {
      terms = true;
      close();
      continue;
    }
    if (!marker && (/^〔[^〕]+〕$/.test(whole) || /^［[^］]+］$/.test(whole) || DOMAIN.test(whole))) {
      // Junior high science's field (第１分野) stays the heading: it has no domains.
      if (!/^第[１２]分野$/.test(heading)) heading = whole.replace(/^([Ａ-Ｚ])\s*/, "$1 ");
      terms = false;
      close();
      continue;
    }
    if (terms && !marker) continue;
    terms = false;
    if (marker) {
      while (stack.length && stack[stack.length - 1].x >= line.x - 1) stack.pop();
      const node = { x: line.x, marker, lines: [{ x: textX, text }], children: [], ages, heading, course, page: line.page };
      if (stack.length) stack[stack.length - 1].children.push(node);
      else roots.push(node);
      stack.push(node);
    } else if (stack.length) {
      stack[stack.length - 1].lines.push({ x: line.x, text: raw });
    } else {
      problems.push(`${part.stage} ${part.subject} p${line.page}: text outside any item: ${whole.slice(0, 60)}`);
    }
  }

  /** An item's text. A short first line over more lines is a title ("㋐
   *  光の反射・屈折" over its description, "（1）数と式" over its lead-in): a
   *  wrapped line runs the full width, so a short one ends a heading. The
   *  title and description are joined with a colon. */
  const textOf = (n) => {
    const [first, ...rest] = n.lines;
    if (rest.length && tidy(first.text).length <= 20 && !/[。，、]$/.test(tidy(first.text))) {
      return { title: tidy(first.text), body: tidy(rest.map((l) => l.text).reduce(joinText, "")) };
    }
    return { title: "", body: tidy(n.lines.map((l) => l.text).reduce(joinText, "")) };
  };

  const walk = (n, topTitle) => {
    const { title, body } = textOf(n);
    const full = title ? `${title}：${body}` : body;
    if (ACTIVITIES.some((r) => r.test(full))) return;
    if (!n.children.length) {
      if (/^次の(ような|事項)/.test(body)) problems.push(`${part.stage} ${part.subject} p${n.page}: a lead-in with no items: ${body.slice(0, 60)}`);
      found.push({ ages: n.ages, heading: n.heading, course: n.course, topTitle, text: full, page: n.page });
      return;
    }
    for (const ch of n.children) walk(ch, topTitle);
  };
  for (const r of roots) {
    const { title, body } = textOf(r);
    // A first-level item with a short title names the topic ("⑴ 身近な物理現象").
    const short = title || (body.length <= 20 && !/。$/.test(body) ? body : "");
    if (!r.children.length && short) continue;
    walk(r, short);
  }
  return found;
}

/**
 * The mathematics statements with a picture in them, as read (each gap shown
 * as [?]) and as printed. Read off the rendered pages on 2026-11-28 (page
 * numbers are the PDF's). Fractions are written a/b; the empty brackets of
 * page 80 are spacing, not a picture. A statement with a gap not listed here
 * stops the build, so a changed source cannot slip a gap through.
 */
const JP_FIX = new Map([
  // mext-cos-01.pdf p70, Grade 2
  ["[?]，[?]など簡単な分数について知ること。", "1/2，1/3など簡単な分数について知ること。"],
  // p73, Grade 3
  ["10 倍，100 倍，1000 倍，[?]の大きさの数及びそれらの表し方について知ること。", "10 倍，100 倍，1000 倍，1/10の大きさの数及びそれらの表し方について知ること。"],
  // p75, Grade 3
  [
    "端数部分の大きさを表すのに小数を用いることを知ること。また，小数の表し方及び[?]の位について知ること。",
    "端数部分の大きさを表すのに小数を用いることを知ること。また，小数の表し方及び1/10の位について知ること。",
  ],
  ["[?]の位までの小数の加法及び減法の意味について理解し，それらの計算ができることを知ること。", "1/10の位までの小数の加法及び減法の意味について理解し，それらの計算ができることを知ること。"],
  // p80, Grade 4
  ["四則の混合した式や（[?]）を用いた式について理解し，正しく計算すること。", "四則の混合した式や（ ）を用いた式について理解し，正しく計算すること。"],
  // p85, Grade 5
  ["ある数の 10 倍，100 倍，1000 倍，[?]，[?]などの大きさの数を，小数点の位置を移してつくること。", "ある数の 10 倍，100 倍，1000 倍，1/10，1/100などの大きさの数を，小数点の位置を移してつくること。"],
  // mext-cos-02.pdf p76, Grade 3: blank space in the print, nothing drawn
  ["円周角と中心角[?]の関係の意味を理解し，それが証明できることを知ること。", "円周角と中心角の関係の意味を理解し，それが証明できることを知ること。"],
]);

function fillHoles(text, where, problems) {
  if (!text.includes(HOLE)) return text;
  const read = text.split(HOLE).join("[?]");
  if (JP_FIX.has(read)) return JP_FIX.get(read);
  problems.push(`${where}: a picture in: ${read}`);
  return text;
}

async function japan() {
  const problems = [];
  const all = [];
  for (const part of JP_PARTS) {
    const found = await japanPart(part, problems);
    for (const s of found) {
      s.text = fillHoles(s.text, `${part.stage} ${part.subject} p${s.page}`, problems);
      if (!s.ages) problems.push(`${part.stage} ${part.subject} p${s.page}: no grade for: ${s.text.slice(0, 50)}`);
      const strand = [part.strand, s.course, s.heading, s.topTitle].filter(Boolean).join(" ");
      all.push({ stage: part.stage, subject: part.subject, strand, ages: s.ages ?? [], text: s.text, page: s.page });
    }
    if (debug && debug === `${part.stage}:${part.subject}`) {
      for (const s of found) console.log(`p${s.page} [${s.ages}] ${[s.course, s.heading, s.topTitle].filter(Boolean).join(" / ")} | ${s.text}`);
    }
  }
  // One statement per subject, strand and text: the same item in two grades
  // (or two bands) is one statement with both grades' ages.
  const byKey = new Map();
  for (const s of all) {
    const key = `${s.stage}|${s.subject}|${s.strand}|${s.text}`;
    const had = byKey.get(key);
    if (had) had.ages = [...new Set([...had.ages, ...s.ages])].sort((a, b) => a - b);
    else byKey.set(key, { ...s });
  }
  const statements = [...byKey.values()].map((s) => ({
    id: `jp-cos-${sha1(`${s.stage}|${s.subject}|${s.strand}|${s.text}`).slice(0, 10)}`,
    code: "",
    subject: s.subject,
    strand: s.strand,
    ages: s.ages,
    text: s.text,
  }));
  if (problems.length) {
    console.error(problems.join("\n"));
    throw new Error(`${problems.length} problems: nothing written`);
  }
  write("jp-cos", {
    source: { title: "Course of Study (学習指導要領), MEXT: 2017 elementary and junior high, 2018 senior high", file: `${JP_DIR}/`, url: JP_PAGE, credit: JP_CREDIT },
    statements,
  });
  const count = {};
  for (const s of statements) for (const a of s.ages) count[`${s.subject} ${a}`] = (count[`${s.subject} ${a}`] ?? 0) + 1;
  console.log(`jp-cos: ${statements.length} statements; dashes replaced ${dashesReplaced}`);
  console.log(Object.entries(count).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
}

if (country === "japan") await japan();
else throw new Error("Usage: --country=japan|taiwan");
