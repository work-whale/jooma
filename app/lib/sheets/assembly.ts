// An assembly script as a sheet.
//
// An assembly in a UK school is a 15 to 20 minute gathering of a year group
// or the whole school, led from the front. The model writes the parts
// (app/lib/assembly-prompt.ts): what to say and how to deliver it. Code makes
// the running order add up to the length (app/lib/sheets/timing.ts), heads
// the closing part to match the form's picker (a reflection, collective
// worship, or a faith school's prayer), and lists the resources as a
// checklist. "Make assembly slides" hands the script to the main Slides
// engine as an assembly deck with speaker notes (assemblyDeckParams).
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { detailsTable } from "./action-plan";
import { timedItems } from "./timing";
import type { SheetDoc } from "./types";

export const ASSEMBLY_PARTS = ["intro", "main", "story", "interactive", "questions", "reflection"] as const;
export type AssemblyPart = (typeof ASSEMBLY_PARTS)[number];

export const ASSEMBLY_SHEET_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "message", label: "Key message" },
  { id: "order", label: "Running order" },
  { id: "resources", label: "Resources" },
];

export type AssemblyReflection = "reflection" | "worship" | "faith";

/** The picker's value; anything else, or an old run without it, is a reflection. */
export const assemblyReflection = (v: unknown): AssemblyReflection => (v === "worship" || v === "faith" ? v : "reflection");

const CLOSING_HEADING: Record<AssemblyReflection, string> = {
  reflection: "Reflection",
  worship: "Collective worship",
  faith: "Prayer and reflection",
};

/** 5 to 120 minutes, as the form allows; 20 when missing. */
export function assemblyMinutes(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(120, Math.max(5, Math.round(n))) : 20;
}

export interface AssemblyInfo {
  stage?: string;
  lengthMinutes?: number | string;
  reflection?: string;
  /** The faith, for a faith school. */
  faith?: string;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);
const section = (role: string, title: string, blocks: Raw[], instructions = ""): Raw => ({ role, title, emoji: "", instructions, blocks });
const list = (title: string, style: "bullet" | "number" | "check", items: string[]): Raw[] => (items.length ? [{ type: "list", title, style, items }] : []);

/** The model's script (complete or mid-stream) as a generic sheet draft. */
export function arrangeAssembly(raw: unknown, info: AssemblyInfo = {}): Raw {
  const r = obj(undash(raw));
  const length = assemblyMinutes(info.lengthMinutes);
  const reflection = assemblyReflection(info.reflection);
  const faith = info.faith?.trim() ?? "";
  const closing = reflection === "faith" && faith ? `${CLOSING_HEADING.faith} (${faith})` : CLOSING_HEADING[reflection];

  const parts = arr(r.parts)
    .map(obj)
    .map((p) => ({
      part: str(p.part) as AssemblyPart,
      title: str(p.title),
      minutes: typeof p.minutes === "number" ? p.minutes : Number.NaN,
      say: strs(p.say),
      delivery: strs(p.delivery),
    }))
    .filter((p) => p.title && (ASSEMBLY_PARTS as readonly string[]).includes(p.part));
  const timed = timedItems(parts.map((p) => ({ label: p.title, minutes: p.minutes })), length);
  const questions = strs(r.questions);

  const sections: Raw[] = [
    section("details", "", [
      detailsTable([
        ["Stage", info.stage?.trim() ?? ""],
        ["Length", `${length} minutes`],
        ["Closing", closing],
        ["Led by", ""],
        ["Date", ""],
      ]),
    ]),
  ];
  const message = str(r.message);
  if (message) sections.push(section("message", "Key message", [{ type: "text", text: message }]));
  if (parts.length) {
    sections.push(section("order", "Running order", [{ type: "table", headers: ["Minutes", "Part"], rows: parts.map((p, i) => [String(timed[i].minutes), p.title]) }]));
  }
  parts.forEach((p, i) => {
    const mins = timed[i].minutes;
    sections.push(
      section(
        "part",
        p.part === "reflection" ? CLOSING_HEADING[reflection] : p.title,
        [
          ...list("What to say", "bullet", p.say),
          ...(p.part === "questions" ? list("Questions to ask", "number", questions) : []),
          ...list("Delivery", "bullet", p.delivery),
        ],
        `${mins} ${mins === 1 ? "minute" : "minutes"}`,
      ),
    );
  });
  const resources = [...list("Resources", "check", strs(r.resources)), ...list("Before the assembly", "check", strs(r.preparation))];
  if (resources.length) sections.push(section("resources", "Resources", resources));

  return {
    title: str(r.title) || "Assembly",
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}

/** The deck "Make assembly slides" asks the Slides engine for: one slide per
 *  part plus the title (3 to 10), from the script's words. Never the
 *  details table: only the message, the parts and the questions. */
export function assemblyDeckParams(doc: SheetDoc, language: string) {
  const parts = doc.sections.filter((s) => s.role === "part");
  const details = doc.sections.find((s) => s.role === "details")?.blocks.find((b) => b.type === "table");
  const stage = details && details.type === "table" ? details.rows.find((r) => r[0] === "Stage")?.[1] ?? "" : "";
  const message = doc.sections.find((s) => s.role === "message")?.blocks.find((b) => b.type === "text");
  const lines: string[] = [];
  if (message && message.type === "text") lines.push(`Key message: ${message.text}`);
  for (const s of parts) {
    lines.push(`\n## ${s.title} (${s.instructions})`);
    for (const b of s.blocks) if (b.type === "list") lines.push(`${b.title}:`, ...b.items.map((t) => `- ${t}`));
  }
  return {
    topic: doc.title,
    deckKind: "assembly" as const,
    ...(stage ? { year: stage } : {}),
    slideCount: Math.max(3, Math.min(10, parts.length + 1)),
    resourceText: lines.join("\n").slice(0, 12000),
    imageSource: "web" as const,
    language,
  };
}
