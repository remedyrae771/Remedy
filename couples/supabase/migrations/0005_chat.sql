-- Чат: реакции на сообщения и отметки о прочтении.
-- Применить после 0001–0004: SQL Editor → вставить файл → Run.

-- Реакции: { "<user_id>": "❤️" } — у каждого партнёра одна реакция на сообщение.
alter table public.messages add column if not exists reactions jsonb not null default '{}'::jsonb;

-- Поставить, сменить или снять свою реакцию. Сообщения напрямую менять нельзя (RLS разрешает
-- только вставку), поэтому реакции идут через эту функцию: она трогает только свою запись.
create or replace function public.react_message(message_id uuid, emoji text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if emoji is not null and (length(emoji) = 0 or length(emoji) > 16) then
    raise exception 'bad emoji';
  end if;

  update public.messages m
     set reactions = case
       when emoji is null or m.reactions ->> auth.uid()::text = emoji then m.reactions - auth.uid()::text
       else m.reactions || jsonb_build_object(auth.uid()::text, emoji)
     end
   where m.id = message_id
     and m.couple_id = public.my_couple_id()
  returning m.reactions into result;

  if result is null then
    raise exception 'message not found';
  end if;
  return result;
end;
$$;

-- Когда каждый последний раз читал чат.
create table if not exists public.chat_reads (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  couple_id     uuid not null references public.couples (id) on delete cascade,
  last_read_at  timestamptz not null default now()
);

alter table public.chat_reads enable row level security;

drop policy if exists "chat_reads: couple read" on public.chat_reads;
drop policy if exists "chat_reads: own insert" on public.chat_reads;
drop policy if exists "chat_reads: own update" on public.chat_reads;

create policy "chat_reads: couple read" on public.chat_reads
  for select using (couple_id = public.my_couple_id());
create policy "chat_reads: own insert" on public.chat_reads
  for insert with check (user_id = auth.uid() and couple_id = public.my_couple_id());
create policy "chat_reads: own update" on public.chat_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid() and couple_id = public.my_couple_id());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_reads') then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end;
$$;
