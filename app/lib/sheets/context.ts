// What a sheet needs besides the model's draft, built from the form's request:
// its subtitle, its starting design, and (for a comprehension on the teacher's
// own text) the passage, which never goes through the model.
//
// Shared by the browser, which normalises the stream as it arrives, and by the
// guest route, which stores the finished sheet for a visitor to claim. Both
// must produce the same document from the same request.

import { defaultFamilyForYear } from "@/app/lib/slideshowThemes";
import { defaultDesign, normalizeDraft, ownPassageSection, serializeSheet, type NormalizeContext } from "./normalize";
import { parsePartialJson } from "./stream";
import { DEFAULT_SHEET_THEME } from "./themes";
import { puzzleDefaults } from "./puzzles/level";
import { sheetToolProfile } from "./tools";
import { newsletterRoster } from "./newsletter";
import type { PupilMeta, SheetTool } from "./types";
import type { LetterInfo } from "./letter";
import type { PupilFact } from "./behaviour";
import type { RiskInfo } from "./risk";
import type { NewsletterInfo } from "./newsletter";
import type { StaffName } from "@/app/lib/staff-privacy";
import type { EctInfo } from "./ect";
import type { AppraisalInfo } from "./appraisal";
import type { LearningWalkInfo, LessonObservationInfo } from "./observation";
import type { SipInfo } from "./sip";

export interface SheetRequestInfo {
  yearGroup?: string;
  subject?: string;
  /** Comprehension: whether the answers page is wanted. */
  includeAnswerKey?: boolean;
  textSource?: "generate" | "own" | "";
  ownText?: string;
  /** Worksheet: the worksheet type, whose starting design goes over the
   *  year's default (an exam paper drops the objective line). */
  template?: string;
  /** One band's version of a differentiated set: puzzles are pitched to it. */
  band?: string;
  /** Lesson plans: the form's curriculum and topic, kept for the buttons
   *  that make slides, a worksheet or a quiz from the plan. */
  curriculum?: string;
  topic?: string;
  /** Lesson plans: the layout and the lesson's length in minutes. */
  layout?: string;
  lessonLength?: number;
  /** Exam papers: the style (app/lib/sheets/exam-styles.ts), the tier and
   *  the time allowed in minutes. */
  examStyle?: string;
  tier?: string;
  minutes?: number;
  /** Letters: the type, recipient, sender, date and facts. The names in it
   *  (recipient, sender, child) stay in the browser. */
  letter?: LetterInfo;
  /** Documents about one child: the name and pronouns. Kept in the browser
   *  and on the saved document; the request to the model never has them. */
  pupil?: PupilMeta;
  /** Documents about one child: facts that go on the page as typed (class,
   *  staff, dates), built into tables by code and never sent to a model. */
  pupilFacts?: PupilFact[];
  /** One page profiles: intervention groups and outside agencies, the same way. */
  pupilLinks?: PupilFact[];
  /** Phonics: the children's age, and the school's scheme (an id from
   *  app/lib/phonics-schemes.ts, or "other" with its typed name). */
  age?: number;
  phonicsScheme?: string;
  phonicsSchemeOther?: string;
  /** Early Years plans: the parts the form's checkboxes left unticked, which
   *  start switched off in Design (app/lib/sheets/eyfs.ts EYFS_PARTS). */
  eyfsHidden?: string[];
  /** Parts of the document the form leaves switched off at the start, by
   *  part id (the profile's `parts`). */
  hiddenParts?: string[];
  /** Plans for a school (a pupil premium statement): the school's name and
   *  the facts typed into the form, put on the page by code, never sent. */
  schoolName?: string;
  schoolFacts?: Record<string, string>;
  /** Pupil premium: how many challenges the teacher gave. */
  ppChallenges?: number;
  /** EYFS action plans: how long the plan runs. */
  timescale?: string;
  /** Risk assessments: the activity's details as typed, printed by code.
   *  The leader's name in it is never sent. */
  risk?: RiskInfo;
  /** Newsletters: the celebrations and dates typed into the form, put on
   *  the page by code and never sent. Its pupils become the roster. */
  newsletter?: NewsletterInfo;
  /** Staff documents: the people named in it ("[ECT]", "[TEACHER]" and
   *  their names), kept on the document and never sent. */
  staff?: StaffName[];
  /** ECT reports: the report type, the point in induction and the outcome
   *  the induction tutor picked (printed by code, never sent). */
  ect?: EctInfo;
  /** Appraisal objectives: the role, pay range and how many objectives. */
  appraisal?: AppraisalInfo;
  /** Lesson observations: the lesson's details, printed by code, and whether
   *  the teacher and observer were named (the names are in `staff`). */
  observation?: LessonObservationInfo;
  /** Learning walks: the date, classes and focus, printed by code. */
  learningWalk?: LearningWalkInfo;
  /** School improvement plans: the school type and how many years. */
  sip?: SipInfo;
}

export function sheetContext(tool: SheetTool, info: SheetRequestInfo): NormalizeContext {
  const profile = sheetToolProfile(tool);
  const year = info.yearGroup && info.yearGroup !== "Mixed" ? info.yearGroup : "";
  const subtitle = [
    info.yearGroup === "Mixed" ? "Mixed years" : year,
    profile.subtitleLabel ?? info.subject?.trim(),
    profile.subtitleSuffix?.(info),
  ].filter(Boolean).join(" · ");
  const design = {
    ...defaultDesign(tool, DEFAULT_SHEET_THEME[defaultFamilyForYear(year)]),
    ...profile.startDesign(info),
  };
  return {
    tool,
    subtitle,
    design,
    puzzle: puzzleDefaults(info.yearGroup, info.band),
    ...(profile.arrange ? { arrange: (raw: unknown) => profile.arrange!(raw, info) } : {}),
    ...(profile.lessonMeta ? { lesson: profile.lessonMeta(info) } : {}),
    ...(profile.examMeta ? { exam: profile.examMeta(info) } : {}),
    ...(profile.letterMeta && info.letter ? { letter: profile.letterMeta(info.letter) } : {}),
    ...(profile.unitMeta ? { unit: profile.unitMeta(info) } : {}),
    ...(profile.aboutPupil && info.pupil ? { pupil: { name: info.pupil.name.trim(), pronouns: info.pupil.pronouns } } : {}),
    ...(info.newsletter ? { roster: newsletterRoster(info.newsletter) } : {}),
    ...(info.staff ? { staff: info.staff.map((s) => ({ placeholder: s.placeholder, name: s.name.trim() })) } : {}),
    leadingSections:
      profile.ownPassage && info.textSource === "own" && info.ownText?.trim()
        ? [ownPassageSection(info.ownText)]
        : undefined,
  };
}

/** The stored form of a finished stream: the normalised sheet, serialised.
 *  Null when the stream held nothing usable. */
export function finishSheet(tool: SheetTool, streamed: string, info: SheetRequestInfo): string | null {
  const draft = parsePartialJson(streamed);
  if (!draft) return null;
  const doc = normalizeDraft(draft, sheetContext(tool, info));
  if (!doc.title && doc.sections.length === 0) return null;
  return serializeSheet(doc);
}
