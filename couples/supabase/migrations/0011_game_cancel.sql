-- Игра «Кто лучше знает»: вопрос, который ещё не угадали, можно отменить или пропустить.
-- Удалять раунд может любой из пары, но только пока догадки не было (секрет удаляется каскадом).
drop policy if exists "game: cancel before guess" on public.game_rounds;
create policy "game: cancel before guess" on public.game_rounds
  for delete using (couple_id = public.my_couple_id() and guessed_at is null);
