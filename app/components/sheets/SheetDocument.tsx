"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { injectGoogleFonts } from "@/app/components/editor/googleFonts";
import { extractHeadings } from "@/app/lib/headings";
import { paginate, type PageUnit } from "@/app/lib/sheets/paginate";
import { SHEET_CSS } from "@/app/lib/sheets/sheet-css";
import { getSheetTheme, PAPER_PX, sheetThemeVars } from "@/app/lib/sheets/themes";
import { answerText, hasAnswersPage, questionNumbers, sheetOutline } from "@/app/lib/sheets/markdown";
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
  type SheetBlock,
  type SheetDoc,
  type SheetQuestion,
} from "@/app/lib/sheets/types";
import { AnswerView, BlockView, PassageView } from "./blocks";
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
  text: "Text",
  callout: "Callout box",
  wordbank: "Word bank",
  passage: "Reading passage",
  table: "Table",
};

interface Unit extends PageUnit {
  key: string;
  /** One paragraph of a passage that may run over a page break. */
  para?: { blockId: string; si: number; bi: number; p: number };
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

interface Measured {
  units: Record<string, number>;
  passages: Record<string, PassageMeasure>;
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
}

export default function SheetDocument({ doc, edit = false, onChange, streaming = false, anchors = true, fit = true, exporting = false, joFocus = null }: SheetDocumentProps) {
  const editing = edit && !streaming && !!onChange;
  const theme = getSheetTheme(doc.design.themeId);
  const paper = PAPER_PX[doc.design.paper] ?? PAPER_PX.a4;
  const numbers = useMemo(() => questionNumbers(doc), [doc]);
  const ids = useMemo(() => (anchors ? extractHeadings(sheetOutline(doc)).map((h) => h.id) : []), [doc, anchors]);
  const showAnswers = hasAnswersPage(doc);

  const [menu, setMenu] = useState<Menu>(null);
  const commit = (next: SheetDoc) => onChange?.(next);

  // ── The pieces ──────────────────────────────────────────────────────────

  const units: Unit[] = [];
  // A passage is drawn in pieces, possibly across pages; each piece looks its
  // toolbar and patch up here.
  const passageTools = new Map<string, { tools: ReactNode; patch: (p: Partial<SheetBlock>) => void; block: Extract<SheetBlock, { type: "passage" }> }>();

  units.push({
    key: "head",
    height: 0,
    render: (live) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {doc.design.nameDate && (
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
        {(doc.objective || editing) && (
          <div className="js-objective">
            {theme.look.emoji && <span aria-hidden="true">🎯</span>}
            <p>
              <b>Learning objective: </b>
              <EditableText value={doc.objective} placeholder="I am learning to..." editable={editing} multiline onChange={(objective) => commit({ ...doc, objective })} label="learning objective" />
            </p>
          </div>
        )}
      </div>
    ),
  });

  if (doc.intro) {
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

  doc.sections.forEach((s, si) => {
    units.push({
      key: `sh:${s.id}`,
      height: 0,
      keepWithNext: s.blocks.length > 0,
      render: (live) => (
        <div className="js-block" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {live && editing && (
            <Tools>
              <ToolButton label="Move up" text="↑" onClick={() => commit(moveSection(doc, si, -1))} />
              <ToolButton label="Move down" text="↓" onClick={() => commit(moveSection(doc, si, 1))} />
              <ToolButton label="Delete section" text="Delete" onClick={() => commit(deleteSection(doc, si))} />
            </Tools>
          )}
          <div className="js-section-head" {...(live && ids[si + 1] ? { id: ids[si + 1] } : {})}>
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
      const patch = (p: Partial<SheetBlock>) => commit(updateBlock(doc, si, bi, p));
      const tools = (
        <Tools>
          <ToolButton label="Move up" text="↑" onClick={() => commit(moveBlock(doc, si, bi, -1))} />
          <ToolButton label="Move down" text="↓" onClick={() => commit(moveBlock(doc, si, bi, 1))} />
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

      units.push({
        key: b.id,
        height: 0,
        render: (live) => (
          <div className="js-block" data-block={b.type}>
            {live && editing && tools}
            <BlockView block={b} number={numbers.get(b.id)} edit={editing} design={doc.design} onPatch={patch} />
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
            <button type="button" className="js-add" onClick={() => live && setMenu({ si, kind: "question" })}>+ Add question</button>
            <button type="button" className="js-add" onClick={() => live && setMenu({ si, kind: "content" })}>+ Add text or box</button>
            {live && menu?.si === si && (
              <AddMenu
                kind={menu.kind}
                onPick={(type) => {
                  commit(insertBlock(doc, si, newBlock(type)));
                  setMenu(null);
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

  if (showAnswers) {
    units.push({
      key: "answers",
      height: 0,
      breakBefore: true,
      keepWithNext: true,
      render: (live) => (
        <div>
          <h2 className="js-answers-title" {...(live && ids[doc.sections.length + 1] ? { id: ids[doc.sections.length + 1] } : {})}>Answers</h2>
          <p className="js-instructions" style={{ marginTop: 2 }}>For the teacher. Remove this page before handing the sheet out, or switch it off in Design.</p>
        </div>
      ),
    });
    doc.sections.forEach((s, si) =>
      s.blocks.forEach((b, bi) => {
        if (!isQuestion(b)) return;
        if (!editing && !answerText(b) && !(b.type === "long" && b.criteria.length)) return;
        units.push({
          key: `a:${b.id}`,
          height: 0,
          render: () => (
            <AnswerView q={b} number={numbers.get(b.id) ?? 0} edit={editing} onPatch={(p: Partial<SheetQuestion>) => commit(updateBlock(doc, si, bi, p))} />
          ),
        });
      }),
    );
    doc.teacherNotes.forEach((note, ni) => {
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

  // ── Measuring ───────────────────────────────────────────────────────────

  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;
    const next: Measured = { units: {}, passages: {}, foot: 0 };
    const h = (el: Element) => Math.ceil(el.getBoundingClientRect().height);
    root.querySelectorAll<HTMLElement>("[data-m]").forEach((el) => {
      const key = el.dataset.m!;
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
  const bodyHeight = paper.h - PAGE_PADDING - (measured?.foot ?? 28) - SAFETY;
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

  const drawPage = (indices: number[]) => {
    const out: ReactNode[] = [];
    for (let k = 0; k < indices.length; k++) {
      const u = units[indices[k]];
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

  const vars = sheetThemeVars(theme, doc.design.fontScale, doc.design.paper) as CSSProperties;
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
              u.para ? (
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

function AddMenu({ kind, onPick, onClose }: { kind: "question" | "content"; onPick: (t: BlockType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const types = kind === "question" ? QUESTION_TYPES : CONTENT_TYPES;
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
