-- Расширенные уведомления (с настройками по видам) и обои в чате.
-- Применить после 0001–0009: SQL Editor → вставить файл → Run.

-- Какие уведомления присылать: { "reactions": false, ... } — отсутствующий ключ = включено.
alter table public.profiles add column if not exists notify_prefs jsonb not null default '{}'::jsonb;

-- Обои чата: id готовых обоев ('hearts', 'night', …) или 'photo:<путь в chat-media>'.
alter table public.profiles add column if not exists chat_wallpaper text;
alter table public.profiles drop constraint if exists profiles_chat_wallpaper_check;
alter table public.profiles add constraint profiles_chat_wallpaper_check check (
  chat_wallpaper is null
  or chat_wallpaper in ('default', 'hearts', 'night', 'clouds', 'paws', 'sunset', 'lavender')
  or (chat_wallpaper like 'photo:%' and couple_id is not null and chat_wallpaper like 'photo:' || couple_id::text || '/%')
);

-- Уведомления о новых моментах, капсулах, датах и пунктах списков.
drop trigger if exists notify_on_moment on public.moments;
create trigger notify_on_moment after insert on public.moments
  for each row execute function public.notify_partner();

drop trigger if exists notify_on_capsule on public.capsules;
create trigger notify_on_capsule after insert on public.capsules
  for each row execute function public.notify_partner();

drop trigger if exists notify_on_event on public.events;
create trigger notify_on_event after insert on public.events
  for each row execute function public.notify_partner();

drop trigger if exists notify_on_list_item on public.list_items;
create trigger notify_on_list_item after insert on public.list_items
  for each row execute function public.notify_partner();

-- Реакции: та же функция, плюс уведомление автору сообщения, когда партнёр ставит реакцию.
create or replace function public.react_message(message_id uuid, emoji text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  result jsonb;
  sender uuid;
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
  returning m.reactions, m.sender_id into result, sender;

  if result is null then
    raise exception 'message not found';
  end if;

  -- Реакция поставлена (а не снята) на чужое сообщение — сообщаем автору.
  if sender <> auth.uid() and result ->> auth.uid()::text is not null then
    begin
      perform net.http_post(
        url := 'https://ksuamdunohzzstukmktj.supabase.co/functions/v1/notify',
        body := jsonb_build_object('table', 'reaction', 'id', message_id, 'actor', auth.uid()),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    exception when others then
      null; -- уведомление не должно мешать реакции
    end;
  end if;
  return result;
end;
$$;
