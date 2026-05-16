-- Bucket for AI-generated audio activity clips (TTS MP3s). Public read so the
-- browser can stream them via a plain <audio src>. Anon insert is open for the
-- MVP — tighten to authenticated users once auth is in.
--
-- Postgres doesn't support `CREATE POLICY IF NOT EXISTS`, so we drop-then-create
-- inside a DO block. The migration is idempotent.

insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

drop policy if exists "anon read audio" on storage.objects;
create policy "anon read audio"
  on storage.objects for select
  using (bucket_id = 'audio');

drop policy if exists "anon insert audio" on storage.objects;
create policy "anon insert audio"
  on storage.objects for insert
  with check (bucket_id = 'audio');

drop policy if exists "anon delete audio" on storage.objects;
create policy "anon delete audio"
  on storage.objects for delete
  using (bucket_id = 'audio');
