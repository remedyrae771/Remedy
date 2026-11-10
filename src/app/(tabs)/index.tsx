import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Input, Muted, Screen, SectionLabel, styles } from '../../components/ui';
import { daysBetween, nextOccurrence, parseISODate, pluralDays, relativeDays, today } from '../../lib/dates';
import { MOODS, moodLabel } from '../../lib/moods';
import { errorText, supabase } from '../../lib/supabase';
import type { CoupleEvent } from '../../lib/types';
import { useAuth, useCouple } from '../../providers/AuthProvider';
import { colors, spacing } from '../../theme';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export default function Home() {
  const { updateProfile } = useAuth();
  const { coupleId, profile, couple, partner } = useCouple();
  const [nextEvent, setNextEvent] = useState<{ event: CoupleEvent; days: number } | null>(null);
  const [note, setNote] = useState(profile.mood_note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sentThinking, setSentThinking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('events')
        .select('*')
        .eq('couple_id', coupleId)
        .then(({ data }) => {
          const upcoming = (data ?? [])
            .map((event: CoupleEvent) => ({
              event,
              days: daysBetween(today(), nextOccurrence(event.date, event.repeats_yearly)),
            }))
            .filter((e) => e.days >= 0)
            .sort((a, b) => a.days - b.days);
          setNextEvent(upcoming[0] ?? null);
        });
    }, [coupleId]),
  );

  const daysTogether = couple?.started_on ? daysBetween(parseISODate(couple.started_on), today()) : null;

  const setMood = async (emoji: string) => {
    setError(null);
    Haptics.selectionAsync();
    try {
      await updateProfile({ mood: emoji, mood_note: note.trim() || null, mood_updated_at: new Date().toISOString() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const saveNote = async () => {
    if (!profile.mood) return;
    try {
      await updateProfile({ mood_note: note.trim() || null, mood_updated_at: new Date().toISOString() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const sendThinking = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const { error: e } = await supabase
      .from('messages')
      .insert({ couple_id: coupleId, body: 'Думаю о тебе 💭', kind: 'thinking' });
    if (e) setError(errorText(e));
    else {
      setSentThinking(true);
      setTimeout(() => setSentThinking(false), 3000);
    }
  };

  return (
    <Screen>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.title}>
          {profile.display_name || 'Я'} {partner ? `& ${partner.display_name || 'партнёр'}` : ''}
        </Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Настройки">
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </Pressable>
      </View>

      {!partner && couple && (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
          <Text style={styles.body}>Ждём партнёра! Отправьте этот код:</Text>
          <Text style={{ fontSize: 36, fontWeight: '800', letterSpacing: 6, color: colors.primary, textAlign: 'center' }}>
            {couple.invite_code}
          </Text>
          <Button
            title="Поделиться кодом"
            onPress={() =>
              Share.share({ message: `Присоединяйся ко мне в Remedy 💞 Код пары: ${couple.invite_code}` })
            }
          />
        </Card>
      )}

      <Card style={{ alignItems: 'center' }}>
        {daysTogether !== null && daysTogether >= 0 ? (
          <>
            <Text style={{ fontSize: 48, fontWeight: '800', color: colors.primary }}>{daysTogether}</Text>
            <Text style={styles.body}>{pluralDays(daysTogether)} вместе</Text>
          </>
        ) : (
          <>
            <Text style={styles.body}>Когда начались ваши отношения?</Text>
            <Button title="Указать дату" variant="secondary" onPress={() => router.push('/settings')} />
          </>
        )}
      </Card>

      {partner && (
        <>
          <SectionLabel>Настроение {partner.display_name || 'партнёра'}</SectionLabel>
          <Card>
            {partner.mood ? (
              <View style={styles.row}>
                <Text style={{ fontSize: 40 }}>{partner.mood}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.body}>{moodLabel(partner.mood)}</Text>
                  {partner.mood_note ? <Text style={styles.body}>«{partner.mood_note}»</Text> : null}
                  <Muted>{timeAgo(partner.mood_updated_at)}</Muted>
                </View>
              </View>
            ) : (
              <Muted>Пока не отметил(а) настроение</Muted>
            )}
            <Button
              title={sentThinking ? 'Отправлено 💕' : 'Думаю о тебе 💭'}
              variant="secondary"
              onPress={sendThinking}
              disabled={sentThinking}
            />
          </Card>
        </>
      )}

      <SectionLabel>Моё настроение</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {MOODS.map((m) => (
            <Chip key={m.emoji} label={`${m.emoji} ${m.label}`} selected={profile.mood === m.emoji} onPress={() => setMood(m.emoji)} />
          ))}
        </View>
        <Input
          placeholder="Пара слов о том, как прошёл день…"
          value={note}
          onChangeText={setNote}
          onEndEditing={saveNote}
          maxLength={140}
        />
        <ErrorText>{error}</ErrorText>
      </Card>

      {nextEvent && (
        <>
          <SectionLabel>Ближайшая дата</SectionLabel>
          <Pressable onPress={() => router.push('/dates')}>
            <Card style={styles.row}>
              <Text style={{ fontSize: 32 }}>{nextEvent.event.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{nextEvent.event.title}</Text>
                <Muted>{relativeDays(nextEvent.days)}</Muted>
              </View>
            </Card>
          </Pressable>
        </>
      )}

      <Pressable onPress={() => router.push('/questions')}>
        <Card style={[styles.row, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <Text style={{ fontSize: 28 }}>💬</Text>
          <Text style={[styles.body, { color: '#fff', flex: 1, fontWeight: '600' }]}>Ответьте на вопрос дня</Text>
          <Text style={{ color: '#fff', fontSize: 20 }}>›</Text>
        </Card>
      </Pressable>
    </Screen>
  );
}
