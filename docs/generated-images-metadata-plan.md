# Generated-images metadata: index, title & description

Make the cross-deck picture library (`generated_images`) searchable and
browsable by **title** and **description**, not just the raw AI prompt.

## Current state
- Table `generated_images` (see `supabase/migrations/20260513000000_create_generated_images.sql`):
  `id, prompt, style, data_url, created_at`.
- Search is `ILIKE '%term%'` on `prompt` only (`listGeneratedImages` in
  [`app/lib/generatedImages.ts`](../app/lib/generatedImages.ts)).
- Indexes: `lower(prompt)` + `created_at desc`.
- RLS is **anon/open** ("MVP: tighten later") — rows aren't scoped to a user.
- The `prompt` is the slide's `imageQuery` (e.g. `"Bastille prison storming"`) —
  terse and not user-friendly to read or search.

## Goal
1. **Title** — a short, human label per image (e.g. "Storming of the Bastille").
2. **Description** — one sentence of context (what it shows / where it came from).
3. **Indexing** — full-text search across title + description + prompt, so
   "french revolution" matches an image titled "Storming of the Bastille".
4. (Coupled) **Scope rows to the owner** now that auth exists.

## Schema changes (new migration)
```sql
alter table generated_images
  add column if not exists title       text,
  add column if not exists description text,
  add column if not exists user_id     uuid references auth.users(id) on delete cascade,
  add column if not exists source      text,        -- 'slideshow' | 'editor-ai' | 'regenerate'
  add column if not exists search_tsv  tsvector
    generated always as (
      to_tsvector('english',
        coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(prompt,''))
    ) stored;

create index if not exists generated_images_search_idx on generated_images using gin (search_tsv);
create index if not exists generated_images_user_idx   on generated_images (user_id, created_at desc);
```
- `search_tsv` is a **generated column** → no app code needed to keep it in sync;
  the GIN index makes full-text search fast.
- Keep the existing `prompt` column (back-compat + still part of the index).

## Where title & description come from
Two tiers — pick per call site:

- **Cheap / deterministic (default):**
  - `title` = title-cased prompt, trimmed to ~6 words.
  - `description` = the slide title + style, e.g. "Illustration for 'The Reign of Terror'."
  - Zero extra cost; good enough for search.
- **AI-enriched (optional, gpt-4o-mini):**
  - One tiny batched call turns `prompt (+ slideTitle, style)` into
    `{ title, description }`. ~$0.0001/image; can run **after** generation so it
    never blocks the deck. Batch all of a deck's images in one request.

Thread `slideTitle` + `style` into `saveGeneratedImage` (the generator already
has both — see the `galleryImage` payload in
[`generate-slideshow/route.ts`](../app/api/generate-slideshow/route.ts)).

## Backfill (existing rows)
- Migration sets `title = initcap(prompt)`, `description = null` for old rows so
  they remain searchable immediately.
- Optional one-off script enriches old rows via the AI tier in batches.
- `user_id` for legacy rows stays null (visible to no one once RLS tightens, or
  keep a "legacy/shared" carve-out — decide at rollout).

## App changes
- [`app/lib/generatedImages.ts`](../app/lib/generatedImages.ts):
  - `GeneratedImage` gains `title`, `description`, `source`.
  - `saveGeneratedImage({ prompt, style, dataUrl, title?, description?, slideTitle?, source? })`
    — compute the deterministic title/description when not supplied.
  - `listGeneratedImages({ search })` → switch from `.ilike('prompt', …)` to a
    full-text query: `.textSearch('search_tsv', term, { type: 'websearch' })`,
    falling back to ILIKE if the term is a single partial word.
- [`PicturesPanel.tsx`](../app/components/editor/PicturesPanel.tsx): render the
  **title** under each generated thumbnail and use the description as the `alt`
  / tooltip; the search box now hits title + description + prompt.

## RLS / auth (do alongside)
Replace the anon `using (true)` policies with owner-scoped ones
(`auth.uid() = user_id`), matching `profiles` / `tool_runs`. Stamp `user_id`
on insert (default `auth.uid()`).

## Rollout phases
1. **Migration** — add columns + generated `search_tsv` + indexes + backfill
   `title`. Ship the full-text `listGeneratedImages` + PicturesPanel title.
   (Immediate searchability win, no AI cost.)
2. **Capture context** — pass `slideTitle`/`style`/`source` through
   `saveGeneratedImage` so new rows get richer deterministic descriptions.
3. **AI enrichment (optional)** — batched gpt-4o-mini titles/descriptions,
   post-generation; backfill old rows.
4. **Auth scoping** — owner RLS + `user_id` on insert.

## Phase 5 (extension): reuse AI images across the library — "generate only when needed"
The real payoff of indexing: before generating an AI image for a slide, look for
a relevant one already in `generated_images` and **reuse it**, saving image-gen
tokens + time. (The metadata above is what makes the match possible.)

### Matching — two tiers
- **Exact (cheapest):** normalized `prompt` + `style` + `orientation` already in
  the library → reuse instantly. Hits whenever a topic/query recurs.
- **Semantic (higher hit rate):** embed the query and do a vector-similarity
  search, **filtered by style + orientation**, reusing only if score ≥ threshold.

Always filter by **style + orientation** so the reused image fits the slide's
frame and aesthetic — a landscape photo can't stand in for a square illustration.

### Schema additions (on top of the columns above)
```sql
create extension if not exists vector;
alter table generated_images
  add column if not exists embedding   vector(1536),   -- of (title + description + prompt)
  add column if not exists orientation text,           -- 'square' | 'landscape' | 'portrait'
  add column if not exists width  int,
  add column if not exists height int,
  add column if not exists model  text;
create index if not exists generated_images_embedding_idx
  on generated_images using hnsw (embedding vector_cosine_ops);
```

### Flow (in `generateAIImage` / `fetchImageForSlide`)
1. Build the match key: normalized prompt (exact tier) and/or an embedding
   (semantic tier).
2. Query the library filtered by `style` + `orientation`, best match first.
3. **Hit** (exact, or score ≥ threshold) → return the existing `data_url`
   (provider `"ai-cached"`, `costUsd: 0`). No generation.
4. **Miss** → generate as today, then save with embedding + metadata so the
   next deck can reuse it.

### Economics
- Embedding lookup ≈ **$0.00001** + a vector query, vs **~$0.015–0.022** to
  generate one image → roughly **1000× cheaper** on a cache hit, and instant
  instead of ~15–30 s.
- Hit rate climbs with library size and topic recurrence (classroom topics
  repeat heavily — French Revolution, photosynthesis, the water cycle…).

### Trade-offs / decisions to make
- **Freshness vs reuse:** a reused image is "close enough," not tailored to the
  exact slide. Likely policy: always-fresh for the **title-hero**, reuse for body
  images; expose a tunable similarity threshold.
- **Privacy:** only the rendered **image** is reused — never another user's
  prompt or lesson text. Keep it to generic AI imagery; document the shared-vs-
  per-org library decision (ties into the RLS step — a reuse cache wants a
  shared read pool even if writes are owner-stamped).
- **Threshold tuning:** too low → irrelevant reuse; too high → few hits. Start
  strict (e.g. cosine ≥ 0.88) and relax with data.
- **Quality control:** allow flagging/removing bad images; never reuse flagged
  or low-quality rows. Consider a small "served count" to prefer proven images.

## Open questions
- Per-user library vs a shared org library (affects step 4).
- Whether to also store `width/height` + `model` (handy for the picker; already
  returned by `generateAIImage`).
- Dedupe identical prompts/images across decks?
