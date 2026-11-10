-- Исправление: в Supabase pgcrypto установлен в схему extensions, поэтому
-- gen_random_bytes() не находился. Код приглашения теперь строится из
-- gen_random_uuid() — встроенной функции Postgres, доступной везде.

create or replace function public.create_couple()
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
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.couples where invite_code = code);
  end loop;

  insert into public.couples (invite_code, created_by)
  values (code, auth.uid())
  returning * into c;

  update public.profiles set couple_id = c.id where id = auth.uid();
  return c;
end;
$$;
