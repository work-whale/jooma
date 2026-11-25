// Write Jooma's progress on each curriculum into the research workbook.
//
//   node scripts/curricula-status.mjs                      # write the columns
//   node scripts/curricula-status.mjs --live=british-isles # regions switched on for everyone
//   node scripts/curricula-status.mjs --check              # print, write nothing
//
// The workbook (docs/Curricula/Jooma national curricula by country and
// state.xlsx) is the shared view of the curricula work: the team reads it, and
// Claude reads it at the start of each session. Its progress columns come from
// the registry in app/lib/curricula, never typed by hand, so the sheet and the
// app cannot disagree.
//
// To every data tab it adds, after the existing columns (or over the ones a
// previous run added):
//   Jooma status | Jooma id | Verified on | Verified source | Claude notes
// and to Read me, a JOOMA PROGRESS block of counts by status.
//
// It edits the sheet XML in place rather than going through a spreadsheet
// library: those rewrite the whole file on save and drop what they do not
// understand (this workbook has comments and drawings). Everything outside the
// added cells, rows and column widths is left byte for byte as it was.
//
// "Live" for a region outside the UK means its app_settings switch is on, which
// this script cannot see, so it is passed with --live.

import { registerHooks } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

// Node runs the registry's TypeScript itself (type stripping); this only lets
// its extensionless relative imports ("./uk") find the .ts file.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        // fall through to the default resolution
      }
    }
    return next(specifier, context);
  },
});

const { CURRICULA_REGISTRY: REGISTRY } = await import("../app/lib/curricula/index.ts");
const { PROVENANCE } = await import("../app/lib/curricula/provenance.ts");
// Each entry with its provenance (sheet row, source, notes) alongside.
const CURRICULA_REGISTRY = REGISTRY.map((c) => ({ ...c, ...PROVENANCE[c.id] }));

const WORKBOOK = fileURLToPath(new URL("../docs/Curricula/Jooma national curricula by country and state.xlsx", import.meta.url));
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const HEADERS = ["Jooma status", "Jooma id", "Verified on", "Verified source", "Claude notes"];
const WIDTHS = [22, 22, 13, 40, 60];
const PROGRESS_MARK = "JOOMA PROGRESS";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const live = new Set(
  (args.find((a) => a.startsWith("--live="))?.slice("--live=".length) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const today = new Date().toISOString().slice(0, 10);

// ── What each row's status is when no registry entry covers it ─────────────
// The plan's scope: the "1 Next" tier is Not started until built; the rest is
// out of scope for this stage.
const NEXT_INTERNATIONAL = /^(IB |Cambridge |Pearson )/;
const SPLIT = { "United States": "USA by state", Canada: "Canada", Australia: "Australia" };
const NEXT_CANADA = new Set(["Ontario", "British Columbia", "Alberta", "Yukon", "Northwest Territories"]);

function defaultStatus(tab, cells) {
  const name = cells.A ?? "";
  switch (tab) {
    case "Countries": {
      // Split countries are tracked row by row on their own tab.
      if (SPLIT[name]) return `See the ${SPLIT[name]} tab`;
      const p = cells.H ?? "";
      if (p.startsWith("1")) return "Not started";
      if (p.startsWith("2")) return "Out of scope (stage 2)";
      if (p.startsWith("3")) return "Out of scope (stage 3)";
      return "Not started";
    }
    case "USA by state":
    case "Australia":
      return "Not started";
    case "Canada":
      if (name === "Yukon" || name === "Northwest Territories") return "Covered by ca-bc (BC's curriculum)";
      return NEXT_CANADA.has(name) ? "Not started" : "Out of scope (later)";
    case "Other split systems": {
      // India's rows are told apart by column B ("Part of the system"): CBSE and
      // NCERT are covered by india-cbse; the other boards come later.
      if (name === "India") {
        const part = cells.B ?? "";
        if (part.startsWith("CBSE")) return "Covered by india-cbse";
        if (part.startsWith("NCERT")) return "Covered by india-cbse (NCERT books)";
        return "Out of scope (later)";
      }
      // The UAE rows are told apart by column B: the federal public schools follow
      // the Ministry curriculum; the private schools follow England, US, IB or CBSE.
      if (name === "United Arab Emirates") {
        const part = cells.B ?? "";
        if (part.startsWith("Federal")) return "Covered by uae-moe";
        if (part.includes("private schools")) return "Covered by existing curricula (England, US, IB, CBSE)";
        return "Out of scope (stage 2)";
      }
      return "Out of scope (stage 3)";
    }
    case "International":
      if (name === "British curriculum schools abroad") return "Live (uses England)";
      return NEXT_INTERNATIONAL.test(name) ? "Not started" : "Out of scope (later)";
    default:
      return "";
  }
}

function entryStatus(c) {
  if (c.region === "uk") return "Live";
  if (!c.verifiedOn) return "Built";
  return live.has(c.region) ? "Live" : "Verified";
}

const RANK = ["Built", "Verified", "Live"];
function rowValues(tab, cells) {
  const entries = CURRICULA_REGISTRY.filter((c) => c.sheetRow.tab === tab && c.sheetRow.name === cells.A);
  if (entries.length === 0) return [defaultStatus(tab, cells), "", "", "", ""];
  const status = entries.map(entryStatus).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
  const dates = [...new Set(entries.map((c) => c.verifiedOn).filter(Boolean))];
  return [
    status,
    entries.map((c) => c.id).join(", "),
    dates.join(", "),
    [...new Set(entries.map((c) => c.source))].join(" "),
    entries.map((c) => c.notes).filter(Boolean).join(" "),
  ];
}

// ── XML helpers ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function colNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CELL = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function cellText(attrs, inner, shared) {
  if (!inner) return "";
  if (/t="s"/.test(attrs)) {
    const v = inner.match(/<v>(\d+)<\/v>/);
    return v ? shared[Number(v[1])] ?? "" : "";
  }
  if (/t="inlineStr"/.test(attrs)) return unesc([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  return v ? unesc(v[1]) : "";
}

function inlineCell(ref, text, style) {
  const s = style ? ` s="${style}"` : "";
  if (text === "") return `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function parseRows(xml, shared) {
  const rows = [];
  for (const m of xml.matchAll(/<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = {};
    const styles = {};
    let maxCol = 0;
    for (const c of (m[3] ?? "").matchAll(CELL)) {
      cells[c[1]] = cellText(c[3], c[4], shared);
      styles[c[1]] = c[3].match(/s="(\d+)"/)?.[1];
      maxCol = Math.max(maxCol, colNum(c[1]));
    }
    rows.push({ num: Number(m[1]), full: m[0], attrs: m[2], inner: m[3] ?? "", cells, styles, maxCol });
  }
  return rows;
}

/** Drop every cell at or after column `from` from a row's XML. */
function cutFrom(inner, from) {
  return inner.replace(CELL, (whole, col) => (colNum(col) >= from ? "" : whole));
}

function setCols(xml, from, widths) {
  const block = xml.match(/<cols>([\s\S]*?)<\/cols>/);
  const kept = block ? [...block[1].matchAll(/<col [^>]*\/>/g)].map((m) => m[0]).filter((c) => Number(c.match(/min="(\d+)"/)?.[1]) < from) : [];
  const added = widths.map((w, i) => `<col customWidth="1" min="${from + i}" max="${from + i}" width="${w}"/>`);
  const cols = `<cols>${[...kept, ...added].join("")}</cols>`;
  return block ? xml.replace(block[0], () => cols) : xml.replace("<sheetData", () => `${cols}<sheetData`);
}

// ── Main ────────────────────────────────────────────────────────────────────
const zip = await JSZip.loadAsync(await readFile(WORKBOOK));
const shared = [...(await zip.file("xl/sharedStrings.xml").async("string")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
);

const workbookXml = await zip.file("xl/workbook.xml").async("string");
const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
const sheets = [...workbookXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => {
  const target = relsXml.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${m[2]}"`));
  const path = (target[1] ?? target[2]).replace(/^\//, "");
  return { name: unesc(m[1]), path: path.startsWith("xl/") ? path : `xl/${path}` };
});

const TABS = ["Countries", "USA by state", "Canada", "Australia", "Other split systems", "International"];
const counts = {};
const unmatched = new Set(CURRICULA_REGISTRY.map((c) => c.id));

for (const sheet of sheets.filter((s) => TABS.includes(s.name))) {
  let xml = await zip.file(sheet.path).async("string");
  if (!xml.includes(NS)) throw new Error(`${sheet.name}: not a worksheet`);
  const rows = parseRows(xml, shared);
  const header = rows.find((r) => r.num === 1);
  const existing = Object.entries(header.cells).find(([, v]) => v === HEADERS[0]);
  const from = existing ? colNum(existing[0]) : header.maxCol + 1;
  const headerStyle = header.styles[colName(Math.min(header.maxCol, from - 1))];
  counts[sheet.name] = {};

  for (const row of rows) {
    if (!row.cells.A && row.num !== 1) continue;
    const values = row.num === 1 ? HEADERS : rowValues(sheet.name, row.cells);
    if (row.num !== 1) {
      counts[sheet.name][values[0]] = (counts[sheet.name][values[0]] ?? 0) + 1;
      for (const c of CURRICULA_REGISTRY) if (c.sheetRow.tab === sheet.name && c.sheetRow.name === row.cells.A) unmatched.delete(c.id);
      if (checkOnly) console.log(`${sheet.name.padEnd(20)} ${row.cells.A.padEnd(34)} ${values[0]}${values[1] ? `  [${values[1]}]` : ""}`);
    }
    const style = row.num === 1 ? headerStyle : row.styles[colName(Math.min(row.maxCol, from - 1))];
    const added = values.map((v, i) => inlineCell(`${colName(from + i)}${row.num}`, v, style)).join("");
    const inner = cutFrom(row.inner, from) + added;
    xml = xml.replace(row.full, () => `<row r="${row.num}"${row.attrs}>${inner}</row>`);
  }
  xml = setCols(xml, from, WIDTHS);
  const lastCol = colName(from + HEADERS.length - 1);
  xml = xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (_, a, b, __, d) => `<dimension ref="${a}${b}:${lastCol}${d}"/>`);
  zip.file(sheet.path, xml);
}

if (unmatched.size) {
  console.error(`No sheet row found for: ${[...unmatched].join(", ")}. Fix sheetRow in app/lib/curricula.`);
  process.exit(1);
}

// The Read me block.
const readme = sheets.find((s) => s.name === "Read me");
if (readme) {
  let xml = await zip.file(readme.path).async("string");
  const rows = parseRows(xml, shared);
  // The tab carries empty placeholder rows down to about 1000. Rows must stay
  // in order, so everything after the last real content (those placeholders
  // and any earlier progress block) goes, and the block is written after it.
  const mark = rows.find((r) => r.cells.A?.startsWith(PROGRESS_MARK));
  const kept = rows.filter((r) => !mark || r.num < mark.num);
  const lastContent = Math.max(0, ...kept.filter((r) => Object.values(r.cells).some(Boolean)).map((r) => r.num));
  for (const r of rows) if (r.num > lastContent) xml = xml.replace(r.full, () => "");
  let n = lastContent + 2;
  const lines = [[`${PROGRESS_MARK} (updated ${today} by scripts/curricula-status.mjs)`, "Counts of rows by Jooma status, per tab. Live regions outside the UK: " + ([...live].join(", ") || "none yet") + "."]];
  for (const tab of TABS) {
    const parts = Object.entries(counts[tab] ?? {}).sort((a, b) => b[1] - a[1]).map(([s, k]) => `${s}: ${k}`);
    lines.push([tab, parts.join("; ")]);
  }
  const style = kept.find((r) => r.num === 5)?.styles.A;
  const added = lines.map(([a, b]) => `<row r="${n}">${inlineCell(`A${n}`, a, style)}${inlineCell(`B${n++}`, b)}</row>`).join("");
  xml = xml.replace("</sheetData>", () => `${added}</sheetData>`);
  zip.file(readme.path, xml);
}

for (const tab of TABS) console.log(`${tab}: ${Object.entries(counts[tab] ?? {}).map(([s, k]) => `${s} ${k}`).join(", ")}`);
if (checkOnly) process.exit(0);

// JSZip invents folder entries ("xl/") on load; the original has none.
for (const [name, file] of Object.entries(zip.files)) if (file.dir) delete zip.files[name];
const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
await writeFile(WORKBOOK, out);
console.log(`Wrote ${WORKBOOK}`);
