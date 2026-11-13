import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { colors, spacing } from '../theme';
import { Card, ErrorText, Muted, styles } from './ui';

/** Виды уведомлений — те же ключи, что проверяют серверные функции notify и reminders. */
export const NOTIFY_CATEGORIES = [
  { key: 'messages', emoji: '💌', label: 'Сообщения', hint: 'Текст, фото, видео, голосовые, ответы' },
  { key: 'thinking', emoji: '💭', label: '«Думаю о тебе»', hint: '' },
  { key: 'reactions', emoji: '❤️', label: 'Реакции на ваши сообщения', hint: '' },
  { key: 'mood', emoji: '🙂', label: 'Настроение партнёра', hint: '' },
  { key: 'question', emoji: '💬', label: 'Вопрос дня', hint: 'Ответ партнёра и вечернее напоминание' },
  { key: 'game', emoji: '🎯', label: 'Игра «Кто лучше знает»', hint: '' },
  { key: 'moments', emoji: '📸', label: 'Новые моменты в альбоме', hint: '' },
  { key: 'capsules', emoji: '⏳', label: 'Капсула времени', hint: 'Новое письмо и день открытия' },
  { key: 'dates', emoji: '📅', label: 'Важные даты', hint: 'Новые даты, годовщина, напоминания в 9:00' },
  { key: 'lists', emoji: '📝', label: 'Общие списки', hint: 'Новые пункты' },
  { key: 'pet', emoji: '🐱', label: 'Питомец', hint: 'Вырос, скучает, серия дней 🔥' },
] as const;

/** Включение и выключение отдельных видов уведомлений (по умолчанию все включены). */
export default function NotifyPrefs() {
  const { profile, updateProfile } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => profile?.notify_prefs ?? {});
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: string, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setError(null);
    try {
      await updateProfile({ notify_prefs: next });
    } catch {
      setPrefs(prefs);
      setError('Не получилось сохранить. Проверьте интернет.');
    }
  };

  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '700' }]}>Что присылать</Text>
      {NOTIFY_CATEGORIES.map((c) => (
        <View key={c.key} style={[styles.row, { justifyContent: 'space-between', paddingVertical: 2 }]}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[styles.body, { fontSize: 15 }]}>
              {c.emoji} {c.label}
            </Text>
            {c.hint ? <Text style={{ fontSize: 12, color: colors.muted }}>{c.hint}</Text> : null}
          </View>
          <Switch
            value={prefs[c.key] !== false}
            onValueChange={(v) => toggle(c.key, v)}
            trackColor={{ true: colors.primary, false: '#E4D8DE' }}
            thumbColor="#FFFFFF"
            // В браузере у включённого переключателя свой цвет кружка — тоже делаем белым.
            {...({ activeThumbColor: '#FFFFFF' } as object)}
            accessibilityLabel={c.label}
          />
        </View>
      ))}
      <ErrorText>{error}</ErrorText>
      <Muted style={{ marginTop: spacing.xs }}>Настройки сохраняются сразу и действуют на всех ваших устройствах.</Muted>
    </Card>
  );
}
