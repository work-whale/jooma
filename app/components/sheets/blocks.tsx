"use client";

import type {
  ExemplarBlock,
  ImageBlock,
  ListBlock,
  PhaseBlock,
  SheetBlock,
  SheetDesign,
  SheetQuestion,
  ChoiceQuestion,
  TrueFalseQuestion,
  MatchingQuestion,
  FillBlanksQuestion,
  OrderQuestion,
  PictureQuestion,
  LabelQuestion,
  SortQuestion,
  WordSearchQuestion,
  CrosswordQuestion,
  TwoColBlock,
  UnitLesson,
} from "@/app/lib/sheets/types";
import { isQuestion } from "@/app/lib/sheets/types";
import { answerText } from "@/app/lib/sheets/markdown";
import { clueText, crosswordCells, crosswordNumbers, placementCells, sortBank, sortRows } from "@/app/lib/sheets/puzzles";
import { EditableText, Rich } from "./rich";
import { clockText, PHASE_FIELDS, phaseFieldLabel, stageLabel, type PhaseWording } from "@/app/lib/sheets/lesson";
import { levelLabel } from "@/app/lib/sheets/model-answers";
import { LESSON_COLUMN_WEIGHT, UNIT_COLUMNS, type UnitColumn } from "@/app/lib/sheets/unit";

/*
 * How each block looks on the page. The same components draw the page on
 * screen, the editor's measuring pass, Print and the PDF, so all four agree.
 *
 * In edit mode every piece of text is an EditableText and small controls
 * appear (add an option, mark the right answer). The pupil's copy never shows
 * the answers: correct options are marked only while editing.
 */

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export interface BlockProps {
  block: SheetBlock;
  /** The question's number on the sheet, for questions. */
  /** What the question is called: "3", or on an exam paper "2(b)". */
  number?: number | string;
  edit: boolean;
  design: SheetDesign;
  onPatch: (patch: Partial<SheetBlock>) => void;
  /** Opens the picture chooser for this block: pictures only. */
  onPicture?: () => void;
  /** A lesson phase's place in the lesson, in minutes from the start. */
  clock?: { start: number; end: number };
  /** A lesson plan's layout, or a cover lesson: what a phase's parts are called. */
  layout?: PhaseWording;
  /** A lesson table's shown columns. Missing: all of them. */
  columns?: UnitColumn[];
}

export function BlockView(props: BlockProps) {
  const { block } = props;
  if (isQuestion(block)) return <QuestionCard {...props} block={block} />;
  const { edit, onPatch, design } = props;
  switch (block.type) {
    case "text":
      return <EditableText as="p" className="js-text" value={block.text} editable={edit} multiline onChange={(text) => onPatch({ text })} label="text" />;
    case "callout":
      return (
        <div className="js-callout" data-variant={block.variant}>
          <span className="js-callout-emoji" aria-hidden="true">{block.emoji}</span>
          <p>
            <EditableText className="js-callout-label" value={block.label} editable={edit} onChange={(label) => onPatch({ label })} label="callout label" />
            <EditableText value={block.text} editable={edit} multiline onChange={(text) => onPatch({ text })} label="callout" />
          </p>
        </div>
      );
    case "wordbank":
      return (
        <div className="js-wordbank">
          <EditableText className="js-wordbank-title" value={block.title} editable={edit} onChange={(title) => onPatch({ title })} label="word bank title" />
          <WordTiles words={block.words} edit={edit} onChange={(words) => onPatch({ words })} />
        </div>
      );
    case "image":
      return <ImageView block={block} edit={edit} onPicture={props.onPicture} />;
    case "list":
      return <ListView block={block} edit={edit} onPatch={onPatch} />;
    case "exemplar":
      return <ExemplarView block={block} edit={edit} onPatch={onPatch} />;
    case "phase":
      return <PhaseView block={block} edit={edit} onPatch={onPatch} clock={props.clock} layout={props.layout} />;
    case "passage":
      return <PassageView title={block.title} paragraphs={block.paragraphs} numbered={design.lineNumbers} edit={edit} onPatch={onPatch} />;
    case "twocol":
      return <TwoColView block={block} edit={edit} onPatch={onPatch} />;
    case "sequence": {
      // The page draws a sequence row by row (SheetDocument); this whole-table
      // form is for anywhere else a block is drawn on its own.
      const columns = props.columns ?? UNIT_COLUMNS;
      return (
        <div className="js-seq" role="table">
          <SequenceHead columns={columns} />
          {block.lessons.map((l, i) => (
            <SequenceRow key={i} lesson={l} index={i} columns={columns} edit={edit} onChange={(next) => onPatch({ lessons: block.lessons.map((x, j) => (j === i ? next : x)) })} />
          ))}
        </div>
      );
    }
    case "table":
      return (
        <table className="js-table" data-headless={block.headers.length === 0 ? "" : undefined}>
          {block.headers.length > 0 && (
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i}>
                    <EditableText value={h} editable={edit} onChange={(v) => onPatch({ headers: block.headers.map((x, j) => (j === i ? v : x)) })} label="heading" />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, ri) => (
              // A row with nothing in it is a row to fill in by hand: an
              // incident log, a signature line. It is drawn tall enough to write in.
              <tr key={ri} data-blank={row.every((c) => !c.trim()) ? "" : undefined}>
                {row.map((cell, ci) => (
                  <td key={ci}>
                    <EditableText
                      value={cell}
                      editable={edit}
                      placeholder=" "
                      onChange={(v) => onPatch({ rows: block.rows.map((r, rj) => (rj === ri ? r.map((c, cj) => (cj === ci ? v : c)) : r)) })}
                      label="cell"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/**
 * A picture in a frame of fixed size, centred on its own row. While editing,
 * the whole frame is a button that opens the picture chooser; an empty frame
 * says what is happening (a search still running, or nothing found yet).
 */
export function ImageView({ block, edit, onPicture }: { block: ImageBlock; edit: boolean; onPicture?: () => void }) {
  return (
    <figure className="js-photo" data-size={block.size} {...(block.finding ? { "data-finding": "" } : {})}>
      <div className="js-photo-frame">
        {block.src ? (
          // A Storage URL, not a static asset: next/image would only add a
          // proxy hop, and the exports need the plain element. crossOrigin so
          // the PDF capture can read its pixels.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={block.src} alt={block.alt} crossOrigin="anonymous" draggable={false} />
        ) : (
          <span className="js-photo-empty">{block.finding ? "Finding a picture..." : ""}</span>
        )}
        {edit && onPicture && !block.finding && (
          <button type="button" className="js-photo-change" onClick={onPicture} aria-label={block.src ? "Change picture" : "Find a picture"}>
            <span>{block.src ? "Change picture" : "Find a picture"}</span>
          </button>
        )}
      </div>
    </figure>
  );
}

/** A passage panel. Also drawn in pieces when a long passage runs over a page
 *  break: `start` is the number of the first paragraph shown. */
export function PassageView({
  title,
  paragraphs,
  numbered,
  edit,
  onPatch,
  start = 0,
  all,
}: {
  title: string;
  paragraphs: string[];
  numbered: boolean;
  edit: boolean;
  onPatch: (patch: Partial<SheetBlock>) => void;
  start?: number;
  /** The whole passage, when this panel shows only part of it. */
  all?: string[];
}) {
  const full = all ?? paragraphs;
  return (
    <div className="js-passage">
      {start === 0 && (title || edit) && (
        <EditableText as="h3" className="js-passage-title" value={title} placeholder="Title" editable={edit} onChange={(t) => onPatch({ title: t })} label="passage title" />
      )}
      {paragraphs.map((p, i) => (
        <p key={start + i} className="js-para">
          {numbered && <span className="js-para-num">{start + i + 1}</span>}
          <EditableText
            value={p}
            editable={edit}
            multiline
            onChange={(v) => onPatch({ paragraphs: v ? full.map((x, j) => (j === start + i ? v : x)) : full.filter((_, j) => j !== start + i) })}
            label={`paragraph ${start + i + 1}`}
          />
        </p>
      ))}
    </div>
  );
}

function WordTiles({ words, edit, onChange }: { words: string[]; edit: boolean; onChange: (w: string[]) => void }) {
  return (
    <div className="js-tiles">
      {words.map((w, i) => (
        <span key={i} className="js-tile">
          <EditableText value={w} editable={edit} onChange={(v) => onChange(v ? words.map((x, j) => (j === i ? v : x)) : words.filter((_, j) => j !== i))} label="word" />
        </span>
      ))}
      {edit && <button type="button" className="js-mini" onClick={() => onChange([...words, "word"])}>+ word</button>}
    </div>
  );
}

function Lines({ n }: { n: number }) {
  return (
    <div className="js-lines" aria-hidden="true">
      {Array.from({ length: Math.max(1, n) }, (_, i) => <div key={i} className="js-line" />)}
    </div>
  );
}

function QuestionCard({ block, number, edit, onPatch }: BlockProps & { block: SheetQuestion }) {
  const patch = onPatch as (p: Partial<SheetQuestion>) => void;
  return (
    <div className="js-q" data-type={block.type}>
      {/* A part label such as "2(b)" is wider than the badge's circle: it gets
          room either side so none of it falls off the coloured shape. */}
      <span className="js-num" {...(String(number ?? "").length > 2 ? { "data-long": "" } : {})}>{number}</span>
      <div className="js-q-body">
        <p className="js-prompt">
          {block.marks > 0 && (
            <span className="js-marks">
              <EditableText
                value={String(block.marks)}
                editable={edit}
                onChange={(v) => { const n = parseInt(v, 10); if (Number.isFinite(n)) patch({ marks: Math.max(0, Math.min(20, n)) }); }}
                label="marks"
              />{" "}
              {block.marks === 1 ? "mark" : "marks"}
            </span>
          )}
          {block.domain && <span className="js-domain">{block.domain}</span>}
          {block.type === "short" && block.quote && <span className="js-quote">&ldquo;{block.quote}&rdquo;</span>}{" "}
          <EditableText value={block.prompt} editable={edit} multiline onChange={(prompt) => patch({ prompt })} label={`question ${number}`} />
        </p>
        <QuestionBody block={block} edit={edit} onPatch={patch} />
      </div>
    </div>
  );
}

function QuestionBody({ block, edit, onPatch }: { block: SheetQuestion; edit: boolean; onPatch: (p: Partial<SheetQuestion>) => void }) {
  switch (block.type) {
    case "mcq":
      return <Choices q={block} edit={edit} onPatch={onPatch as (p: Partial<ChoiceQuestion>) => void} />;
    case "truefalse":
      return <TrueFalse q={block} edit={edit} onPatch={onPatch as (p: Partial<TrueFalseQuestion>) => void} />;
    case "matching":
      return <Matching q={block} edit={edit} onPatch={onPatch as (p: Partial<MatchingQuestion>) => void} />;
    case "fillblanks":
      return <FillBlanks q={block} edit={edit} onPatch={onPatch as (p: Partial<FillBlanksQuestion>) => void} />;
    case "short":
    case "long":
      return <Lines n={block.lines} />;
    case "calc":
      return (
        <>
          {block.working && <div className="js-working">Working</div>}
          <p className="js-answer-row">Answer <i /></p>
        </>
      );
    case "order":
      return <Ordering q={block} edit={edit} onPatch={onPatch as (p: Partial<OrderQuestion>) => void} />;
    case "wordorder":
      return (
        <>
          <WordTiles words={block.words} edit={edit} onChange={(words) => onPatch({ words } as Partial<SheetQuestion>)} />
          <Lines n={1} />
        </>
      );
    case "picture":
      return <Pictures q={block} edit={edit} onPatch={onPatch as (p: Partial<PictureQuestion>) => void} />;
    case "label":
      return <Labels q={block} edit={edit} onPatch={onPatch as (p: Partial<LabelQuestion>) => void} />;
    case "sort":
      return <Sorting q={block} edit={edit} onPatch={onPatch as (p: Partial<SortQuestion>) => void} />;
    case "wordsearch":
      return <WordSearch q={block} edit={edit} onPatch={onPatch as (p: Partial<WordSearchQuestion>) => void} />;
    case "crossword":
      return <Crossword q={block} edit={edit} onPatch={onPatch as (p: Partial<CrosswordQuestion>) => void} />;
  }
}

// ── Puzzles ──────────────────────────────────────────────────────────────
// The grids are built by app/lib/sheets/puzzles and stored on the block; these
// only draw them. While editing, the words, items and clues are what change,
// and the grid rebuilds itself from them (refreshPuzzle in updateBlock).

/** A puzzle square's size in pixels: as large as reads well, small enough that
 *  the biggest grid (15 squares) still sits on one page. */
const cellPx = (n: number, room = 600, max = 36) => Math.min(max, Math.floor(room / Math.max(n, 1)));

function Sorting({ q, edit, onPatch }: { q: SortQuestion; edit: boolean; onPatch: (p: Partial<SortQuestion>) => void }) {
  const rows = sortRows(q);
  const set = (categories: SortQuestion["categories"]) => onPatch({ categories });
  return (
    <>
      {/* What pupils get, the same while editing: the shuffled bank and empty
          columns. Showing the items in their columns here made the sheet look
          already answered. */}
      <div className="js-wordbank">
        <span className="js-wordbank-title">Sort these</span>
        <div className="js-tiles">
          {sortBank(q).map((w, i) => <span key={i} className="js-tile">{w}</span>)}
        </div>
      </div>
      <div className="js-sort" style={{ gridTemplateColumns: `repeat(${Math.max(1, q.categories.length)}, minmax(0, 1fr))` }}>
        {q.categories.map((cat, ci) => (
          <div key={ci} className="js-sort-col">
            <div className="js-sort-head">
              <EditableText
                value={cat.name}
                editable={edit}
                onChange={(v) => set(v ? q.categories.map((x, j) => (j === ci ? { ...x, name: v } : x)) : q.categories.filter((_, j) => j !== ci))}
                label={`group ${ci + 1}`}
              />
            </div>
            {Array.from({ length: rows }, (_, r) => <div key={r} className="js-sort-line" />)}
          </div>
        ))}
      </div>
      {edit && (
        // The answers, for the teacher to change. Only drawn while editing, so
        // it never reaches Preview, Print, the PDF or Word.
        <div className="js-sort-key" data-testid="sort-answer-key">
          <p className="js-sort-key-title">Answer key: where each item belongs (not printed)</p>
          {q.categories.map((cat, ci) => (
            <div key={ci} className="js-sort-key-row">
              <span className="js-sort-key-name">{cat.name || `Group ${ci + 1}`}</span>
              <div className="js-tiles">
                {cat.items.map((it, ii) => (
                  <span key={ii} className="js-tile">
                    <EditableText
                      value={it}
                      editable
                      onChange={(v) =>
                        set(q.categories.map((x, j) => (j === ci ? { ...x, items: v ? x.items.map((y, k) => (k === ii ? v : y)) : x.items.filter((_, k) => k !== ii) } : x)))
                      }
                      label={`item ${ii + 1} in group ${ci + 1}`}
                    />
                  </span>
                ))}
                {cat.items.length < 8 && (
                  <button type="button" className="js-mini" onClick={() => set(q.categories.map((x, j) => (j === ci ? { ...x, items: [...x.items, "New item"] } : x)))}>
                    + item
                  </button>
                )}
              </div>
            </div>
          ))}
          {q.categories.length < 4 && (
            <button type="button" className="js-mini" onClick={() => set([...q.categories, { name: "New group", items: ["New item"] }])}>+ group</button>
          )}
        </div>
      )}
    </>
  );
}

function LetterGrid({ rows, cell, shade, numbers, blankLetters }: {
  rows: (string | null)[][];
  cell: number;
  shade?: Set<string>;
  numbers?: Map<string, number>;
  /** A crossword for pupils: the squares, not the answers. */
  blankLetters?: boolean;
}) {
  const cols = rows[0]?.length ?? 0;
  return (
    <div
      className={numbers ? "js-cw" : "js-ws"}
      style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px`, fontSize: Math.round(cell * 0.55) }}
      data-cols={cols}
      data-rows={rows.length}
    >
      {rows.flatMap((row, r) =>
        row.map((ch, c) => {
          const key = `${r},${c}`;
          if (ch === null) return <span key={key} className="js-cw-gap" />;
          const n = numbers?.get(key);
          return (
            <span key={key} className={`js-cell${shade?.has(key) ? " js-cell-on" : ""}`} data-cell={key}>
              {n !== undefined && <b className="js-cw-num" style={{ fontSize: Math.max(7, Math.round(cell * 0.28)) }}>{n}</b>}
              {!blankLetters && ch}
            </span>
          );
        }),
      )}
    </div>
  );
}

function WordSearch({ q, edit, onPatch }: { q: WordSearchQuestion; edit: boolean; onPatch: (p: Partial<WordSearchQuestion>) => void }) {
  return (
    <>
      {q.grid.length > 0 && <LetterGrid rows={q.grid.map((row) => row.split(""))} cell={cellPx(q.grid.length)} />}
      <div className="js-wordbank">
        <span className="js-wordbank-title">Find</span>
        {edit ? (
          <WordTiles words={q.words} edit onChange={(words) => onPatch({ words })} />
        ) : (
          <div className="js-tiles">
            {q.placements.map((p, i) => <span key={i} className="js-tile">{p.word}</span>)}
          </div>
        )}
      </div>
      {edit && q.skipped.length > 0 && (
        <p className="js-puzzle-note">Not in the grid: {q.skipped.join(", ")}. Try a shorter word, or make the grid harder so it is bigger.</p>
      )}
    </>
  );
}

function Crossword({ q, edit, onPatch }: { q: CrosswordQuestion; edit: boolean; onPatch: (p: Partial<CrosswordQuestion>) => void }) {
  const clues = (dir: "across" | "down") => q.placed.filter((p) => p.dir === dir);
  const setEntry = (i: number, patch: Partial<{ clue: string; answer: string }> | null) =>
    onPatch({ entries: patch ? q.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) : q.entries.filter((_, j) => j !== i) });
  return (
    <>
      {q.placed.length > 0 && (
        <LetterGrid rows={crosswordCells(q)} cell={cellPx(Math.max(q.width, q.height), 520, 34)} numbers={crosswordNumbers(q.placed)} blankLetters />
      )}
      {edit ? (
        <div className="js-cw-edit">
          {q.entries.map((e, i) => (
            <div key={i} className="js-cw-edit-row">
              <EditableText value={e.clue} editable onChange={(v) => setEntry(i, v ? { clue: v } : null)} label={`clue ${i + 1}`} />
              <span className="js-tile">
                <EditableText value={e.answer} editable onChange={(v) => setEntry(i, v ? { answer: v } : null)} label={`answer ${i + 1}`} />
              </span>
            </div>
          ))}
          {q.entries.length < 12 && (
            <button type="button" className="js-mini" onClick={() => onPatch({ entries: [...q.entries, { clue: "A clue", answer: "answer" }] })}>+ clue</button>
          )}
          {q.unplaced.length > 0 && (
            <p className="js-puzzle-note">Not in the grid: {q.unplaced.join(", ")}. An answer needs a letter in common with another to cross it.</p>
          )}
        </div>
      ) : (
        <div className="js-cw-clues">
          {(["across", "down"] as const).map((dir) => (
            <div key={dir}>
              <h4>{dir === "across" ? "Across" : "Down"}</h4>
              {clues(dir).map((p) => (
                <p key={`${dir}${p.number}`}><b>{p.number}</b> <Rich text={clueText(p)} /></p>
              ))}
            </div>
          ))}
        </div>
      )}
      {q.wordBank && !edit && q.placed.length > 0 && (
        <div className="js-wordbank">
          <span className="js-wordbank-title">Word bank</span>
          <div className="js-tiles">
            {q.placed.map((p) => p.answer).sort((x, y) => x.localeCompare(y)).map((w, i) => <span key={i} className="js-tile">{w}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

/** The answers page's solved grid. */
function SolvedGrid({ q }: { q: SheetQuestion }) {
  if (q.type === "wordsearch" && q.grid.length) {
    return (
      <div className="js-solved">
        <LetterGrid rows={q.grid.map((row) => row.split(""))} cell={cellPx(q.grid.length, 300, 20)} shade={new Set(q.placements.flatMap(placementCells))} />
      </div>
    );
  }
  if (q.type === "crossword" && q.placed.length) {
    return (
      <div className="js-solved">
        <LetterGrid rows={crosswordCells(q)} cell={cellPx(Math.max(q.width, q.height), 300, 22)} numbers={crosswordNumbers(q.placed)} />
      </div>
    );
  }
  return null;
}

function Choices({ q, edit, onPatch }: { q: ChoiceQuestion; edit: boolean; onPatch: (p: Partial<ChoiceQuestion>) => void }) {
  const multi = q.answers.length > 1;
  const toggle = (i: number) => {
    if (!edit) return;
    const answers = multi || q.answers.includes(i) ? (q.answers.includes(i) ? q.answers.filter((a) => a !== i) : [...q.answers, i]) : [i];
    onPatch({ answers });
  };
  return (
    <div className="js-options">
      {q.options.map((o, i) => (
        <div key={i} className="js-option">
          <span
            className={multi ? "js-box" : "js-bubble"}
            onClick={() => toggle(i)}
            title={edit ? "Mark as the right answer" : undefined}
            style={edit && q.answers.includes(i) ? { background: "var(--js-heading)", borderColor: "var(--js-heading)" } : undefined}
          />
          <span className="js-letter">{LETTERS[i]}</span>
          <EditableText
            value={o}
            editable={edit}
            onChange={(v) => onPatch(v ? { options: q.options.map((x, j) => (j === i ? v : x)) } : { options: q.options.filter((_, j) => j !== i), answers: q.answers.filter((a) => a !== i).map((a) => (a > i ? a - 1 : a)) })}
            label={`option ${LETTERS[i]}`}
          />
        </div>
      ))}
      {edit && q.options.length < 6 && (
        <button type="button" className="js-mini" onClick={() => onPatch({ options: [...q.options, "New option"] })}>+ option</button>
      )}
    </div>
  );
}

function TrueFalse({ q, edit, onPatch }: { q: TrueFalseQuestion; edit: boolean; onPatch: (p: Partial<TrueFalseQuestion>) => void }) {
  const set = (i: number, answer: boolean) => edit && onPatch({ statements: q.statements.map((s, j) => (j === i ? { ...s, answer } : s)) });
  const mark = (on: boolean) => (edit && on ? { background: "var(--js-heading)", borderColor: "var(--js-heading)" } : undefined);
  return (
    <div className="js-tf">
      <span />
      <span className="js-tf-head">True</span>
      <span className="js-tf-head">False</span>
      {q.statements.map((s, i) => (
        <div key={i} className="js-tf-row">
          <EditableText
            value={s.text}
            editable={edit}
            onChange={(v) => onPatch({ statements: v ? q.statements.map((x, j) => (j === i ? { ...x, text: v } : x)) : q.statements.filter((_, j) => j !== i) })}
            label={`statement ${i + 1}`}
          />
          <span className="js-tf-cell"><span className="js-bubble" onClick={() => set(i, true)} style={mark(s.answer)} /></span>
          <span className="js-tf-cell"><span className="js-bubble" onClick={() => set(i, false)} style={mark(!s.answer)} /></span>
        </div>
      ))}
      {edit && (
        <button type="button" className="js-mini" onClick={() => onPatch({ statements: [...q.statements, { text: "A statement", answer: true }] })}>+ statement</button>
      )}
    </div>
  );
}

function Matching({ q, edit, onPatch }: { q: MatchingQuestion; edit: boolean; onPatch: (p: Partial<MatchingQuestion>) => void }) {
  const rows = Math.max(q.left.length, q.right.length);
  return (
    <div className="js-match">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "contents" }}>
          {q.left[i] !== undefined ? (
            <div className="js-match-item js-match-left">
              <span><span className="js-letter">{i + 1}</span>{" "}<EditableText value={q.left[i]} editable={edit} onChange={(v) => onPatch({ left: q.left.map((x, j) => (j === i ? v : x)) })} label={`left ${i + 1}`} /></span>
              <span className="js-dot" />
            </div>
          ) : <span />}
          <span />
          {q.right[i] !== undefined ? (
            <div className="js-match-item">
              <span className="js-dot" />
              <span><span className="js-letter">{LETTERS[i]}</span>{" "}<EditableText value={q.right[i]} editable={edit} onChange={(v) => onPatch({ right: q.right.map((x, j) => (j === i ? v : x)) })} label={`right ${LETTERS[i]}`} /></span>
            </div>
          ) : <span />}
        </div>
      ))}
      {edit && (
        <button
          type="button"
          className="js-mini"
          onClick={() => onPatch({ left: [...q.left, "Term"], right: [...q.right, "Meaning"], pairs: [...q.pairs, q.right.length] })}
        >
          + pair
        </button>
      )}
    </div>
  );
}

function FillBlanks({ q, edit, onPatch }: { q: FillBlanksQuestion; edit: boolean; onPatch: (p: Partial<FillBlanksQuestion>) => void }) {
  return (
    <>
      {(q.wordBank.length > 0 || edit) && (
        <div className="js-wordbank">
          <span className="js-wordbank-title">Word bank</span>
          <WordTiles words={q.wordBank} edit={edit} onChange={(wordBank) => onPatch({ wordBank })} />
        </div>
      )}
      <div className="js-sentences">
        {q.sentences.map((s, i) => (
          <p key={i}>
            <EditableText
              value={s}
              editable={edit}
              gaps
              multiline
              onChange={(v) => onPatch({ sentences: v ? q.sentences.map((x, j) => (j === i ? v : x)) : q.sentences.filter((_, j) => j !== i) })}
              label={`sentence ${i + 1}`}
            />
          </p>
        ))}
        {edit && <button type="button" className="js-mini" onClick={() => onPatch({ sentences: [...q.sentences, "A sentence with a ___ in it."] })}>+ sentence</button>}
      </div>
    </>
  );
}

function Ordering({ q, edit, onPatch }: { q: OrderQuestion; edit: boolean; onPatch: (p: Partial<OrderQuestion>) => void }) {
  return (
    <div className="js-order">
      {q.items.map((it, i) => (
        <div key={i} className="js-order-item">
          <span className="js-box" />
          <EditableText value={it} editable={edit} onChange={(v) => onPatch({ items: q.items.map((x, j) => (j === i ? v : x)) })} label={`item ${i + 1}`} />
        </div>
      ))}
    </div>
  );
}

function Pictures({ q, edit, onPatch }: { q: PictureQuestion; edit: boolean; onPatch: (p: Partial<PictureQuestion>) => void }) {
  return (
    <div className="js-pictures">
      {q.options.map((o, i) => (
        <div key={i} className="js-picture" style={edit && q.answer === i ? { borderColor: "var(--js-heading)" } : undefined} onClick={() => edit && onPatch({ answer: i })}>
          <span className="js-picture-emoji" aria-hidden="true">{o.emoji}</span>
          <EditableText value={o.label} editable={edit} onChange={(v) => onPatch({ options: q.options.map((x, j) => (j === i ? { ...x, label: v } : x)) })} label={`picture ${i + 1}`} />
          <span className="js-bubble" />
        </div>
      ))}
    </div>
  );
}

function Labels({ q, edit, onPatch }: { q: LabelQuestion; edit: boolean; onPatch: (p: Partial<LabelQuestion>) => void }) {
  return (
    <>
      {q.wordBank.length > 0 && (
        <div className="js-wordbank">
          <span className="js-wordbank-title">Word bank</span>
          <WordTiles words={q.wordBank} edit={edit} onChange={(wordBank) => onPatch({ wordBank })} />
        </div>
      )}
      <div className="js-labels">
        {q.items.map((it, i) => (
          <div key={i} className="js-label-row">
            <span className="js-letter">{i + 1}</span>
            <EditableText value={it.clue} editable={edit} onChange={(v) => onPatch({ items: q.items.map((x, j) => (j === i ? { ...x, clue: v } : x)) })} label={`clue ${i + 1}`} />
            <i />
          </div>
        ))}
      </div>
    </>
  );
}

/** The answer page's line for one question: plain text, with the text answers
 *  editable while editing. */
export function AnswerView({ q, number, edit, onPatch, showMarks = false }: { q: SheetQuestion; number: number | string; edit: boolean; onPatch: (p: Partial<SheetQuestion>) => void; showMarks?: boolean }) {
  const editableAnswer = q.type === "short" || q.type === "long" || q.type === "calc" || q.type === "wordorder";
  return (
    <div className="js-answer">
      <span className="js-answer-n">{number}</span>
      <div style={{ flex: 1 }}>
        {showMarks && <span className="js-marks">{q.marks} {q.marks === 1 ? "mark" : "marks"}</span>}
        {editableAnswer ? (
          <EditableText
            value={(q as { answer: string }).answer}
            editable={edit}
            multiline
            placeholder="Add the answer"
            onChange={(answer) => onPatch({ answer } as Partial<SheetQuestion>)}
            label={`answer ${number}`}
          />
        ) : (
          <Rich text={answerLine(q)} />
        )}
        <SolvedGrid q={q} />
        {q.type === "long" && q.criteria.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {q.criteria.map((c, i) => <li key={i}><Rich text={c} /></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function answerLine(q: SheetQuestion): string {
  switch (q.type) {
    case "mcq":
      return q.answers.map((i) => `${LETTERS[i]}) ${q.options[i] ?? ""}`).join(", ") || "-";
    case "truefalse":
      return q.statements.map((s, i) => `${i + 1}. ${s.answer ? "True" : "False"}`).join("    ");
    case "matching":
      return q.left.map((_, i) => `${i + 1} = ${LETTERS[q.pairs[i]] ?? "?"}`).join(",  ");
    case "fillblanks":
      return q.answers.join(", ") || "-";
    case "order":
      return q.order.map((i) => q.items[i]).join("  >  ");
    case "picture":
      return q.options[q.answer] ? `${q.options[q.answer].emoji} ${q.options[q.answer].label}` : "-";
    case "label":
      return q.items.map((it, i) => `${i + 1}. ${it.answer}`).join("    ");
    case "sort":
    case "wordsearch":
    case "crossword":
      return answerText(q);
    default:
      return "";
  }
}

/** Items of a list, each editable; emptying one removes it. */
function EditableItems({ items, edit, onChange, label, add }: { items: string[]; edit: boolean; onChange: (items: string[]) => void; label: string; add: string }) {
  return (
    <>
      {items.map((it, i) => (
        <li key={i}>
          <EditableText
            value={it}
            editable={edit}
            multiline
            onChange={(v) => onChange(v ? items.map((x, j) => (j === i ? v : x)) : items.filter((_, j) => j !== i))}
            label={label}
          />
        </li>
      ))}
      {edit && (
        <li className="js-list-add">
          <button type="button" className="js-mini" onClick={() => onChange([...items, add])}>+ add</button>
        </li>
      )}
    </>
  );
}

/** A titled list: ticks for success criteria, numbers for steps. */
export function ListView({ block, edit, onPatch }: { block: ListBlock; edit: boolean; onPatch: (p: Partial<ListBlock>) => void }) {
  const Tag = block.style === "number" ? "ol" : "ul";
  return (
    <div className="js-list" data-style={block.style}>
      {(block.title || edit) && (
        <EditableText as="h3" className="js-list-title" value={block.title} placeholder="List title" editable={edit} onChange={(title) => onPatch({ title })} label="list title" />
      )}
      <Tag>
        <EditableItems items={block.items} edit={edit} onChange={(items) => onPatch({ items })} label="list item" add="New item" />
      </Tag>
    </div>
  );
}

/**
 * One stage of a lesson: its stage and timing in a header band, then what the
 * teacher and pupils do, how understanding is checked, and the adaptations.
 * Empty parts are left off the printed plan but stay fillable while editing.
 */
export function PhaseView({ block, edit, onPatch, clock, layout }: { block: PhaseBlock; edit: boolean; onPatch: (p: Partial<PhaseBlock>) => void; clock?: { start: number; end: number }; layout?: PhaseWording }) {
  return (
    <div className="js-phase" data-stage={block.stage}>
      <div className="js-phase-head">
        <span className="js-phase-stage">{stageLabel(block.stage, layout)}</span>
        <EditableText className="js-phase-title" value={block.title} placeholder="Phase title" editable={edit} onChange={(title) => onPatch({ title })} label="phase title" />
        <span className="js-phase-time">
          {clock && <span className="js-phase-clock">{clockText(clock.start)} to {clockText(clock.end)}</span>}
          {edit ? (
            <input
              type="number"
              className="js-phase-min"
              min={1}
              max={180}
              value={block.minutes}
              aria-label="Minutes"
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n) && n >= 1 && n <= 180) onPatch({ minutes: n });
              }}
            />
          ) : (
            <b>{block.minutes}</b>
          )}{" "}
          min
        </span>
      </div>
      <dl className="js-phase-grid">
        {PHASE_FIELDS.map((field) => {
          // The script row belongs to cover lessons; a lesson plan's phases
          // have no "say" at all and never show it, even while editing.
          if (field === "say" && block.say === undefined) return null;
          const value = block[field] ?? "";
          const empty = Array.isArray(value) ? value.length === 0 : !value;
          if (empty && !edit) return null;
          const label = phaseFieldLabel(field, block.stage, layout);
          return (
            <div className="js-phase-row" key={field} data-field={field}>
              <dt>{label}</dt>
              <dd>
                {Array.isArray(value) ? (
                  <ul>
                    <EditableItems items={value} edit={edit} onChange={(check) => onPatch({ check })} label={label} add="A question to ask" />
                  </ul>
                ) : (
                  <EditableText value={value} placeholder={`Add ${label.toLowerCase()}`} editable={edit} multiline onChange={(v) => onPatch({ [field]: v } as Partial<PhaseBlock>)} label={label} />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Two titled lists side by side, each in its own box. An empty side is left
 *  off the printed page but stays fillable while editing. */
export function TwoColView({ block, edit, onPatch }: { block: TwoColBlock; edit: boolean; onPatch: (p: Partial<TwoColBlock>) => void }) {
  const sides = (["left", "right"] as const).filter((k) => edit || block[k].title || block[k].items.length);
  return (
    <div className="js-twocol" data-sides={sides.length}>
      {sides.map((k) => {
        const s = block[k];
        return (
          <div className="js-twocol-side" key={k}>
            <EditableText as="h3" className="js-twocol-title" value={s.title} placeholder="Heading" editable={edit} onChange={(title) => onPatch({ [k]: { ...s, title } } as Partial<TwoColBlock>)} label={`${k} heading`} />
            <ul>
              <EditableItems items={s.items} edit={edit} onChange={(items) => onPatch({ [k]: { ...s, items } } as Partial<TwoColBlock>)} label={s.title.toLowerCase() || "point"} add="A new point" />
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** The CSS grid columns a lesson table is drawn with: the lesson's title,
 *  then each shown column by its weight. Header and rows share it, so a table
 *  split across pages lines up. */
export function sequenceGrid(columns: UnitColumn[]): string {
  return [LESSON_COLUMN_WEIGHT, ...columns.map((c) => c.weight)].map((w) => `minmax(0, ${w}fr)`).join(" ");
}

/** A lesson table's header row. */
export function SequenceHead({ columns }: { columns: UnitColumn[] }) {
  return (
    <div className="js-seq-head" role="row" style={{ gridTemplateColumns: sequenceGrid(columns) }}>
      <span role="columnheader">Lesson</span>
      {columns.map((c) => (
        <span key={c.id} role="columnheader">{c.label}</span>
      ))}
    </div>
  );
}

/** One lesson as a table row. Lists (key knowledge, resources, questions)
 *  are bullets; vocabulary is a comma list. */
export function SequenceRow({ lesson, index, columns, edit, onChange, planHref = null, live = true }: {
  lesson: UnitLesson;
  index: number;
  columns: UnitColumn[];
  edit: boolean;
  onChange: (next: UnitLesson) => void;
  /** "Plan this lesson": Lesson Plan filled in from this row. Drawn on screen
   *  only; exports pass null. */
  planHref?: string | null;
  /** False in the measuring copy: the link is drawn (it takes room) but is
   *  not a link. */
  live?: boolean;
}) {
  return (
    <div className="js-seq-row" role="row" style={{ gridTemplateColumns: sequenceGrid(columns) }}>
      <div role="cell" className="js-seq-lesson">
        <span className="js-seq-num">Lesson {index + 1}</span>
        <EditableText value={lesson.title} placeholder="Lesson title" editable={edit} multiline onChange={(title) => onChange({ ...lesson, title })} label={`lesson ${index + 1} title`} />
        {planHref &&
          (live ? (
            <a className="js-seq-plan" href={planHref} target="_blank" rel="noopener" title="Opens Lesson Plan in a new tab, filled in from this lesson" data-testid="plan-this-lesson">
              Plan this lesson
            </a>
          ) : (
            <span className="js-seq-plan">Plan this lesson</span>
          ))}
      </div>
      {columns.map((c) => {
        const value = lesson[c.id];
        return (
          <div role="cell" key={c.id} data-col={c.id}>
            {Array.isArray(value) ? (
              c.id === "vocabulary" && !edit ? (
                <p>{value.join(", ")}</p>
              ) : (
                <ul>
                  <EditableItems items={value} edit={edit} onChange={(items) => onChange({ ...lesson, [c.id]: items })} label={c.label.toLowerCase()} add="New item" />
                </ul>
              )
            ) : (
              <EditableText value={value} placeholder=" " editable={edit} multiline onChange={(v) => onChange({ ...lesson, [c.id]: v })} label={`${c.label.toLowerCase()} for lesson ${index + 1}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A model answer at a level: a header band with the level and its marks, the
 * answer (prose, numbered steps or points), then the notes tying its phrases
 * to the mark scheme and a line of commentary.
 */
export function ExemplarView({ block, edit, onPatch }: { block: ExemplarBlock; edit: boolean; onPatch: (p: Partial<ExemplarBlock>) => void }) {
  const Tag = block.form === "steps" ? "ol" : "ul";
  return (
    <div className="js-exemplar" data-level={block.level}>
      <div className="js-exemplar-head">
        <span className="js-exemplar-level">{levelLabel(block.level)}</span>
        <span className="js-exemplar-marks">
          {edit ? (
            <EditableText
              value={String(block.awarded)}
              editable
              onChange={(v) => { const n = parseInt(v, 10); if (Number.isFinite(n)) onPatch({ awarded: Math.max(0, Math.min(block.outOf || 60, n)) }); }}
              label="marks awarded"
            />
          ) : (
            block.awarded
          )}{" "}
          / {block.outOf} marks
        </span>
      </div>
      <div className="js-exemplar-body">
        {block.form === "prose" ? (
          block.parts.map((p, i) => (
            <EditableText key={i} as="p" value={p} editable={edit} multiline onChange={(v) => onPatch({ parts: v ? block.parts.map((x, j) => (j === i ? v : x)) : block.parts.filter((_, j) => j !== i) })} label="answer paragraph" />
          ))
        ) : (
          <Tag>
            <EditableItems items={block.parts} edit={edit} onChange={(parts) => onPatch({ parts })} label="answer step" add="Another step" />
          </Tag>
        )}
      </div>
      {block.annotations.length > 0 && (
        <div className="js-exemplar-notes">
          <p className="js-exemplar-notes-title">Where the marks come from</p>
          <ul>
            {block.annotations.map((a, i) => (
              <li key={i}>
                <span className="js-quote">&ldquo;{a.quote}&rdquo;</span>{" "}
                <EditableText value={a.note} editable={edit} multiline onChange={(note) => onPatch({ annotations: note ? block.annotations.map((x, j) => (j === i ? { ...x, note } : x)) : block.annotations.filter((_, j) => j !== i) })} label="mark note" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {(block.commentary || edit) && (
        <EditableText as="p" className="js-exemplar-comment" value={block.commentary} placeholder="Add a comment on this answer" editable={edit} multiline onChange={(commentary) => onPatch({ commentary })} label="commentary" />
      )}
    </div>
  );
}
