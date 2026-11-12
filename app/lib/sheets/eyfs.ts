// An Early Years plan as a sheet.
//
// In England, Nursery and Reception follow the Early Years Foundation Stage
// (EYFS): seven areas of learning, each with Early Learning Goals (ELGs) that
// children are assessed against at the end of Reception. Teachers plan a topic
// on a wide grid, the areas down the side and the weeks across, then plan the
// continuous provision (what is set out indoors and outdoors for children to
// choose) and a few adult-led activities for each area.
//
// So the page is landscape: the overview, the week-by-week grid (at most six
// weeks to a table, so twelve weeks are two tables), then one section per
// area with its provision side by side and its adult-led activities, then the
// book list and home learning, each of which Design can switch off.
//
// The model fills one fixed shape (eyfsResponseFormat in
// app/lib/eyfs-prompt.ts); code arranges it. Pure, free of React,
// normalize.ts and schema.ts.

import { undash } from "./undash";
import { activityBlocks, activityTitle } from "./activity";

/** The seven areas, in EYFS order: [model field, name]. Prime areas first. */
export const EYFS_AREAS: [string, string][] = [
  ["communication", "Communication and Language"],
  ["personal", "Personal, Social and Emotional Development"],
  ["physical", "Physical Development"],
  ["literacy", "Literacy"],
  ["maths", "Mathematics"],
  ["world", "Understanding the World"],
  ["arts", "Expressive Arts and Design"],
];

/** Weeks per grid table: six fit landscape A4 with readable cells. */
export const WEEKS_PER_TABLE = 6;

/** The longest grid cell kept. The table cannot split across pages, so a
 *  long cell would push it off the page; the prompt asks for far less. */
export const MAX_GRID_CELL = 140;

/** The parts of a plan Design can switch off. */
export const EYFS_PARTS: { id: string; label: string }[] = [
  { id: "grid", label: "Week by week overview" },
  { id: "books", label: "Book list" },
  { id: "home", label: "Home learning" },
];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** A grid cell cut to MAX_GRID_CELL at a word, with an ellipsis. */
export function gridCell(v: unknown): string {
  const s = str(v);
  if (s.length <= MAX_GRID_CELL) return s;
  const cut = s.slice(0, MAX_GRID_CELL - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX_GRID_CELL / 2)).trimEnd()}…`;
}

/** The grid as tables of at most WEEKS_PER_TABLE weeks: the areas down the
 *  side, the weeks across. One week is one table of one week. */
export function eyfsGrids(weeks: Raw[]): { from: number; to: number; headers: string[]; rows: string[][] }[] {
  const out: { from: number; to: number; headers: string[]; rows: string[][] }[] = [];
  for (let start = 0; start < weeks.length; start += WEEKS_PER_TABLE) {
    const chunk = weeks.slice(start, start + WEEKS_PER_TABLE);
    out.push({
      from: start + 1,
      to: start + chunk.length,
      headers: ["Area", ...chunk.map((w, i) => (str(w.theme) ? `Week ${start + i + 1}: ${str(w.theme)}` : `Week ${start + i + 1}`))],
      rows: EYFS_AREAS.map(([field, name]) => [name, ...chunk.map((w) => gridCell(w[field]))]),
    });
  }
  return out;
}

/** The model's plan (complete or mid-stream) as a generic sheet draft. */
export function arrangeEyfs(raw: unknown): Raw {
  const r = obj(undash(raw));
  // A week arrives once it has a theme or any cell; mid-stream ones wait.
  const weeks = arr(r.weeks).map(obj).filter((w) => str(w.theme) || EYFS_AREAS.some(([f]) => str(w[f])));
  const areas = arr(r.areas).map(obj);
  const byArea = (field: string) => areas.find((a) => a.area === field);

  const gridSections: Raw[] = eyfsGrids(weeks).map((g) => ({
    role: "grid",
    title: g.from === g.to ? `Week ${g.from} at a glance` : `Weeks ${g.from} to ${g.to} at a glance`,
    emoji: "🗓️",
    instructions: "",
    blocks: [{ type: "table", headers: g.headers, rows: g.rows }],
  }));

  const areaSections: Raw[] = EYFS_AREAS.map(([field, name]) => {
    const a = obj(byArea(field));
    const indoor = strs(a.indoor);
    const outdoor = strs(a.outdoor);
    const adultLed = arr(a.adultLed).filter((x) => activityTitle(x));
    return {
      role: "area",
      title: name,
      emoji: "",
      instructions: "",
      blocks: [
        ...(str(a.goals) ? [{ type: "text", text: `**Early Learning Goals:** ${str(a.goals)}` }] : []),
        ...(indoor.length || outdoor.length
          ? [{ type: "twocol", left: { title: "Continuous provision indoors", items: indoor }, right: { title: "Continuous provision outdoors", items: outdoor } }]
          : []),
        ...adultLed.flatMap((x) => [{ type: "text", text: `**Adult-led: ${activityTitle(x)}**` }, ...activityBlocks(x)]),
      ],
    };
  });

  const books = strs(r.bookList);
  const home = strs(r.homeLearning);
  const sections: Raw[] = [
    { role: "overview", title: "Overview", emoji: "🌱", instructions: "", blocks: str(r.overview) ? [{ type: "text", text: str(r.overview) }] : [] },
    ...gridSections,
    ...areaSections,
    { role: "books", title: "Books to share", emoji: "📚", instructions: "", blocks: books.length ? [{ type: "list", title: "", style: "bullet", items: books }] : [] },
    { role: "home", title: "Home learning", emoji: "🏡", instructions: "", blocks: home.length ? [{ type: "list", title: "", style: "bullet", items: home }] : [] },
  ];

  return {
    title: str(r.title),
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
