export const MOODS = [
  { emoji: '🥰', label: 'Влюблён(а)' },
  { emoji: '😊', label: 'Хорошо' },
  { emoji: '😌', label: 'Спокойно' },
  { emoji: '😴', label: 'Устал(а)' },
  { emoji: '😔', label: 'Грустно' },
  { emoji: '😤', label: 'Злюсь' },
  { emoji: '🤒', label: 'Болею' },
  { emoji: '🤗', label: 'Хочу обнимашек' },
] as const;

export function moodLabel(emoji: string | null | undefined): string {
  return MOODS.find((m) => m.emoji === emoji)?.label ?? '';
}
