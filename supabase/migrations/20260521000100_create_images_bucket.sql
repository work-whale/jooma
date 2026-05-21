-- Bucket for AI-generated images + user-uploaded photos. Public read so the
-- browser can stream via <img src> directly. Anon insert is open for the MVP
-- — tighten to authenticated users once auth is in.
--
-- This replaces the previous "store base64 directly in JSONB / data_url"
-- approach which was crushing the free-tier Postgres compute: 2-3 MB per
-- image inside TOAST'd columns produced 10s+ statement timeouts.

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read images" on storage.objects;
create policy "anon read images"
  on storage.objects for select
  using (bucket_id = 'images');

drop policy if exists "anon insert images" on storage.objects;
create policy "anon insert images"
  on storage.objects for insert
  with check (bucket_id = 'images');

drop policy if exists "anon delete images" on storage.objects;
create policy "anon delete images"
  on storage.objects for delete
  using (bucket_id = 'images');
