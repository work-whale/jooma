"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { injectGoogleFonts } from "@/app/components/editor/googleFonts";
import { extractHeadings } from "@/app/lib/headings";
import { paginate, type PageUnit } from "@/app/lib/sheets/paginate";
import { SHEET_CSS } from "@/app/lib/sheets/sheet-css";
import { getSheetTheme, pagePx, sheetThemeVars } from "@/app/lib/sheets/themes";
import { withPupilName, withPupilPlaceholder } from "@/app/lib/sheets/pupil";
import { emptyLesson, TOPIC_MAP_COLUMNS, visibleColumns, type UnitColumn } from "@/app/lib/sheets/unit";
import { unitLessonHref } from "@/app/lib/lesson-handoffs";
import { headedSections, isHidden } from "@/app/lib/sheets/visibility";
import { answersTitle, answerText, examCover, hasAnswersPage, questionLabels, sheetOutline, showsCover } from "@/app/lib/sheets/markdown";
import { phaseClock, phaseWording } from "@/app/lib/sheets/lesson";
import { sheetToolProfile } from "@/app/lib/sheets/tools";
import { showsIntro, showsObjective, showsPictures, showsSlip, visibleNotes } from "@/app/lib/sheets/visibility";
import { formatLetterDate } from "@/app/lib/sheets/letter";
import { puzzleDefaultsFromSubtitle } from "@/app/lib/sheets/puzzles";
import { PUZZLE_LEVELS } from "@/app/lib/sheets/types";
import {
  addSection,
  deleteBlock,
  deleteSection,
  duplicateBlock,
  insertBlock,
  moveBlock,
  moveSection,
  newBlock,
  updateBlock,
  updateSection,
} from "@/app/lib/sheets/edit";
import {
  isQuestion,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  type BlockType,
  type ImageSize,
  type SheetBlock,
  type SheetDoc,
  type SheetQuestion,
} from "@/app/lib/sheets/types";
import { AnswerView, BlockView, PassageView, SequenceHead, SequenceRow } from "./blocks";
import { EditableText } from "./rich";

/*
 * A sheet drawn as real pages, A4 or Letter, and edited in place.
 *
 * Pages are not a CSS trick. Every piece of the sheet (the header, a section
 * heading, a question, each paragraph of a passage) is first drawn once in a
 * hidden copy at full page width and measured; paginate() packs those heights
 * onto pages; then the pages are drawn. So what the teacher sees is exactly
 * what Print and the PDF produce, page breaks included, and a question is
 * never cut in half by one.
 *
 * Measuring runs in a layout effect, before the browser paints, and again
 * whenever the hidden copy changes size (a web font arriving, an edit), so the
 * pages never show a wrong break first.
 */

/** The page's padding (top + bottom), as in sheet-css's .js-page. */
const PAGE_PADDING = 46 + 40;
/** The gap between pieces on a page (.js-page-body) and inside a passage. */
const GAP = 14;
const PASSAGE_GAP = 10;
/** Kept clear at the foot of each page, so rounding never clips a line. */
const SAFETY = 6;

const CONTENT_TYPES: BlockType[] = ["text", "callout", "wordbank", "passage", "table"];
const CONTENT_LABEL: Partial<Record<BlockType, string>> = {
  list: "List",
  phase: "Lesson phase",
  exemplar: "Model answer",
  sequence: "Lesson table",
  twocol: "Two-column box",
  image: "Picture",
  text: "Text",
  callout: "Callout box",
  wordbank: "Word bank",
  passage: "Reading passage",
  table: "Table",
};

const PICTURE_SIZES: { size: ImageSize; text: string; label: string }[] = [
  { size: "s", text: "S", label: "Small picture" },
  { size: "m", text: "M", label: "Medium picture" },
  { size: "l", text: "L", label: "Large picture" },
];

interface Unit extends PageUnit {
  key: string;
  /** One paragraph of a passage that may run over a page break. */
  para?: { blockId: string; si: number; bi: number; p: number };
  /** One lesson of a lesson table; the first (r = 0) carries the header row. */
  seq?: { blockId: string; r: number };
  /** One row of a table taller than a page, drawn in pieces like a lesson
   *  table: any piece that opens a page repeats the header row. */
  trow?: { blockId: string; r: number };
  /** Draws the piece. `live` is false for the hidden measuring copy, which
   *  must carry no ids and no toolbars. */
  render?: (live: boolean) => ReactNode;
}

interface PassageMeasure {
  /** Panel height less its paragraphs: padding, border, title, gaps. */
  chrome: number;
  /** The title and the gap under it; a continued panel has neither. */
  titleH: number;
  paras: number[];
}

interface SequenceMeasure {
  /** The table's frame: its height less the header and rows. */
  chrome: number;
  head: number;
  rows: number[];
}

interface Measured {
  units: Record<string, number>;
  passages: Record<string, PassageMeasure>;
  sequences: Record<string, SequenceMeasure>;
  /** Tables drawn in pieces, measured like lesson tables. */
  tables: Record<string, SequenceMeasure>;
  foot: number;
}

type Menu = { si: number; kind: "question" | "content" } | null;

export interface SheetDocumentProps {
  doc: SheetDoc;
  /** Click-to-edit text, block toolbars and the add buttons. */
  edit?: boolean;
  /** Called with the whole changed sheet; the workspace keeps it for undo. */
  onChange?: (next: SheetDoc) => void;
  /** Still arriving from the model: no editing, and new blocks fade in. */
  streaming?: boolean;
  /** Give headings the outline's ids. Off for a second copy on the page. */
  anchors?: boolean;
  /** Scale pages down to fit a narrow container. Off for exports. */
  fit?: boolean;
  /** Drawn for a PDF or Print: square corners, no shadow. */
  exporting?: boolean;
  /** The piece Jo is working on, ringed and labelled. Its key is the piece's
   *  `data-jo`: "head", "intro", "sh:<sectionId>" or a block id. */
  joFocus?: { key: string; label: string } | null;
  /** Opens the picture chooser for the picture block with this id. Without
   *  it pictures can still be sized, moved and deleted, but not changed. */
  onPicture?: (blockId: string) => void;
}

export default function SheetDocument({ doc: stored, edit = false, onChange, streaming = false, anchors = true, fit = true, exporting = false, joFocus = null, onPicture }: SheetDocumentProps) {
  // A document about one child is drawn with the child's name in place of
  // "[PUPIL]", and every edit goes back with the name taken out again, so the
  // stored copy (the one Jo and autosave see) never holds it in its text.
  const doc = useMemo(() => withPupilName(stored), [stored]);
  const editing = edit && !streaming && !!onChange;
  const theme = getSheetTheme(doc.design.themeId);
  const paper = pagePx(doc.design);
  const numbers = useMemo(() => questionLabels(doc), [doc]);
  const clocks = useMemo(() => phaseClock(doc), [doc]);
  const profile = sheetToolProfile(doc.tool);
  const ids = useMemo(() => (anchors ? extractHeadings(sheetOutline(doc)).map((h) => h.id) : []), [doc, anchors]);
  const showAnswers = hasAnswersPage(doc);
  // The outline lists the sections on the page, so a heading's id is found
  // by its place among those, not among every section.
  const shown = headedSections(doc);
  const headingAt = new Map(shown.map((s, i) => [s.id, i + 1]));

  const [menu, setMenu] = useState<Menu>(null);
  const commit = (next: SheetDoc) => onChange?.(withPupilPlaceholder(next));
  const columns: UnitColumn[] = visibleColumns(doc, profile.unitColumns ?? TOPIC_MAP_COLUMNS);

  // Measured on the last render (see Measuring below). Read here because a
  // table only splits across pages once it is known to be taller than one.
  const [measured, setMeasured] = useState<Measured | null>(null);
  const bodyHeight = paper.h - PAGE_PADDING - (measured?.foot ?? 28) - SAFETY;
  /** A table taller than a page body. Measured whole while it fits, and by
   *  its pieces once split, so the choice holds steady between renders. */
  const tallTable = (id: string) => {
    const t = measured?.tables[id];
    const h = t ? t.chrome + t.head + t.rows.reduce((a, b) => a + b, 0) : (measured?.units[id] ?? 0);
    return h > bodyHeight;
  };

  // ── The pieces ──────────────────────────────────────────────────────────

  const units: Unit[] = [];
  // A passage is drawn in pieces, possibly across pages; each piece looks its
  // toolbar and patch up here.
  const passageTools = new Map<string, { tools: ReactNode; patch: (p: Partial<SheetBlock>) => void; block: Extract<SheetBlock, { type: "passage" }> }>();

  // An exam paper opens with a cover page instead of the usual header: the
  // level and tier, title, time allowed, total marks (worked out from the
  // questions), the candidate's details, instructions and, for a paper in a
  // board's style, the line saying it is not an official paper.
  const cover = showsCover(doc) ? examCover(doc) : null;
  if (cover) {
    units.push({
      key: "cover",
      height: 0,
      render: (live) => (
        <div className="js-cover" data-testid={live ? "exam-cover" : undefined}>
          <p className="js-cover-level">{[cover.level, cover.tier].filter(Boolean).join(", ")}</p>
          <EditableText
            as="h1"
            className="js-title"
            value={doc.title}
            placeholder={streaming ? " " : "Paper title"}
            editable={editing}
            onChange={(title) => commit({ ...doc, title })}
            label="title"
            {...(live && ids[0] ? { id: ids[0] } : {})}
          />
          <div className="js-cover-facts">
            <span>Time allowed <b>{cover.time}</b></span>
            <span>Total marks <b data-testid={live ? "exam-total" : undefined}>{cover.total}</b></span>
          </div>
          <div className="js-cover-boxes">
            <span>Name <i /></span>
            <span>Class <i /></span>
            <span>Candidate number <i /></span>
          </div>
          <div className="js-cover-instructions">
            <p className="js-cover-heading">Instructions</p>
            <ul>{cover.instructions.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
          {cover.disclaimer && <p className="js-cover-disclaimer">{cover.disclaimer}</p>}
        </div>
      ),
    });
  }

  // A letter opens with its letterhead: the school and date, the salutation
  // and the "Re:" line (the title). All built in code, all editable.
  const letter = doc.letter;
  const setLetter = (patch: Partial<NonNullable<SheetDoc["letter"]>>) => letter && commit({ ...doc, letter: { ...letter, ...patch } });
  if (letter) {
    units.push({
      key: "letter-head",
      height: 0,
      render: (live) => (
        <div className="js-letter-head" data-testid={live ? "letter-head" : undefined}>
          <div className="js-letter-top">
            {(letter.school || editing) && (
              <EditableText className="js-letter-school" value={letter.school} placeholder="School name" editable={editing} onChange={(school) => setLetter({ school })} label="school name" />
            )}
            <EditableText className="js-letter-date" value={formatLetterDate(letter.date)} placeholder="Date" editable={editing} onChange={(date) => setLetter({ date })} label="date" />
          </div>
          <EditableText as="p" className="js-letter-salutation" value={letter.salutation} placeholder="Dear..." editable={editing} onChange={(salutation) => setLetter({ salutation })} label="salutation" />
          <p className="js-letter-re" {...(live && ids[0] ? { id: ids[0] } : {})}>
            <b>Re: </b>
            <EditableText value={doc.title} placeholder={streaming ? " " : "What the letter is about"} editable={editing} onChange={(title) => commit({ ...doc, title })} label="subject" />
          </p>
        </div>
      ),
    });
  }

  // A one page profile has an empty box beside the title for a printed
  // photo. Nothing is uploaded: the box is only a frame.
  const photo = !!profile.photoBox && !isHidden(doc, "photo");
  if (!cover && !letter) units.push({
    key: "head",
    height: 0,
    render: (live) => (
      <div className={photo ? "js-head-photo" : undefined}>
      {photo && (
        <div className="js-photo-box" aria-label="Space for a photo" data-testid={live ? "photo-box" : undefined}>
          <span>Photo</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {doc.design.nameDate && !profile.pupilPageRole && (
          <div className="js-namedate">
            <span>Name <i /></span>
            <span>Date <i /></span>
          </div>
        )}
        {(doc.subtitle || editing) && (
          <EditableText className="js-subtitle" value={doc.subtitle} placeholder="Year and subject" editable={editing} onChange={(subtitle) => commit({ ...doc, subtitle })} label="subtitle" />
        )}
        <EditableText
          as="h1"
          className="js-title"
          value={doc.title}
          placeholder={streaming ? " " : "Title"}
          editable={editing}
          onChange={(title) => commit({ ...doc, title })}
          label="title"
          {...(live && ids[0] ? { id: ids[0] } : {})}
        />
        {showsObjective(doc) && (doc.objective || editing) && (
          <div className="js-objective">
            {theme.look.emoji && <span aria-hidden="true">🎯</span>}
            <p>
              <b>Learning objective: </b>
              <EditableText value={doc.objective} placeholder="I am learning to..." editable={editing} multiline onChange={(objective) => commit({ ...doc, objective })} label="learning objective" />
            </p>
          </div>
        )}
      </div>
      </div>
    ),
  });

  if (doc.intro && showsIntro(doc)) {
    const intro = doc.intro;
    units.push({
      key: "intro",
      height: 0,
      render: (live) => (
        <div className="js-block">
          {live && editing && (
            <Tools>
              <ToolButton label="Delete" onClick={() => commit({ ...doc, intro: null })} />
            </Tools>
          )}
          <BlockView
            block={{ id: "intro", type: "callout", ...intro }}
            edit={editing}
            design={doc.design}
            onPatch={(p) => {
              const { variant, label, text, emoji } = { ...intro, ...(p as Partial<typeof intro>) };
              commit({ ...doc, intro: text ? { variant, label, text, emoji } : null });
            }}
          />
        </div>
      ),
    });
  }

  // A lesson table is drawn in pieces, possibly across pages, like a passage.
  const pupilPage = (s: SheetDoc["sections"][number]) => !!profile.pupilPageRole && s.role === profile.pupilPageRole;
  const sequenceTools = new Map<string, { tools: ReactNode; block: Extract<SheetBlock, { type: "sequence" }>; si: number; bi: number }>();
  const tableTools = new Map<string, { tools: ReactNode; block: Extract<SheetBlock, { type: "table" }>; patch: (p: Partial<SheetBlock>) => void }>();

  doc.sections.forEach((s, si) => {
    // A part switched off in Design (a unit plan's overview) is left off
    // the page, and out of the outline's way.
    if (isHidden(doc, s.role)) return;
    // A letter's paragraphs sit under no heading, nor does a built-in part
    // with no title (a profile's review dates).
    if (!((letter || s.role) && !s.title && !s.instructions)) units.push({
      key: `sh:${s.id}`,
      height: 0,
      keepWithNext: s.blocks.length > 0,
      // The pupils' pages (a cover lesson's task) start on a page of their
      // own, with the name and date lines at the top.
      breakBefore: !!pupilPage(s),
      render: (live) => (
        <div className="js-block" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pupilPage(s) && doc.design.nameDate && (
            <div className="js-namedate" data-testid={live ? "pupil-page-namedate" : undefined}>
              <span>Name <i /></span>
              <span>Date <i /></span>
            </div>
          )}
          {live && editing && (
            <Tools>
              <ToolButton label="Move up" text="↑" onClick={() => commit(moveSection(doc, si, -1))} />
              <ToolButton label="Move down" text="↓" onClick={() => commit(moveSection(doc, si, 1))} />
              <ToolButton label="Delete section" text="Delete" onClick={() => commit(deleteSection(doc, si))} />
            </Tools>
          )}
          <div className="js-section-head" {...(live && ids[headingAt.get(s.id) ?? -1] ? { id: ids[headingAt.get(s.id)!] } : {})}>
            {theme.look.emoji && (s.emoji || editing) && (
              <EditableText className="js-section-emoji" value={s.emoji} placeholder="+" editable={editing} onChange={(emoji) => commit(updateSection(doc, si, { emoji }))} label="section emoji" />
            )}
            <EditableText as="h2" className="js-section-title" value={s.title} placeholder="Section title" editable={editing} onChange={(title) => commit(updateSection(doc, si, { title }))} label="section title" />
          </div>
          {(s.instructions || editing) && (
            <EditableText
              as="p"
              className="js-instructions"
              value={s.instructions}
              placeholder="Add instructions"
              editable={editing}
              multiline
              onChange={(instructions) => commit(updateSection(doc, si, { instructions }))}
              label="section instructions"
            />
          )}
        </div>
      ),
    });

    s.blocks.forEach((b, bi) => {
      // A picture switched off in Design is gone from the page, and one with
      // nothing in it is left off the pupil's copy rather than printed empty.
      if (b.type === "image" && (!showsPictures(doc) || (!editing && !b.src && !b.finding))) return;
      const patch = (p: Partial<SheetBlock>) => commit(updateBlock(doc, si, bi, p));
      const tools = (
        <Tools>
          <ToolButton label="Move up" text="↑" onClick={() => commit(moveBlock(doc, si, bi, -1))} />
          <ToolButton label="Move down" text="↓" onClick={() => commit(moveBlock(doc, si, bi, 1))} />
          {b.type === "image" && (
            <>
              {PICTURE_SIZES.filter((p) => p.size !== b.size).map((p) => (
                <ToolButton key={p.size} label={p.label} text={p.text} onClick={() => patch({ size: p.size })} />
              ))}
              {onPicture && <ToolButton label="Change picture" text="Change" onClick={() => onPicture(b.id)} />}
            </>
          )}
          {(b.type === "sort" || b.type === "wordsearch" || b.type === "crossword") && (
            <ToolButton label={b.type === "sort" ? "Shuffle the items" : "Shuffle the grid"} text="Shuffle" onClick={() => patch({ seed: b.seed + 1 })} />
          )}
          {b.type === "wordsearch" && PUZZLE_LEVELS.indexOf(b.level) > 0 && (
            <ToolButton label="Easier grid" text="Easier" onClick={() => patch({ level: PUZZLE_LEVELS[PUZZLE_LEVELS.indexOf(b.level) - 1] })} />
          )}
          {b.type === "wordsearch" && PUZZLE_LEVELS.indexOf(b.level) < PUZZLE_LEVELS.length - 1 && (
            <ToolButton label="Harder grid" text="Harder" onClick={() => patch({ level: PUZZLE_LEVELS[PUZZLE_LEVELS.indexOf(b.level) + 1] })} />
          )}
          {b.type === "crossword" && (
            <ToolButton label={b.wordBank ? "Hide the word bank" : "Show a word bank"} text={b.wordBank ? "No word bank" : "Word bank"} onClick={() => patch({ wordBank: !b.wordBank })} />
          )}
          {(b.type === "short" || b.type === "long") && (
            <>
              <ToolButton label="Fewer lines" text="− line" onClick={() => patch({ lines: Math.max(b.type === "long" ? 3 : 1, b.lines - 1) })} />
              <ToolButton label="More lines" text="+ line" onClick={() => patch({ lines: Math.min(b.type === "long" ? 16 : 6, b.lines + 1) })} />
            </>
          )}
          <ToolButton label="Duplicate" onClick={() => commit(duplicateBlock(doc, si, bi))} />
          <ToolButton label="Delete" onClick={() => commit(deleteBlock(doc, si, bi))} />
        </Tools>
      );

      if (b.type === "passage") {
        b.paragraphs.forEach((_, p) => {
          units.push({ key: `pp:${b.id}:${p}`, height: 0, para: { blockId: b.id, si, bi, p } });
        });
        if (b.paragraphs.length === 0) {
          units.push({ key: b.id, height: 0, render: (live) => <div className="js-block">{live && editing && tools}<BlockView block={b} edit={editing} design={doc.design} onPatch={patch} /></div> });
        }
        passageTools.set(b.id, { tools, patch, block: b });
        return;
      }

      if (b.type === "sequence") {
        // One unit per lesson. The first carries the header row, so the
        // section heading, the header and the first lesson always share a
        // page; any lesson that opens a later page draws the header again
        // above it (see drawSequence). An emptied table is its header alone.
        const count = Math.max(1, b.lessons.length);
        for (let r = 0; r < count; r++) units.push({ key: `sq:${b.id}:${r}`, height: 0, seq: { blockId: b.id, r } });
        sequenceTools.set(b.id, { tools, block: b, si, bi });
        return;
      }

      if (b.type === "table" && b.rows.length > 1 && tallTable(b.id)) {
        // Taller than a page: one unit per row, the header repeated on each
        // page it runs onto (see drawTable). A table that fits on a page is
        // drawn whole, below, and moves to the next page whole as before.
        b.rows.forEach((_, r) => units.push({ key: `tr:${b.id}:${r}`, height: 0, trow: { blockId: b.id, r } }));
        tableTools.set(b.id, { tools, block: b, patch });
        return;
      }

      units.push({
        key: b.id,
        height: 0,
        render: (live) => (
          <div className="js-block" data-block={b.type}>
            {live && editing && tools}
            <BlockView
              block={b}
              number={numbers.get(b.id)}
              edit={editing}
              design={doc.design}
              onPatch={patch}
              onPicture={live && onPicture ? () => onPicture(b.id) : undefined}
              clock={clocks.get(b.id)}
              layout={phaseWording(doc)}
            />
          </div>
        ),
      });
    });

    if (editing) {
      units.push({
        key: `add:${s.id}`,
        height: 0,
        render: (live) => (
          <div className="js-add-row">
            {/* A letter, a unit plan or a plan about one child has no questions to add. */}
            {!letter && !doc.unit && !profile.aboutPupil && <button type="button" className="js-add" onClick={() => live && setMenu({ si, kind: "question" })}>+ Add question</button>}
            <button type="button" className="js-add" onClick={() => live && setMenu({ si, kind: "content" })}>{letter ? "+ Add paragraph or box" : "+ Add text or box"}</button>
            {live && menu?.si === si && (
              <AddMenu
                kind={menu.kind}
                pictures={!!onPicture}
                extra={profile.extraBlocks}
                onPick={(type) => {
                  // A new puzzle is pitched to the year in the sheet's subtitle.
                  const block = newBlock(type, puzzleDefaultsFromSubtitle(doc.subtitle));
                  commit(insertBlock(doc, si, block));
                  setMenu(null);
                  // A new picture is an empty frame: go straight to choosing one.
                  if (type === "image") onPicture?.(block.id);
                }}
                onClose={() => setMenu(null)}
              />
            )}
          </div>
        ),
      });
    }
  });

  if (editing) {
    units.push({
      key: "add-section",
      height: 0,
      render: () => (
        <div className="js-add-row">
          <button type="button" className="js-add" onClick={() => commit(addSection(doc))}>+ Add section</button>
        </div>
      ),
    });
  }

  // A letter ends with its sign-off and, for a trip, the tear-off slip.
  if (letter) {
    units.push({
      key: "letter-signoff",
      height: 0,
      render: (live) => (
        <div className="js-letter-signoff" data-testid={live ? "letter-signoff" : undefined}>
          <EditableText as="p" value={letter.signOff} placeholder="Yours sincerely," editable={editing} onChange={(signOff) => setLetter({ signOff })} label="sign-off" />
          <div className="js-letter-signature" aria-hidden="true" />
          {(letter.senderName || editing) && (
            <EditableText as="p" className="js-letter-sender" value={letter.senderName} placeholder="Your name" editable={editing} onChange={(senderName) => setLetter({ senderName })} label="your name" />
          )}
          {(letter.senderRole || editing) && (
            <EditableText as="p" className="js-letter-role" value={letter.senderRole} placeholder="Your role" editable={editing} onChange={(senderRole) => setLetter({ senderRole })} label="your role" />
          )}
        </div>
      ),
    });
    const slip = letter.slip;
    if (slip && showsSlip(doc)) {
      const setSlip = (patch: Partial<typeof slip>) => setLetter({ slip: { ...slip, ...patch } });
      units.push({
        key: "letter-slip",
        height: 0,
        render: (live) => (
          <div className="js-slip" data-testid={live ? "reply-slip" : undefined}>
            <p className="js-slip-cut" aria-hidden="true">✂ Cut here and return to school</p>
            <EditableText as="h3" className="js-slip-title" value={slip.title} placeholder="Reply slip" editable={editing} onChange={(title) => setSlip({ title })} label="slip title" />
            {(slip.returnBy || editing) && (
              <p className="js-slip-return">
                <b>Please return by: </b>
                <EditableText value={slip.returnBy} placeholder="Date" editable={editing} onChange={(returnBy) => setSlip({ returnBy })} label="return by" />
              </p>
            )}
            <EditableText as="p" className="js-slip-statement" value={slip.statement} placeholder="I give permission..." editable={editing} multiline onChange={(statement) => setSlip({ statement })} label="slip statement" />
            <div className="js-slip-fields">
              {slip.fields.map((f) => (
                <span key={f}>
                  {f} <i />
                </span>
              ))}
            </div>
          </div>
        ),
      });
    }
  }

  if (showAnswers) {
    units.push({
      key: "answers",
      height: 0,
      breakBefore: true,
      keepWithNext: true,
      render: (live) => (
        <div>
          <h2 className="js-answers-title" {...(live && ids[shown.length + 1] ? { id: ids[shown.length + 1] } : {})}>{answersTitle(doc)}</h2>
          <p className="js-instructions" style={{ marginTop: 2 }}>{profile.answersNote}</p>
        </div>
      ),
    });
    doc.sections.forEach((s, si) => {
      if (isHidden(doc, s.role)) return;
      // Numbering restarts in each section, so each section's answers go
      // under its own title.
      if (profile.restartNumbers && s.blocks.some(isQuestion)) {
        units.push({ key: `ah:${s.id}`, height: 0, keepWithNext: true, render: () => <h3 className="js-answers-sub">{s.title}</h3> });
      }
      s.blocks.forEach((b, bi) => {
        if (!isQuestion(b)) return;
        if (!editing && !answerText(b) && !(b.type === "long" && b.criteria.length)) return;
        units.push({
          key: `a:${b.id}`,
          height: 0,
          render: () => (
            <AnswerView q={b} number={numbers.get(b.id) ?? ""} edit={editing} showMarks={!!doc.exam} onPatch={(p: Partial<SheetQuestion>) => commit(updateBlock(doc, si, bi, p))} />
          ),
        });
      });
    });
    visibleNotes(doc).forEach(({ note, index: ni }) => {
      const setNote = (next: typeof note | null) =>
        commit({ ...doc, teacherNotes: next ? doc.teacherNotes.map((n, j) => (j === ni ? next : n)) : doc.teacherNotes.filter((_, j) => j !== ni) });
      units.push({
        key: `n:${ni}`,
        height: 0,
        render: (live) => (
          <div className="js-block">
            {live && editing && (
              <Tools>
                <ToolButton label="Delete" onClick={() => setNote(null)} />
              </Tools>
            )}
            <div className="js-note">
              <EditableText as="h3" value={note.title} placeholder="Teacher notes" editable={editing} onChange={(title) => setNote({ ...note, title })} label="note title" />
              <ul>
                {note.points.map((pt, pi) => (
                  <li key={pi}>
                    <EditableText
                      value={pt}
                      editable={editing}
                      multiline
                      onChange={(v) => setNote({ ...note, points: v ? note.points.map((x, j) => (j === pi ? v : x)) : note.points.filter((_, j) => j !== pi) })}
                      label="note"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ),
      });
    });
  }

  // The questions start on the page after the cover.
  if (cover && units.length > 1) units[1].breakBefore = true;

  // ── Measuring ───────────────────────────────────────────────────────────

  const measureRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;
    const next: Measured = { units: {}, passages: {}, sequences: {}, tables: {}, foot: 0 };
    const h = (el: Element) => Math.ceil(el.getBoundingClientRect().height);
    root.querySelectorAll<HTMLElement>("[data-m]").forEach((el) => {
      const key = el.dataset.m!;
      if (key.startsWith("Q:")) {
        const head = el.querySelector(".js-seq-head");
        const rows = [...el.querySelectorAll(".js-seq-row")].map(h);
        const headH = head ? h(head) : 0;
        next.sequences[key.slice(2)] = { chrome: Math.max(0, h(el) - headH - rows.reduce((a, b) => a + b, 0)), head: headH, rows };
        return;
      }
      if (key.startsWith("T:")) {
        const head = el.querySelector("thead");
        const rows = [...el.querySelectorAll("tbody > tr")].map(h);
        const headH = head ? h(head) : 0;
        next.tables[key.slice(2)] = { chrome: Math.max(0, h(el) - headH - rows.reduce((a, b) => a + b, 0)), head: headH, rows };
        return;
      }
      if (!key.startsWith("P:")) {
        next.units[key] = h(el);
        return;
      }
      const paras = [...el.querySelectorAll(".js-para")].map(h);
      const title = el.querySelector(".js-passage-title");
      next.passages[key.slice(2)] = {
        chrome: h(el) - paras.reduce((a, b) => a + b, 0) - PASSAGE_GAP * Math.max(0, paras.length - 1),
        titleH: title ? h(title) + PASSAGE_GAP : 0,
        paras,
      };
    });
    const foot = root.querySelector(".js-page-foot");
    next.foot = foot ? h(foot) : 28;
    setMeasured((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  // Every render: an edit, a new chunk or a design change can move any break.
  // Cheap, and setMeasured keeps the old object when nothing moved. A layout
  // effect is the documented place to measure the DOM and set state from it
  // (React's tooltip example): the re-render happens before the browser
  // paints, so a wrong page break is never shown.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
  });

  useEffect(() => {
    const page = measureRef.current?.firstElementChild;
    if (!page) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(page);
    return () => observer.disconnect();
  }, [measure]);

  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    waitForSheetFonts(doc.design.themeId).then(() => {
      if (!live) return;
      setFontsReady(true);
      measure();
    });
    return () => { live = false; };
  }, [doc.design.themeId, measure]);

  // ── Packing ─────────────────────────────────────────────────────────────

  if (measured) {
    for (const u of units) {
      const piece = u.seq ?? u.trow;
      if (piece) {
        // The pieces of one table touch: each row's height already includes
        // the gap paginate adds before it. A row that opens a page carries
        // the frame and the repeated header with it.
        const m = u.seq ? measured.sequences[piece.blockId] : measured.tables[piece.blockId];
        if (!m) u.height = 0;
        else if (piece.r === 0) u.height = m.chrome + m.head + (m.rows[0] ?? 0);
        else {
          u.height = (m.rows[piece.r] ?? 0) - GAP;
          u.openHeight = m.chrome + m.head + GAP;
        }
        continue;
      }
      if (!u.para) {
        u.height = measured.units[u.key] ?? 0;
        continue;
      }
      const m = measured.passages[u.para.blockId];
      const ph = m?.paras[u.para.p] ?? 0;
      if (!m) u.height = 0;
      else if (u.para.p === 0) u.height = m.chrome + ph;
      else {
        // See PageUnit.openHeight: a paragraph that opens a page also opens a
        // new panel, without the title.
        u.height = ph + PASSAGE_GAP - GAP;
        u.openHeight = m.chrome - m.titleH + GAP - PASSAGE_GAP;
      }
    }
  }
  const pages = measured ? paginate(units, bodyHeight, GAP) : [units.map((_, i) => i)];

  // ── Drawing ─────────────────────────────────────────────────────────────

  // Jo's ring and label, on the live pages only: the measuring copy must be
  // identical whatever Jo is doing, or the page breaks would move. The label
  // is absolutely placed, so the ring changes no heights either.
  const joMark = (key: string, live: boolean) => {
    if (!live) return {};
    const active = joFocus?.key === key;
    return { "data-jo": key, ...(active ? { "data-jo-active": "" } : {}) };
  };
  const joLabel = (key: string, live: boolean) =>
    live && joFocus?.key === key && joFocus.label ? (
      <span className="js-jo-label" role="status">
        <i aria-hidden="true">J</i>
        {joFocus.label}
      </span>
    ) : null;

  const drawPassage = (blockId: string, from: number, to: number, live: boolean) => {
    const entry = passageTools.get(blockId);
    if (!entry) return null;
    const { block, tools, patch } = entry;
    return (
      <div className="js-block" key={`${blockId}:${from}`} data-block="passage" {...(from === 0 ? joMark(blockId, live) : {})}>
        {from === 0 && joLabel(blockId, live)}
        {live && editing && from === 0 && tools}
        <PassageView
          title={block.title}
          paragraphs={block.paragraphs.slice(from, to)}
          all={block.paragraphs}
          start={from}
          numbered={doc.design.lineNumbers}
          edit={editing}
          onPatch={patch}
        />
      </div>
    );
  };

  /** Rows `from` to `to` of a lesson table, under its header. The piece that
   *  starts with the header carries the table's toolbar and Jo's mark. */
  const drawSequence = (blockId: string, from: number, to: number, first: boolean, live: boolean) => {
    const entry = sequenceTools.get(blockId);
    if (!entry) return null;
    const { block, tools, si, bi } = entry;
    const setLesson = (r: number, next: (typeof block.lessons)[number] | null) =>
      commit(updateBlock(doc, si, bi, { lessons: next ? block.lessons.map((l, j) => (j === r ? next : l)) : block.lessons.filter((_, j) => j !== r) }));
    const addLesson = (after: number) =>
      commit(updateBlock(doc, si, bi, { lessons: [...block.lessons.slice(0, after + 1), emptyLesson(), ...block.lessons.slice(after + 1)] }));
    const rows = block.lessons.slice(Math.max(0, from), to);
    return (
      <div className="js-block" key={`${blockId}:${from}`} data-block="sequence" {...(first ? joMark(blockId, live) : {})}>
        {first && joLabel(blockId, live)}
        {live && editing && first && tools}
        <div className="js-seq" role="table" data-cols={columns.length > 6 ? "wide" : undefined} data-testid={live ? "lesson-table" : undefined}>
          <SequenceHead columns={columns} />
          {rows.map((lesson, k) => {
            const r = Math.max(0, from) + k;
            return (
              <div className="js-block" key={r}>
                {live && editing && (
                  <Tools>
                    <ToolButton label={`Add a lesson after lesson ${r + 1}`} text="+ Lesson" onClick={() => addLesson(r)} />
                    <ToolButton label={`Delete lesson ${r + 1}`} text="Delete" onClick={() => setLesson(r, null)} />
                  </Tools>
                )}
                <SequenceRow
                  lesson={lesson}
                  index={r}
                  columns={columns}
                  edit={editing}
                  onChange={(next) => setLesson(r, next)}
                  planHref={exporting ? null : unitLessonHref(doc, lesson, r)}
                  live={live}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /** Rows `from` to `to` of a table taller than a page, under its header
   *  row. The first piece carries the toolbar and Jo's mark. */
  const drawTable = (blockId: string, from: number, to: number, first: boolean, live: boolean) => {
    const entry = tableTools.get(blockId);
    if (!entry) return null;
    const { block, tools, patch } = entry;
    return (
      <div className="js-block" key={`${blockId}:${from}`} data-block="table" {...(first ? joMark(blockId, live) : {})}>
        {first && joLabel(blockId, live)}
        {live && editing && first && tools}
        <BlockView block={block} edit={editing} design={doc.design} onPatch={patch} rows={{ from: Math.max(0, from), to }} />
      </div>
    );
  };

  const drawPage = (indices: number[]) => {
    const out: ReactNode[] = [];
    for (let k = 0; k < indices.length; k++) {
      const u = units[indices[k]];
      if (u.seq) {
        let end = k;
        while (end + 1 < indices.length && units[indices[end + 1]].seq?.blockId === u.seq.blockId) end++;
        out.push(drawSequence(u.seq.blockId, u.seq.r, units[indices[end]].seq!.r + 1, u.seq.r === 0, true));
        k = end;
        continue;
      }
      if (u.trow) {
        let end = k;
        while (end + 1 < indices.length && units[indices[end + 1]].trow?.blockId === u.trow.blockId) end++;
        out.push(drawTable(u.trow.blockId, u.trow.r, units[indices[end]].trow!.r + 1, u.trow.r === 0, true));
        k = end;
        continue;
      }
      if (!u.para) {
        out.push(
          <div key={u.key} {...joMark(u.key, true)}>
            {joLabel(u.key, true)}
            {u.render?.(true)}
          </div>,
        );
        continue;
      }
      let end = k;
      while (end + 1 < indices.length && units[indices[end + 1]].para?.blockId === u.para.blockId) end++;
      out.push(drawPassage(u.para.blockId, u.para.p, units[indices[end]].para!.p + 1, true));
      k = end;
    }
    return out;
  };

  // Fit the pages to a narrow container (a phone, a side panel) by zooming
  // them, rather than letting an A4 page push the layout sideways. The
  // measuring copy sits outside the zoom, so it always measures at full size.
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = rootRef.current;
    if (!fit || !el) return;
    const update = () => setZoom(Math.min(1, el.clientWidth / (paper.w + 8)));
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [fit, paper.w]);

  const vars = sheetThemeVars(theme, doc.design.fontScale, paper) as CSSProperties;
  const highContrast = theme.tags?.includes("high-contrast");

  return (
    <div
      ref={rootRef}
      className={`js-sheet${streaming ? " js-streaming" : ""}`}
      style={{ ...vars, position: "relative" }}
      data-section={theme.look.section}
      data-number={theme.look.number}
      data-mode={editing ? "edit" : "read"}
      data-paranum={doc.design.lineNumbers ? "on" : "off"}
      data-contrast={highContrast ? "high" : undefined}
      data-ready={measured && fontsReady && !streaming ? "true" : "false"}
      data-export={exporting ? "true" : undefined}
      data-testid="sheet-document"
    >
      <style href="jooma-sheet-css" precedence="default">{SHEET_CSS}</style>

      <div className="js-pages" style={fit && zoom < 1 ? { zoom } : undefined}>
        {pages.map((indices, pi) => (
          <div
            className="js-page"
            key={pi}
            data-page={pi + 1}
            style={measured ? undefined : { height: "auto", minHeight: paper.h }}
          >
            <div className="js-page-body">{drawPage(indices)}</div>
            <div className="js-page-foot">
              <span>{doc.title}</span>
              <span>Page {pi + 1} of {pages.length}</span>
            </div>
          </div>
        ))}
      </div>

      {/* The measuring copy. Off screen, never seen or reached. */}
      <div
        ref={measureRef}
        className="js-measure"
        aria-hidden="true"
        inert
        style={{ position: "absolute", left: -20000, top: 0, width: paper.w, visibility: "hidden", pointerEvents: "none" }}
      >
        <div className="js-page">
          <div className="js-page-body">
            {units.map((u) =>
              u.seq ? (
                u.seq.r === 0 ? <div key={u.key} data-m={`Q:${u.seq.blockId}`}>{drawSequence(u.seq.blockId, 0, Infinity, true, false)}</div> : null
              ) : u.trow ? (
                u.trow.r === 0 ? <div key={u.key} data-m={`T:${u.trow.blockId}`}>{drawTable(u.trow.blockId, 0, Infinity, true, false)}</div> : null
              ) : u.para ? (
                u.para.p === 0 ? <div key={u.key} data-m={`P:${u.para.blockId}`}>{drawPassage(u.para.blockId, 0, Infinity, false)}</div> : null
              ) : (
                <div key={u.key} data-m={u.key}>{u.render?.(false)}</div>
              ),
            )}
          </div>
          <div className="js-page-foot"><span>{doc.title}</span><span>Page 1 of 1</span></div>
        </div>
      </div>
    </div>
  );
}

function Tools({ children }: { children: ReactNode }) {
  return <div className="js-tools" role="toolbar" aria-label="Block tools">{children}</div>;
}

function ToolButton({ label, text, onClick }: { label: string; text?: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}>
      {text ?? label}
    </button>
  );
}

function AddMenu({ kind, pictures, extra = [], onPick, onClose }: { kind: "question" | "content"; pictures: boolean; extra?: BlockType[]; onPick: (t: BlockType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const content: BlockType[] = [...extra, ...CONTENT_TYPES, ...(pictures ? ["image" as const] : [])];
  const types = kind === "question" ? QUESTION_TYPES : content;
  return (
    <div ref={ref} className="js-menu" role="menu" style={{ top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }}>
      <span className="js-menu-head">{kind === "question" ? "Add a question" : "Add text or a box"}</span>
      {types.map((t) => (
        <button key={t} type="button" role="menuitem" onClick={() => onPick(t)}>
          {kind === "question" ? QUESTION_TYPE_LABEL[t as SheetQuestion["type"]] : CONTENT_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

/**
 * Resolves once the theme's fonts can be drawn with: the Google Fonts sheet
 * has loaded and the two families are ready. Pagination measures again then,
 * and the PDF export waits for it, so neither works from fallback metrics.
 * Gives up after a few seconds rather than hang offline.
 */
export function waitForSheetFonts(themeId: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  injectGoogleFonts();
  const theme = getSheetTheme(themeId);
  const link = document.querySelector<HTMLLinkElement>('link[data-jooma="google-fonts"]');
  const sheetLoaded = new Promise<void>((resolve) => {
    if (!link || link.sheet) return resolve();
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
  const ready = sheetLoaded
    .then(() =>
      Promise.all(
        [theme.fonts.heading, theme.fonts.body].flatMap((f) => [document.fonts.load(`400 16px ${f}`), document.fonts.load(`700 16px ${f}`)]),
      ),
    )
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  return Promise.race([ready, new Promise<void>((r) => setTimeout(r, 4000))]);
}
