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

grant execute on function list_presentations_lite() to anon, authenticated;
notify pgrst, 'reload schema';
