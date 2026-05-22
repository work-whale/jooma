-- Update list_presentations_lite to strip large base64 fields from first_slide.
--
-- The original version returned slides->0 verbatim. Title-cover slides store a
-- full-bleed background photo as a base64 data URL in `backgroundImage`, often
-- 1-3 MB per deck. With N presentations on the list page that means N×3 MB just
-- to render small thumbnails — enough to trip the statement timeout and make the
-- page feel very slow.
--
-- We strip backgroundImage (and its companion positioning fields) plus the `src`
-- field from every inline image object. The thumbnail renderer still shows the
-- slide layout, text, shapes, and colours — just without the heavy pixel data.

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
    case
      when p.slides -> 0 is null then null
      else
        -- 1. Strip top-level background image fields.
        -- 2. Strip src / dataUrl from every element of the images array so
        --    inline AI-generated or uploaded photos don't bloat the payload.
        jsonb_set(
          (p.slides -> 0)
            - 'backgroundImage'
            - 'backgroundImageWidth'
            - 'backgroundImageHeight'
            - 'backgroundOffsetX'
            - 'backgroundOffsetY'
            - 'backgroundScale',
          '{images}',
          coalesce(
            (
              select jsonb_agg(img - 'src' - 'dataUrl')
              from jsonb_array_elements(
                coalesce((p.slides -> 0) -> 'images', '[]'::jsonb)
              ) as img
            ),
            '[]'::jsonb
          ),
          false   -- don't create {images} key if it was absent
        )
    end                                                  as first_slide
  from presentations p
  order by p.updated_at desc;
$$;

grant execute on function list_presentations_lite() to anon, authenticated;
