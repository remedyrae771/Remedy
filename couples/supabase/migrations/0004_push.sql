-- Push-уведомления.
-- Применить после 0001–0003: SQL Editor → вставить файл → Run.
-- Также нужна Edge Function `notify` (supabase/functions/notify/index.ts) с выключенной проверкой JWT.

create extension if not exists pg_net;

-- Подписки браузеров/телефонов на уведомления (по одной на устройство).
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: own read" on public.push_subscriptions;
drop policy if exists "push: own insert" on public.push_subscriptions;
drop policy if exists "push: own update" on public.push_subscriptions;
drop policy if exists "push: own delete" on public.push_subscriptions;

create policy "push: own read" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "push: own insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "push: own update" on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push: own delete" on public.push_subscriptions for delete using (user_id = auth.uid());

-- Ключи VAPID. Функция notify создаёт их сама при первом запуске.
-- RLS без политик + отозванные права: читать может только серверная функция (service role).
create table if not exists public.push_vapid (
  id           int primary key default 1 check (id = 1),
  public_key   text not null,
  private_key  text not null,
  created_at   timestamptz not null default now()
);

alter table public.push_vapid enable row level security;
revoke all on public.push_vapid from anon, authenticated;

-- Сообщить функции notify о новом событии. Функция сама перечитывает строку из базы,
-- поэтому в запросе передаётся только имя таблицы и id — подделать текст уведомления нельзя.
create or replace function public.notify_partner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://ksuamdunohzzstukmktj.supabase.co/functions/v1/notify',
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
exception when others then
  -- Уведомление не должно мешать сохранению сообщения, ответа или настроения.
  return new;
end;
$$;

drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message
  after insert on public.messages
  for each row execute function public.notify_partner();

drop trigger if exists notify_on_answer on public.answers;
create trigger notify_on_answer
  after insert on public.answers
  for each row execute function public.notify_partner();

drop trigger if exists notify_on_mood on public.profiles;
create trigger notify_on_mood
  after update of mood on public.profiles
  for each row
  when (new.mood is distinct from old.mood and new.mood is not null and new.couple_id is not null)
  execute function public.notify_partner();
