-- Большое обновление: рост питомца и серии дней, голосовые и ответы в чате,
-- альбом «Наши моменты», капсула времени, игра «Кто лучше знает», напоминания.
-- Применить после 0001–0006: SQL Editor → вставить файл → Run.

-- ---------------------------------------------------------------------------
-- Часовой пояс пары (для напоминаний в 9:00 и 20:00 по местному времени)
-- ---------------------------------------------------------------------------
alter table public.couples add column if not exists timezone text not null default 'Asia/Almaty';

-- ---------------------------------------------------------------------------
-- Активность по дням → серии дней и рост питомца
-- ---------------------------------------------------------------------------
create table if not exists public.activity_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  couple_id  uuid not null references public.couples (id) on delete cascade,
  day        date not null,
  primary key (user_id, day)
);

create index if not exists activity_days_couple_idx on public.activity_days (couple_id, day);

alter table public.activity_days enable row level security;
drop policy if exists "activity: couple read" on public.activity_days;
drop policy if exists "activity: own insert" on public.activity_days;
create policy "activity: couple read" on public.activity_days for select using (couple_id = public.my_couple_id());
create policy "activity: own insert" on public.activity_days
  for insert with check (user_id = auth.uid() and couple_id = public.my_couple_id());

-- Статистика пары: дни, когда заходили ОБА, текущая и лучшая серия подряд.
create or replace function public.couple_stats()
returns json
language sql
stable
security definer set search_path = public
as $$
  with both_days as (
    select day
    from public.activity_days
    where couple_id = public.my_couple_id()
    group by day
    having count(distinct user_id) >= 2
  ),
  runs as (
    select day, day - (row_number() over (order by day))::int as grp from both_days
  ),
  streaks as (
    select min(day) as start_day, max(day) as end_day, count(*) as len from runs group by grp
  ),
  local_today as (
    select (now() at time zone coalesce((select timezone from public.couples where id = public.my_couple_id()), 'Asia/Almaty'))::date as d
  )
  select json_build_object(
    'days_together', (select count(*) from both_days),
    'streak', coalesce((select len from streaks, local_today where end_day >= local_today.d - 1 order by end_day desc limit 1), 0),
    'best_streak', coalesce((select max(len) from streaks), 0),
    'today_both', exists (select 1 from both_days, local_today where day = local_today.d)
  );
$$;

-- ---------------------------------------------------------------------------
-- Чат: ответы и голосовые сообщения
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists reply_to uuid references public.messages (id) on delete set null;
alter table public.messages add column if not exists media_duration numeric;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'thinking', 'media', 'voice'));

alter table public.messages drop constraint if exists messages_media_check;
alter table public.messages add constraint messages_media_check check (
  (kind not in ('media', 'voice') and media_path is null)
  or (kind = 'media' and media_type in ('image', 'video') and media_path like couple_id::text || '/%')
  or (kind = 'voice' and media_type = 'audio' and media_path like couple_id::text || '/%')
);

update storage.buckets
   set allowed_mime_types = array['image/*', 'video/*', 'audio/*']
 where id = 'chat-media';

-- ---------------------------------------------------------------------------
-- Альбом «Наши моменты»: воспоминания с фото/видео, датой и подписью
-- ---------------------------------------------------------------------------
create table if not exists public.moments (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default '',
  happened_on  date not null default current_date,
  media_path   text not null,
  media_type   text not null check (media_type in ('image', 'video')),
  media_width  integer,
  media_height integer,
  created_at   timestamptz not null default now(),
  check (media_path like couple_id::text || '/%')
);

create index if not exists moments_couple_idx on public.moments (couple_id, happened_on desc);

alter table public.moments enable row level security;
drop policy if exists "moments: couple all" on public.moments;
create policy "moments: couple all" on public.moments
  for all using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());

-- ---------------------------------------------------------------------------
-- Капсула времени: письмо партнёру, которое откроется в выбранный день
-- ---------------------------------------------------------------------------
create table if not exists public.capsules (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null check (length(body) between 1 and 5000),
  open_on     date not null,
  created_at  timestamptz not null default now()
);

alter table public.capsules enable row level security;
-- Читать таблицу напрямую может только автор; получатель видит письма через capsule_list(),
-- который отдаёт текст только после даты открытия.
drop policy if exists "capsules: author read" on public.capsules;
drop policy if exists "capsules: author insert" on public.capsules;
drop policy if exists "capsules: author delete" on public.capsules;
create policy "capsules: author read" on public.capsules for select using (author_id = auth.uid());
create policy "capsules: author insert" on public.capsules
  for insert with check (author_id = auth.uid() and couple_id = public.my_couple_id() and open_on > current_date);
create policy "capsules: author delete" on public.capsules for delete using (author_id = auth.uid());

create or replace function public.capsule_list()
returns table (id uuid, author_id uuid, open_on date, created_at timestamptz, is_open boolean, body text)
language sql
stable
security definer set search_path = public
as $$
  select c.id, c.author_id, c.open_on, c.created_at,
         c.open_on <= (now() at time zone cp.timezone)::date as is_open,
         case when c.author_id = auth.uid() or c.open_on <= (now() at time zone cp.timezone)::date then c.body end as body
  from public.capsules c
  join public.couples cp on cp.id = c.couple_id
  where c.couple_id = public.my_couple_id()
  order by c.open_on desc, c.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Игра «Кто лучше знает»: один отвечает о себе, второй угадывает
-- ---------------------------------------------------------------------------
create table if not exists public.game_rounds (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  subject_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_idx  integer not null,
  guess         integer,
  correct       boolean,
  guessed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists game_rounds_couple_idx on public.game_rounds (couple_id, created_at desc);

-- Ответ загадавшего лежит отдельно: партнёр не видит его, пока не угадает.
create table if not exists public.game_secrets (
  round_id  uuid primary key references public.game_rounds (id) on delete cascade,
  answer    integer not null
);

alter table public.game_rounds enable row level security;
alter table public.game_secrets enable row level security;

drop policy if exists "game: couple read" on public.game_rounds;
drop policy if exists "game: own insert" on public.game_rounds;
create policy "game: couple read" on public.game_rounds for select using (couple_id = public.my_couple_id());
create policy "game: own insert" on public.game_rounds
  for insert with check (subject_id = auth.uid() and couple_id = public.my_couple_id() and guess is null and guessed_at is null);

drop policy if exists "game secrets: visible after guess" on public.game_secrets;
drop policy if exists "game secrets: subject insert" on public.game_secrets;
create policy "game secrets: visible after guess" on public.game_secrets for select using (
  exists (
    select 1 from public.game_rounds r
    where r.id = round_id and r.couple_id = public.my_couple_id() and (r.subject_id = auth.uid() or r.guessed_at is not null)
  )
);
create policy "game secrets: subject insert" on public.game_secrets for insert with check (
  exists (select 1 from public.game_rounds r where r.id = round_id and r.subject_id = auth.uid() and r.guessed_at is null)
);

-- Угадать: только партнёр загадавшего и только один раз.
create or replace function public.game_guess(round_id uuid, choice integer)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  r public.game_rounds;
  secret integer;
begin
  select * into r from public.game_rounds where id = round_id and couple_id = public.my_couple_id() for update;
  if r.id is null then raise exception 'round not found'; end if;
  if r.subject_id = auth.uid() then raise exception 'cannot guess own round'; end if;
  if r.guessed_at is not null then raise exception 'already guessed'; end if;
  select answer into secret from public.game_secrets where game_secrets.round_id = r.id;
  if secret is null then raise exception 'round not ready'; end if;

  update public.game_rounds
     set guess = choice, correct = (choice = secret), guessed_at = now()
   where id = r.id;
  return json_build_object('correct', choice = secret, 'answer', secret);
end;
$$;

-- ---------------------------------------------------------------------------
-- Журнал напоминаний (чтобы не прислать одно и то же дважды)
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_log (
  couple_id  uuid not null references public.couples (id) on delete cascade,
  kind       text not null,
  ref        text not null default '',
  day        date not null,
  sent_at    timestamptz not null default now(),
  primary key (couple_id, kind, ref, day)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Уведомления о новом раунде и разгаданном ответе
-- ---------------------------------------------------------------------------
drop trigger if exists notify_on_game_round on public.game_rounds;
create trigger notify_on_game_round
  after insert on public.game_rounds
  for each row execute function public.notify_partner();

drop trigger if exists notify_on_game_guess on public.game_rounds;
create trigger notify_on_game_guess
  after update of guessed_at on public.game_rounds
  for each row when (old.guessed_at is null and new.guessed_at is not null)
  execute function public.notify_partner();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['moments', 'game_rounds', 'game_secrets', 'activity_days'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
