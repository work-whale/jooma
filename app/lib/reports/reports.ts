// End of term reports for a whole class.
//
// The teacher fills a grid, one row per pupil: first name, pronouns, an
// attainment judgement per subject, effort, a note and a next step. The model
// writes one comment and one next step per pupil. It never sees a name: see
// ./privacy.ts. Comments are stored with "[PUPIL]" where the name goes and the
// name is put back only when a card is shown, copied or exported.
//
// Stored as JSON in tool_runs.output, `kind` first, so a reader can tell it
// from the single pupil markdown reports saved before. Pure.

export const REPORTS_KIND = "jooma-reports";
export const REPORTS_VERSION = 1;
export const MAX_PUPILS = 40;
/** Pupils written in one request. */
export const CHUNK_SIZE = 5;

export type Phase = "primary" | "secondary";
export type ScaleId = "primary" | "gcse" | "target";
export type Pronouns = "he" | "she" | "they";
export type ReportLength = "short" | "standard" | "long";
export type ReportTone = "warm" | "formal" | "encouraging" | "concise";

export const SCALES: Record<ScaleId, { label: string; values: string[] }> = {
  primary: { label: "Working towards, expected, greater depth", values: ["Working towards", "Expected standard", "Greater depth"] },
  gcse: { label: "GCSE grade, 9 to 1", values: ["9", "8", "7", "6", "5", "4", "3", "2", "1"] },
  target: { label: "Below, on or above target", values: ["Below target", "On target", "Above target"] },
};

export const EFFORT = ["Excellent", "Good", "Inconsistent", "Needs to improve"];

export const LENGTH_WORDS: Record<ReportLength, number> = { short: 50, standard: 100, long: 160 };

export const PRIMARY_SUBJECTS = ["English", "Maths", "Science", "History", "Geography", "Art", "Music", "PE", "Computing", "RE", "PSHE", "French", "Design and technology"];

export interface ReportSettings {
  yearGroup: string;
  phase: Phase;
  subjects: string[];
  scale: ScaleId;
  length: ReportLength;
  tone: ReportTone;
  nextSteps: boolean;
}

export interface PupilRow {
  /** Stable within the class: "p1", "p2"... */
  id: string;
  name: string;
  pronouns: Pronouns;
  /** Subject to a value on the class's scale; "" when not judged. */
  attainment: Record<string, string>;
  effort: string;
  note: string;
  nextStep: string;
  /** The written report, with "[PUPIL]" for the name. */
  comment: string;
  /** The written next step, with "[PUPIL]" for the name. */
  target: string;
  status: "pending" | "writing" | "done" | "error";
}

export interface ReportsDoc {
  kind: typeof REPORTS_KIND;
  version: number;
  settings: ReportSettings;
  pupils: PupilRow[];
}

const PRIMARY_YEARS = /^(nursery|reception|year [1-6])$/i;

/** Nursery to Year 6 is primary; anything else, secondary. */
export function phaseFor(yearGroup: string): Phase {
  return PRIMARY_YEARS.test(yearGroup.trim()) ? "primary" : "secondary";
}

export function defaultSettings(yearGroup = ""): ReportSettings {
  const phase = phaseFor(yearGroup);
  return {
    yearGroup,
    phase,
    subjects: phase === "primary" ? ["English", "Maths", "Science"] : [""],
    scale: phase === "primary" ? "primary" : "target",
    length: "standard",
    tone: "warm",
    nextSteps: true,
  };
}

let seq = 0;
export function newPupil(name = "", id?: string): PupilRow {
  seq += 1;
  return { id: id ?? `p${Date.now().toString(36)}${seq}`, name, pronouns: "they", attainment: {}, effort: "", note: "", nextStep: "", comment: "", target: "", status: "pending" };
}

export function makeReports(settings: ReportSettings, pupils: PupilRow[]): ReportsDoc {
  return { kind: REPORTS_KIND, version: REPORTS_VERSION, settings, pupils };
}

export function isReportsOutput(output: string | null | undefined): boolean {
  return typeof output === "string" && output.trimStart().startsWith(`{"kind":"${REPORTS_KIND}"`);
}

export function serializeReports(doc: ReportsDoc): string {
  return JSON.stringify(doc);
}

export function parseReports(output: string | null | undefined): ReportsDoc | null {
  if (!isReportsOutput(output)) return null;
  try {
    const doc = JSON.parse(output as string) as ReportsDoc;
    return doc?.kind === REPORTS_KIND && Array.isArray(doc.pupils) && doc.settings ? doc : null;
  } catch {
    return null;
  }
}

/** The subjects a class reports on: one for secondary, every named one for
 *  primary; blanks dropped. */
export function activeSubjects(settings: ReportSettings): string[] {
  const named = settings.subjects.map((s) => s.trim()).filter(Boolean);
  return settings.phase === "secondary" ? named.slice(0, 1) : named;
}

/** Pupils, in order, split into the requests that write them. */
export function chunk<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The `step` a request is recorded under: only the first request for a class
 * counts as a generation. Like a differentiated set's bands, the rest are part
 * of the same piece of work. A rewrite of one report is an edit.
 */
export function reportUsageStep(chunkIndex: unknown, redo: unknown): string | null {
  if (redo === true) return "Report redo";
  return typeof chunkIndex === "number" && chunkIndex > 0 ? "Report batch" : null;
}

/** RFC 4180 CSV of the finished reports, names in: what a school's reporting
 *  system imports. */
export function reportsCsv(doc: ReportsDoc, swap: (text: string, name: string) => string): string {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Name", "Report", "Next step"], ...doc.pupils.filter((p) => p.comment).map((p) => [p.name, swap(p.comment, p.name), swap(p.target, p.name)])];
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** The class's reports as markdown, names in: Copy all, Word, the Library. */
export function reportsMarkdown(doc: ReportsDoc, swap: (text: string, name: string) => string): string {
  const subjects = activeSubjects(doc.settings);
  const head = [`# Reports: ${[doc.settings.yearGroup, subjects.join(", ")].filter(Boolean).join(", ")}`];
  const body = doc.pupils
    .filter((p) => p.comment)
    .flatMap((p) => [`## ${p.name}`, swap(p.comment, p.name), ...(p.target ? [`**Next step:** ${swap(p.target, p.name)}`] : [])]);
  return [...head, ...body].join("\n\n");
}

/**
 * A streamed answer (complete or partial) applied to the pupils it was for.
 * Only references in `refs` are touched, so a model that answers for a pupil
 * it was not asked about changes nothing.
 */
export function applyAnswer(pupils: PupilRow[], refs: string[], raw: unknown): PupilRow[] {
  const reports = raw && typeof raw === "object" && Array.isArray((raw as { reports?: unknown }).reports) ? ((raw as { reports: unknown[] }).reports) : [];
  const byRef = new Map<string, { comment: string; target: string }>();
  for (const r of reports) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const ref = typeof o.ref === "string" ? o.ref : "";
    if (!refs.includes(ref)) continue;
    byRef.set(ref, { comment: typeof o.comment === "string" ? o.comment : "", target: typeof o.nextStep === "string" ? o.nextStep : "" });
  }
  return pupils.map((p) => {
    const got = byRef.get(p.id);
    return got ? { ...p, comment: got.comment, target: got.target } : p;
  });
}

/** Runs `tasks` with at most `limit` in flight, in order of starting. */
export async function runLimited<T>(tasks: (() => Promise<T>)[], limit = 2): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
