"use client";

import type {
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
} from "@/app/lib/sheets/types";
import { isQuestion } from "@/app/lib/sheets/types";
import { EditableText, Rich } from "./rich";

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
  number?: number;
  edit: boolean;
  design: SheetDesign;
  onPatch: (patch: Partial<SheetBlock>) => void;
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
    case "passage":
      return <PassageView title={block.title} paragraphs={block.paragraphs} numbered={design.lineNumbers} edit={edit} onPatch={onPatch} />;
    case "table":
      return (
        <table className="js-table">
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th key={i}>
                  <EditableText value={h} editable={edit} onChange={(v) => onPatch({ headers: block.headers.map((x, j) => (j === i ? v : x)) })} label="heading" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
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
      <span className="js-num">{number}</span>
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
  }
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
export function AnswerView({ q, number, edit, onPatch }: { q: SheetQuestion; number: number; edit: boolean; onPatch: (p: Partial<SheetQuestion>) => void }) {
  const editableAnswer = q.type === "short" || q.type === "long" || q.type === "calc" || q.type === "wordorder";
  return (
    <div className="js-answer">
      <span className="js-answer-n">{number}</span>
      <div>
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
    default:
      return "";
  }
}
