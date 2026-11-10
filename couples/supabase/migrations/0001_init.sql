-- Remedy: приложение для пар
-- Схема базы данных Supabase (Postgres) с Row Level Security.
-- Применить: Supabase Dashboard → SQL Editor → вставить файл → Run
-- или `supabase db push` при использовании Supabase CLI.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Пары и профили
-- ---------------------------------------------------------------------------

create table public.couples (
  id           uuid primary key default gen_random_uuid(),
  invite_code  text not null unique,
  started_on   date,                -- дата начала отношений
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null default '',
  couple_id        uuid references public.couples (id) on delete set null,
  mood             text,             -- эмодзи настроения
  mood_note        text,
  mood_updated_at  timestamptz,
  created_at       timestamptz not null default now()
);

create index profiles_couple_id_idx on public.profiles (couple_id);

-- Профиль создаётся автоматически при регистрации.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Пара текущего пользователя. security definer, чтобы не было рекурсии в RLS.
create function public.my_couple_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

-- Создать пару и получить код-приглашение.
create function public.create_couple()
returns public.couples
language plpgsql
security definer set search_path = public
as $$
declare
  c public.couples;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if public.my_couple_id() is not null then
    raise exception 'already in a couple';
  end if;

  loop
    code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.couples where invite_code = code);
  end loop;

  insert into public.couples (invite_code, created_by)
  values (code, auth.uid())
  returning * into c;

  update public.profiles set couple_id = c.id where id = auth.uid();
  return c;
end;
$$;

-- Присоединиться к паре по коду.
create function public.join_couple(code text)
returns public.couples
language plpgsql
security definer set search_path = public
as $$
declare
  c public.couples;
  members int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if public.my_couple_id() is not null then
    raise exception 'already in a couple';
  end if;

  select * into c from public.couples where invite_code = upper(trim(code));
  if c.id is null then
    raise exception 'invalid code';
  end if;

  select count(*) into members from public.profiles where couple_id = c.id;
  if members >= 2 then
    raise exception 'couple is full';
  end if;

  update public.profiles set couple_id = c.id where id = auth.uid();
  return c;
end;
$$;

-- Выйти из пары (данные пары остаются у партнёра).
create function public.leave_couple()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set couple_id = null where id = auth.uid();
$$;

alter table public.couples enable row level security;
alter table public.profiles enable row level security;

create policy "couple: members read"
  on public.couples for select
  using (id = public.my_couple_id());

create policy "couple: members update"
  on public.couples for update
  using (id = public.my_couple_id())
  with check (id = public.my_couple_id());

create policy "profiles: read self and partner"
  on public.profiles for select
  using (id = auth.uid() or couple_id = public.my_couple_id());

-- couple_id меняется только через RPC (create/join/leave).
create policy "profiles: update self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and couple_id is not distinct from public.my_couple_id());

-- ---------------------------------------------------------------------------
-- Важные даты
-- ---------------------------------------------------------------------------

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  couple_id       uuid not null references public.couples (id) on delete cascade,
  title           text not null,
  date            date not null,
  emoji           text not null default '📅',
  repeats_yearly  boolean not null default false,
  note            text,
  created_by      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index events_couple_id_idx on public.events (couple_id);

-- ---------------------------------------------------------------------------
-- Вопросы для пары
-- ---------------------------------------------------------------------------

create table public.questions (
  id        serial primary key,
  category  text not null,
  text      text not null
);

create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  question_id  int not null references public.questions (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, question_id)
);

create index answers_couple_question_idx on public.answers (couple_id, question_id);

-- Проверка, ответил ли текущий пользователь на вопрос (для RLS, без рекурсии).
create function public.i_answered(q int)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.answers where question_id = q and user_id = auth.uid());
$$;

-- Ответил ли партнёр на вопрос (сам ответ при этом остаётся скрыт).
create function public.partner_answered(q int)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.answers
    where question_id = q
      and couple_id = public.my_couple_id()
      and user_id <> auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Общие списки и желания
-- ---------------------------------------------------------------------------

create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  title       text not null,
  emoji       text not null default '📝',
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists (id) on delete cascade,
  couple_id   uuid not null references public.couples (id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index lists_couple_id_idx on public.lists (couple_id);
create index list_items_list_id_idx on public.list_items (list_id);

-- ---------------------------------------------------------------------------
-- Чат
-- ---------------------------------------------------------------------------

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  sender_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null,
  kind        text not null default 'text' check (kind in ('text', 'thinking')),
  created_at  timestamptz not null default now()
);

create index messages_couple_created_idx on public.messages (couple_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS для данных пары
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.messages enable row level security;

create policy "events: couple all"
  on public.events for all
  using (couple_id = public.my_couple_id())
  with check (couple_id = public.my_couple_id());

create policy "questions: authenticated read"
  on public.questions for select
  to authenticated
  using (true);

-- Ответ партнёра виден только после того, как ответил сам.
create policy "answers: read own, partner after answering"
  on public.answers for select
  using (
    user_id = auth.uid()
    or (couple_id = public.my_couple_id() and public.i_answered(question_id))
  );

create policy "answers: insert own"
  on public.answers for insert
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());

create policy "answers: update own"
  on public.answers for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());

create policy "lists: couple all"
  on public.lists for all
  using (couple_id = public.my_couple_id())
  with check (couple_id = public.my_couple_id());

create policy "list_items: couple all"
  on public.list_items for all
  using (couple_id = public.my_couple_id())
  with check (
    couple_id = public.my_couple_id()
    and exists (select 1 from public.lists l where l.id = list_id and l.couple_id = public.my_couple_id())
  );

create policy "messages: couple read"
  on public.messages for select
  using (couple_id = public.my_couple_id());

create policy "messages: send own"
  on public.messages for insert
  with check (sender_id = auth.uid() and couple_id = public.my_couple_id());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.list_items;
alter publication supabase_realtime add table public.answers;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.couples;

-- ---------------------------------------------------------------------------
-- Стартовый набор вопросов
-- ---------------------------------------------------------------------------

insert into public.questions (category, text) values
  ('Знакомство', 'Что ты подумал(а) обо мне при первой встрече?'),
  ('Знакомство', 'Какой момент наших отношений ты вспоминаешь чаще всего?'),
  ('Знакомство', 'Когда ты понял(а), что я тебе по-настоящему нравлюсь?'),
  ('Глубокие', 'Что для тебя значит чувствовать себя любимым(ой)?'),
  ('Глубокие', 'Чего ты боишься больше всего в отношениях?'),
  ('Глубокие', 'За что ты благодарен(на) мне на этой неделе?'),
  ('Глубокие', 'Какая моя привычка тебя больше всего умиляет?'),
  ('Глубокие', 'Есть ли что-то, о чём тебе сложно со мной говорить?'),
  ('Глубокие', 'Как мне лучше поддержать тебя, когда тебе плохо?'),
  ('Будущее', 'Где ты видишь нас через пять лет?'),
  ('Будущее', 'Какое путешествие ты хочешь совершить вместе?'),
  ('Будущее', 'Какую традицию ты хотел(а) бы завести вместе?'),
  ('Будущее', 'Каким был бы наш идеальный выходной через 10 лет?'),
  ('Будущее', 'Чему новому ты хочешь научиться вместе со мной?'),
  ('Весёлые', 'Если бы мы были героями фильма, какой это был бы жанр?'),
  ('Весёлые', 'Какую суперсилу ты бы мне дал(а)?'),
  ('Весёлые', 'Какое блюдо описывает наши отношения?'),
  ('Весёлые', 'Какая песня — «наша»?'),
  ('Весёлые', 'Что бы ты сделал(а), если бы мы поменялись телами на день?'),
  ('Весёлые', 'Какое самое странное свидание ты хочешь устроить?'),
  ('Близость', 'Какой мой жест заботы тебе особенно приятен?'),
  ('Близость', 'Когда ты чувствуешь себя ближе всего ко мне?'),
  ('Близость', 'Какой комплимент от меня ты запомнил(а) надолго?'),
  ('Близость', 'Что тебе хочется чаще делать вместе?'),
  ('Ценности', 'Что для тебя самое важное в семье?'),
  ('Ценности', 'Как ты хочешь, чтобы мы решали ссоры?'),
  ('Ценности', 'Какой совет ты дал(а) бы паре, которая только начала встречаться?'),
  ('Ценности', 'Что ты хотел(а) бы, чтобы я знал(а) о тебе лучше?'),
  ('Ценности', 'Какое наше общее достижение ты ценишь больше всего?'),
  ('Ценности', 'За что ты гордишься нами?');
