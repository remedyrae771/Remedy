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
  relativeDays,
  today,
} from '../../lib/dates';
import { confirmAction } from '../../lib/platform';
import { errorText, supabase } from '../../lib/supabase';
import type { CoupleEvent } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, spacing } from '../../theme';

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
        subtitle: event.repeats_yearly && years > 0 ? `исполнится ${years} — ` : '',
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
          subtitle: `${years}-я годовщина — `,
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
        <View key={row.key}>
          {i > 0 && row.days < 0 && rows[i - 1].days >= 0 ? <SectionLabel>Прошедшие</SectionLabel> : null}
          <Pressable onLongPress={row.event ? () => remove(row.event!) : undefined} delayLongPress={400}>
            <Card style={[styles.row, row.days < 0 && { opacity: 0.6 }]}>
              <Text style={{ fontSize: 32 }}>{row.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{row.title}</Text>
                <Muted>
                  {row.subtitle}
                  {row.key === 'milestone' ? '' : formatDate(row.date)}
                </Muted>
              </View>
              <Text style={{ color: row.days === 0 ? colors.primary : colors.muted, fontWeight: '600' }}>
                {relativeDays(row.days)}
              </Text>
            </Card>
          </Pressable>
        </View>
      ))}

      {rows.some((r) => r.event) ? <Muted>Удерживайте дату, чтобы удалить её.</Muted> : null}
    </Screen>
  );
}
