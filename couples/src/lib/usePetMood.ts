import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { PetMood } from '../components/Pet';
import { dayIndex, today } from './dates';
import { supabase } from './supabase';
import type { Profile } from './types';

export type PetTask = { key: string; label: string; done: boolean };

const isToday = (iso: string | null | undefined) => {
  if (!iso) return false;
  const d = new Date(iso);
  const t = today();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
};

/**
 * Настроение питомца складывается из того, что пара сделала сегодня:
 * отметили настроение, ответили на вопрос дня, написали друг другу.
 */
export function usePetMood(coupleId: string, userId: string, profile: Profile, partner: Profile | null, partnerName: string) {
  const [answeredMe, setAnsweredMe] = useState(false);
  const [answeredPartner, setAnsweredPartner] = useState(false);
  const [talked, setTalked] = useState(false);

  const load = useCallback(async () => {
    const { data: questions } = await supabase.from('questions').select('id').order('id');
    const q = questions?.length ? questions[dayIndex() % questions.length].id : null;
    const start = today().toISOString();
    const [mine, theirs, msgs] = await Promise.all([
      q ? supabase.from('answers').select('id').eq('question_id', q).eq('user_id', userId).maybeSingle() : null,
      q ? supabase.rpc('partner_answered', { q }) : null,
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('couple_id', coupleId).gte('created_at', start),
    ]);
    setAnsweredMe(Boolean(mine?.data));
    setAnsweredPartner(Boolean(theirs?.data));
    setTalked((msgs.count ?? 0) > 0);
  }, [coupleId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const tasks: PetTask[] = [
    { key: 'mood-me', label: 'Отметить своё настроение', done: isToday(profile.mood_updated_at) },
    { key: 'mood-partner', label: `${partnerName} отмечает настроение`, done: isToday(partner?.mood_updated_at) },
    { key: 'q-me', label: 'Ответить на вопрос дня', done: answeredMe },
    { key: 'q-partner', label: `${partnerName} отвечает на вопрос`, done: answeredPartner },
    { key: 'chat', label: 'Написать друг другу', done: talked },
  ];
  const score = tasks.filter((t) => t.done).length;
  const hour = new Date().getHours();

  let mood: PetMood;
  if (hour < 7 && score < 5) mood = 'sleepy';
  else if (score >= 4) mood = 'happy';
  else if (score >= 1) mood = 'ok';
  else mood = 'sad';

  return { mood, tasks, score, reload: load };
}
