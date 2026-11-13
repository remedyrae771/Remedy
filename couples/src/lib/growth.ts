import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from './supabase';

/** Стадии роста питомца: растёт за дни, когда в приложение заходили вы оба. */
export const STAGES = [
  { from: 0, name: 'Малыш', scale: 0.8 },
  { from: 3, name: 'Растёт', scale: 0.88 },
  { from: 10, name: 'Подросток', scale: 0.95 },
  { from: 30, name: 'Взрослый', scale: 1 },
  { from: 100, name: 'Легенда', scale: 1.04 },
] as const;

export type Stage = { index: number; name: string; scale: number; next: string | null; daysToNext: number; progress: number };

export function stageFor(days: number): Stage {
  let index = 0;
  STAGES.forEach((s, i) => {
    if (days >= s.from) index = i;
  });
  const current = STAGES[index];
  const next = STAGES[index + 1];
  return {
    index,
    name: current.name,
    scale: current.scale,
    next: next?.name ?? null,
    daysToNext: next ? next.from - days : 0,
    progress: next ? (days - current.from) / (next.from - current.from) : 1,
  };
}

export type CoupleStats = { days_together: number; streak: number; best_streak: number; today_both: boolean };

/** Статистика пары с сервера (серии дней, дни вместе), обновляется при каждом заходе на экран. */
export function useCoupleStats() {
  const [stats, setStats] = useState<CoupleStats | null>(null);
  useFocusEffect(
    useCallback(() => {
      supabase.rpc('couple_stats').then(({ data }) => {
        if (data) setStats(data as CoupleStats);
      });
    }, []),
  );
  return stats;
}

/** Отметить, что сегодня заходили (один раз за день на устройстве). */
let markedDay = '';
export function markActiveToday(coupleId: string) {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (markedDay === day) return;
  markedDay = day;
  supabase
    .from('activity_days')
    .upsert({ couple_id: coupleId, day }, { onConflict: 'user_id,day', ignoreDuplicates: true })
    .then(({ error }) => {
      if (error) markedDay = '';
    });
}
