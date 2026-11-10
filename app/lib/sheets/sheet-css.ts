// The one stylesheet every sheet is drawn with: on screen, in Print and in
// the PDF. A string rather than a CSS module because the exports render the
// pages outside React's page (an offscreen node, a print iframe) and need the
// same rules inline. Values come from the theme's custom properties
// (sheetThemeVars), and the theme's switches arrive as data attributes on the
// root: data-section, data-number.
//
// Everything is scoped under .js-sheet so it cannot leak into the app.

export const SHEET_CSS = `
.js-sheet { color: var(--js-ink); font-family: var(--js-font-body); font-size: var(--js-size); line-height: var(--js-leading); }
.js-sheet *, .js-sheet *::before, .js-sheet *::after { box-sizing: border-box; }
.js-sheet p { margin: 0; }
.js-pages { display: flex; flex-direction: column; align-items: center; gap: 28px; }
.js-page {
  position: relative; width: var(--js-page-w); min-height: var(--js-page-h); height: var(--js-page-h);
  padding: 46px 52px 40px; background: var(--js-paper); display: flex; flex-direction: column;
  border-radius: 14px; box-shadow: 0 1px 3px rgba(20,16,40,.08), 0 14px 40px rgba(20,16,40,.10); overflow: hidden;
}
.js-page-body { flex: 1; display: flex; flex-direction: column; gap: 14px; }
.js-page-foot { display: flex; justify-content: space-between; font-size: 10px; color: var(--js-muted); padding-top: 10px; opacity: .8; }
.js-measure .js-page { height: auto; min-height: 0; box-shadow: none; }
.js-sheet[data-export] .js-page { border-radius: 0; box-shadow: none; }

/* Header */
.js-namedate { display: flex; justify-content: flex-end; gap: 22px; font-weight: 700; font-size: .82em; color: var(--js-ink); }
.js-namedate span { display: inline-flex; align-items: flex-end; gap: 6px; }
.js-namedate i { display: inline-block; border-bottom: 1.5px solid var(--js-ink); width: 180px; height: 1.1em; }
.js-namedate span + span i { width: 120px; }
.js-title { font-family: var(--js-font-heading); color: var(--js-heading); font-size: 2.05em; line-height: 1.12; font-weight: 700; margin: 2px 0 0; letter-spacing: -.01em; }
.js-subtitle { font-size: .78em; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--js-muted); }
.js-objective { display: flex; gap: 10px; align-items: flex-start; background: var(--js-soft); border-radius: var(--js-radius); padding: 10px 14px; font-weight: 600; }
.js-objective b { color: var(--js-heading); }

/* Callouts */
.js-callout { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border: var(--js-border) solid var(--js-accent); border-radius: var(--js-radius); background: var(--js-panel); box-shadow: var(--js-shadow); }
.js-callout-emoji { font-size: 1.5em; line-height: 1; }
.js-callout-label { font-weight: 800; margin-right: 6px; color: var(--js-heading); }
.js-callout[data-variant="remember"] { border-color: #E2457A; }
.js-callout[data-variant="tip"] { border-color: #2F80ED; }
.js-callout[data-variant="challenge"] { border-color: #F2A900; }

/* Sections */
.js-section-head { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.js-section-title { font-family: var(--js-font-heading); color: var(--js-heading); font-size: 1.32em; font-weight: 700; line-height: 1.2; }
.js-section-emoji { font-size: 1.15em; }
.js-sheet[data-section="band"] .js-section-head { background: var(--js-soft); border-radius: var(--js-radius); padding: 8px 14px; }
.js-sheet[data-section="underline"] .js-section-head { border-bottom: 3px solid var(--js-accent); padding-bottom: 6px; }
.js-sheet[data-section="tab"] .js-section-head { border-bottom: 2px solid var(--js-accent); }
.js-sheet[data-section="tab"] .js-section-title { background: var(--js-accent); color: var(--js-on-accent); padding: 5px 14px; border-radius: var(--js-radius) var(--js-radius) 0 0; }
.js-sheet[data-section="plain"] .js-section-head { border-bottom: 1.5px solid var(--js-line); padding-bottom: 4px; }
.js-sheet[data-section="band"][data-contrast="high"] .js-section-head { background: #000; }
.js-sheet[data-section="band"][data-contrast="high"] .js-section-title { color: #fff; }
.js-instructions { color: var(--js-muted); font-style: italic; margin-top: -6px; }

/* Questions */
.js-q { display: grid; grid-template-columns: auto 1fr; gap: 10px 12px; align-items: start; padding: 12px 14px; border: var(--js-border) solid var(--js-line); border-radius: var(--js-radius); background: var(--js-paper); box-shadow: var(--js-shadow); position: relative; }
.js-num { min-width: 1.85em; height: 1.85em; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: .95em; }
.js-sheet[data-number="circle"] .js-num { border-radius: 999px; background: var(--js-heading); color: #fff; }
.js-sheet[data-number="square"] .js-num { border-radius: 6px; background: var(--js-heading); color: #fff; }
.js-sheet[data-number="plain"] .js-num { color: var(--js-ink); min-width: 1.4em; justify-content: flex-start; }
.js-num[data-long] { padding: 0 .5em; white-space: nowrap; }
.js-answer-n { white-space: nowrap; }
.js-q-body { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.js-prompt { font-weight: 600; }
.js-marks { float: right; margin-left: 10px; font-size: .72em; font-weight: 700; color: var(--js-muted); border: 1px solid var(--js-line); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.js-domain { display: inline-block; font-size: .7em; font-weight: 800; letter-spacing: .04em; color: var(--js-heading); background: var(--js-soft); border-radius: 999px; padding: 1px 8px; margin-right: 6px; vertical-align: 2px; }
.js-quote { background: var(--js-soft); border-radius: 6px; padding: 1px 6px; font-style: italic; }

.js-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.js-option { display: flex; gap: 9px; align-items: center; padding: 7px 11px; border: 1.5px solid var(--js-line); border-radius: calc(var(--js-radius) * .7); }
.js-bubble { width: 1.15em; height: 1.15em; border-radius: 999px; border: 2px solid var(--js-muted); flex: none; }
.js-box { width: 1.25em; height: 1.25em; border-radius: 4px; border: 2px solid var(--js-muted); flex: none; }
.js-letter { font-weight: 800; color: var(--js-heading); }

.js-tf { display: grid; grid-template-columns: 1fr auto auto; gap: 6px 14px; align-items: center; }
.js-tf-row { display: contents; }
.js-tf-head { font-size: .78em; font-weight: 800; color: var(--js-muted); text-align: center; }
.js-tf-cell { display: flex; justify-content: center; }

.js-match { display: grid; grid-template-columns: 1fr 70px 1fr; gap: 8px 0; align-items: center; }
.js-match-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1.5px solid var(--js-line); border-radius: calc(var(--js-radius) * .7); }
.js-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--js-heading); flex: none; }
.js-match-left { justify-content: space-between; }

.js-gap { display: inline-block; min-width: 92px; border-bottom: 2px var(--js-lines) var(--js-ink); height: 1.1em; vertical-align: -0.15em; margin: 0 3px; }
.js-sentences { display: flex; flex-direction: column; gap: 10px; line-height: 2; }

.js-lines { display: flex; flex-direction: column; }
.js-line { height: 2.05em; border-bottom: 1.5px var(--js-lines) var(--js-muted); }
.js-working { border: 1.5px dashed var(--js-muted); border-radius: calc(var(--js-radius) * .7); height: 112px; padding: 6px 10px; font-size: .78em; font-weight: 700; color: var(--js-muted); }
.js-answer-row { display: flex; align-items: flex-end; gap: 8px; font-weight: 700; }
.js-answer-row i { flex: 0 0 200px; border-bottom: 1.5px solid var(--js-ink); height: 1.2em; }

.js-order { display: flex; flex-direction: column; gap: 7px; }
.js-order-item { display: flex; align-items: center; gap: 10px; }
.js-tiles { display: flex; flex-wrap: wrap; gap: 8px; }
.js-tile { padding: 5px 12px; border: 1.5px solid var(--js-line); border-radius: 999px; background: var(--js-soft); font-weight: 600; }
.js-pictures { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.js-picture { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px; border: 1.5px solid var(--js-line); border-radius: var(--js-radius); text-align: center; }
.js-picture-emoji { font-size: 2.4em; line-height: 1.1; }
.js-labels { display: flex; flex-direction: column; gap: 8px; }
.js-label-row { display: grid; grid-template-columns: auto 1fr 160px; gap: 10px; align-items: end; }
.js-label-row i { border-bottom: 1.5px solid var(--js-ink); height: 1.2em; }

/* Puzzles: sorting columns, word search and crossword grids. Square sizes are
   set inline from the grid's size (blocks.tsx), so the largest still fits a page. */
.js-sort { display: grid; gap: 10px; }
.js-sort-col { border: 1.5px solid var(--js-line); border-radius: var(--js-radius); overflow: hidden; display: flex; flex-direction: column; padding-bottom: 8px; }
.js-sort-head { background: var(--js-soft); color: var(--js-heading); font-weight: 800; text-align: center; padding: 6px 8px; }
.js-sort-line { height: 2.05em; border-bottom: 1.5px var(--js-lines) var(--js-muted); margin: 0 10px; }
.js-sort-key { border: 1.5px dashed var(--js-muted); border-radius: var(--js-radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.js-sort-key-title { font-size: .78em; font-weight: 800; color: var(--js-muted); text-transform: uppercase; letter-spacing: .04em; }
.js-sort-key-row { display: grid; grid-template-columns: 9em 1fr; gap: 10px; align-items: start; }
.js-sort-key-name { font-weight: 800; color: var(--js-heading); padding-top: 5px; }
.js-ws, .js-cw { display: grid; width: max-content; margin: 2px auto; line-height: 1; }
.js-ws { border: 2px solid var(--js-ink); border-radius: 4px; }
.js-cell { position: relative; display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--js-ink); }
.js-cw .js-cell { border: 1.5px solid var(--js-ink); margin: 0 -1.5px -1.5px 0; background: var(--js-paper); }
.js-cell-on { background: var(--js-soft); color: var(--js-heading); font-weight: 900; }
.js-cw-num { position: absolute; top: 1px; left: 2px; line-height: 1; font-weight: 700; color: var(--js-muted); }
.js-cw-clues { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; }
.js-cw-clues h4 { margin: 0 0 4px; color: var(--js-heading); font-weight: 800; }
.js-cw-clues p { margin: 0 0 4px; }
.js-cw-clues b { color: var(--js-heading); margin-right: 4px; }
.js-cw-edit { display: flex; flex-direction: column; gap: 6px; }
.js-cw-edit-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
.js-puzzle-note { font-size: .8em; color: var(--js-muted); font-style: italic; }
.js-solved { margin-top: 6px; }
.js-solved .js-ws, .js-solved .js-cw { margin: 0; }

/* Word bank, passage, table */
.js-wordbank { border: 2px dashed var(--js-accent); border-radius: var(--js-radius); padding: 10px 14px; background: var(--js-paper); }
.js-wordbank-title { font-weight: 800; color: var(--js-heading); margin-right: 8px; }
.js-wordbank .js-tiles { margin-top: 6px; }
.js-passage { background: var(--js-panel); border: 1.5px solid var(--js-line); border-radius: var(--js-radius); padding: 18px 22px; display: flex; flex-direction: column; gap: 10px; }
.js-passage-title { font-family: var(--js-font-heading); color: var(--js-heading); font-size: 1.25em; font-weight: 700; text-align: center; }
.js-para { position: relative; }
.js-sheet[data-paranum="on"] .js-para { padding-left: 26px; }
.js-para-num { position: absolute; left: 0; top: .15em; font-size: .72em; font-weight: 800; color: var(--js-muted); }
.js-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1.5px solid var(--js-line); border-radius: var(--js-radius); overflow: hidden; }
.js-table th { background: var(--js-soft); color: var(--js-heading); text-align: left; font-weight: 800; }
.js-table th, .js-table td { padding: 8px 12px; border-bottom: 1px solid var(--js-line); vertical-align: top; }
.js-table tr:last-child td { border-bottom: 0; }
.js-text { }

/* Pictures: a fixed frame per size, on its own row, so a page's height is
   known before the picture loads and text is never covered. */
.js-photo { display: flex; justify-content: center; margin: 0; }
.js-photo-frame { position: relative; width: 300px; height: 200px; max-width: 100%; border-radius: var(--js-radius); overflow: hidden; background: var(--js-soft); border: 1.5px solid var(--js-line); }
.js-photo[data-size="s"] .js-photo-frame { width: 195px; height: 130px; }
.js-photo[data-size="l"] .js-photo-frame { width: 480px; height: 320px; }
.js-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.js-photo-empty { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 10px; font: 600 12px/1.3 system-ui, sans-serif; color: var(--js-muted); }
.js-photo[data-finding] .js-photo-empty { animation: js-photo-pulse 1.4s ease-in-out infinite; }
@keyframes js-photo-pulse { 50% { opacity: .45; } }
.js-photo-change { all: unset; position: absolute; inset: 0; cursor: pointer; border-radius: inherit; }
.js-photo-change span { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; background: #1D1730; color: #fff; font: 600 11.5px/1 system-ui, sans-serif; white-space: nowrap; opacity: 0; transition: opacity .15s ease; }
.js-photo-change:hover span, .js-photo-change:focus-visible span { opacity: 1; }
.js-photo-change:focus-visible { outline: 2px solid var(--js-accent); outline-offset: 2px; }
.js-photo-empty + .js-photo-change span { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .js-photo[data-finding] .js-photo-empty { animation: none; } }

/* Maths */
.js-frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; font-size: .9em; line-height: 1; margin: 0 1px; }
.js-frac > span:first-child { border-bottom: 1.5px solid currentColor; padding: 0 2px 1px; }
.js-frac > span:last-child { padding: 1px 2px 0; }

/* Answers page */
.js-answers-title { font-family: var(--js-font-heading); color: var(--js-heading); font-size: 1.6em; font-weight: 700; }
.js-answer { display: grid; grid-template-columns: 2.2em 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--js-line); }
.js-answer-n { font-weight: 800; color: var(--js-heading); }
.js-note { background: var(--js-panel); border-radius: var(--js-radius); padding: 12px 16px; }
.js-note h3 { margin: 0 0 6px; font-family: var(--js-font-heading); color: var(--js-heading); font-size: 1.05em; }
.js-note ul { margin: 0; padding-left: 18px; }

.js-answers-sub { margin: 6px 0 0; font-family: var(--js-font-heading); color: var(--js-heading); font-size: 1.05em; }

/* Lists: success criteria tick boxes, numbered steps, bullets */
.js-list { display: flex; flex-direction: column; gap: 4px; }
.js-list-title { margin: 0; font-family: var(--js-font-heading); color: var(--js-heading); font-size: 1.02em; font-weight: 700; }
.js-list ul, .js-list ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 3px; }
/* The app's CSS reset removes list markers; a plan's lists need them back. */
.js-list ul { list-style: disc outside; }
.js-list ol { list-style: decimal outside; }
.js-list li { display: list-item; }
.js-list[data-style="check"] ul { list-style: none; padding-left: 0; }
.js-list[data-style="check"] li { display: flex; gap: 9px; align-items: flex-start; }
.js-list-add { list-style: none !important; }
.js-list[data-style="check"] li:not(.js-list-add)::before { content: ""; flex: none; width: 1em; height: 1em; margin-top: .2em; border: 2px solid var(--js-muted); border-radius: 4px; }
.js-list ol li::marker { font-weight: 800; color: var(--js-heading); }
.js-list-add { list-style: none; }

/* Lesson phases: a header band with the stage and time, then labelled rows */
.js-phase { border: var(--js-border) solid var(--js-line); border-radius: var(--js-radius); overflow: hidden; background: var(--js-paper); box-shadow: var(--js-shadow); }
.js-phase-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; background: var(--js-soft); padding: 8px 14px; border-bottom: 1.5px solid var(--js-line); }
.js-phase-stage { font-size: .7em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--js-on-accent); background: var(--js-accent); border-radius: 999px; padding: 2px 9px; }
.js-phase-title { flex: 1; min-width: 40%; font-family: var(--js-font-heading); color: var(--js-heading); font-weight: 700; font-size: 1.05em; }
.js-phase-time { margin-left: auto; font-size: .82em; color: var(--js-muted); white-space: nowrap; display: inline-flex; gap: 8px; align-items: baseline; }
.js-phase-clock { font-weight: 700; color: var(--js-ink); }
.js-phase-min { width: 3.4em; font: inherit; padding: 1px 4px; border: 1.5px solid var(--js-line); border-radius: 6px; background: var(--js-paper); color: var(--js-ink); }
.js-phase-grid { margin: 0; display: flex; flex-direction: column; }
.js-phase-row { display: grid; grid-template-columns: 9.5em 1fr; gap: 12px; padding: 7px 14px; border-top: 1px solid var(--js-line); }
.js-phase-row:first-child { border-top: 0; }
.js-phase-row dt { font-weight: 800; font-size: .86em; color: var(--js-heading); padding-top: .1em; }
.js-phase-row dd { margin: 0; }
.js-phase-row dd ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; list-style: disc outside; }
.js-phase-row dd li { display: list-item; }
.js-phase-row[data-field="support"] dt, .js-phase-row[data-field="challenge"] dt, .js-phase-row[data-field="ta"] dt { color: var(--js-muted); }

/* Exam paper cover: a page of its own */
.js-cover { display: flex; flex-direction: column; gap: 18px; min-height: calc(var(--js-page-h) - 160px); }
.js-cover-level { font-size: .82em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--js-muted); }
.js-cover .js-title { font-size: 2.4em; }
.js-cover-facts { display: flex; gap: 28px; padding: 12px 16px; background: var(--js-soft); border-radius: var(--js-radius); }
.js-cover-facts b { display: block; font-size: 1.35em; color: var(--js-heading); }
.js-cover-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; font-weight: 700; }
.js-cover-boxes span { display: flex; gap: 10px; align-items: flex-end; }
.js-cover-boxes span:first-child { grid-column: 1 / -1; }
.js-cover-boxes i { flex: 1; border-bottom: 1.5px solid var(--js-ink); height: 1.4em; }
.js-cover-instructions { border: 1.5px solid var(--js-line); border-radius: var(--js-radius); padding: 12px 16px; }
.js-cover-heading { font-family: var(--js-font-heading); font-weight: 700; color: var(--js-heading); margin-bottom: 6px !important; }
.js-cover-instructions ul { margin: 0; padding-left: 20px; list-style: disc outside; display: flex; flex-direction: column; gap: 4px; }
.js-cover-instructions li { display: list-item; }
.js-cover-disclaimer { margin-top: auto !important; font-size: .78em; font-style: italic; color: var(--js-muted); }

/* Model answers: one card per level */
.js-exemplar { border: var(--js-border) solid var(--js-line); border-radius: var(--js-radius); overflow: hidden; background: var(--js-paper); box-shadow: var(--js-shadow); }
.js-exemplar[data-level="full"] { border-color: var(--js-accent); }
.js-exemplar-head { display: flex; align-items: baseline; gap: 10px; padding: 8px 14px; background: var(--js-soft); border-bottom: 1.5px solid var(--js-line); }
.js-exemplar-level { font-size: .72em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--js-on-accent); background: var(--js-accent); border-radius: 999px; padding: 2px 9px; }
.js-exemplar[data-level="mid"] .js-exemplar-level { background: var(--js-heading); color: #fff; }
.js-exemplar[data-level="low"] .js-exemplar-level { background: var(--js-muted); color: #fff; }
.js-exemplar-marks { margin-left: auto; font-weight: 700; color: var(--js-heading); }
.js-exemplar-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.js-exemplar-body ol, .js-exemplar-body ul { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 4px; }
.js-exemplar-body ol { list-style: decimal outside; }
.js-exemplar-body ul { list-style: disc outside; }
.js-exemplar-body li { display: list-item; }
.js-exemplar-notes { padding: 8px 14px; border-top: 1px solid var(--js-line); font-size: .9em; }
.js-exemplar-notes-title { font-weight: 800; color: var(--js-heading); margin-bottom: 4px !important; }
.js-exemplar-notes ul { margin: 0; padding-left: 18px; list-style: disc outside; display: flex; flex-direction: column; gap: 3px; }
.js-exemplar-notes li { display: list-item; }
.js-exemplar-comment { padding: 8px 14px 10px; font-style: italic; color: var(--js-muted); border-top: 1px solid var(--js-line); }

/* Editing */
.js-edit { outline: 1.5px dashed transparent; outline-offset: 2px; border-radius: 4px; cursor: text; min-width: 1ch; }
.js-sheet[data-mode="edit"] .js-edit:hover { outline-color: color-mix(in srgb, var(--js-accent) 55%, transparent); }
.js-edit[contenteditable="true"] { outline: 2px solid var(--js-accent); background: color-mix(in srgb, var(--js-accent) 7%, transparent); }
.js-edit:empty::before { content: attr(data-placeholder); color: var(--js-muted); opacity: .6; }
.js-block { position: relative; }
.js-sheet[data-mode="edit"] .js-page { overflow: visible; }
.js-tools { position: absolute; top: -14px; right: 8px; display: none; gap: 2px; padding: 3px; background: #1D1730; border-radius: 9px; z-index: 5; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
.js-sheet[data-mode="edit"] .js-block:hover > .js-tools, .js-sheet[data-mode="edit"] .js-block:focus-within > .js-tools { display: flex; }
.js-tools button { all: unset; cursor: pointer; color: #fff; font: 600 11px/1 system-ui, sans-serif; padding: 5px 7px; border-radius: 6px; }
.js-tools button:hover { background: rgba(255,255,255,.16); }
.js-add-row { position: relative; display: flex; gap: 8px; justify-content: center; padding: 2px 0; }
.js-menu-head { grid-column: 1 / -1; font: 700 10.5px/1 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #6D6683; padding: 8px 10px 4px; }
.js-add { all: unset; cursor: pointer; font: 600 12px/1 system-ui, sans-serif; color: var(--js-heading); border: 1.5px dashed var(--js-line); border-radius: 999px; padding: 7px 14px; background: var(--js-paper); }
.js-add:hover { border-color: var(--js-accent); }
.js-mini { all: unset; cursor: pointer; font: 700 11px/1 system-ui, sans-serif; color: var(--js-muted); padding: 3px 6px; border-radius: 6px; }
.js-mini:hover { background: var(--js-soft); color: var(--js-heading); }
.js-menu { position: absolute; z-index: 20; background: #fff; border: 1px solid #E2DCF2; border-radius: 12px; box-shadow: 0 12px 34px rgba(29,23,48,.18); padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; width: 320px; }
.js-menu button { all: unset; cursor: pointer; font: 500 12.5px/1.2 system-ui, sans-serif; color: #1D1730; padding: 8px 10px; border-radius: 8px; }
.js-menu button:hover { background: #F1ECFC; }
.js-streaming .js-page-body > :last-child { animation: js-in .35s ease-out both; }
@keyframes js-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* Jo at work: the piece being edited, ringed in Jooma purple, with a label. */
.js-sheet [data-jo] { position: relative; border-radius: 10px; transition: box-shadow .3s ease, background-color .3s ease; }
.js-sheet [data-jo-active] { box-shadow: 0 0 0 2px #8B6AE8, 0 0 0 7px rgba(139,106,232,.16); background-color: rgba(241,236,252,.45); }
.js-jo-label { position: absolute; top: -13px; left: 10px; z-index: 6; display: inline-flex; align-items: center; gap: 6px; max-width: calc(100% - 20px); padding: 3px 10px 3px 3px; border-radius: 999px; background: #3A1C8F; color: #fff; font: 600 11px/1.2 system-ui, sans-serif; box-shadow: 0 4px 12px rgba(58,28,143,.25); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: js-in .25s ease-out both; pointer-events: none; }
.js-jo-label i { flex: none; width: 18px; height: 18px; border-radius: 6px; background: #5B2ED6; display: grid; place-items: center; font-style: normal; font-size: 10px; font-weight: 800; }
@media (prefers-reduced-motion: reduce) { .js-sheet [data-jo] { transition: none; } .js-jo-label { animation: none; } }

@media print {
  .js-pages { gap: 0; }
  .js-page { box-shadow: none; border-radius: 0; break-after: page; }
  .js-tools, .js-add-row, .js-mini, .js-jo-label, .js-photo-change { display: none !important; }
  .js-sheet [data-jo-active] { box-shadow: none; background: none; }
}
`;
