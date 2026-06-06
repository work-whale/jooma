-- Phase 1 of the generated-images metadata plan
-- (docs/generated-images-metadata-plan.md): adds title / description + a
-- full-text search vector, plus the cache-ready columns (orientation, width,
-- height, model, embedding, user_id) so the shared AI-image reuse cache can be
-- switched on later WITHOUT another migration.
--
-- RLS is intentionally left open (shared read/insert) for now — the reuse cache
-- wants a shared read pool; owner-scoping is a separate, later step.

create extension if not exists vector;

-- Plain data columns first (the generated column below references title/description).
alter table generated_images
  add column if not exists title       text,
  add column if not exists description text,
  add column if not exists source      text,           -- 'slideshow' | 'editor-ai' | 'regenerate'
  add column if not exists orientation text,            -- 'square' | 'landscape' | 'portrait'
  add column if not exists width       int,
  add column if not exists height      int,
  add column if not exists model       text,
  add column if not exists user_id     uuid references auth.users (id) on delete cascade,
  add column if not exists embedding   vector(1536);    -- populated in the reuse-cache phase

-- Full-text search across title + description + prompt (stored generated column,
-- so it stays in sync automatically).
alter table generated_images
  add column if not exists search_tsv tsvector
    generated always as (
      to_tsvector(
        'english',
        coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(prompt, '')
      )
    ) stored;

create index if not exists generated_images_search_idx on generated_images using gin (search_tsv);
create index if not exists generated_images_user_idx   on generated_images (user_id, created_at desc);

-- Backfill a readable title for existing rows from their prompt.
update generated_images set title = initcap(prompt) where title is null;
