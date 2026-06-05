# Scenic slideshow backgrounds

Two phases. **Phase 1 (shipped)** = flat gradient/SVG-style scene motifs drawn as
decoration shapes. **Phase 2 (planned)** = rich full-bleed illustration artwork.

## Phase 1 — flat scene motifs (DONE)

Themes: `ocean`, `desert`, `cloudy`, `forest`, `dusk` in
[`app/lib/slideshowThemes.ts`](../app/lib/slideshowThemes.ts).

Each theme is a normal palette/font skin **plus** a backdrop built from
low-opacity `ellipse` / `triangle` decoration shapes in
`sceneDecorations()` ([`app/lib/slideshow-layouts.ts`](../app/lib/slideshow-layouts.ts)),
prepended behind content via the existing `getThemeDecorations` hook.

Why shapes instead of CSS gradients / images:
- Shapes already render on **every** surface — editor canvas, tray thumbnails,
  present mode, and **pptxgenjs export** — so no per-surface background code and
  the scene survives PPTX export for free.
- No assets, no storage, tiny JSON footprint.

Skeleton-less slides (audio, audio-answer, video, manual) get the motif too:
`handleThemeChange` in [`Editor.tsx`](../app/components/editor/Editor.tsx) prepends
`backgroundDecorations(theme, hasBgImage)` to their shapes (stripping stale
`dec_*` shapes first so re-switching doesn't stack them).

Known Phase-1 gaps (acceptable for now):
- The scene reads as a subtle frame around the centred paper card, not a
  full-bleed scene.
- `title-cover` / full-bleed-photo slides intentionally skip decorations.

## Phase 2 — full illustration backgrounds (PLAN)

Goal: optional rich painted scene artwork (real seascape / dunes / skyscape)
as a full-bleed slide background, with content kept legible.

### Data model
- Add `backgroundArt?: string` (Storage URL) and `backgroundArtScrim?: string`
  (overlay color/opacity) to `SlideJSON` — distinct from `backgroundImage`
  (which is the AI content photo) so the two never collide.
- Add to `SlideshowTheme`: `art?: { src: string; scrim: string; textOnArt: string }`
  or a small set of per-layout art variants (title vs content).

### Assets
- Generate a small fixed set per theme (e.g. 2–3 variants: hero, content-light,
  content-dark) with the existing AI image pipeline (`generateAIImage`) or
  source CC0 art. Store once in the `images` bucket; reference by URL. **Do not**
  generate per-deck — these are reusable theme assets, committed/seeded once.
- Keep each ≤ ~150 KB (webp) so decks stay light.

### Rendering
- Reuse the existing `backgroundImage` cover-render path? No — keep separate so
  a slide can have BOTH content photo and scene art. Add a dedicated full-bleed
  `<img>`/CSS layer at `z=-1` in the 4 surfaces:
  editor canvas ([`Editor.tsx`](../app/components/editor/Editor.tsx) ~L3180),
  [`MiniSlide.tsx`](../app/components/editor/MiniSlide.tsx) ~L687,
  `PresentationViewer.tsx`, and the pptxgenjs export (`pptx ... background: { path }`).
- Legibility: render `backgroundArtScrim` (e.g. `rgba(255,255,255,0.72)` for
  light themes) between the art and content. Paper-card layouts may drop the
  card and place content directly on the scrim for a more immersive look.
- Text colour: switch theme text to `textOnArt` where content sits directly on
  art rather than on a card.

### Export
- pptxgenjs supports a slide background image (`slide.background = { path }`) and
  shape overlays for the scrim — verify cover-fit and that the scrim renders
  above the bg image but below text.

### Picker UX
- Theme swatches in [`EditorTopBar.tsx`](../app/components/editor/EditorTopBar.tsx)
  and `GenerateModal` currently show `palette.background` as a flat colour. For
  art themes, show a thumbnail of the hero art instead.

### Open questions
- Per-slide art rotation (vary art across slides) vs one art per theme.
- Whether art themes are a separate toggle ("Illustrated") layered on top of any
  palette, rather than discrete themes.
