-- Общий питомец пары.
-- Применить после 0001_init.sql: SQL Editor → вставить файл → Run.

alter table public.couples
  add column if not exists pet_name  text not null default 'Пушок',
  add column if not exists pet_kind  text not null default 'cat'
    check (pet_kind in ('cat', 'dog', 'bunny', 'bear')),
  add column if not exists pet_pats  integer not null default 0;

-- Погладить питомца: атомарно увеличивает счётчик, чтобы одновременные
-- нажатия обоих партнёров не терялись.
create or replace function public.pet_pat()
returns integer
language sql
security definer set search_path = public
as $$
  update public.couples
     set pet_pats = pet_pats + 1
   where id = public.my_couple_id()
  returning pet_pats;
$$;
