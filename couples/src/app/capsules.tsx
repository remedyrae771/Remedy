import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GradientFill } from '../components/Gradient';
import { Button, Chip, ErrorText, Input, Muted, Screen } from '../components/ui';
import { daysBetween, formatDate, nextOccurrence, parseISODate, parseUserDate, pluralDays, toISODate, today } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useCouple } from '../providers/AuthProvider';
import { colors, radius, shadows, spacing } from '../theme';

type Capsule = { id: string; author_id: string; open_on: string; created_at: string; is_open: boolean; body: string | null };

const addDays = (n: number) => {
  const d = today();
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

export default function Capsules() {
  const { coupleId, userId, partner, couple } = useCouple();
  const [list, setList] = useState<Capsule[]>([]);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [when, setWhen] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partnerName = partner?.display_name || 'партнёр';

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('capsule_list');
    setList((data as Capsule[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const startedOn = couple?.started_on ?? null;
  const presets = useMemo(() => {
    const out: { label: string; date: string }[] = [
      { label: 'Через неделю', date: addDays(7) },
      { label: 'Через месяц', date: addDays(30) },
      { label: 'Через год', date: addDays(365) },
    ];
    if (startedOn) {
      const anniversary = toISODate(nextOccurrence(startedOn, true, parseISODate(addDays(1))));
      out.splice(2, 0, { label: 'К годовщине 💞', date: anniversary });
    }
    return out;
  }, [startedOn]);

  const save = async () => {
    setError(null);
    const date = when === 'custom' ? parseUserDate(custom) : when;
    if (!body.trim()) return setError('Напишите письмо.');
    if (!date) return setError(when === 'custom' ? 'Дата в формате ДД.ММ.ГГГГ.' : 'Выберите, когда письмо откроется.');
    if (daysBetween(today(), parseISODate(date)) < 1) return setError('Дата открытия должна быть в будущем.');
    setSaving(true);
    const { error: e } = await supabase.from('capsules').insert({ couple_id: coupleId, body: body.trim(), open_on: date });
    setSaving(false);
    if (e) return setError('Не получилось запечатать письмо. Попробуйте ещё раз.');
    setBody('');
    setWhen(null);
    setCustom('');
    setWriting(false);
    load();
  };

  const forMe = list.filter((c) => c.author_id !== userId);
  const fromMe = list.filter((c) => c.author_id === userId);

  const renderCapsule = (c: Capsule) => {
    const days = daysBetween(today(), parseISODate(c.open_on));
    const mine = c.author_id === userId;
    if (!c.is_open && !mine) {
      return (
        <View key={c.id} style={[s.envelope, s.sealed]}>
          <GradientFill colors={['#F9D9E4', '#EBD9F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <Text style={{ fontSize: 40 }}>💌</Text>
          <Text style={s.envelopeTitle}>Письмо от {partnerName}</Text>
          <Text style={s.countdown}>
            откроется через {days} {pluralDays(days)}
          </Text>
          <Muted>{formatDate(c.open_on)}</Muted>
        </View>
      );
    }
    return (
      <View key={c.id} style={s.envelope}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.envelopeTitle}>{mine ? (c.is_open ? '✉️ Ваше письмо (открыто)' : '🔒 Ваше письмо') : `💌 От ${partnerName}`}</Text>
          <Muted>{formatDate(c.open_on)}</Muted>
        </View>
        <Text style={s.letter}>{c.body}</Text>
        {mine && !c.is_open ? (
          <Muted>
            {partnerName} увидит его через {days} {pluralDays(days)}
          </Muted>
        ) : null}
      </View>
    );
  };

  return (
    <Screen edges={['bottom']}>
      <View style={s.hero}>
        <GradientFill colors={['#FFE7DA', '#FBD3E0', '#EBD9F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={{ fontSize: 44 }}>⏳💌</Text>
        <Text style={s.heroTitle}>Капсула времени</Text>
        <Text style={s.heroText}>Напишите письмо {partnerName} — оно откроется только в выбранный день. До этого будет виден лишь запечатанный конверт.</Text>
      </View>

      {writing ? (
        <View style={s.card}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={`Дорогой(ая) ${partnerName}…`}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={5000}
            style={s.textarea}
          />
          <Text style={s.label}>Когда открыть?</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {presets.map((p) => (
              <Chip key={p.label} label={p.label} selected={when === p.date} onPress={() => setWhen(p.date)} />
            ))}
            <Chip label="Своя дата" selected={when === 'custom'} onPress={() => setWhen('custom')} />
          </View>
          {when === 'custom' ? (
            <Input placeholder="ДД.ММ.ГГГГ" value={custom} onChangeText={setCustom} maxLength={10} keyboardType="numbers-and-punctuation" />
          ) : when ? (
            <Muted>Откроется {formatDate(when)}</Muted>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button title="🔒 Запечатать письмо" onPress={save} loading={saving} />
          <Button title="Отмена" variant="ghost" onPress={() => setWriting(false)} />
        </View>
      ) : (
        <Button title="✍️ Написать письмо в будущее" onPress={() => setWriting(true)} />
      )}

      {forMe.length ? <Text style={s.section}>Для вас</Text> : null}
      {forMe.map(renderCapsule)}
      {fromMe.length ? <Text style={s.section}>Вы написали</Text> : null}
      {fromMe.map(renderCapsule)}
      {!list.length && !writing ? <Muted style={{ alignItems: 'center' }}>Пока писем нет. Напишите первое!</Muted> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hero: { borderRadius: radius.lg, overflow: 'hidden', padding: spacing.lg, alignItems: 'center', gap: 6, boxShadow: shadows.raised },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  heroText: { fontSize: 14, color: colors.text, textAlign: 'center', opacity: 0.8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, boxShadow: shadows.card },
  textarea: {
    minHeight: 160,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    textAlignVertical: 'top',
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#FFFBF5',
    borderWidth: 1,
    borderColor: '#F3E3D3',
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: spacing.xs },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm },
  envelope: { backgroundColor: '#FFFBF5', borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, boxShadow: shadows.card, borderWidth: 1, borderColor: '#F3E3D3' },
  sealed: { alignItems: 'center', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.9)' },
  envelopeTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  countdown: { fontSize: 15, fontWeight: '700', color: colors.primaryDeep },
  letter: { fontSize: 17, lineHeight: 25, color: colors.text },
});
