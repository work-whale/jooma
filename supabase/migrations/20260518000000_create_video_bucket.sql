-- Bucket for user-uploaded video clips. Public read so the browser can stream
-- via a plain <video src>. Anon insert is open for the MVP.

insert into storage.buckets (id, name, public)
values ('video', 'video', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read video" on storage.objects;
create policy "anon read video"
  on storage.objects for select
  using (bucket_id = 'video');

drop policy if exists "anon insert video" on storage.objects;
create policy "anon insert video"
  on storage.objects for insert
  with check (bucket_id = 'video');

drop policy if exists "anon delete video" on storage.objects;
create policy "anon delete video"
  on storage.objects for delete
  using (bucket_id = 'video');
