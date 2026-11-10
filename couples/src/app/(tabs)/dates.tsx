import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Input, Muted, Screen, SectionLabel, Title, styles } from '../../components/ui';
import {
  daysBetween,
  formatDate,
  nextOccurrence,
  parseISODate,
  parseUserDate,
  pluralDays,
  toISODate,
  today,
} from '../../lib/dates';
import { confirmAction } from '../../lib/platform';
import { errorText, supabase } from '../../lib/supabase';
import type { CoupleEvent } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, radius, spacing } from '../../theme';

const EMOJIS = ['📅', '💍', '🎂', '❤️', '✈️', '🍷', '🎁', '🎉'];

type Row = {
  key: string;
  emoji: string;
  title: string;
  date: string;
  days: number;
  subtitle: string;
  event?: CoupleEvent;
};

export default function Dates() {
  const { coupleId, couple } = useCouple();
  const [events, setEvents] = useState<CoupleEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [yearly, setYearly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('events').select('*').eq('couple_id', coupleId);
    setEvents((data as CoupleEvent[]) ?? []);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`events-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const startedOn = couple?.started_on ?? null;
  const rows = useMemo<Row[]>(() => {
    const now = today();
    const list: Row[] = events.map((event) => {
      const next = nextOccurrence(event.date, event.repeats_yearly, now);
      const years = next.getFullYear() - parseISODate(event.date).getFullYear();
      return {
        key: event.id,
        emoji: event.emoji,
        title: event.title,
        date: event.date,
        days: daysBetween(now, next),
        subtitle: event.repeats_yearly && years > 0 ? `${years}-я годовщина · ` : '',
        event,
      };
    });

    if (startedOn) {
      const next = nextOccurrence(startedOn, true, now);
      const years = next.getFullYear() - parseISODate(startedOn).getFullYear();
      if (years > 0) {
        list.push({
          key: 'anniversary',
          emoji: '💞',
          title: 'Наша годовщина',
          date: startedOn,
          days: daysBetween(now, next),
          subtitle: `${years}-я годовщина · `,
        });
      }
      // Круглые даты: 100, 500, 1000… дней вместе.
      const together = daysBetween(parseISODate(startedOn), now);
      const milestone = [100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000].find((m) => m >= together);
      if (milestone) {
        list.push({
          key: 'milestone',
          emoji: '✨',
          title: `${milestone} дней вместе`,
          date: startedOn,
          days: milestone - together,
          subtitle: '',
        });
      }
    }

    return list.sort((a, b) => {
      const aPast = a.days < 0;
      const bPast = b.days < 0;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? b.days - a.days : a.days - b.days;
    });
  }, [events, startedOn]);

  const add = async () => {
    setError(null);
    const iso = parseUserDate(dateInput);
    if (!title.trim()) return setError('Введите название.');
    if (!iso) return setError('Дата в формате ДД.ММ.ГГГГ, например 14.02.2025.');
    setSaving(true);
    const { error: e } = await supabase
      .from('events')
      .insert({ couple_id: coupleId, title: title.trim(), date: iso, emoji, repeats_yearly: yearly });
    setSaving(false);
    if (e) return setError(errorText(e));
    setTitle('');
    setDateInput('');
    setShowForm(false);
    load();
  };

  const remove = (event: CoupleEvent) => {
    confirmAction('Удалить дату?', event.title, 'Удалить', async () => {
      await supabase.from('events').delete().eq('id', event.id);
      load();
    });
  };

  return (
    <Screen>
      <Title subtitle="Годовщины, дни рождения и планы">Важные даты</Title>

      {showForm ? (
        <Card>
          <Input placeholder="Название (например, День рождения Ани)" value={title} onChangeText={setTitle} />
          <Input
            placeholder="ДД.ММ.ГГГГ"
            value={dateInput}
            onChangeText={setDateInput}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
            ))}
          </View>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={styles.body}>Повторять каждый год</Text>
            <Switch value={yearly} onValueChange={setYearly} trackColor={{ true: colors.primary }} />
          </View>
          <ErrorText>{error}</ErrorText>
          <Button title="Сохранить" onPress={add} loading={saving} />
          <Button title="Отмена" variant="ghost" onPress={() => setShowForm(false)} />
        </Card>
      ) : (
        <Button title="+ Добавить дату" onPress={() => setShowForm(true)} />
      )}

      {rows.length === 0 && !showForm ? (
        <Muted>Добавьте первую дату — годовщину, день рождения или ближайшее свидание.</Muted>
      ) : null}

      {rows.map((row, i) => (
        <View key={row.key} style={{ gap: spacing.sm }}>
          {i > 0 && row.days < 0 && rows[i - 1].days >= 0 ? <SectionLabel>Прошедшие</SectionLabel> : null}
          <Pressable onLongPress={row.event ? () => remove(row.event!) : undefined} delayLongPress={400}>
            <Card style={[styles.row, { gap: spacing.md, paddingVertical: spacing.md }, row.days < 0 && { opacity: 0.6 }]}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 24 }}>{row.emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.body, { fontWeight: '600' }]} numberOfLines={2}>
                  {row.title}
                </Text>
                <Muted>
                  {row.subtitle}
                  {formatDate(row.key === 'milestone' ? toISODate(addDays(today(), row.days)) : row.date)}
                </Muted>
              </View>
              <DaysBadge days={row.days} />
            </Card>
          </Pressable>
        </View>
      ))}

      {rows.some((r) => r.event) ? <Muted>Удерживайте дату, чтобы удалить её.</Muted> : null}
    </Screen>
  );
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Плашка «сколько осталось»: крупное число дней, акцент для ближайших дат. */
function DaysBadge({ days }: { days: number }) {
  const soon = days >= 0 && days <= 30;
  const base = {
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    backgroundColor: soon ? colors.primarySoft : colors.background,
  };
  if (days === 0 || days === 1) {
    return (
      <View style={[base, { backgroundColor: colors.primary }]}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{days === 0 ? 'Сегодня' : 'Завтра'}</Text>
      </View>
    );
  }
  const n = Math.abs(days);
  return (
    <View style={base}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: soon ? colors.primary : colors.text, fontVariant: ['tabular-nums'] }}>
        {n}
      </Text>
      <Text style={{ fontSize: 11, color: colors.muted }}>{days < 0 ? `${pluralDays(n)} назад` : pluralDays(n)}</Text>
    </View>
  );
}
