import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MediaViewer, useMediaUrl } from '../components/Media';
import { Button, Chip, ErrorText, Input, Muted, Screen } from '../components/ui';
import { parseUserDate, toISODate, today } from '../lib/dates';
import { pickMedia, uploadMedia, type PickedMedia } from '../lib/media';
import { supabase } from '../lib/supabase';
import type { Message } from '../lib/types';
import { useCouple } from '../providers/AuthProvider';
import { colors, radius, shadows, spacing } from '../theme';

type Moment = {
  id: string;
  title: string;
  happened_on: string;
  media_path: string;
  media_type: 'image' | 'video';
  media_width: number | null;
  media_height: number | null;
  created_at: string;
};

type Item = { key: string; message: Message; title?: string; date: string; isMoment: boolean };

/** Альбом показывает файлы через тот же просмотрщик, что и чат: превращаем момент в «сообщение». */
const momentToMessage = (m: Moment, coupleId: string): Message => ({
  id: m.id,
  couple_id: coupleId,
  sender_id: '',
  body: m.title,
  kind: 'media',
  created_at: m.created_at,
  media_path: m.media_path,
  media_type: m.media_type,
  media_width: m.media_width,
  media_height: m.media_height,
});

function Tile({ item, size, onPress }: { item: Item; size: number; onPress: () => void }) {
  const url = useMediaUrl(item.message);
  const video = item.message.media_type === 'video';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, { width: size, height: size }, pressed && { transform: [{ scale: 0.96 }] }]}>
      {url && !video ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {video ? (
        <View style={[StyleSheet.absoluteFill, s.video]}>
          <Text style={{ color: '#fff', fontSize: 22 }}>▶</Text>
        </View>
      ) : null}
      {item.isMoment ? (
        <View style={s.badge}>
          <Text style={s.badgeText} numberOfLines={1}>
            ⭐ {item.title || 'Момент'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function Album() {
  const { coupleId } = useCouple();
  const { width } = useWindowDimensions();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [media, setMedia] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'all' | 'moments'>('all');
  const [viewer, setViewer] = useState<Message | null>(null);
  const [draft, setDraft] = useState<PickedMedia | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: m }, { data: msgs }] = await Promise.all([
      supabase.from('moments').select('*').eq('couple_id', coupleId).order('happened_on', { ascending: false }),
      supabase.from('messages').select('*').eq('couple_id', coupleId).eq('kind', 'media').order('created_at', { ascending: false }).limit(300),
    ]);
    setMoments((m as Moment[]) ?? []);
    setMedia((msgs as Message[]) ?? []);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const items = useMemo<Item[]>(() => {
    const fromMoments = moments.map((m) => ({ key: `m-${m.id}`, message: momentToMessage(m, coupleId), title: m.title, date: m.happened_on, isMoment: true }));
    if (filter === 'moments') return fromMoments;
    const fromChat = media.map((m) => ({ key: `c-${m.id}`, message: m, date: m.created_at.slice(0, 10), isMoment: false }));
    return [...fromMoments, ...fromChat].sort((a, b) => b.date.localeCompare(a.date));
  }, [moments, media, filter, coupleId]);

  const columns = 3;
  const tile = Math.floor((Math.min(width, 640) - spacing.lg * 2 - spacing.sm * (columns - 1)) / columns);

  const pick = async () => {
    setError(null);
    try {
      const picked = await pickMedia();
      if (picked) {
        setDraft(picked);
        setTitle('');
        setDate('');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    if (!draft) return;
    const iso = date.trim() ? parseUserDate(date) : toISODate(today());
    if (!iso) return setError('Дата в формате ДД.ММ.ГГГГ.');
    setSaving(true);
    setError(null);
    try {
      const path = await uploadMedia(coupleId, draft);
      const { error: e } = await supabase.from('moments').insert({
        couple_id: coupleId,
        title: title.trim(),
        happened_on: iso,
        media_path: path,
        media_type: draft.type,
        media_width: Math.round(draft.width),
        media_height: Math.round(draft.height),
      });
      if (e) throw new Error('Не получилось сохранить момент.');
      setDraft(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Группируем по месяцам: «Ноябрь 2026»
  const sections = useMemo(() => {
    const out: { label: string; items: Item[] }[] = [];
    for (const it of items) {
      const d = new Date(it.date + 'T00:00:00');
      const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      const cap = (label.charAt(0).toUpperCase() + label.slice(1)).replace(/\s*г\.?$/, '');
      if (out[out.length - 1]?.label !== cap) out.push({ label: cap, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items]);

  return (
    <Screen edges={['bottom']}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={s.row}>
          <Chip label="Все" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="⭐ Моменты" selected={filter === 'moments'} onPress={() => setFilter('moments')} />
        </View>
        <Muted>{items.length} шт.</Muted>
      </View>

      {draft ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Новый момент</Text>
          <Muted>{draft.type === 'video' ? '🎬 Видео выбрано' : '📷 Фото выбрано'}</Muted>
          <Input placeholder="Подпись, например «Первое свидание»" value={title} onChangeText={setTitle} maxLength={80} />
          <Input placeholder={`Дата: ДД.ММ.ГГГГ (по умолчанию сегодня)`} value={date} onChangeText={setDate} maxLength={10} keyboardType="numbers-and-punctuation" />
          <ErrorText>{error}</ErrorText>
          <Button title="Сохранить в альбом" onPress={save} loading={saving} />
          <Button title="Отмена" variant="ghost" onPress={() => setDraft(null)} />
        </View>
      ) : (
        <>
          <Button title="＋ Добавить момент" onPress={pick} />
          <ErrorText>{error}</ErrorText>
        </>
      )}

      {sections.length === 0 ? (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 40 }}>📸</Text>
          <Text style={s.cardTitle}>Здесь будут ваши фото и видео</Text>
          <Muted>Всё, что вы отправите друг другу в чат, появится здесь. А особенные моменты можно добавить с подписью и датой.</Muted>
        </View>
      ) : null}

      {sections.map((sec) => (
        <View key={sec.label} style={{ gap: spacing.sm }}>
          <Text style={s.month}>{sec.label}</Text>
          <View style={s.grid}>
            {sec.items.map((it) => (
              <Tile key={it.key} item={it} size={tile} onPress={() => setViewer(it.message)} />
            ))}
          </View>
        </View>
      ))}

      <MediaViewer message={viewer} onClose={() => setViewer(null)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.primarySoft, boxShadow: shadows.soft },
  video: { backgroundColor: '#5A2846', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 4, right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  month: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, boxShadow: shadows.card },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
});
