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
import { OPS } from "unpdf/pdfjs";

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

// ── Taiwan ──────────────────────────────────────────────────────────────────
//
// Curriculum Guidelines of 12-Year Basic Education (十二年國民基本教育課程綱要),
// Ministry of Education, published by NAER: https://www.naer.edu.tw/eng/PageSyllabus?fid=148
// (fetched 2026-11-28). Licence: NAER's open data declaration
// (https://www.naer.edu.tw/PageDoc?fid=324): all material on its site, free,
// non-exclusive, for any use including adaptation, with the source credited.
//
// What a statement is: one coded row of a learning performance (學習表現)
// or learning content (學習內容) table, its text as printed. Mandarin and
// mathematics are read from the Chinese text (no official English); English
// and science from NAER's official English translation (英譯 公告版). They
// are two frameworks, so the card can say which are in Chinese.
//
// Codes are kept, with the stage numerals written I to V in plain letters
// (the books mix Ⅳ and IV). The marks ◎ (repeated in another stage) and *
// (a higher level) are dropped from the code. Senior high: the
// MOE-mandated required courses only (數學 10, 11A, 11B; science "Vc"), as
// for Japan; the electives (12甲/乙, "Va", 加深加廣) are left out.

const TW_DIR = "docs/standards/taiwan";
const TW_PAGE = "https://www.naer.edu.tw/eng/PageSyllabus?fid=148";
const TW_LICENCE = "https://www.naer.edu.tw/PageDoc?fid=324";
const TW_CREDIT =
  "Curriculum Guidelines of 12-Year Basic Education (十二年國民基本教育課程綱要) for Mandarin (國語文) and mathematics (數學): Ministry of Education, Taiwan, published by the National Academy for Educational Research (NAER), https://www.naer.edu.tw/eng/PageSyllabus?fid=148. Statements are excerpts from the official Chinese text, edited by Jooma into a list. Used under NAER's open data declaration, https://www.naer.edu.tw/PageDoc?fid=324.";
const TW_EN_CREDIT =
  "Curriculum Guidelines of 12-Year Basic Education for English and for natural science, official English translation: Ministry of Education, Taiwan, published by the National Academy for Educational Research (NAER), https://www.naer.edu.tw/eng/PageSyllabus?fid=148. Statements are excerpts from the official English text, edited by Jooma into a list. Used under NAER's open data declaration, https://www.naer.edu.tw/PageDoc?fid=324.";

const STAGE_AGES = { I: [6, 7], II: [8, 9], III: [10, 11], IV: [12, 13, 14], V: [15, 16, 17] };
const ROMAN_CHARS = { "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V" };
const plainRoman = (s) => s.replace(/[ⅠⅡⅢⅣⅤ]/g, (c) => ROMAN_CHARS[c]).replace(/\s/g, "");

/** The items of a page with text, page numbers and margins dropped. */
async function twItems(pdf, p) {
  const tc = await (await pdf.getPage(p)).getTextContent();
  return tc.items
    .map((i) => ({ str: i.str.replace(/[\u0000-\u001f]/g, " "), x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }))
    .filter((i) => i.str.trim() !== "" && i.y > 56 && i.y < 800);
}

// Exponents and indices are set small, raised or lowered: written with the
// Unicode superscript and subscript forms. One with no such form stops the build.
const SUP = Object.fromEntries(
  [..."0123456789+−-=()𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧"].map((c, i) => [c, [..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ"][i]]),
);
const SUB = Object.fromEntries([..."0123456789+−-=()𝑎𝑒𝑖𝑗𝑘𝑛𝑜𝑝𝑟𝑠𝑡𝑥"].map((c, i) => [c, [..."₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑᵢⱼₖₙₒₚᵣₛₜₓ"][i]]));
const twScriptProblems = [];
const scripted = (s, map, where) =>
  [...s.replace(/\s/g, "")].map((c) => map[c] ?? (twScriptProblems.push(`${where}: no small form for "${c}" in "${s}"`), c)).join("");

/** Items into rows, top to bottom, each row left to right. A small item a
 *  few points above or below a row is its superscript or subscript. */
function twRows(items, tol = 2.5) {
  const rows = [];
  const heights = items.map((i) => Math.round(i.h)).sort((a, b) => a - b);
  const body = heights[Math.floor(heights.length / 2)] ?? 12;
  const small = items.filter((i) => i.h < body * 0.8 && /^[\s0-9+−\-=()𝑎-𝑧ℎ]+$/u.test(i.str));
  for (const it of [...items].filter((i) => !small.includes(i)).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const it of small) {
    const row = rows.filter((r) => Math.abs(it.y - r.y) <= 7).sort((a, b) => Math.abs(it.y - a.y) - Math.abs(it.y - b.y))[0];
    if (!row) {
      rows.push({ y: it.y, items: [it] });
      continue;
    }
    const up = it.y > row.y;
    row.items.push({ ...it, str: scripted(it.str, up ? SUP : SUB, `y${Math.round(it.y)} x${Math.round(it.x)}`), w: it.w, script: true });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows.sort((a, b) => b.y - a.y);
}

/** One row's items as text, with where each item starts in it. Chinese runs
 *  on with no space (a Latin word or number keeps one from another); English
 *  keeps a space wherever the print leaves a gap ("Can" "say"), and none
 *  where a word was set in two pieces ("o" "f"). */
function twJoin(items, en) {
  let out = "";
  const starts = [];
  let prev = null;
  for (const it of items) {
    const gap = prev ? it.x - (prev.x + prev.w) : 0;
    const s = it.str;
    let sep = "";
    if (prev && !it.script && !prev.script && !/\s$/.test(out) && !/^\s/.test(s)) {
      if (en) sep = gap > 1.2 ? " " : "";
      else sep = gap > 1.5 && /[A-Za-z0-9]$/.test(out) && /^[A-Za-z]/.test(s) ? " " : "";
    }
    out += sep;
    starts.push(out.length);
    out += s;
    prev = it;
  }
  return { text: out, starts };
}

/** Two lines of one statement joined. */
function twJoinLines(a, b, en) {
  if (!a) return b;
  if (en) return /[A-Za-z]-$/.test(a) ? a + b : `${a} ${b}`;
  return /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : a + b;
}

const tidyTw = (s, en) => {
  // NFC turns the CJK compatibility forms some fonts use (U+F97E for 量)
  // into the usual characters. The Symbol font's × sits in the private use
  // area; any other private use character stops the build.
  let t = tidy(s).normalize("NFC").replace(//g, "×");
  if (!en) t = t.replace(/(?<=[^\x00-\x7f]) (?=[^\x00-\x7f])/g, "");
  return t.replace(/\s+([，。、；：」）])/g, "$1").replace(/([「（])\s+/g, "$1");
};

// A code at the start of a cell: category (letters, perhaps set apart as in
// "I N d" or "B Mb", or a digit), stage (Roman numerals, perhaps with "c"
// for the senior high required courses), serial number.
const TW_CODE = /^[◎*＊\s]*([A-Za-z](?:\s?[A-Za-z]){0,3}|[1-9])\s*-\s*((?:[ⅠⅡⅢⅣⅤ]|I|V)(?:\s?(?:[ⅠⅡⅢⅣⅤ]|I|V)){0,2}(?:\s?c)?)\s*-\s*([0-9]{1,2})(?![0-9,])/;

/**
 * A table read as columns: in each column a code starts a statement and the
 * lines below it at the same indent continue it, across a page turn.
 * Headers and stage labels sit at other indents and are skipped. Reading
 * starts after a row matching `start` and ends at a row matching `stop`.
 */
async function twColumns(sec, problems) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`${TW_DIR}/${sec.file}`)));
  const found = [];
  let on = !sec.start;
  let done = false;
  const open = sec.columns.map(() => null);
  const close = (k) => {
    if (open[k]) found.push(open[k]);
    open[k] = null;
  };
  for (let p = sec.pages[0]; p <= sec.pages[1] && !done; p++) {
    const items = (await twItems(pdf, p)).filter((i) => !["◎", "‧", "*", "＊"].includes(i.str.trim()));
    // The live part of the page: after `start`, before `stop`.
    let top = 800;
    let bottom = 45;
    for (const r of twRows(items)) {
      const whole = tidy(twJoin(r.items, sec.en).text).replace(/\s/g, "");
      if (!on && sec.start.test(whole)) {
        on = true;
        top = r.y - 1;
        continue;
      }
      if (on && sec.stop && sec.stop.test(whole)) {
        bottom = r.y + 1;
        done = true;
        break;
      }
    }
    if (!on) continue;
    sec.columns.forEach((col, k) => {
      const mine = items.filter((i) => i.x >= col[0] && i.x < col[1] && i.y < top && i.y > bottom);
      for (const r of twRows(mine)) {
        const { text } = twJoin(r.items, sec.en);
        if (sec.skip && sec.skip.test(text.replace(/\s/g, ""))) continue;
        // The code is matched with every gap spaced, so a statement that
        // starts with a number ("Ab-Ⅰ-1" "1,000個") keeps its own digits.
        const { text: probe, starts } = twJoin(r.items, true);
        const m = TW_CODE.exec(probe);
        if (m) {
          close(k);
          const after = r.items.findIndex((_, n) => starts[n] >= m[0].length);
          const rest = after >= 0 ? twJoin(r.items.slice(after), sec.en).text.replace(/^[\s:：]+/, "") : "";
          open[k] = { cat: m[1].replace(/\s/g, ""), stage: plainRoman(m[2]), n: Number(m[3]), text: rest, textX: after >= 0 ? r.items[after].x : null, page: p };
        } else if (open[k] && (open[k].textX === null || (r.items[0].x >= open[k].textX - 4 && r.items[0].x <= open[k].textX + 6))) {
          if (open[k].textX === null) open[k].textX = r.items[0].x;
          open[k].text = twJoinLines(open[k].text, text, sec.en);
        }
      }
    });
  }
  sec.columns.forEach((_, k) => close(k));
  if (!found.length) problems.push(`${sec.file} p${sec.pages}: nothing read`);
  return found.map((s) => ({ ...s, text: tidyTw(s.text, sec.en) }));
}

/** The horizontal rules of a page that cross [x0, x1]: the row lines of its tables. */
/** Also returns the small shapes drawn inside [x0, x1]: a symbol the PDF
 *  draws instead of setting as text (the √ of "1:√3:2"), which the text
 *  layer loses. Shapes are placed through the drawing transform. */
async function twRules(pdf, p, x0, x1) {
  const ops = await (await pdf.getPage(p)).getOperatorList();
  const ys = [];
  const shapes = [];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const saved = [];
  ops.fnArray.forEach((fn, i) => {
    const a = ops.argsArray[i];
    if (fn === OPS.save) saved.push(ctm);
    else if (fn === OPS.restore) ctm = saved.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    if (fn !== OPS.constructPath || !a[2]) return;
    const pts = [[a[2][0], a[2][1]], [a[2][2], a[2][3]]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
    const m = [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
    if (m[3] - m[1] < 2 && m[0] <= x0 && m[2] >= x1) ys.push((m[1] + m[3]) / 2);
    else if (m[0] > x0 && m[2] < x1 && m[2] - m[0] < 60 && m[3] - m[1] < 30 && (m[2] - m[0] > 0.5 || m[3] - m[1] > 0.5)) shapes.push({ x: m[0], y: (m[1] + m[3]) / 2 });
  });
  const rules = [...new Set(ys.map((y) => Math.round(y)))].sort((a, b) => b - a).filter((y, i, a) => i === 0 || a[i - 1] - y > 2);
  return { rules, shapes };
}

/**
 * The mathematics cells with a drawn symbol, by code: the text as read
 * and as printed (read off the rendered pages, 2026-11-28; PDF pages). The
 * build stops on a cell with a shape that is not listed here, or whose text
 * has changed. N-8-2 and N-10-1: the shape is the bar over a √ that is set
 * as text, so nothing is lost. G-8-1: the bar over AB is set as stray
 * combining marks, written here over each letter, and the root's bar
 * becomes brackets so the formula reads the same on one line.
 */
const TW_FIX = new Map([
  // naer-maths-zh.pdf p41
  ["N-8-2", ["二次方根的近似值：二次方根的近似值；二次方根的整數部分；十分逼近法。使用計算機√鍵。", null]],
  // p43
  [
    "G-8-1",
    [
      "直角坐標系上兩點距離公式：直角坐標系上兩點𝐴(𝑎, 𝑏)和𝐵(𝑐,𝑑)的距離為̅̅̅̅𝐴𝐵=√(𝑎−𝑐)²+(𝑏−𝑑)²；生活上相關問題。",
      "直角坐標系上兩點距離公式：直角坐標系上兩點𝐴(𝑎, 𝑏)和𝐵(𝑐,𝑑)的距離為𝐴̅𝐵̅=√((𝑎−𝑐)²+(𝑏−𝑑)²)；生活上相關問題。",
    ],
  ],
  // p45
  [
    "S-9-4",
    [
      "相似直角三角形邊長比值的不變性：直角三角形中某一銳角的角度決定邊長比值，該比值為不變量，不因相似直角三角形的大小而改變；三內角為30°,60°,90°其邊長比記錄為「1:3:2」；三內角為45°,45°,90°其邊長比記錄為「1:1:2」。",
      "相似直角三角形邊長比值的不變性：直角三角形中某一銳角的角度決定邊長比值，該比值為不變量，不因相似直角三角形的大小而改變；三內角為30°,60°,90°其邊長比記錄為「1:√3:2」；三內角為45°,45°,90°其邊長比記錄為「1:1:√2」。",
    ],
  ],
  // p47
  ["N-10-1", ["實數：數線，十進制小數的意義，三一律，有理數的十進制小數特徵，無理數之十進制小數的估算（√2為無理數的證明），科學記號數字的運算。", null]],
]);

/**
 * The mathematics tables, read cell by cell between their rules: the code
 * sits in the middle of its cell, with the text above and below it. Only
 * the text column is the statement (the content table's notes, teaching aids
 * and linked performances are not). A cell with no code at the top of a
 * page goes on from the page before.
 */
async function twCells(sec, problems) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`${TW_DIR}/${sec.file}`)));
  const found = [];
  let grade = null;
  let on = false;
  for (let p = sec.pages[0]; p <= sec.pages[1]; p++) {
    const items = await twItems(pdf, p);
    const { rules, shapes } = await twRules(pdf, p, sec.text[0] + 4, sec.text[1] - 4);
    let first = true;
    for (let k = 0; k + 1 < rules.length; k++) {
      const band = items.filter((i) => i.y < rules[k] && i.y > rules[k + 1]);
      if (!band.length) continue;
      const whole = tidy(twRows(band).map((r) => twJoin(r.items, false).text).join(" ")).replace(/\s/g, "");
      if (sec.start.test(whole)) on = true;
      if (!on) continue;
      if (sec.stop.test(whole)) return found;
      if (sec.skip.test(whole)) continue;
      const g = whole.match(/^([0-9]{1,2})年級(?:（([AB])類）)?$/);
      if (g) {
        grade = g[1] + (g[2] ?? "");
        continue;
      }
      const code = tidy(twJoin(twRows(band.filter((i) => i.x >= sec.code[0] && i.x < sec.code[1])).flatMap((r) => r.items), false).text).replace(/\s/g, "");
      const text = tidyTw(
        twRows(band.filter((i) => i.x >= sec.text[0] && i.x < sec.text[1]))
          .map((r) => twJoin(r.items, false).text)
          .reduce((a, b) => twJoinLines(a, b, false), ""),
        false,
      );
      if (!code) {
        if (first && found.length && text) found[found.length - 1].text = tidyTw(found[found.length - 1].text + text, false);
        else if (text) problems.push(`${sec.file} p${p}: a cell with no code: ${text.slice(0, 40)}`);
        first = false;
        continue;
      }
      first = false;
      const m = code.match(sec.codeRe);
      if (!m) {
        problems.push(`${sec.file} p${p}: not a code: ${code}`);
        continue;
      }
      // The marks ※ (extension), ★ (not assessed directly) and ＃ (taught
      // within another topic) are dropped, as ◎ and * are.
      const shape = shapes.some((sh) => sh.y < rules[k] && sh.y > rules[k + 1]);
      found.push({ cat: m[1], stage: plainRoman(m[2]), n: Number(m[3]), grade, text: text.replace(/[※★＃]/g, ""), page: p, shape });
    }
  }
  problems.push(`${sec.file}: no end found`);
  return found;
}

// The category names, as the guidelines print them.
const TW_STRANDS = {
  mandarinPerf: { 1: "聆聽", 2: "口語表達", 3: "標音符號與運用", 4: "識字與寫字", 5: "閱讀", 6: "寫作" },
  mandarinContent: {
    Aa: "標音符號", Ab: "字詞", Ac: "句段", Ad: "篇章", Ba: "記敘文本", Bb: "抒情文本", Bc: "說明文本", Bd: "議論文本", Be: "應用文本",
    Ca: "物質文化", Cb: "社群文化", Cc: "精神文化",
  },
  maths: { n: "數與量", s: "空間與形狀", g: "坐標幾何", r: "關係", a: "代數", f: "函數", d: "資料與不確定性" },
  // From the headings of the English guideline (the fifth has a dash in
  // print, a hyphen here by the brand rule).
  englishPerf: {
    1: "Language proficiency in listening", 2: "Language proficiency in speaking", 3: "Language proficiency in reading", 4: "Language proficiency in writing",
    5: "Language proficiency - integrative use of at least two out of four language skills", 6: "Learning interest and attitude",
    7: "Learning approaches and strategies", 8: "Cultural literacy", 9: "Logical reasoning, judgement and creativity",
  },
  englishContent: {
    Aa: "Linguistic knowledge, alphabet", Ab: "Linguistic knowledge, phonology", Ac: "Linguistic knowledge, vocabulary", Ad: "Linguistic knowledge, sentence structure",
    Ae: "Linguistic knowledge, discourse", B: "Communication", C: "Culture and customs", D: "Cognitive capability",
  },
  // From the science guideline's Table 2 (performances) and Table 3 (content).
  sciencePerf: {
    ti: "Imagination and creativity", tr: "Reasoning and argumentation", tc: "Critical thinking", tm: "Construction of models",
    po: "Observing and identifying", pe: "Planning and executing", pa: "Analyzing and finding", pc: "Discussing and communicating",
    ai: "Cultivate interest in scientific inquiry", ah: "Develop the habit of applying scientific thinking and inquiry", an: "Understanding the nature of science",
  },
  scienceTopics: {
    INa: "Matter and energy", INb: "Structure and function", INc: "System and scale", INd: "Change and stability", INe: "Interaction",
    INf: "Science and daily life", INg: "Resource and sustainability",
    A: "Composition and characteristics of matter", B: "Form, conversion, and flow of energy", C: "Structure and function of matter/materials",
    D: "Structure and function of organisms", E: "Physical systems", F: "Earth environment", G: "Evolution and heredity", H: "History of the Earth",
    I: "Dynamic Earth", J: "Reactions of the materials, equilibrium and production", K: "Phenomena and interactions in nature",
    L: "Organisms and the environment", M: "Science, technology, society, and humanities", N: "Resources and sustainable development",
  },
  scienceSubjects: { B: "Biology", P: "Physics", C: "Chemistry", E: "Earth sciences" },
};
/** A science content code's category: "INa" (a cross-subject concept),
 *  "Ab" (junior high topic A), "BDa" (senior high biology, topic D). */
function scienceTopic(cat) {
  const t = TW_STRANDS.scienceTopics;
  if (t[cat]) return t[cat];
  if (/^[A-N][a-f]$/.test(cat)) return t[cat[0]];
  const m = cat.match(/^([BPCE])([A-N])[a-f]$/);
  return m && t[m[2]] ? `${TW_STRANDS.scienceSubjects[m[1]]}, ${t[m[2]]}` : undefined;
}

const TW_SECTIONS = [
  // Mandarin (國語文), Chinese. PDF pages.
  { kind: "columns", fw: "tw-108-zh", subject: "Mandarin", part: "學習表現", strands: TW_STRANDS.mandarinPerf, file: "naer-mandarin-zh.pdf", pages: [8, 14], start: /^一、學習表現$/, stop: /^二、學習內容$/, columns: [[140, 560]] },
  { kind: "columns", fw: "tw-108-zh", subject: "Mandarin", part: "學習內容", strands: TW_STRANDS.mandarinContent, file: "naer-mandarin-zh.pdf", pages: [14, 21], start: /^二、學習內容$/, stop: /^三、高級中等學校/, columns: [[140, 560]] },
  // Mathematics (數學), Chinese: the performances listed by stage (the
  // second listing, by category, repeats them), then the content by grade.
  {
    kind: "cells", fw: "tw-108-zh", subject: "Mathematics", part: "學習表現", strands: TW_STRANDS.maths, file: "naer-maths-zh.pdf", pages: [12, 16],
    start: /^編碼學習表現（依學習階段排序）$/, stop: /依表現類別排序/, skip: /^(編碼學習表現|第.學習階段$)/, code: [55, 128], text: [128, 540],
    codeRe: /^([nsgrafd])-((?:I|V){1,3})-([0-9]{1,2})$/,
  },
  {
    kind: "cells", fw: "tw-108-zh", subject: "Mathematics", part: "學習內容", strands: TW_STRANDS.maths, file: "naer-maths-zh.pdf", pages: [22, 56],
    start: /^編碼學習內容條目及說明/, stop: /^12年級（加深加廣/, skip: /^編碼學習內容條目及說明/, code: [55, 108], text: [108, 256],
    codeRe: /^([NSGRAFD])-([0-9]{1,2}[AB]?)-([0-9]{1,2})$/,
  },
];

const EN_SECTIONS = [
  // English, official English translation.
  {
    kind: "columns", fw: "tw-108-en", subject: "English", part: "Learner performance", strands: TW_STRANDS.englishPerf, en: true, file: "naer-english-en.pdf", pages: [14, 27],
    start: /^\(1\)Languageproficiencyinlistening$/, stop: /^2\.LearningContent$/, columns: [[150, 560]],
  },
  {
    kind: "columns", fw: "tw-108-en", subject: "English", part: "Learning content", strand: (c) => TW_STRANDS.englishContent[c] ?? TW_STRANDS.englishContent[c[0]], en: true,
    file: "naer-english-en.pdf", pages: [28, 36], start: /^LearningContent$/, stop: /^3\.Enrichmentandexpanded/, skip: /^Stage(I|II|III|IV|V)$/,
    columns: [[160, 270], [270, 377], [377, 483], [483, 600]],
  },
  // Natural science, official English translation: elementary (two stage
  // columns side by side), junior high, senior high required courses.
  {
    kind: "columns", fw: "tw-108-en", subject: "Science", part: "Learning performance", strands: TW_STRANDS.sciencePerf, en: true, file: "naer-science-en.pdf", pages: [11, 16],
    start: /^\(1\)Learningperformances$/, stop: /^\(2\)Learningcontents$/, columns: [[215, 375], [375, 560]],
  },
  {
    kind: "columns", fw: "tw-108-en", subject: "Science", part: "Learning content", strand: scienceTopic, en: true, file: "naer-science-en.pdf", pages: [16, 26],
    start: /^\(2\)Learningcontents$/, stop: /^2\.LearningFocusesofJuniorHigh/, columns: [[125, 320], [320, 560]],
  },
  {
    kind: "columns", fw: "tw-108-en", subject: "Science", part: "Learning performance", strands: TW_STRANDS.sciencePerf, en: true, file: "naer-science-en.pdf", pages: [26, 31],
    start: /^\(1\)Learningperformances$/, stop: /^\(2\)Learningcontents$/, columns: [[250, 560]],
  },
  {
    kind: "columns", fw: "tw-108-en", subject: "Science", part: "Learning content", strand: scienceTopic, en: true, file: "naer-science-en.pdf", pages: [31, 47],
    start: /^\(2\)Learningcontents$/, stop: /^3\.LearningFocusesofMOE/, skip: /^(Subtopic)?LearningContents/, columns: [[250, 560]],
  },
  {
    kind: "columns", fw: "tw-108-en", subject: "Science", part: "Learning performance", strands: TW_STRANDS.sciencePerf, en: true, file: "naer-science-en.pdf", pages: [47, 52],
    start: /^\(1\)Learningperformances$/, stop: /^\(2\)Learningcontents$/, columns: [[245, 560]],
  },
  {
    kind: "columns", fw: "tw-108-en", subject: "Science", part: "Learning content", strand: scienceTopic, en: true, file: "naer-science-en.pdf", pages: [52, 64],
    start: /^\(2\)Learningcontents$/, stop: /^v\.Thecontentsof/, columns: [[275, 560]],
  },
];
TW_SECTIONS.push(...EN_SECTIONS);

async function taiwan() {
  const problems = [];
  const all = [];
  for (const sec of TW_SECTIONS) {
    const found = sec.kind === "cells" ? await twCells(sec, problems) : await twColumns(sec, problems);
    for (const s of found) {
      const cat = sec.strand ? sec.strand(s.cat) : (sec.strands[s.cat] ?? sec.strands[s.cat.toLowerCase()]);
      if (!cat) problems.push(`${sec.file} p${s.page}: no category for ${s.cat}`);
      let code;
      let ages;
      if (s.grade !== undefined && sec.part === "學習內容" && sec.subject === "Mathematics") {
        code = `${s.cat}-${s.stage}-${s.n}`;
        const g = Number(String(s.stage).replace(/[AB]$/, ""));
        ages = [g + 5];
        if (s.grade && s.grade !== s.stage) problems.push(`${code}: under the heading for grade ${s.grade}`);
      } else {
        code = `${s.cat}-${s.stage}-${s.n}`;
        ages = STAGE_AGES[s.stage.replace(/c$/, "")];
        if (!ages) problems.push(`${sec.file} p${s.page}: no stage in ${code}`);
      }
      if (!s.text) problems.push(`${sec.file} p${s.page}: ${code} has no text`);
      if (/[-]/.test(s.text)) problems.push(`${sec.file} p${s.page}: ${code} has a private use character: ${s.text}`);
      if (sec.kind === "cells" && TW_FIX.has(code)) {
        const [read, printed] = TW_FIX.get(code);
        if (s.text !== read) problems.push(`${code}: the text read has changed: ${s.text}`);
        else if (printed) s.text = printed;
      } else if (s.shape) problems.push(`${sec.file} p${s.page}: ${code} has a drawn symbol: ${s.text}`);
      all.push({ fw: sec.fw, subject: sec.subject, strand: cat ? `${sec.part}${sec.en ? ": " : " "}${cat}` : sec.part, code, ages: ages ?? [], text: s.text, page: s.page });
    }
    if (debug && debug === `${sec.subject}:${sec.part}`) for (const s of all.filter((a) => a.subject === sec.subject && a.strand.startsWith(sec.part))) console.log(`p${s.page} ${s.code} [${s.ages}] ${s.strand} | ${s.text}`);
  }
  problems.push(...twScriptProblems);
  const seen = new Set();
  for (const s of all) {
    const key = `${s.fw}|${s.subject}|${s.code}`;
    if (seen.has(key)) problems.push(`${key}: twice`);
    seen.add(key);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    throw new Error(`${problems.length} problems: nothing written`);
  }
  for (const [fw, credit, lang] of [
    ["tw-108-zh", TW_CREDIT, "Chinese"],
    ["tw-108-en", TW_EN_CREDIT, "official English"],
  ]) {
    const statements = all
      .filter((s) => s.fw === fw)
      .map((s) => ({ id: `${fw}-${sha1(`${s.subject}|${s.code}`).slice(0, 10)}`, code: s.code, subject: s.subject, strand: s.strand, ages: s.ages, text: s.text }));
    if (!statements.length) continue;
    write(fw, { source: { title: `Curriculum Guidelines of 12-Year Basic Education (${lang}), Ministry of Education, Taiwan (NAER)`, file: `${TW_DIR}/`, url: TW_PAGE, licence: TW_LICENCE, credit }, statements });
    const count = {};
    for (const s of statements) for (const a of s.ages) count[`${s.subject} ${a}`] = (count[`${s.subject} ${a}`] ?? 0) + 1;
    console.log(`${fw}: ${statements.length} statements; dashes replaced ${dashesReplaced}`);
    console.log(Object.entries(count).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
  }
}

if (country === "japan") await japan();
else if (country === "taiwan") await taiwan();
else throw new Error("Usage: --country=japan|taiwan");
