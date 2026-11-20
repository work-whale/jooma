#!/usr/bin/env node
/**
 * Builds the statements the "Align to curriculum" card offers to teachers in
 * Scotland and Northern Ireland.
 *
 *   node scripts/build-uk-curricula.mjs --nation=scotland
 *   node scripts/build-uk-curricula.mjs --nation=northern-ireland
 *
 * (--nation=wales refuses: Wales is not built, see docs/uk-curricula-build.md.)
 *
 * Reads the fixed source copies in docs/standards/uk/<nation>/ and writes
 * app/lib/standards/data/<framework>.json, plus a count report on stdout to
 * review. The JSON is committed; run this again only when a source changes.
 * tests/unit/uk-curricula-data.spec.ts checks every statement word for word
 * against its source. Never hand-edit the JSON: fix this script instead.
 *
 * Do NOT import scripts/build-standards.mjs: it runs its whole build at top
 * level and would rewrite the US and Australian data.
 *
 * ── Scotland: Curriculum for Excellence experiences and outcomes ("Es and Os")
 * Education Scotland, https://education.gov.scot/curriculum-for-excellence/
 *   curriculum-for-excellence-documents/experiences-and-outcomes/
 * (page updated 27/04/2026, fetched 2026-11-20). One PDF per curriculum area,
 * saved in docs/standards/uk/scotland/ (sha256 in the build doc):
 *   expressive-arts-eo.pdf            c84cb7ca1ae79093003004d5eace1e58de113c2807135c22e525800d7eddfc3b
 *   health-and-wellbeing-eo.pdf       17108f9b17d2d639e3b08ed3a303039c9f8bb0de0a518ce9e1a43e9dd9b3742d
 *   classical-languages-eo.pdf        8543f2753e10236b3e0293206d1c4ce64388ed2675cd44a71c534d2c60c3e6d1
 *   gaelic-learners-eo.pdf            2c522fa26a15bd48b5a15c45673a8c3960adec1939ef8fd12f5d7ff493f90694
 *   literacy-english-eo.pdf           18ab523c8fb3e4389b004397f86e8ac31a013093c2b052743df5dbd364456281
 *   modern-languages-eo.pdf           da036f6c5a2427d9da26dde12de55c29aa80cb73abf2f2c183615b0582b68e40
 *   numeracy-maths-eo.pdf             2976f73347215d3f97fe7eb50b9724b4738418e734c7d36845e022bf2aef9f55
 *   rme-eo.pdf                        e31afd9b5f56c0614c813e9c0dc56a7b6875a69d26d4c4fe869f5f7c7ab44df2
 *   rerc-eo.pdf                       a05836374047dea5cd05dcab5edd252c5ec534d9e86381162c677ad9ad32575a
 *   sciences-eo.pdf                   6e3f2f55ac3b53fcf1f53d738697bbb3221caf250403b903f45c792ecd7c0d8f
 *   social-studies-eo.pdf             15d410e83d8632c65c4dfec4c300d1239ebb16ce69991c69893b027f02f9ffa4
 *   technologies-es-os.pdf            d93fc1c3011a1d9b257a8b91dfa35d445c335500fbe0eb068fbbc037fd1bc057
 *   all-experiencesoutcomes18.pdf     e1c103cb48aae8f534955b10dac83c363c76d81f76485366056446bcacff6d69
 *                                     (every area in one file; used only to cross-check the codes)
 * Licence: https://education.gov.scot/terms-of-use says the website material
 * is "(c) Crown copyright" and may be used and re-used free of charge in any
 * format or medium under the Open Government Licence v3.0 (logos excluded).
 *
 * Excluded, on purpose: every "(Gaelic)" translation; "Literacy and Gaidhlig"
 * (Gaelic-medium; its LIT codes clash with Literacy and English); the
 * "across learning" and "responsibility of all" documents (subsets of the area
 * documents); the Early Level modern languages document combined with
 * Benchmarks; Benchmarks (assessment guidance, not curriculum statements).
 *
 * How a page is read. The Es and Os are tables with one column per level
 * (Early, First, Second, Third, Fourth); a cell is the outcome's text with its
 * code(s) printed below it. An outcome common to several levels is one wide
 * cell with all its codes ("HWB 0-09a / HWB 1-09a / ... / HWB 4-09a").
 *   1. Text items are read with their positions (unpdf, pdf.js) and joined
 *      into runs of one line (items less than 9 points apart are one run).
 *   2. Footnote markers (6 point superscripts), footnote text, the running
 *      page header and the Appendix pages are dropped.
 *   3. Every code run anchors one cell: the text lines directly above it that
 *      start at the same left edge. That cell's text is the statement.
 *   4. The statement's strand is the page heading and the organiser (the
 *      row label in the first column) above it: "<heading>: <organiser>".
 *   5. Anything left over that is not a known heading, level label, row label
 *      or introduction is reported and stops the build.
 * The codes decide the level: Early is level 0, First 1, Second 2, Third and
 * Fourth 3 and 4 (one framework, as Education Scotland gives them the same
 * span, S1 to S3). An outcome with codes at several levels is written to each
 * framework it covers, with that framework's codes only.
 *
 * Text is kept verbatim apart from: a capital first letter, collapsed
 * whitespace, and en and em dashes written as hyphens (the brand avoids them in
 * anything a teacher reads). A word broken at a line end after a hyphen is
 * joined without a space.
 *
 * ── Northern Ireland: the statutory requirements (minimum content)
 * The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007,
 * Schedule 2, as XML from legislation.gov.uk:
 *   https://www.legislation.gov.uk/nisr/2007/46/schedule/2/data.xml
 * (latest available revised version, which includes the amendments to 2023;
 * fetched 2026-11-20), saved as docs/standards/uk/northern-ireland/
 * nisr-2007-46-schedule-2.xml, sha256
 *   c63af56f40de2b8caead22e492d50e02658aa169e952a4850b1d66e29ab18091
 * Licence: legislation.gov.uk says "All content is available under the Open
 * Government Licence v3.0 except where otherwise stated" (page footer, checked
 * 2026-11-20). CCEA's own documents are CCEA copyright and are not used.
 *
 * Built: Part 2 (Foundation Stage), Part 3 (Key Stage 1) and Part 4 (Key Stage
 * 2). Each list item under an Area of Learning's strand is one statement; an
 * item with a list inside it is its lead-in with the parts lettered "(a) ...
 * (b) ...". Lead-ins ("Pupils should be enabled to:") are not statements. The
 * Order's bold sub-headings in Mathematics ("Understanding Number and Number
 * Notation") are added to the strand. A Foundation Stage "Progression"
 * section is "<strand> (progression)" where every strand has one, otherwise
 * "<Area> (progression)". ALL-CAPS titles are written as Part 1's tables
 * write the Areas and their contributory elements. Trailing list punctuation
 * (";", "; and", ", and", ":") is removed from items. Ids are the stage and the
 * first 10 hex characters of sha1(subject, strand, text); the Order has no codes.
 * Not built: Key Stage 3 and 4 (Parts 5 and 6), whose content is prose under
 * objectives, not itemised statements, so reading it would mean merging and
 * choosing. tests/unit/uk-curricula-data.spec.ts counts the list items of
 * each Part straight off the XML and holds them equal to the statements'.
 *
 * Wales: not built. The Hwb terms limit downloads to educational use and bar
 * commercial reuse, modification and scraping; see docs/uk-curricula-build.md.
 *
 * `--leadins` (Northern Ireland) lists the text outside the lists, to review.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

const OUT = "app/lib/standards/data";
const nation = (process.argv.find((a) => a.startsWith("--nation=")) ?? "").slice("--nation=".length);

// The en and em dash are built from their code points: the brand rule keeps them
// out of every file, this one included.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, "g");
export const clean = (s) => s.replace(DASHES, "-").replace(/\s+/g, " ").trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Text read as a code: the PDF sets a few codes with a gap after the first
 *  letter ("L IT 0-11a"), which is closed. */
const norm = (s) => clean(s).replace(/(^|[/,] ?)([A-Z]) ([A-Z]{2,3} ?\d)/g, "$1$2$3");
const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const write = (name, data) => writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 1) + "\n");

// ── Scotland ────────────────────────────────────────────────────────────────

const CFE_CREDIT =
  "Curriculum for Excellence experiences and outcomes: © Crown copyright, Education Scotland. Contains public sector information licensed under the Open Government Licence v3.0.";
const CFE_PAGE = "https://education.gov.scot/curriculum-for-excellence/curriculum-for-excellence-documents/experiences-and-outcomes/";
const SCOT = "docs/standards/uk/scotland";

/** The documents read, with the area each one is. The title is checked
 *  against the PDF's own first heading. */
const SCOT_DOCS = [
  { file: "expressive-arts-eo.pdf", subject: "Expressive arts" },
  { file: "health-and-wellbeing-eo.pdf", subject: "Health and wellbeing" },
  { file: "classical-languages-eo.pdf", subject: "Classical languages" },
  { file: "gaelic-learners-eo.pdf", subject: "Gaelic (learners)" },
  { file: "literacy-english-eo.pdf", subject: "Literacy and English" },
  { file: "modern-languages-eo.pdf", subject: "Modern languages" },
  { file: "numeracy-maths-eo.pdf", subject: "Numeracy and mathematics" },
  { file: "rme-eo.pdf", subject: "Religious and moral education" },
  { file: "rerc-eo.pdf", subject: "Religious education in Roman Catholic schools" },
  { file: "sciences-eo.pdf", subject: "Sciences" },
  { file: "social-studies-eo.pdf", subject: "Social studies" },
  { file: "technologies-es-os.pdf", subject: "Technologies" },
];

/** The four frameworks, by the level digits of the codes they take. */
const CFE_FRAMEWORKS = [
  { id: "cfe-early", levels: [0] },
  { id: "cfe-first", levels: [1] },
  { id: "cfe-second", levels: [2] },
  { id: "cfe-third-fourth", levels: [3, 4] },
];

const CODE = "[A-Z]{3,4} ?\\d{1,2} ?- ?\\d{2}[a-z]?";
// A code list: the first code in full; later ones may leave the area prefix out
// ("RME 0-07a / 1-07a / RME 2-07a"). Two codes in the source have no final
// letter ("MLAN 1-03"): kept as printed.
const CODE_LATER = "(?:[A-Z]{3,4} ?)?\\d{1,2} ?- ?\\d{2}[a-z]?";
const CODE_RUN = new RegExp(`^${CODE}(?: ?(?:/|,|and) ?${CODE_LATER})*$`);
const CONTINUED = /\s*\(continued\)/gi;
const CODE_PARTIAL =new RegExp(`^${CODE}(?: ?(?:/|,|and) ?${CODE_LATER})* ?(?:/|,|and)$`);
const CODE_ONE = new RegExp(CODE_LATER, "g");

/** The codes are printed with a few typos (also in Education Scotland's own
 *  all-in-one PDF): a level written "02" for "2" ("TCH 02-02a"), and an area
 *  prefix left off after a slash ("RME 0-07a / 1-07a"). The level digit is
 *  what places the outcome, so the code is written the way every other one is.
 *  Each fix is reported when it is made. */
function canonicalCode(raw, prefix) {
  const m = raw.replace(/\s+/g, " ").match(/^(?:([A-Z]{3,4}) ?)?(\d{1,2}) ?- ?(\d{2}[a-z]?)$/);
  if (!m) throw new Error(`Not a code: ${raw}`);
  const level = Number(m[2]);
  return { code: `${m[1] ?? prefix} ${level}-${m[3]}`, level, typo: m[2].length > 1 || !m[1] };
}

/** One page's items: text with its position and size. */
async function pageItems(pdf, p) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  return tc.items
    .filter((i) => i.str.trim() !== "")
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], h: Math.round(i.height), w: i.width }));
}

/** Items on one line, merged into runs: pieces less than 9 points apart are
 *  one run (cells are 11 or more apart). */
function toRuns(items) {
  // A line of a cell starts where a column's text starts: an x that three or
  // more items on the page share (within a point). An item anywhere else is the
  // rest of the line to its left ("selected resources" then "as"). Two cells
  // can be less than 9 points apart, so the gap alone cannot say.
  const startsColumn = (it) => items.filter((o) => Math.abs(o.x - it.x) <= 1).length >= 3;
  const rows = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  const runs = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of row.items) {
      // A code never joins its neighbours: it can sit right against the next cell's text.
      const isCode = (t) => CODE_RUN.test(t.replace(/\s+/g, " ").trim());
      // ...unless it carries the list on ("LIT 0-02a" then "/ ENG 0-03a").
      const listMore = /^\s*[/,]/.test(it.str) || (cur && /[/,]$/.test(cur.text.trim()) && isCode(it.str));
      if (cur && it.x - cur.right < 9 && (listMore || (!startsColumn(it) && !isCode(it.str) && !isCode(cur.text)))) {
        const gap = it.x - cur.right;
        const glue = /^[.,;:!?)]/.test(it.str) || gap < 1.2 || cur.text.endsWith(" ") || it.str.startsWith(" ") ? "" : " ";
        cur.text += glue + it.str;
        cur.right = it.x + it.w;
        cur.h = Math.max(cur.h, it.h);
      } else {
        cur = { x: it.x, y: row.y, h: it.h, text: it.str, right: it.x + it.w, used: false };
        runs.push(cur);
      }
    }
  }
  // A list bullet on its own is part of the line it starts.
  for (const r of runs) {
    if (r.text !== "•") continue;
    const next = runs.find((n) => n !== r && Math.abs(n.y - r.y) <= 2 && n.x > r.x && n.x - r.right < 20);
    if (!next) continue;
    next.text = "• " + next.text;
    next.x = r.x;
    r.dead = true;
  }
  return runs.filter((r) => !r.dead);
}

const LEVEL_LABELS = new Set(["Early", "First", "Second", "Third", "Fourth", "Organiser", "Third and Fourth", "Third / Fourth"]);

/** Join a cell's lines: a line that ends in a hyphen after a letter is
 *  joined to the next without a space ("grammatically-" "straightforward"). */
function joinLines(lines) {
  let out = "";
  for (const l of lines) {
    const t = l.trim();
    if (!out) out = t;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(t)) out += t;
    else out += " " + t;
  }
  return clean(out);
}

/** Read one area document. Returns the outcomes in page order, and a list
 *  of anything it could not place (which stops the build). */
async function readDoc(doc) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`${SCOT}/${doc.file}`)));
  const outcomes = [];
  const problems = [];
  const typos = [];
  let title = "";
  let heading = "";
  let organiser = "";
  let appendix = false;
  let intro = 0;

  for (let p = 1; p <= pdf.numPages && !appendix; p++) {
    let items = await pageItems(pdf, p);
    // The Appendix (explanations and glossary) is not curriculum statements.
    const app = items.find((i) => i.h >= 16 && /^Appendix\b/.test(i.str.trim()));
    if (app) {
      appendix = true;
      items = items.filter((i) => i.y > app.y + 1);
    }
    // Footnote markers print small; a marker at the left edge starts the
    // footnote text, which runs to the foot of the page.
    const defs = items.filter((i) => i.h <= 7 && i.x <= 50);
    const footTop = defs.length ? Math.max(...defs.map((d) => d.y)) + 14 : -Infinity;
    items = items.filter((i) => i.h > 7 && i.y > footTop);
    // The running header at the foot of every page, and the page number.
    items = items.filter((i) => !(i.y < 62 && (/experiences and outcomes$/i.test(i.str.trim()) || /^\d+$/.test(i.str.trim()))));

    const runs = toRuns(items);
    for (const r of runs) {
      if (r.h >= 16 && !title) title = clean(r.text);
    }
    // Headings: blocks of 14 point lines ("(continued)" is dropped). A page can
    // carry more than one; a cell takes the nearest above it.
    const headBlocks = [];
    for (const r of runs.filter((r) => r.h === 14).sort((a, b) => b.y - a.y)) {
      const b = headBlocks[headBlocks.length - 1];
      if (b && b.last - r.y <= 18) { b.lines.push(r); b.last = r.y; } else headBlocks.push({ top: r.y, last: r.y, lines: [r] });
      r.used = true;
    }
    for (const b of headBlocks) {
      const raw = clean(b.lines.map((l) => l.text).join(" "));
      b.continued = /\(continued\)/i.test(raw);
      b.text = raw.replace(CONTINUED, "").trim();
    }
    for (const r of runs) {
      if (r.h >= 16) r.used = true;
      if (LEVEL_LABELS.has(clean(r.text)) || /^(Early|First|Second|Third|Fourth)( and (First|Second|Third|Fourth))?$/.test(clean(r.text))) r.used = true;
    }

    // What a section says about itself, above the row of level labels, is
    // an introduction, not an outcome.
    const labelRow = runs.filter((r) => r.used && r.h === 10 && /^(Early|First|Second|Third|Fourth|Organiser)/.test(clean(r.text)));
    if (labelRow.length) {
      const labelY = Math.max(...labelRow.map((r) => r.y));
      // A 12 point line there is a section heading ("Development of beliefs and
      // values" in RME), set smaller than the 14 point ones.
      for (const r of runs.filter((r) => !r.used && r.y > labelY + 3 && r.h === 12 && r.x <= 60).sort((a, b) => b.y - a.y)) {
        const b = headBlocks[headBlocks.length - 1];
        if (b && b.last - r.y <= 18 && b.small) { b.lines.push(r); b.last = r.y; b.text = clean(`${b.text} ${r.text}`); }
        else headBlocks.push({ top: r.y, last: r.y, lines: [r], text: clean(r.text), small: true });
        r.used = true;
      }
      for (const r of runs) if (!r.used && r.y > labelY + 3) { r.used = true; intro++; }
      for (const hb of headBlocks) if (hb.small) { hb.continued = /\(continued\)/i.test(hb.text); hb.text = hb.text.replace(CONTINUED, "").trim(); }
    }

    // A long list of codes wraps onto a second line ("LIT 0-01a / LIT 0-11a /"
    // then "LIT 0-20a"): one list. Joined top down.
    const partial = (r) => CODE_PARTIAL.test(norm(r.text));
    for (const r of [...runs].sort((a, b) => b.y - a.y)) {
      if (r.dead || !partial(r)) continue;
      const next = runs.find((n) => !n.dead && n !== r && n.y < r.y && r.y - n.y <= 14 && n.x >= r.x - 20 && n.x <= r.x + 150 && (CODE_RUN.test(norm(n.text)) || partial(n)));
      if (!next) { problems.push(`p${p}: code list ends in a separator: ${clean(r.text)}`); continue; }
      next.text = `${norm(r.text)} ${norm(next.text)}`;
      next.x = Math.min(next.x, r.x);
      r.dead = true;
      r.used = true;
    }
    for (let i = runs.length - 1; i >= 0; i--) if (runs[i].dead) runs.splice(i, 1);

    // Anchor a cell on each code run.
    const text = runs.filter((r) => !r.used && !CODE_RUN.test(norm(r.text)));
    const codeRuns = runs.filter((r) => CODE_RUN.test(norm(r.text)));
    const cells = [];
    for (const c of codeRuns) {
      c.used = true;
      // Lines just above the code (or on its own line, when it sits beside the
      // last one), with no other cell's code between them and this one.
      const above = text.filter(
        (t) =>
          !t.cell && t.y - c.y > -3 && t.y - c.y <= 28 && t.x <= c.x + 1 && t.h <= 12 &&
          !codeRuns.some((k) => k !== c && k.y < t.y - 3 && k.y > c.y + 3 && k.x >= t.x - 24 && k.x < t.x + 150),
      );
      if (!above.length) {
        problems.push(`p${p}: no text above ${clean(c.text)}`);
        continue;
      }
      // The column nearest to the code on its left (list items are indented, so
      // the column is everything within 24 points of the right-most), then its
      // lowest line.
      const maxX = Math.max(...above.map((t) => t.x));
      const first = above.filter((t) => maxX - t.x <= 24).sort((a, b) => a.y - b.y)[0];
      // The cell's lines: unbroken upwards from the nearest line, within one
      // column (columns are 110 or more points apart; list items are indented
      // by up to 20). A paragraph gap inside a cell is up to 26 points; the
      // gap between two cells is more than 40, and has the next cell's code in it.
      const lines = [first];
      first.cell = true;
      let cur = first;
      for (;;) {
        const nxt = text
          .filter((t) => !t.cell && Math.abs(t.x - first.x) <= 24 && t.y - cur.y >= 8 && t.y - cur.y <= 27 && t.h <= 12)
          .sort((a, b) => a.y - b.y || a.x - b.x)[0];
        if (!nxt) break;
        // Another cell's code in this column between the two lines: a cell boundary.
        const left = Math.min(...lines.map((l) => l.x));
        if (codeRuns.some((k) => k !== c && k.y < nxt.y && k.y > cur.y && k.x >= left - 24 && k.x < left + 150)) break;
        nxt.cell = true;
        lines.push(nxt);
        cur = nxt;
      }
      const L = Math.min(...lines.map((l) => l.x));
      // Lines were collected upwards from the code: the text reads top down.
      lines.reverse();
      for (const l of lines) l.used = true;
      cells.push({ c, L, top: lines[0].y, text: joinLines(lines.map((l) => l.text)) });
    }

    // Organisers: what is left at the left edge of the table. Blocks of
    // lines; the name is the 12 point part when there is one.
    const firstCol = cells.length ? Math.min(...cells.map((c) => c.L)) : Infinity;
    const left = runs.filter((r) => !r.used && r.x < firstCol - 10 && r.y > 62);
    left.sort((a, b) => b.y - a.y);
    const blocks = [];
    for (const r of left) {
      const b = blocks[blocks.length - 1];
      if (b && b.lines[b.lines.length - 1].y - r.y <= 16) b.lines.push(r);
      else blocks.push({ top: r.y, lines: [r] });
    }
    // Where the page names its rows in 12 point type, only those are names:
    // the 10 point blocks are descriptions of them. Where it does not
    // (Technologies), every block is a name.
    const anyNamed = blocks.some((b) => b.lines.some((l) => l.h === 12));
    for (const b of blocks) {
      const named = b.lines.filter((l) => l.h === 12);
      b.isName = !anyNamed || named.length > 0;
      b.name = joinLines((named.length ? named : b.lines).map((l) => l.text));
      for (const l of b.lines) l.used = true;
    }

    // Place each cell under its heading and organiser: the nearest above it,
    // an organiser only from below its own heading. A row that names none keeps
    // the last organiser seen under the same heading, and none under a new one.
    cells.sort((a, b) => b.top - a.top || a.L - b.L);
    for (const cell of cells) {
      const above = headBlocks.filter((h) => h.top + 6 >= cell.top);
      const hb = above.reduce((m, h) => (!m || h.top < m.top ? h : m), null); // the nearest
      const outer = above.reduce((m, h) => (!m || h.top > m.top ? h : m), null); // the topmost
      // A running heading at the top of the page ("... (continued)"), or a 14
      // point heading above a smaller one, names the section; the nearest
      // heading names the part of it ("Physical education, physical activity
      // and sport: Physical activity and sport").
      const nested = hb && outer && hb !== outer && !outer.small && (outer.continued || hb.small) && outer.text !== hb.text;
      const head = hb ? (nested ? `${outer.text}: ${hb.text}` : hb.text) : heading;
      const candidates = blocks.filter((b) => b.isName && b.top + 6 >= cell.top && (!hb || b.top < hb.top));
      const nearest = candidates.length ? candidates.reduce((m, b) => (b.top < m.top ? b : m)) : null;
      if (nearest) organiser = nearest.name;
      else if (head !== heading) organiser = "";
      heading = head;
      cell.heading = head;
      cell.organiser = organiser;
    }

    const codes = [];
    for (const cell of cells) {
      const raw = norm(cell.c.text).match(CODE_ONE) ?? [];
      const prefix = raw[0].match(/^[A-Z]{3,4}/)?.[0];
      const parsed = raw.map((r) => canonicalCode(r, prefix));
      for (const q of parsed) if (q.typo) typos.push(`p${p}: ${raw.join(" / ")} -> ${q.code}`);
      // A code inside the text means a code line was read as text.
      if (new RegExp(CODE).test(cell.text)) problems.push(`p${p}: a code in the text of ${parsed.map((q) => q.code).join(" / ")}: ${cell.text.slice(-60)}`);
      codes.push(parsed.map((q) => q.code));
      outcomes.push({
        page: p,
        codes: parsed.map((q) => q.code),
        levels: parsed.map((q) => q.level),
        text: cap(cell.text),
        strand: strandOf(doc.subject, cell.heading, cell.organiser),
      });
    }

    // A page without a single code is the introduction: its text is not outcomes.
    if (!codeRuns.length) { intro += runs.filter((r) => !r.used).length; continue; }
    for (const r of runs.filter((r) => !r.used)) problems.push(`p${p}: unplaced "${clean(r.text).slice(0, 90)}" (x${Math.round(r.x)} y${Math.round(r.y)} h${r.h})`);
  }
  return { outcomes, problems, typos, title, intro };
}

/** "<heading>: <organiser>"; the area's own name is not a heading. */
function strandOf(subject, heading, organiser) {
  const h = heading === subject ? "" : heading;
  return [h, organiser].filter(Boolean).join(": ") || subject;
}

/** The registry ages each level covers: Nursery is 3 and Reception 4, Year N
 *  is N + 4 (the year names the card shows). Early = to P1, First = P2 to P4,
 *  Second = P5 to P7, Third and Fourth = S1 to S3. */
const CFE_AGES = {
  "cfe-early": [3, 4, 5],
  "cfe-first": [6, 7, 8],
  "cfe-second": [9, 10, 11],
  "cfe-third-fourth": [12, 13, 14],
};

const slug = (code) => code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function scotland() {
  let totalProblems = 0;
  const all = [];
  for (const doc of SCOT_DOCS) {
    const { outcomes, problems, typos, title } = await readDoc(doc);
    if (title.replace(/\s*Experiences and outcomes$/, "") !== doc.subject && !title.startsWith(doc.subject.split(" (")[0])) {
      console.warn(`  title "${title}" differs from "${doc.subject}"`);
    }
    console.log(`${doc.file}: ${outcomes.length} outcomes, ${problems.length} unplaced${typos.length ? `, code fixes: ${typos.join("; ")}` : ""}`);
    for (const pr of problems.slice(0, 40)) console.log(`    ${pr}`);
    totalProblems += problems.length;
    for (const o of outcomes) all.push({ ...o, subject: doc.subject });
  }
  if (totalProblems) throw new Error(`${totalProblems} items could not be placed. Fix the reader, never the data.`);

  // One framework per stage: an outcome goes to every framework one of its
  // codes belongs to, with that framework's codes only.
  const out = {};
  for (const fw of CFE_FRAMEWORKS) out[fw.id] = [];
  for (const o of all) {
    for (const fw of CFE_FRAMEWORKS) {
      const codes = o.codes.filter((_, i) => fw.levels.includes(o.levels[i]));
      if (!codes.length) continue;
      out[fw.id].push({ id: `${fw.id}-${slug(codes[0])}`, code: codes.join(" / "), subject: o.subject, strand: o.strand, ages: CFE_AGES[fw.id], text: o.text, _first: codes[0] });
    }
  }
  // A code is not always unique in the source: the Early level outcomes for
  // talking, reading and writing share codes, each with its own wording. Those
  // ids get a short hash of strand and text; every other id is the code alone.
  for (const [fwId, list] of Object.entries(out)) {
    const count = new Map();
    for (const st of list) count.set(st.id, (count.get(st.id) ?? 0) + 1);
    const seen = new Set();
    for (const st of list) {
      if (count.get(st.id) > 1) st.id = `${st.id}-${sha1(`${st.strand}|${st.text}`).slice(0, 6)}`;
      if (seen.has(st.id)) throw new Error(`Duplicate id ${st.id}: the same code, strand and text twice in ${fwId}`);
      seen.add(st.id);
      delete st._first;
    }
    write(fwId, {
      source: { title: "Curriculum for Excellence experiences and outcomes", file: "docs/standards/uk/scotland/", url: CFE_PAGE, credit: CFE_CREDIT },
      statements: list,
    });
    const bySubject = {};
    for (const st of list) bySubject[st.subject] = (bySubject[st.subject] ?? 0) + 1;
    console.log(`${fwId}: ${list.length} statements, ${Object.entries(bySubject).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  }
}

// ── Northern Ireland ────────────────────────────────────────────────────────

const NIC_CREDIT =
  "Northern Ireland Curriculum statutory requirements, from The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007: © Crown copyright. Contains public sector information licensed under the Open Government Licence v3.0.";
const NI_DIR = "docs/standards/uk/northern-ireland";
const NI_XML = `${NI_DIR}/nisr-2007-46-schedule-2.xml`;

/** The stages built: Parts 2 to 4 of Schedule 2. Key Stages 3 and 4 (Parts 5
 *  and 6) are not: they are prose under objectives, not itemised statements. */
const NI_STAGES = [
  { id: "nic-fs", part: 2, group: "At Foundation Stage:", ages: [5, 6] },
  { id: "nic-ks1", part: 3, group: "At Key Stages 1 and 2:", ages: [7, 8] },
  { id: "nic-ks2", part: 4, group: "At Key Stages 1 and 2:", ages: [9, 10, 11] },
];

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** A small XML reader: elements with their children in order; text nodes are
 *  strings. No dependency, as the other build scripts have none. */
function parseXml(xml) {
  const root = { name: "#root", children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z0-9:_-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      stack[stack.length - 1].children.push(decodeEntities(m[5]));
    } else if (m[2]) {
      if (m[1]) stack.pop();
      else {
        const node = { name: m[2], children: [] };
        stack[stack.length - 1].children.push(node);
        if (!m[4]) stack.push(node);
      }
    }
  }
  return root;
}

const kids = (n, name) => n.children.filter((c) => typeof c !== "string" && c.name === name);
const find = (n, name) => {
  for (const c of n.children) {
    if (typeof c === "string") continue;
    if (c.name === name) return c;
    const d = find(c, name);
    if (d) return d;
  }
  return null;
};
/** The text of a node: everything inside it except footnote references. An
 *  amendment's inserted text (<Addition>) is part of the law and is kept. */
function textOf(n) {
  if (typeof n === "string") return n;
  if (n.name === "CommentaryRef") return "";
  return n.children.map(textOf).join("");
}
/** The text of a node apart from any list inside it. */
function ownText(n) {
  if (typeof n === "string") return n;
  if (n.name === "UnorderedList" || n.name === "OrderedList" || n.name === "CommentaryRef") return "";
  return n.children.map(ownText).join("");
}

/** Part 1's tables: the Areas of Learning and their contributory elements, as
 *  the Order spells them, for each group of stages. */
function areasOf(root) {
  const out = {};
  const walkT = (n) => {
    if (typeof n === "string") return;
    if (n.name === "Tabular") {
      const group = clean(textOf(kids(n, "Title")[0] ?? ""));
      const table = find(n, "xhtml:tbody");
      const areas = [];
      for (const tr of table ? kids(table, "xhtml:tr") : []) {
        const [a, b] = kids(tr, "xhtml:td");
        areas.push({ area: clean(textOf(a)), elements: b ? kids(b, "Para").map((p) => clean(textOf(p))).filter(Boolean) : [] });
      }
      out[group] = areas;
      return;
    }
    for (const c of n.children) walkT(c);
  };
  walkT(root);
  return out;
}

/** An ALL-CAPS title written the way the Order writes it elsewhere: the Area
 *  names and contributory elements of Part 1, else each word capitalised
 *  except small ones. */
function titleCase(title, known) {
  const t = clean(title).replace(/[:.]+$/, "").trim();
  if (t !== t.toUpperCase()) return t;
  const hit = known.find((k) => k.toLowerCase() === t.toLowerCase());
  if (hit) return hit;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && ["and", "in", "of", "the", "to", "for"].includes(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The end of a list item: the punctuation that ends a bullet, not the sentence. */
const stripListEnd = (s) => s.replace(/\s*(?:;\s*and|,\s*and|;|:)\s*$/, "").trim();

/** One statement from a list item: its text, or its text then its own list as
 *  "(a) ... (b) ...". */
function itemText(li) {
  const nested = find(li, "UnorderedList");
  if (!nested) return stripListEnd(clean(textOf(li)));
  const lead = clean(ownText(li));
  const parts = kids(nested, "ListItem").map((s, i) => `(${String.fromCharCode(97 + i)}) ${stripListEnd(clean(textOf(s)))}`);
  return `${lead} ${parts.join(" ")}`.trim();
}

function northernIreland() {
  const xml = readFileSync(NI_XML, "utf8");
  const root = parseXml(xml);
  const parts = [];
  const collect = (n) => {
    if (typeof n === "string") return;
    if (n.name === "Part") { parts.push(n); return; }
    for (const c of n.children) collect(c);
  };
  collect(root);
  if (parts.length !== 6) throw new Error(`Expected 6 Parts in Schedule 2, found ${parts.length}`);
  const areaTables = areasOf(root);

  const out = {};
  for (const stage of NI_STAGES) {
    const areas = areaTables[stage.group];
    if (!areas) throw new Error(`No Part 1 table for ${stage.group}`);
    const areaNames = areas.map((a) => a.area);
    const known = [...areaNames, ...areas.flatMap((a) => a.elements)];
    const part = parts[stage.part - 1];
    const stageTitle = clean(textOf(kids(part, "Title")[0] ?? ""));
    let area = "";
    let strand = "";
    let progression = false;
    let sub = "";
    const list = [];
    const leadins = new Map();
    const info_ = {}; // per Area: how many strands and how many Progression sections

    const walkP = (n) => {
      if (typeof n === "string") return;
      if (n.name === "Tabular" || n.name === "Commentaries" || n.name === "Number") return;
      if (n.name === "Title") {
        const t = clean(textOf(n));
        if (t === stageTitle) return;
        const asArea = areaNames.find((a) => a.toLowerCase() === t.replace(/[:.]+$/, "").toLowerCase());
        const info = (info_[area] ??= { strands: 0, progressions: 0 });
        if (asArea && (t === t.toUpperCase() || t === asArea)) {
          area = asArea;
          strand = "";
          sub = "";
          progression = false;
          info_[area] ??= { strands: 0, progressions: 0 };
        } else if (/^progression$/i.test(t)) {
          progression = true;
          sub = "";
          info.progressions++;
        } else {
          strand = titleCase(t, known);
          sub = "";
          progression = false;
          info.strands++;
        }
        return;
      }
      if (n.name === "UnorderedList" && !n.nested) {
        for (const li of kids(n, "ListItem")) {
          const text = itemText(li);
          if (!text) continue;
          const base = strand || area;
          list.push({ subject: area, strand: sub ? `${base}: ${sub}` : base, strandName: strand, sub, progression, text: cap(text) });
        }
        return;
      }
      // Text that sits outside the lists (the lead-ins "Pupils should be enabled
      // to:") is not a statement. It is listed with --leadins, to review.
      if (n.name === "Para" || n.name === "Text") {
        const t = clean(ownText(n));
        // The Order's own bold sub-headings in Mathematics ("Understanding Number
        // and Number Notation"): short, no end punctuation, no "should".
        if (t && t.split(" ").length <= 8 && !/[.:;,]$/.test(t) && !/\bshould\b|^Pupils|^Teachers/.test(t)) {
          sub = t;
          return;
        }
        if (t && !(n.name === "Text" && leadins.has(t))) leadins.set(t, (leadins.get(t) ?? 0) + 1);
        return;
      }
      for (const c of n.children) walkP(c);
    };
    walkP(part);
    if (process.argv.includes("--leadins")) console.log(`${stage.id} text outside the lists:\n${[...leadins].map(([t, n]) => `  ${n} x ${t.slice(0, 150)}`).join("\n")}`);
    // A Progression section sits after its strand when every strand of the Area
    // has one (Language and Literacy, The Arts); when the Area has one for all
    // its strands together (Mathematics and Numeracy, The World Around Us), it
    // belongs to the Area.
    for (const st of list) {
      if (!st.progression) continue;
      const i = info_[st.subject];
      const perStrand = i.strands > 0 && i.strands === i.progressions;
      st.strand = `${perStrand ? st.strandName : st.subject} (progression)${st.sub ? `: ${st.sub}` : ""}`;
    }

    const seen = new Map();
    const statements = list.map((s) => {
      const id = `${stage.id}-${sha1(`${s.subject}|${s.strand}|${s.text}`).slice(0, 10)}`;
      if (seen.has(id)) throw new Error(`Duplicate statement in ${stage.id}: ${s.subject} / ${s.strand}: ${s.text.slice(0, 60)}`);
      seen.set(id, true);
      return { id, code: "", subject: s.subject, strand: s.strand, ages: stage.ages, text: s.text };
    });
    out[stage.id] = statements;
    write(stage.id, {
      source: {
        title: "The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007, Schedule 2",
        file: `${NI_DIR}/`,
        url: "https://www.legislation.gov.uk/nisr/2007/46/schedule/2",
        credit: NIC_CREDIT,
      },
      statements,
    });
    const by = {};
    for (const s of statements) by[s.subject] = (by[s.subject] ?? 0) + 1;
    console.log(`${stage.id}: ${statements.length} statements, ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  }
}

if (nation === "scotland") await scotland();
else if (nation === "northern-ireland") northernIreland();
else if (nation === "wales") {
  console.error("Wales is not built: the Hwb terms bar commercial reuse and scraping. See docs/uk-curricula-build.md (WALES_PERMISSION).");
  process.exit(1);
} else {
  console.error("Usage: node scripts/build-uk-curricula.mjs --nation=scotland|northern-ireland");
  process.exit(1);
}
