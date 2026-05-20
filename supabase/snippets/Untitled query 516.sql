-- Lightweight list query for the Slideshows index page.
--
-- The `presentations.slides` JSONB column can be many MB once it contains
-- base64-encoded AI images. A plain `select *` for the list view pulls that
-- weight for every row and trips Postgres' statement timeout (code 57014).
--
-- This function returns ONLY what the list page renders:
--   - id, title, created_at, updated_at
--   - slide_count          (jsonb_array_length of slides)
--   - first_slide          (slides->0, used for the thumbnail)
--
-- Order by updated_at desc to preserve the existing list ordering.

create or replace function list_presentations_lite()
returns table (
  id          uuid,
  title       text,
  created_at  timestamptz,
  updated_at  timestamptz,
  slide_count integer,
  first_slide jsonb
)
language sql
stable
as $$
  select
    p.id,
    p.title,
    p.created_at,
    p.updated_at,
    coalesce(jsonb_array_length(p.slides), 0)::integer as slide_count,
    p.slides -> 0                                       as first_slide
  from presentations p
  order by p.updated_at desc;
$$;

-- Allow the anon role to call this function (matches the rest of the MVP's
-- open-access policies — tighten later when auth lands).
grant execute on function list_presentations_lite() to anon, authenticated;
