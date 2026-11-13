-- Фото и видео в чате + «был(а) в сети».
-- Применить после 0001–0005: SQL Editor → вставить файл → Run.

-- «Был(а) в сети»: приложение обновляет время, пока открыто, и при сворачивании.
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Сообщения с медиа: kind = 'media', файл лежит в хранилище chat-media по пути «<couple_id>/<файл>».
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_type text;
alter table public.messages add column if not exists media_width integer;
alter table public.messages add column if not exists media_height integer;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'thinking', 'media'));

alter table public.messages drop constraint if exists messages_media_check;
alter table public.messages add constraint messages_media_check check (
  (kind <> 'media' and media_path is null)
  or (kind = 'media' and media_type in ('image', 'video') and media_path like couple_id::text || '/%')
);

-- Закрытое хранилище: файл до 50 МБ, только картинки и видео.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Доступ к файлам — только своей паре (первая папка пути = id пары).
drop policy if exists "chat-media: couple read" on storage.objects;
drop policy if exists "chat-media: couple upload" on storage.objects;
drop policy if exists "chat-media: own delete" on storage.objects;

create policy "chat-media: couple read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = public.my_couple_id()::text);

create policy "chat-media: couple upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = public.my_couple_id()::text);

create policy "chat-media: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and owner_id = auth.uid()::text);
