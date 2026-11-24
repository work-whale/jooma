#!/usr/bin/env node
/**
 * Builds the standards statements the "Align to curriculum" card offers to
 * teachers outside England.
 *
 *   node scripts/build-standards.mjs
 *
 * Reads the official documents in docs/standards/ and writes
 * app/lib/standards/data/<framework>.json, plus a count report on stdout to
 * review. The JSON is committed; run this again only when a source changes.
 * tests/unit/standards.spec.ts checks every statement word for word against
 * its source.
 *
 * Sources (fixed copies in docs/standards/, fetched 2026-11-15):
 *   - CCSS_Math_Standards_ADA.pdf, CCSS_ELA_Standards_ADA.pdf
 *       Common Core State Standards, the accessible (ADA-compliant) editions
 *       from https://corestandards.org/ (the per-standard pages and the old XML
 *       downloads are offline). Public License: © Copyright 2010. National
 *       Governors Association Center for Best Practices and Council of Chief
 *       State School Officers. All rights reserved.
 *       ELA takes the K to 12 English language arts standards (RL, RI, RF, W,
 *       SL, L). The grades 6 to 12 literacy standards for history, science and
 *       technical subjects are not included.
 *   - NGSS_AllTopic.pdf
 *       Next Generation Science Standards, all performance expectations by
 *       topic, https://www.nextgenscience.org/sites/default/files/AllTopic.pdf
 *       Only the performance expectations are taken (not the clarification
 *       statements, assessment boundaries or foundation boxes).
 *   - AC9_curriculum_workbook.xlsx
 *       Australian Curriculum v9.0, ACARA's curriculum workbook from
 *       https://www.australiancurriculum.edu.au/downloads (CC BY 4.0). Content
 *       descriptions, Foundation to Year 10, for English, Mathematics, Science,
 *       Humanities and Social Sciences, The Arts, Technologies and Health and
 *       Physical Education. Languages are left out on purpose. A two-year band
 *       ("Years 3 and 4") gives both ages.
 *
 * Text is kept verbatim apart from: a capital first letter, collapsed
 * whitespace, and en and em dashes written as hyphens (the brand avoids them in
 * anything a teacher reads). A standard with lettered parts keeps them, each as
 * "(a) ..." after the stem.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import JSZip from "jszip";
import { getDocumentProxy, extractText } from "unpdf";

const SRC = "docs/standards";
const OUT = "app/lib/standards/data";

export const clean = (s) =>
  s
    // The maths PDF draws the "unknown number" box as a glyph that extracts
    // as U+FFFD ("5 = ? - 3"); it is a box in the printed standard.
    .replace(/�/g, "□")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

async function pdfPages(file) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`${SRC}/${file}`)));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t) => t.split("\n"));
}

/** Age at the start of a US grade. */
const gradeAge = (g) => (g === "K" ? 5 : Number(g) + 5);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ── Common Core mathematics ────────────────────────────────────────────────

async function ccssMath() {
  const pages = await pdfPages("CCSS_Math_Standards_ADA.pdf");
  const domains = new Map();
  const out = [];
  let cur = null;
  let part = null;
  // Footnote markers print as plain digits after a word or a sentence
  // ("the problem.2", "problems4 using"). Only those go: a digit after a
  // single-letter variable ("x2") or inside a code ("1.OA.6") stays.
  // Exponents print as superscripts and extract as plain digits ("x2 = p",
  // "(x2 + y2)2"): a 2, 3 or 4 straight after a single-letter variable or a
  // closing bracket is put back as a superscript, before markers are taken.
  const SUP = { 2: "²", 3: "³", 4: "⁴" };
  const unmark = (s) =>
    clean(s)
      .replace(/(?<=(?:^|[\s(])[a-z]|\))([234])(?=[\s)=+\-,.;]|$)/g, (d) => SUP[d])
      .replace(/(?<=[a-z]{3}|[a-z]{2}[.”"]|\)\.|\.[”"])\d{1,2}(?=\s|$)/g, "")
      // After a number's full stop only when a new sentence follows ("10 and
      // 100.4 For example"), never in a decimal ("between 1.4 and 1.5").
      .replace(/(?<=\d\.)\d(?=\s[A-Z])/g, "");
  const flush = () => {
    if (!cur) return;
    const text = [unmark(cur.stem), ...cur.parts.map((p, i) => `(${String.fromCharCode(97 + i)}) ${unmark(p)}`)].join(" ");
    out.push({ ...cur.meta, text: cap(text) });
    cur = null;
    part = null;
  };
  for (const lines of pages) {
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const dom = line.match(/^(.+?)\s+((?:K|[1-8])\.[A-Z]+|HS[A-Z]-[A-Z]+)$/);
      if (dom && !/^\d+\./.test(line)) {
        flush();
        domains.set(dom[2], clean(dom[1]).replace(/(?<=[a-z])\d+$/, ""));
        continue;
      }
      const std = line.match(/^\d+\.\s+((K|[1-8]|HS[A-Z])[.-][A-Z]+[A-Za-z0-9.-]*)$/);
      if (std) {
        flush();
        const code = std[1];
        const grade = std[2];
        const domainCode = code.replace(/\.[A-Z]\.\d+$/, "");
        cur = {
          meta: {
            id: `ccss-math-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            code: `CCSS.MATH.CONTENT.${code}`,
            subject: "Mathematics",
            strand: domains.get(domainCode) ?? domainCode,
            ages: grade.startsWith("HS") ? range(14, 17) : [gradeAge(grade)],
          },
          stem: "",
          parts: [],
        };
        continue;
      }
      if (!cur) continue;
      // A page heading, a cluster ("A. Use place value ..."), or the page's
      // footnotes ("1See Glossary, Table 2.") end the standard.
      if (/^COMMON CORE STATE STANDARDS/i.test(line) || /^[A-Z]\.\s/.test(line) || /^\d{1,2}[A-Z][a-z]/.test(line)) {
        flush();
        continue;
      }
      const sub = line.match(/^([a-z])\.\s+(.*)$/);
      if (sub) {
        cur.parts.push(sub[2]);
        part = cur.parts.length - 1;
        continue;
      }
      if (part === null) cur.stem += ` ${line}`;
      else cur.parts[part] += ` ${line}`;
    }
    flush();
  }
  return out;
}

// ── Common Core English language arts ──────────────────────────────────────

/** The section label each page carries near its top, lower-cased. */
const ELA_STRANDS = {
  "reading: literature": ["RL", "Reading: Literature"],
  "reading: informational text": ["RI", "Reading: Informational Text"],
  "reading: foundational skills": ["RF", "Reading: Foundational Skills"],
  writing: ["W", "Writing"],
  "speaking and listening": ["SL", "Speaking and Listening"],
  language: ["L", "Language"],
};
const ELA_CLUSTERS = new Set(
  [
    "Key Ideas and Details", "Craft and Structure", "Integration of Knowledge and Ideas",
    "Range of Reading and Level of Text Complexity", "Print Concepts", "Phonological Awareness",
    "Phonics and Word Recognition", "Fluency", "Text Types and Purposes",
    "Production and Distribution of Writing", "Research to Build and Present Knowledge", "Range of Writing",
    "Comprehension and Collaboration", "Presentation of Knowledge and Ideas", "Conventions of Standard English",
    "Knowledge of Language", "Vocabulary Acquisition and Use",
  ].map((s) => s.toLowerCase()),
);
/** Cells that hold no standard, but still take their column. */
const PLACEHOLDER = /^\((?:Not applicable|Begins in grade|See grade|Include)/i;

function gradesFromHeader(line) {
  const out = [];
  for (const m of line.matchAll(/Kindergartners|Grades? (\d+)(?:\s*[-–]\s*(\d+))? students/g)) {
    if (m[0] === "Kindergartners") out.push({ key: "K", ages: [5] });
    else if (m[2]) out.push({ key: `${m[1]}-${m[2]}`, ages: range(Number(m[1]) + 5, Number(m[2]) + 5) });
    else out.push({ key: m[1], ages: [Number(m[1]) + 5] });
  }
  return out;
}

async function ccssEla() {
  const pages = await pdfPages("CCSS_ELA_Standards_ADA.pdf");
  const out = [];
  const report = [];
  for (const lines of pages) {
    // The title sits in the first few lines; the running header names
    // "literacy in history/social studies, science, and technical subjects"
    // on every page, so only the title decides.
    const top = lines.slice(0, 6).join("\n");
    if (/Standards for Literacy in/i.test(top)) continue;
    // "12 | K-5 | rEAdiNg: LiTErATurE" or "36 | 6-12 | ENgLiSh LANguAgE ArTS | wriTiNg".
    const label = lines
      .slice(0, 6)
      .map((l) => l.trim().match(/^\d+ \| (?:K-5|6-12) \| (.+)$/)?.[1].split(" | ").at(-1).trim().toLowerCase())
      .find((l) => l && ELA_STRANDS[l]);
    const strand = label ? ELA_STRANDS[label] : null;
    const headerAt = lines.findIndex((l) => /students:|Kindergartners:/.test(l));
    if (!strand || headerAt === -1) continue;
    // The grade headings, sometimes broken over the next lines.
    const headerText = [lines[headerAt], ...lines.slice(headerAt + 1, headerAt + 3).filter((l) => /students:/.test(l) && !/^\d/.test(l.trim()))].join(" ");
    let columns = gradesFromHeader(headerText);
    if (columns.length === 1 && columns[0].key === "K") columns = gradesFromHeader("Kindergartners: Grade 1 students: Grade 2 students:");
    if (!columns.length) continue;

    // Items in reading order: "N. stem", "a. part", continuation lines.
    const items = [];
    // A placeholder cell can share its line with the next column's standard:
    // "3. (Begins in grade 2) 3. (Begins in grade 2) 3. Use knowledge of ...".
    const expanded = lines
      .slice(headerAt + 1)
      .flatMap((l) => (/^\d{1,2}\.\s+\(/.test(l.trim()) ? l.trim().split(/(?<=\))\s+(?=\d{1,2}\.\s)/) : [l]));
    for (const raw of expanded) {
      const line = raw.trim();
      if (!line || /^\d+ \| /.test(line) || /^Common Core State Standard/i.test(line)) continue;
      if (ELA_CLUSTERS.has(line.toLowerCase().replace(/\s+/g, " "))) continue;
      const num = line.match(/^(\d{1,2})\.\s+(.*)$/);
      if (num) {
        items.push({ n: Number(num[1]), stem: num[2], parts: [] });
        continue;
      }
      const sub = line.match(/^([a-z])\.\s+(.*)$/);
      const last = items.at(-1);
      if (!last) continue;
      if (sub) last.parts.push(sub[2]);
      else if (last.parts.length) last.parts[last.parts.length - 1] += ` ${line}`;
      else last.stem += ` ${line}`;
    }

    // Each item goes to the leftmost column whose last standard number is
    // lower. That reads both orders the PDF uses, row by row (1,1,1,2,2,2)
    // and column by column (4,5,6,4,5,6), and a merged "(Not applicable)"
    // cell, which appears once and leaves the other columns without it.
    const lastIn = columns.map(() => 0);
    for (const it of items) {
      const col = lastIn.findIndex((last) => last < it.n);
      if (col === -1) throw new Error(`ELA page with ${strand[0]}: no column for standard ${it.n} (${it.stem.slice(0, 40)})`);
      lastIn[col] = it.n;
      const n = it.n;
      {
        const g = columns[col];
        if (!PLACEHOLDER.test(it.stem.trim())) {
          const code = `${strand[0]}.${g.key}.${n}`;
          const text = [clean(it.stem), ...it.parts.map((p, k) => `(${String.fromCharCode(97 + k)}) ${clean(p)}`)].join(" ");
          out.push({
            id: `ccss-ela-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            code: `CCSS.ELA-LITERACY.${code}`,
            subject: "English Language Arts",
            strand: strand[1],
            ages: g.ages,
            text: cap(text),
          });
        }
        report.push(`${strand[0]}.${g.key}.${n}`);
      }
    }
  }
  return out;
}

// ── NGSS performance expectations ──────────────────────────────────────────

const PE = /((?:K-2|3-5|K|[1-5]|MS|HS)-[A-Z]{2,4}\d?-\d+)\.\s+(?=[A-Z])/g;

function peAges(code) {
  const band = code.match(/^(K-2|3-5|K|[1-5]|MS|HS)-/)[1];
  if (band === "K-2") return [5, 6, 7];
  if (band === "3-5") return [8, 9, 10];
  if (band === "MS") return [11, 12, 13];
  if (band === "HS") return range(14, 17);
  return [gradeAge(band)];
}

async function ngss() {
  const pages = await pdfPages("NGSS_AllTopic.pdf");
  const seen = new Map();
  for (const lines of pages) {
    // The topic is the page's heading, "3.Inheritance and Variation of Traits: ...".
    const topicLine = lines.find((l) => /^(?:K-2|3-5|K|[1-5]|MS|HS)\.\s?[A-Z]/.test(l.trim()));
    const topic = topicLine ? clean(topicLine.trim().replace(/^(?:K-2|3-5|K|[1-5]|MS|HS)\.\s?/, "")) : "";
    const flat = clean(lines.join(" "));
    const hits = [...flat.matchAll(PE)];
    for (let k = 0; k < hits.length; k++) {
      const code = hits[k][1];
      if (seen.has(code)) continue;
      const start = hits[k].index + hits[k][0].length;
      const end = k + 1 < hits.length ? hits[k + 1].index : flat.length;
      let text = flat.slice(start, end);
      // The expectation ends at its clarification or boundary, or where the
      // foundation boxes begin.
      text = text.split(/\s\[(?:Clarification Statement|Assessment Boundary)/)[0];
      text = text.split(/\sThe performance expectation|\sScience and Engineering Practices|\sDisciplinary Core Ideas|\sCrosscutting Concepts/)[0];
      text = clean(text);
      if (text.length < 20) continue;
      seen.set(code, {
        id: `ngss-${code.toLowerCase()}`,
        code,
        subject: "Science",
        strand: topic,
        ages: peAges(code),
        text: cap(text),
      });
    }
  }
  return [...seen.values()];
}

// ── Australian Curriculum v9 ───────────────────────────────────────────────

/** ACARA writes a few numbers in LaTeX ("\(\frac12\)", "\(\pi\)"). Jooma shows
 *  plain text and tells the model never to use LaTeX, so they become "1/2". */
const plainMath = (s) =>
  s.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) =>
    m
      .replace(/\\frac\s*(?:\{(\d+)\}|(\d))\s*(?:\{(\d+)\}|(\d+))/g, (_m, a1, a2, b1, b2) => `${a1 ?? a2}/${b1 ?? b2}`)
      .replace(/\\pi\b/g, "π")
      .trim(),
  );

/** The workbook's Subject column, as a teacher knows it: "HASS F-6" is
 *  Humanities and Social Sciences, and the Years 7 to 10 subjects lose their
 *  "7-10" ("History 7-10" is History). The rest stay as they are. */
const AC9_SUBJECT = (name) => (name === "HASS F-6" ? "Humanities and Social Sciences" : name.replace(/\s+7-10$/, ""));

/** The ages a workbook level covers: "Foundation Year" is 5, "Year N" is N + 5,
 *  and a two-year band ("Years 3 and 4") is both ages, [8, 9]. null for
 *  anything else. */
function ac9Ages(level) {
  if (level === "Foundation Year") return [5];
  const one = level.match(/^Year (\d+)$/);
  if (one) return [Number(one[1]) + 5];
  const band = level.match(/^Years (\d+) and (\d+)$/);
  if (band && Number(band[2]) === Number(band[1]) + 1) return [Number(band[1]) + 5, Number(band[2]) + 5];
  return null;
}

/** Every learning area but Languages. Languages (1,283 statements, two
 *  sequences per language that overlap at the same year) are left out on
 *  purpose: the owner's decision, 2026-11-24. */
const AC9_AREAS = ["English", "Mathematics", "Science", "Humanities and Social Sciences", "The Arts", "Technologies", "Health and Physical Education"];

async function ac9() {
  const zip = await JSZip.loadAsync(readFileSync(`${SRC}/AC9_curriculum_workbook.xlsx`));
  const M = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const shared = [...(await zip.file("xl/sharedStrings.xml").async("string")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
  );
  const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
  if (!sheet.includes(M)) throw new Error("AC9 workbook: unexpected sheet");
  const out = [];
  const ctx = {};
  for (const r of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = c[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      cells[c[1]] = unesc(/t="s"/.test(c[2]) && v !== undefined ? shared[Number(v)] : (inline ?? v ?? ""));
    }
    const area = cells.A;
    if (!AC9_AREAS.includes(area)) continue;
    // The strand in force is kept per subject AND level: Dance and Music, or
    // History and Geography, repeat their own strand rows at the same level.
    const key = `${area}|${cells.B ?? ""}|${cells.C ?? ""}`;
    if (cells.H) ctx[key] = { strand: cells.H, sub: "" };
    if (cells.I) ctx[key] = { ...(ctx[key] ?? { strand: "" }), sub: cells.I };
    const code = cells.E ?? "";
    if (!/^AC9[A-Z]+\w*\d$/.test(code) || !cells.J || cells.K) continue;
    const level = cells.C ?? "";
    const ages = ac9Ages(level);
    if (!ages) continue;
    const where = ctx[key] ?? { strand: "", sub: "" };
    out.push({
      id: `ac9-${code.toLowerCase()}`,
      code,
      subject: AC9_SUBJECT(cells.B ?? area),
      strand: clean([where.strand, where.sub].filter(Boolean).join(": ")),
      ages,
      text: cap(clean(plainMath(cells.J.replace(/<[^>]+>/g, " ")))),
    });
  }
  // English, Mathematics and Science keep their place at the front (and so
  // their order on the card); the other learning areas follow in workbook order.
  const first = (s) => (["English", "Mathematics", "Science"].includes(s.subject) ? 0 : 1);
  return out.sort((a, b) => first(a) - first(b));
}

// ── Write ──────────────────────────────────────────────────────────────────

const SOURCES = {
  "ccss-math": {
    title: "Common Core State Standards for Mathematics",
    file: "docs/standards/CCSS_Math_Standards_ADA.pdf",
    url: "https://corestandards.org/",
    credit: "Common Core State Standards: © Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.",
  },
  "ccss-ela": {
    title: "Common Core State Standards for English Language Arts",
    file: "docs/standards/CCSS_ELA_Standards_ADA.pdf",
    url: "https://corestandards.org/",
    credit: "Common Core State Standards: © Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.",
  },
  ngss: {
    title: "Next Generation Science Standards",
    file: "docs/standards/NGSS_AllTopic.pdf",
    url: "https://www.nextgenscience.org/",
    credit:
      "NGSS is a registered trademark of WestEd. Neither WestEd nor the lead states and partners that developed the Next Generation Science Standards were involved in the production of this product, and do not endorse it.",
  },
  ac9: {
    title:
      "Australian Curriculum v9.0 (English, Mathematics, Science, Humanities and Social Sciences, The Arts, Technologies, Health and Physical Education; Languages are not included)",
    file: "docs/standards/AC9_curriculum_workbook.xlsx",
    url: "https://www.australiancurriculum.edu.au/",
    credit:
      "© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2010 to present, unless otherwise indicated. This material was downloaded from the Australian Curriculum website (accessed 15 November 2026) and was modified. The material is licensed under CC BY 4.0.",
  },
};

const built = { "ccss-math": await ccssMath(), "ccss-ela": await ccssEla(), ngss: await ngss(), ac9: await ac9() };
mkdirSync(OUT, { recursive: true });
for (const [id, statements] of Object.entries(built)) {
  const ids = new Set();
  for (const s of statements) {
    if (ids.has(s.id)) throw new Error(`${id}: duplicate ${s.id}`);
    ids.add(s.id);
  }
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify({ source: SOURCES[id], statements }, null, 1) + "\n");
  const byAge = {};
  for (const s of statements) for (const a of s.ages) byAge[a] = (byAge[a] ?? 0) + 1;
  const bySubject = {};
  for (const s of statements) bySubject[s.subject] = (bySubject[s.subject] ?? 0) + 1;
  console.log(`${id}: ${statements.length} statements`, JSON.stringify(bySubject), "by age", JSON.stringify(byAge));
}
