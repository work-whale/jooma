#!/usr/bin/env node
/**
 * Builds the curriculum statements the slides wizard aligns to.
 *
 *   node scripts/build-national-curriculum.mjs
 *
 * Reads the official documents in docs/ and writes
 * app/lib/national-curriculum/data/{primary,early-years}.json, plus a count
 * report on stdout to review against the documents. The JSON is committed; this
 * only needs running again when a source document or the curation changes.
 *
 * Sources, all Crown copyright under the Open Government Licence. Committed
 * in docs/ as a fixed copy of the versions the data was built from, and read
 * by the word for word check in tests/unit/national-curriculum.spec.ts. The
 * links below are where each came from, for when a new version is published:
 *   - docs/PRIMARY_national_curriculum.pdf
 *       The national curriculum in England, key stages 1 and 2 (Years 1 to 6),
 *       the "primary national curriculum" PDF from
 *       https://www.gov.uk/government/publications/national-curriculum-in-england-primary-curriculum
 *       Only the "Statutory requirements" lists are taken. Notes and guidance,
 *       "Examples (non-statutory)" blocks and the English appendices are not.
 *   - docs/EYFS_statutory_framework_from_September_2026.pdf
 *       The 17 Early Learning Goals, for Reception. The group and school based
 *       framework, from September 2026:
 *       https://assets.publishing.service.gov.uk/media/6a5f8e4fb00f3323bf1a23a1/EYFS_group_and_school_based_from_September_2026.pdf
 *   - docs/Development_Matters_2023.html
 *       DfE's non-statutory curriculum guidance, "3 and 4-year-olds", for
 *       Nursery: the HTML page saved from
 *       https://www.gov.uk/government/publications/development-matters--2/development-matters
 *       The statutory goals describe the END of Reception, so they would pitch
 *       a Nursery deck two years too high.
 *
 * Text is kept verbatim apart from: a capital first letter, no trailing full
 * stop, and dashes written as hyphens (the brand avoids en and em dashes in
 * anything a teacher reads). A bullet that introduces sub-bullets ("spell:")
 * is merged into each of them, so every statement stands on its own.
 * tests/unit/national-curriculum.spec.ts checks every statement still appears
 * word for word in its source.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getDocumentProxy, extractText } from "unpdf";

const PRIMARY_PDF = "docs/PRIMARY_national_curriculum.pdf";
const EYFS_PDF = "docs/EYFS_statutory_framework_from_September_2026.pdf";
const DM_HTML = "docs/Development_Matters_2023.html";
const OUT_DIR = "app/lib/national-curriculum/data";
const CURATION = "scripts/nc-curation.json";

// ── Shared text helpers ───────────────────────────────────────────────────

const BULLET = /^[•▪●·]/;

/** The spelling suffixes and prefixes English writes as "–s", "–ing", "un–". */
const SUFFIX = "s|es|ing|ed|er|est|ly|ful|less|ness|ment|y|en|ise|ize|ation|ous|tion|sion|ssion|cian|ible|able|ibly|ably|ant|ent|ance|ence|ancy|ency|ive|ic|al|ure|sure|ture|ough|ei|ie|ei";
// Only "un–" appears in the statutory lists. A wider list would catch prose
// such as "in – an overview".
const PREFIX = "un";

function tidy(s) {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)\]])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    // Affix notation first, so "adding – s or – es" reads "adding -s or -es".
    .replace(new RegExp(`\\s?[\\u2013\\u2014-]\\s?(${SUFFIX})(?=[\\s,.;\\]]|$)`, "g"), " -$1")
    .replace(new RegExp(`\\b(${PREFIX})\\s?[\\u2013\\u2014](?=[\\s,.;\\]]|$)`, "g"), "$1-")
    // Other dashes as hyphens: spaced ones stay spaced, the rest close up.
    .replace(/\s[–—]\s/g, " - ")
    .replace(/[–—]\s?/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

function display(s) {
  const t = tidy(s).replace(/[.;]+$/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function yearsKey(years) {
  if (years.length === 1) return `y${years[0]}`;
  return `y${years[0]}-${years[years.length - 1]}`;
}

// ── Primary national curriculum (Years 1 to 6) ────────────────────────────

/** Page ranges per subject. Everything outside them is introduction,
 *  appendix or glossary, none of which holds statutory lists. */
const SUBJECTS = [
  { name: "English", from: 17, to: 48 },
  { name: "Maths", from: 101, to: 141 },
  { name: "Science", from: 146, to: 175 },
  { name: "Art and design", from: 177, to: 177 },
  { name: "Computing", from: 179, to: 179 },
  { name: "Design and technology", from: 181, to: 183 },
  { name: "Geography", from: 185, to: 187 },
  { name: "History", from: 189, to: 192 },
  { name: "Languages", from: 194, to: 195 },
  { name: "Music", from: 197, to: 197 },
  { name: "Physical education", from: 199, to: 200 },
];

/** Headings that set which years the following lists apply to. */
function yearsFromHeading(text) {
  const t = text.toLowerCase().replace(/[–—]/g, "-");
  let m = t.match(/^years? (\d) (?:and|to) (\d) programme of study/);
  if (m) return range(+m[1], +m[2]);
  m = t.match(/^year (\d) programme of study/);
  if (m) return [+m[1]];
  if (/^spoken language - years 1 to 6/.test(t)) return range(1, 6);
  if (/^key stage 1 programme of study/.test(t)) return [1, 2];
  if (/^lower key stage 2 programme of study/.test(t)) return [3, 4];
  if (/^upper key stage 2 programme of study/.test(t)) return [5, 6];
  if (/^key stage 1$/.test(t)) return [1, 2];
  if (/^key stage 2$/.test(t)) return [3, 4, 5, 6];
  if (/^key stage 2: foreign language/.test(t)) return [3, 4, 5, 6];
  return null;
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Bold headings inside a statutory list that are a sub-section of the strand
 *  rather than a strand of their own. English's transcription strand is the
 *  one that has them; Chalkie and the document both treat it as one strand. */
const SUBSECTION = /^(spelling|handwriting|handwriting and presentation)\b/i;

/** The document is not consistent about one strand name. */
const STRAND_NAMES = { "Animals including humans": "Animals, including humans" };

/** Strands whose years the document states in prose rather than by heading.
 *  Swimming: "All schools must provide swimming instruction either in key
 *  stage 1 or key stage 2". */
const STRAND_YEARS = { "Physical education|Swimming and water safety": range(1, 6) };

/** Unpaired small type above a line is a superscript: a power, or the small
 *  "o" the document uses as a degree sign. */
const SUPER = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
function superscriptToken(text) {
  if (text === "o") return "°";
  if (/^\d+$/.test(text)) return [...text].map((d) => SUPER[d]).join("");
  return text;
}

/** Lines of one page, with stacked fractions and superscripts put back. */
async function pageLines(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  const tc = await page.getTextContent();
  const normal = [];
  const small = [];
  for (const it of tc.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const size = Math.round(Math.abs(it.transform[0]));
    const x = it.transform[4];
    const y = it.transform[5];
    // Running header and page number.
    if (y > 790 || y < 45) continue;
    const entry = { x, y, str: it.str, font: it.fontName, size, width: it.width };
    (size <= 9 ? small : normal).push(entry);
  }

  // Group normal items into lines.
  const lines = [];
  for (const it of normal.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }

  // Each small token goes to its nearest line, above it (a numerator or a
  // superscript) or below it (a denominator).
  const tokens = [];
  for (const it of small) {
    const charW = it.width / Math.max(1, it.str.length);
    let i = 0;
    for (const part of it.str.split(/(\s+)/)) {
      if (part.trim()) tokens.push({ text: part, x0: it.x + i * charW, x1: it.x + (i + part.length) * charW, y: it.y });
      i += part.length;
    }
  }
  for (const tok of tokens) {
    let best = null;
    for (const l of lines) {
      const d = Math.abs(l.y - tok.y);
      if (d <= 9 && (!best || d < Math.abs(best.y - tok.y))) best = l;
    }
    if (!best) continue;
    best.small ??= [];
    best.small.push({ ...tok, above: tok.y > best.y });
  }

  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    // Per-character positions so a fraction lands in the gap left for it.
    // Runs carry no space at their edges, so a visible gap between two runs
    // is a space ("in" + "English Appendix 1", a hyperlink run).
    const chars = [];
    let prevEnd = null;
    for (const it of l.items) {
      const w = it.width / Math.max(1, it.str.length);
      if (prevEnd !== null && it.x - prevEnd > 1.2 && chars.length && chars[chars.length - 1].ch !== " " && !it.str.startsWith(" ")) {
        chars.push({ ch: " ", x: prevEnd });
      }
      [...it.str].forEach((ch, k) => chars.push({ ch, x: it.x + k * w }));
      prevEnd = it.x + it.width;
    }
    const inserts = [];
    const above = (l.small ?? []).filter((t) => t.above);
    const below = (l.small ?? []).filter((t) => !t.above);
    const usedBelow = new Set();
    for (const num of above) {
      let match = null;
      let overlap = 0;
      below.forEach((den, k) => {
        if (usedBelow.has(k)) return;
        const o = Math.min(num.x1, den.x1) - Math.max(num.x0, den.x0);
        if (o > overlap - 0.5 && Math.abs((num.x0 + num.x1) / 2 - (den.x0 + den.x1) / 2) < 8) {
          match = k;
          overlap = o;
        }
      });
      if (match !== null && /^\d+$/.test(num.text) && /^\d+$/.test(below[match].text)) {
        usedBelow.add(match);
        inserts.push({ x: Math.min(num.x0, below[match].x0), text: ` ${num.text}/${below[match].text} `, fraction: true });
      } else {
        // A superscript: the "th" of "20th", the 2 of cm², a degree sign.
        inserts.push({ x: num.x0, text: superscriptToken(num.text), fraction: false });
      }
    }
    below.forEach((den, k) => {
      if (!usedBelow.has(k)) inserts.push({ x: den.x0, text: den.text, fraction: false });
    });
    for (const ins of inserts.sort((a, b) => b.x - a.x)) {
      const at = chars.findIndex((c) => c.x > ins.x);
      const piece = [...ins.text].map((ch) => ({ ch, x: ins.x }));
      if (at === -1) chars.push(...piece);
      else chars.splice(at, 0, ...piece);
    }
    const first = l.items[0];
    return {
      y: l.y,
      x: Math.round(first.x),
      font: first.font,
      size: first.size,
      bold: first.font === boldFont,
      // A superscript sits flush on its unit and is followed by a space: "cm³ blocks".
      text: chars.map((c) => c.ch).join("").replace(/\s+/g, " ").replace(/\s+([²³°])/g, "$1").replace(/([²³])(?=[a-z])/g, "$1 ").trim(),
      hadSmall: (l.small ?? []).length > 0,
      page: pageNo,
    };
  });
}

let boldFont = "";

async function buildPrimary() {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(PRIMARY_PDF)));
  // The heading font is the one "Notes and guidance (non-statutory)" is set
  // in. Found rather than assumed, so a different extractor's font naming
  // does not silently break the build.
  {
    const probe = await (await pdf.getPage(161)).getTextContent();
    boldFont = probe.items.find((it) => it.str?.startsWith("Notes and guidance"))?.fontName ?? "g_d0_f1";
  }

  const statements = [];
  const review = [];

  for (const subject of SUBJECTS) {
    let years = null;
    let strand = null;
    let collecting = false;
    let skipping = false; // inside an "Examples (non-statutory)" block
    let paragraph = []; // non-bullet prose lines at the margin
    let current = null; // the bullet being read
    let stem = null; // a level 1 bullet that introduces sub-bullets
    let baseX = null;

    const emit = (b) => {
      if (!b || !years) return;
      const parts = b.stem ? [b.stem.text, b.text] : [b.text];
      const text = b.stem ? `${display(b.stem.text).replace(/:$/, "")}: ${tidy(b.text).replace(/[.;]+$/, "")}` : display(b.text);
      // Subjects with no strand headings (Art, Computing, History, Languages,
      // Music, most of PE) have one strand, named as Chalkie names it.
      const named = strand ? tidy(strand).replace(/ - /g, ": ") : "Core";
      const strandName = STRAND_NAMES[named] ?? named;
      statements.push({
        subject: subject.name,
        strand: strandName,
        years: [...(STRAND_YEARS[`${subject.name}|${strandName}`] ?? years)],
        text,
        parts: parts.map(tidy),
        page: b.page,
        needsReview: b.hadSmall || undefined,
      });
    };
    const flush = () => {
      if (current) {
        if (current.level === 1) {
          // A stem whose sub-bullets never came is a statement in its own right.
          if (!current.isStem || current.children === 0) emit(current.isStem ? { ...current, isStem: false } : current);
        } else emit(current);
      }
      current = null;
    };

    for (let p = subject.from; p <= subject.to; p++) {
      const lines = await pageLines(pdf, p);
      for (const line of lines) {
        const t = line.text;
        if (!t) continue;
        baseX ??= line.x;

        if (line.bold) {
          // Headings end whatever list was open, and any prose before them.
          paragraph = [];
          const ys = yearsFromHeading(t);
          // A small "Key stage 1" / "Key stage 2" inside a strand narrows its
          // years without ending it: D&T's "Cooking and nutrition" has both.
          if (ys && line.size < 14 && strand && !/programme of study|^spoken language/i.test(t)) {
            // The "Pupils should be taught to:" above still applies.
            flush();
            years = ys;
            continue;
          }
          if (/^notes and guidance/i.test(t)) { flush(); collecting = false; skipping = false; continue; }
          if (/^examples \(non-statutory\)/i.test(t)) { flush(); skipping = true; continue; }
          if (/^statutory requirements/i.test(t)) { flush(); collecting = true; skipping = false; continue; }
          if (/^subject content$/i.test(t) || /^purpose of study|^aims|^attainment targets/i.test(t)) { flush(); collecting = false; continue; }
          if (ys) { flush(); years = ys; strand = null; collecting = false; skipping = false; stem = null; continue; }
          // A large heading that is not a year heading opens a strand of its
          // own: D&T's "Cooking and nutrition".
          if (line.size >= 14) { flush(); collecting = false; strand = t; stem = null; continue; }
          if (SUBSECTION.test(t) && strand) { flush(); continue; }
          // A strand heading.
          flush();
          strand = t;
          stem = null;
          skipping = false;
          continue;
        }

        const isBullet = BULLET.test(t);
        if (isBullet) {
          const level = line.x < baseX + 12 ? 1 : 2;
          const body = t.replace(BULLET, "").trim();
          if (level === 1) skipping = false;
          if (skipping) continue;
          if (paragraph.length) {
            const para = paragraph.join(" ");
            paragraph = [];
            if (/should be taught/i.test(para) && /:\s*$/.test(para)) collecting = true;
          }
          if (!collecting) continue;
          // Counted BEFORE the flush: flushing a stem that already has a child
          // must not emit the stem as a statement of its own.
          if (level === 2 && stem) stem.children++;
          flush();
          if (level === 1) {
            stem = null;
            current = { level: 1, text: body, page: line.page, hadSmall: line.hadSmall, isStem: /:\s*$/.test(body), children: 0 };
            if (current.isStem) stem = current;
          } else {
            current = { level: 2, text: body, stem, page: line.page, hadSmall: line.hadSmall || stem?.hadSmall };
          }
          continue;
        }

        // Plain text: a continuation of the open bullet, or margin prose.
        if (current && line.x > baseX + 12) {
          if (!skipping) {
            current.text += " " + t;
            if (line.hadSmall) current.hadSmall = true;
            // A stem can wrap onto a second line before its colon.
            if (current.level === 1) {
              current.isStem = /:\s*$/.test(current.text);
              if (current.isStem) stem = current;
            }
          }
          continue;
        }
        if (line.x <= baseX + 12) {
          flush();
          if (stem && stem.children > 0) stem = null;
          paragraph.push(t);
          // Prose closes the list; "... should be taught to:" reopens it. A
          // marker can wrap over two lines before its colon, so prose that is
          // still heading towards one keeps the list's state until it lands.
          const para = paragraph.join(" ");
          if (/should be taught/i.test(para) && /:\s*$/.test(para)) {
            collecting = true;
            paragraph = [];
          } else if (!/should be taught|during years/i.test(para)) {
            collecting = false;
          }
        }
      }
    }
    flush();
  }

  // Ids: year scope, subject, strand, position. Stable for a given document.
  const counters = new Map();
  for (const s of statements) {
    const base = `${yearsKey(s.years)}-${slug(s.subject)}-${slug(s.strand)}`;
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    s.id = `${base}-${String(n).padStart(2, "0")}`;
    if (s.needsReview) review.push(s);
  }
  return { statements, review };
}

// ── Reception: the Early Learning Goals ───────────────────────────────────

const EYFS_AREAS = [
  "Communication and Language",
  "Personal, Social and Emotional Development",
  "Physical Development",
  "Literacy",
  "Mathematics",
  "Understanding the World",
  "Expressive Arts and Design",
];

async function buildReception() {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(EYFS_PDF)));
  const { text } = await extractText(pdf, { mergePages: false });
  const out = [];
  let area = null;
  let goal = null;
  let current = null;
  const flush = () => {
    if (current && area && goal) {
      out.push({ subject: area, strand: goal, years: ["Reception"], text: display(current.text), parts: [tidy(current.text)], page: current.page });
    }
    current = null;
  };
  text.forEach((pageText, i) => {
    if (!/ELG:/.test(pageText)) return;
    for (const raw of pageText.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (EYFS_AREAS.includes(line)) { flush(); area = line; continue; }
      const g = line.match(/^ELG:\s*(.+)$/);
      if (g) { flush(); goal = g[1].trim(); continue; }
      if (/^Children at the expected level of development will:/.test(line)) { flush(); continue; }
      if (BULLET.test(line)) { flush(); current = { text: line.replace(BULLET, "").trim(), page: i + 1 }; continue; }
      if (current && !/^(Learning and Development Considerations|\d+\.\d+)/.test(line)) { current.text += " " + line; continue; }
      flush();
      if (/^Learning and Development Considerations/.test(line)) { area = null; goal = null; }
    }
    flush();
  });
  return out;
}

// ── Nursery: Development Matters, 3 and 4-year-olds ───────────────────────

function decode(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"');
}

function buildNursery() {
  const html = readFileSync(DM_HTML, "utf8");
  const out = [];
  // Each area of learning is an <h2>, in the same order as the framework.
  const areaRe = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/g;
  for (const m of html.matchAll(areaRe)) {
    const title = decode(m[1]).trim();
    const area = EYFS_AREAS.find((a) => a.toLowerCase() === title.toLowerCase());
    if (!area) continue;
    const body = m[2];
    const listRe = /<strong>\s*3 and 4-year-olds\s*<\/strong>\s*will be learning to:\s*<\/p>\s*(<ul>[\s\S]*?<\/ul>)(?=\s*<(?:h4|hr|p|div)\b)/g;
    for (const l of body.matchAll(listRe)) {
      // Top-level items, with any nested list merged into its stem.
      const ul = l[1];
      const items = [];
      let depth = 0;
      let buf = "";
      let nested = [];
      const tokenRe = /<(\/?)(ul|li)\b[^>]*>|([^<]+)|<[^>]+>/g;
      let liDepth = 0;
      let nestedBuf = "";
      for (const t of ul.matchAll(tokenRe)) {
        const [, close, tag, txt] = t;
        if (tag === "ul") { depth += close ? -1 : 1; continue; }
        if (tag === "li") {
          if (!close) { liDepth++; if (liDepth === 2) nestedBuf = ""; }
          else {
            if (liDepth === 2) nested.push(decode(nestedBuf));
            if (liDepth === 1) { items.push({ text: decode(buf), nested }); buf = ""; nested = []; }
            liDepth--;
          }
          continue;
        }
        if (txt) { if (liDepth >= 2) nestedBuf += txt; else if (liDepth === 1) buf += txt; }
      }
      for (const it of items) {
        if (it.nested.length) {
          for (const n of it.nested) {
            out.push({ subject: area, strand: "3 and 4-year-olds", years: ["Nursery"], text: `${display(it.text).replace(/:$/, "")}: ${tidy(n)}`, parts: [tidy(it.text), tidy(n)], page: null });
          }
        } else {
          out.push({ subject: area, strand: "3 and 4-year-olds", years: ["Nursery"], text: display(it.text), parts: [tidy(it.text)], page: null });
        }
      }
    }
  }
  return out;
}

// ── Curation and output ───────────────────────────────────────────────────

function applyCuration(statements) {
  let curation = { replace: {}, drop: [] };
  try { curation = { ...curation, ...JSON.parse(readFileSync(CURATION, "utf8")) }; } catch { /* none yet */ }
  const drop = new Set(curation.drop ?? []);
  return statements
    .filter((s) => !drop.has(s.id))
    .map((s) => {
      const r = curation.replace?.[s.id];
      if (!r) { const { needsReview, ...rest } = s; void needsReview; return rest; }
      const { needsReview, ...rest } = s; void needsReview;
      return { ...rest, text: r };
    });
}

function withIds(list, key) {
  const counters = new Map();
  return list.map((s) => {
    const base = `${key}-${slug(s.subject)}-${slug(s.strand)}`;
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    return { id: `${base}-${String(n).padStart(2, "0")}`, ...s };
  });
}

function report(label, statements) {
  console.log(`\n${label}: ${statements.length} statements`);
  const by = new Map();
  for (const s of statements) {
    const k = `${s.years.join(",").padEnd(9)} ${s.subject} > ${s.strand}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...by.entries()].sort()) console.log(`  ${String(n).padStart(3)}  ${k}`);
}

const primary = await buildPrimary();
const primaryOut = applyCuration(primary.statements);
const early = [...withIds(buildNursery(), "nursery"), ...withIds(await buildReception(), "reception")];

/** One statement per line: small enough to load in the browser, and a change
 *  to one statement is a one-line diff. */
function writeData(path, header, statements) {
  const head = JSON.stringify(header).slice(1, -1);
  const rows = statements.map(({ id, subject, strand, years, text, page }) => JSON.stringify({ id, subject, strand, years, text, page }));
  writeFileSync(path, `{${head},\n"statements": [\n${rows.join(",\n")}\n]}\n`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeData(`${OUT_DIR}/primary.json`, {
  source: { doc: PRIMARY_PDF, title: "The national curriculum in England: key stages 1 and 2 framework document", published: "September 2013" },
}, primaryOut);
writeData(`${OUT_DIR}/early-years.json`, {
  sources: {
    reception: { doc: EYFS_PDF, title: "Early years foundation stage statutory framework (group and school-based providers)", published: "September 2026" },
    nursery: { doc: DM_HTML, title: "Development Matters: non-statutory curriculum guidance for the EYFS", published: "September 2023" },
  },
}, early);

report("Primary", primaryOut);
report("Early years", early);
if (primary.review.length) {
  console.log(`\nStatements built from small type (fractions, superscripts). Check each against the PDF:`);
  for (const s of primary.review) console.log(`  ${s.id} (p${s.page}): ${s.text}`);
}
