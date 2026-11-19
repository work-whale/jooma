-- ── One file, many owners: make "is this file still in use?" tell the truth ──
--
-- Production's `images` bucket hit the free plan's 1 GB in Nov 2026. Two of the
-- fixes make a single Storage object belong to more than one row:
--
--   * uploads are named by content (app/lib/contentName.ts), so the same
--     Pixabay photo in ten decks is ONE object, not ten;
--   * scripts/compact-images.mjs merges the byte-identical copies already there.
--
-- Every delete path therefore has to ask before removing a file, and the
-- function they ask (20260909000000) had three blind spots:
--
--   1. Guest tries. trial_generations.output holds decks a visitor has not yet
--      claimed; the nightly guest cleanup and the delete route both need to see
--      them. Only UNCLAIMED rows count: a claimed try was copied into the
--      teacher's presentations row, which is the live reference from then on.
--
--   2. A whole account. Account deletion (app/lib/account-deletion.ts) needs
--      "used by anybody other than this user", which a single excluded id
--      cannot express. p_exclude_user drops that user's own runs and library
--      rows (their decks are already deleted by the time it asks). Shares are
--      always counted: a recipient keeps theirs.
--
--   3. In-flight writes. A deck being generated is handed an existing file's
--      URL the moment its upload lands, but the deck row is saved later. Any
--      object written in the last hour counts as in use, so a sweep running in
--      that gap cannot pull the picture out from under it. Uploads now always
--      overwrite (upsert), which refreshes updated_at even on a repeat.
--
-- The old two-argument signature is dropped rather than overloaded: two
-- functions differing only by a defaulted argument make every named call
-- ambiguous. Existing callers pass p_paths and p_exclude_id by name, so they
-- keep working unchanged.

drop function if exists public.storage_paths_in_use(text[], uuid);

create or replace function public.storage_paths_in_use(
  p_paths        text[],
  p_exclude_id   uuid default null,
  p_exclude_user uuid default null
)
returns table (path text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select p.path
  from unnest(p_paths) as p(path)
  where
    -- Written or rewritten in the last hour: possibly about to be saved.
    exists (
      select 1 from storage.objects o
       where o.name = p.path
         and greatest(o.created_at, coalesce(o.updated_at, o.created_at)) > now() - interval '1 hour'
    )
    -- The cross-slideshow reuse library.
    or exists (
      select 1 from generated_images g
       where g.data_url like '%' || p.path || '%'
         and (p_exclude_user is null or g.user_id is distinct from p_exclude_user)
    )
    or exists (
      select 1 from presentations pr
       where pr.slides::text like '%' || p.path || '%'
         and (p_exclude_id is null or pr.id <> p_exclude_id)
         and (p_exclude_user is null or pr.user_id is distinct from p_exclude_user)
    )
    or exists (
      select 1 from tool_runs t
       where (t.output like '%' || p.path || '%'
              or t.input::text like '%' || p.path || '%')
         and (p_exclude_id is null or t.id <> p_exclude_id)
         and (p_exclude_user is null or t.user_id is distinct from p_exclude_user)
    )
    -- A share is a snapshot the recipient keeps (20260904000000).
    or exists (
      select 1 from shares s
       where s.output like '%' || p.path || '%'
    )
    -- A guest's try they can still claim.
    or exists (
      select 1 from trial_generations tg
       where tg.claimed_by is null
         and tg.output::text like '%' || p.path || '%'
    );
$$;

-- Service role only, as before: it reads across every user's rows by design.
revoke all on function public.storage_paths_in_use(text[], uuid, uuid) from public, anon, authenticated;

comment on function public.storage_paths_in_use(text[], uuid, uuid) is
  'Which of the given Storage object paths are still referenced by a deck, run, share, the image library or an unclaimed guest try, or were written in the last hour. p_exclude_id skips one resource; p_exclude_user skips every row one user owns. Service role only: deliberately reads across all users.';
