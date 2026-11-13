-- Своё имя для партнёра («Зайка», «Солнце»): показывается только у того, кто его задал.
alter table public.profiles add column if not exists partner_nickname text;

alter table public.profiles drop constraint if exists profiles_partner_nickname_len;
alter table public.profiles add constraint profiles_partner_nickname_len check (partner_nickname is null or length(partner_nickname) <= 30);
