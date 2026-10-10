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
  .js-tools, .js-add-row, .js-mini, .js-jo-label { display: none !important; }
  .js-sheet [data-jo-active] { box-shadow: none; background: none; }
}
`;
