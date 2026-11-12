// Sensory activities as a sheet.
//
// Five multisensory activities on one topic, for any class and particularly
// for pupils with SEND (special educational needs and disabilities) such as
// autism or sensory processing differences. Each activity is drawn with the
// shared activity blocks (what it is for, what you need, the steps, the words
// to use: app/lib/sheets/activity.ts), its senses as a line of tags, and a
// two-column box with adaptations for pupils who are sensitive to sensory
// input beside those who seek it. SEND notes and cross-curricular links are
// gathered into their own sections at the end, so Design can switch each off.
//
// Whenever an activity uses taste or smell, a reminder to check allergies and
// care plans opens the sheet: built in code, never left to the model.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { activityBlocks, activityTitle } from "./activity";

/** The senses an activity can name, in the order they are shown. */
export const SENSES = ["Sight", "Hearing", "Touch", "Movement", "Smell", "Taste"] as const;

export const SENSORY_PARTS: { id: string; label: string }[] = [
  { id: "send", label: "SEND and inclusion notes" },
  { id: "links", label: "Cross-curricular links" },
];

export const SENSORY_ACTIVITIES = 5;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** The senses an activity names, known ones only, in SENSES order, once each. */
export function activitySenses(v: unknown): string[] {
  const named = new Set(strs(v).map((s) => s.toLowerCase()));
  return SENSES.filter((s) => named.has(s.toLowerCase()));
}

/** Whether any activity uses taste or smell. */
export function usesTasteOrSmell(activities: unknown[]): boolean {
  return activities.some((a) => activitySenses(obj(a).senses).some((s) => s === "Taste" || s === "Smell"));
}

/** The model's activities (complete or mid-stream) as a generic sheet draft. */
export function arrangeSensory(raw: unknown): Raw {
  const r = obj(undash(raw));
  const activities = arr(r.activities).filter((a) => activityTitle(a)).slice(0, SENSORY_ACTIVITIES);

  const activitySections: Raw[] = activities.map((a, i) => {
    const x = obj(a);
    const senses = activitySenses(x.senses);
    const sensitive = strs(x.sensitive);
    const seeking = strs(x.seeking);
    // The shared blocks without its support and challenge box: the sensory
    // adaptations take its place.
    const blocks = activityBlocks({ ...x, support: "", challenge: "" });
    return {
      role: "activity",
      title: `${i + 1}. ${activityTitle(a)}`,
      emoji: "",
      instructions: "",
      blocks: [
        ...(str(x.objective) ? [{ type: "text", text: `**Learning objective:** ${str(x.objective)}` }] : []),
        ...(senses.length ? [{ type: "text", text: `**Senses:** ${senses.join(" · ")}` }] : []),
        ...blocks,
        ...(sensitive.length || seeking.length
          ? [{ type: "twocol", left: { title: "For pupils who are sensory-sensitive", items: sensitive }, right: { title: "For pupils who are sensory-seeking", items: seeking } }]
          : []),
      ],
    };
  });

  const notes = activities.map((a, i) => [i + 1, activityTitle(a), str(obj(a).sendNote)] as const).filter(([, , n]) => n);
  const links = activities.flatMap((a, i) => strs(obj(a).crossCurricular).map((l) => `${i + 1}. ${activityTitle(a)}: ${l}`));

  const sections: Raw[] = [
    {
      role: "safety",
      title: "",
      emoji: "",
      instructions: "",
      blocks: usesTasteOrSmell(activities)
        ? [{ type: "callout", variant: "remember", label: "Before you start", emoji: "⚠️", text: "Some activities use taste or smell. Check every pupil's allergies, dietary needs and care plan first, and leave out anything a pupil cannot have." }]
        : [],
    },
    ...(str(r.intro) ? [{ role: "intro", title: "", emoji: "", instructions: "", blocks: [{ type: "text", text: str(r.intro) }] }] : []),
    ...activitySections,
    { role: "send", title: "SEND and inclusion notes", emoji: "", instructions: "", blocks: notes.length ? [{ type: "list", title: "", style: "bullet", items: notes.map(([n, t, note]) => `${n}. ${t}: ${note}`) }] : [] },
    { role: "links", title: "Cross-curricular links", emoji: "", instructions: "", blocks: links.length ? [{ type: "list", title: "", style: "bullet", items: links }] : [] },
  ];

  return {
    title: str(r.title),
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
