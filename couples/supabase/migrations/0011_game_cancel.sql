-- Игра «Кто лучше знает»: свой вопрос, который ещё не угадали, можно отменить или изменить ответ.
-- Удалять раунд может только тот, кто его загадал, и только до догадки (секрет удаляется каскадом).
drop policy if exists "game: cancel before guess" on public.game_rounds;
create policy "game: cancel before guess" on public.game_rounds
  for delete using (subject_id = auth.uid() and couple_id = public.my_couple_id() and guessed_at is null);
