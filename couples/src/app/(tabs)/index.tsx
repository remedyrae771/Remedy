import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientFill } from '../../components/Gradient';
import InviteCard from '../../components/InviteCard';
import PushCard from '../../components/PushCard';
import Pet, { petSpeech } from '../../components/Pet';
import { Button, ErrorText, Input, Muted, Screen, styles as ui } from '../../components/ui';
import { daysBetween, nextOccurrence, parseISODate, pluralDays, today } from '../../lib/dates';
import { MOODS, moodLabel } from '../../lib/moods';
import { errorText, supabase } from '../../lib/supabase';
import type { CoupleEvent } from '../../lib/types';
import { usePetMood, type PetTask } from '../../lib/usePetMood';
import { useAuth, useCouple } from '../../providers/AuthProvider';
import { colors, gradients, radius, shadows, spacing } from '../../theme';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

const initial = (name: string | null | undefined) => (name?.trim()?.[0] ?? '♥').toUpperCase();

/** Где выполнить задание для питомца. */
const TASK_LINKS: Record<string, Href | null> = {
  'mood-me': null,
  'mood-partner': null,
  'q-me': '/questions',
  'q-partner': '/questions',
  chat: '/chat',
};

function Avatar({ name, tint, size = 44 }: { name: string; tint: readonly string[]; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#FFFFFF',
        boxShadow: shadows.soft,
      }}
    >
      <GradientFill colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initial(name)}</Text>
    </View>
  );
}

function HeartsMeter({ score, total }: { score: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <Text key={i} style={{ fontSize: 18, opacity: i < score ? 1 : 0.35 }}>
          {i < score ? '💖' : '🤍'}
        </Text>
      ))}
    </View>
  );
}

function TaskRow({ task }: { task: PetTask }) {
  const link = TASK_LINKS[task.key];
  return (
    <Pressable
      disabled={!link || task.done}
      onPress={() => link && router.push(link)}
      style={({ pressed }) => [s.taskRow, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[s.check, task.done && s.checkDone]}>
        {task.done ? <GradientFill colors={['#6FD3A0', '#2F9E6B']} /> : null}
        {task.done ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text> : null}
      </View>
      <Text style={[ui.body, { flex: 1, fontSize: 15 }, task.done && { color: colors.muted }]}>{task.label}</Text>
      {link && !task.done ? <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '700' }}>›</Text> : null}
    </Pressable>
  );
}

export default function Home() {
  const { updateProfile } = useAuth();
  const { userId, coupleId, profile, couple, partner } = useCouple();
  const pet = usePetMood(coupleId, userId, profile, partner);
  const [nextEvent, setNextEvent] = useState<{ event: CoupleEvent; days: number } | null>(null);
  const [note, setNote] = useState(profile.mood_note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sentThinking, setSentThinking] = useState(false);
  const [pats, setPats] = useState<number | null>(null);

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
  const petName = couple?.pet_name || 'Пушок';
  const petPats = pats ?? couple?.pet_pats ?? 0;
  const tasks = pet.tasks.filter((t) => partner || !t.key.endsWith('partner'));
  const score = tasks.filter((t) => t.done).length;

  const setMood = async (emoji: string) => {
    setError(null);
    haptic(() => Haptics.selectionAsync());
    try {
      await updateProfile({ mood: emoji, mood_note: note.trim() || null, mood_updated_at: new Date().toISOString() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const saveNote = async () => {
    if (!profile.mood || (note.trim() || null) === profile.mood_note) return;
    try {
      await updateProfile({ mood_note: note.trim() || null, mood_updated_at: new Date().toISOString() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const sendThinking = async () => {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    const { error: e } = await supabase.from('messages').insert({ couple_id: coupleId, body: 'Думаю о тебе 💭', kind: 'thinking' });
    if (e) setError(errorText(e));
    else {
      setSentThinking(true);
      pet.reload();
      setTimeout(() => setSentThinking(false), 3000);
    }
  };

  const patPet = async () => {
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    setPats(petPats + 1);
    const { data } = await supabase.rpc('pet_pat');
    if (typeof data === 'number') setPats(data);
  };

  return (
    <Screen>
      {/* Шапка: мы двое */}
      <View style={[ui.row, { gap: spacing.md }]}>
        <View style={{ flexDirection: 'row' }}>
          <Avatar name={profile.display_name} tint={['#F7849F', '#C93D68']} />
          <View style={{ marginLeft: -14 }}>
            <Avatar name={partner?.display_name ?? '?'} tint={partner ? ['#B9A6F2', '#7D63C9'] : ['#E4DCE2', '#C7B9C2']} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.hello} numberOfLines={1}>
            {profile.display_name || 'Я'}
            {partner ? ` & ${partner.display_name || 'партнёр'}` : ''}
          </Text>
          <Text style={ui.muted}>
            {daysTogether !== null && daysTogether >= 0 ? `${daysTogether} ${pluralDays(daysTogether)} вместе 💞` : 'Наше пространство'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Настройки" style={s.iconButton}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>

      {/* Комнатка питомца */}
      <View style={s.stage}>
        <GradientFill colors={gradients.stage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <GradientFill colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']} radial center={{ x: 0.5, y: 0.45 }} />

        <View style={[ui.row, { justifyContent: 'space-between', alignSelf: 'stretch' }]}>
          <View style={s.glassChip}>
            <Text style={s.glassChipText}>🐾 {petName}</Text>
          </View>
          <View style={s.glassChip}>
            <Text style={s.glassChipText}>💗 {petPats}</Text>
          </View>
        </View>

        <View style={s.bubble}>
          <Text style={s.bubbleText}>{petSpeech(pet.mood)}</Text>
          <View style={s.bubbleTail} />
        </View>

        <Pet kind={couple?.pet_kind ?? 'cat'} mood={pet.mood} size={190} onPat={patPet} />

        <View style={s.meterPanel}>
          <HeartsMeter score={score} total={tasks.length} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
            Счастье {score}/{tasks.length}
          </Text>
        </View>
        <Text style={[ui.muted, { fontSize: 12 }]}>Нажмите на питомца, чтобы погладить</Text>
      </View>

      {!partner && couple ? <InviteCard code={couple.invite_code} inviterName={profile.display_name} /> : null}

      {partner ? <PushCard compact /> : null}

      {/* Задания для питомца */}
      <View style={s.panel}>
        <Text style={s.panelTitle}>Задания на сегодня</Text>
        <Text style={[ui.muted, { marginTop: -8, marginBottom: 4 }]}>Каждое выполненное добавляет питомцу сердечко</Text>
        {tasks.map((t) => (
          <TaskRow key={t.key} task={t} />
        ))}
      </View>

      {/* Плитки */}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable style={[s.tile, { flex: 1 }]} onPress={() => router.push('/settings')}>
          <Text style={{ fontSize: 24 }}>💞</Text>
          {daysTogether !== null && daysTogether >= 0 ? (
            <>
              <Text style={s.tileNumber}>{daysTogether}</Text>
              <Text style={ui.muted}>{pluralDays(daysTogether)} вместе</Text>
            </>
          ) : (
            <>
              <Text style={[s.tileNumber, { fontSize: 18 }]}>Когда начали?</Text>
              <Text style={ui.muted}>Укажите дату</Text>
            </>
          )}
        </Pressable>
        <Pressable style={[s.tile, { flex: 1 }]} onPress={() => router.push('/dates')}>
          <Text style={{ fontSize: 24 }}>{nextEvent?.event.emoji ?? '📅'}</Text>
          {nextEvent ? (
            <>
              <Text style={s.tileNumber}>
                {nextEvent.days === 0 ? 'Сегодня' : nextEvent.days === 1 ? 'Завтра' : nextEvent.days}
              </Text>
              <Text style={ui.muted} numberOfLines={2}>
                {nextEvent.days <= 1 ? nextEvent.event.title : `${pluralDays(nextEvent.days)} до «${nextEvent.event.title}»`}
              </Text>
            </>
          ) : (
            <>
              <Text style={[s.tileNumber, { fontSize: 18 }]}>Даты</Text>
              <Text style={ui.muted}>Добавьте важный день</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Настроения рядом */}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={[s.tile, { flex: 1, alignItems: 'center' }]}>
          <Text style={s.moodWho}>Я</Text>
          <View style={s.moodOrb}>
            <Text style={{ fontSize: 34 }}>{profile.mood ?? '🙂'}</Text>
          </View>
          <Text style={[ui.body, { fontWeight: '600', fontSize: 14 }]}>{profile.mood ? moodLabel(profile.mood) : 'Отметьте ниже'}</Text>
        </View>
        <View style={[s.tile, { flex: 1, alignItems: 'center' }]}>
          <Text style={s.moodWho} numberOfLines={1}>
            {partner?.display_name || 'Партнёр'}
          </Text>
          <View style={s.moodOrb}>
            <Text style={{ fontSize: 34 }}>{partner?.mood ?? '💭'}</Text>
          </View>
          <Text style={[ui.body, { fontWeight: '600', fontSize: 14, textAlign: 'center' }]} numberOfLines={2}>
            {partner?.mood ? moodLabel(partner.mood) : partner ? 'Пока без отметки' : 'Ещё не с нами'}
          </Text>
          {partner?.mood_note ? (
            <Text style={[ui.muted, { textAlign: 'center' }]} numberOfLines={2}>
              «{partner.mood_note}»
            </Text>
          ) : null}
          {partner?.mood_updated_at ? <Text style={[ui.muted, { fontSize: 12 }]}>{timeAgo(partner.mood_updated_at)}</Text> : null}
        </View>
      </View>

      {partner ? (
        <Button title={sentThinking ? 'Отправлено 💕' : 'Думаю о тебе 💭'} onPress={sendThinking} disabled={sentThinking} />
      ) : null}

      {/* Выбор настроения */}
      <View style={s.panel}>
        <Text style={s.panelTitle}>Как вы сегодня?</Text>
        <View style={s.moodGrid}>
          {MOODS.map((m) => {
            const selected = profile.mood === m.emoji;
            return (
              <Pressable
                key={m.emoji}
                onPress={() => setMood(m.emoji)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [s.moodCell, pressed && { transform: [{ scale: 0.94 }] }]}
              >
                <View style={[s.moodButton, selected && s.moodButtonSelected]}>
                  {selected ? <GradientFill colors={['#FFE1EA', '#F9B9CC']} /> : null}
                  <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
                </View>
                <Text style={[s.moodCaption, selected && { color: colors.primaryDeep, fontWeight: '700' }]} numberOfLines={1}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          placeholder="Пара слов о том, как прошёл день…"
          value={note}
          onChangeText={setNote}
          onEndEditing={saveNote}
          onBlur={saveNote}
          maxLength={140}
        />
        <ErrorText>{error}</ErrorText>
      </View>

      {/* Вопрос дня */}
      <Pressable onPress={() => router.push('/questions')} style={({ pressed }) => [s.cta, pressed && { transform: [{ scale: 0.98 }] }]}>
        <GradientFill colors={gradients.question} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <GradientFill colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} radial center={{ x: 0.15, y: 0.1 }} />
        <Text style={{ fontSize: 32 }}>💬</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Вопрос дня</Text>
          <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14 }}>Ответьте и узнайте ответ партнёра</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>›</Text>
      </Pressable>
      <Muted style={{ alignItems: 'center' }}>Remedy · пространство для двоих</Muted>
    </Screen>
  );
}

const s = StyleSheet.create({
  hello: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.soft,
  },
  stage: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    boxShadow: shadows.raised,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  glassChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0px 4px 10px rgba(122, 46, 72, 0.08)',
  },
  glassChipText: { fontWeight: '700', color: colors.text, fontSize: 14 },
  bubble: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    zIndex: 2,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    boxShadow: '0px 8px 18px rgba(122, 46, 72, 0.12)',
  },
  bubbleText: { fontSize: 15, fontWeight: '600', color: colors.text },
  bubbleTail: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
  meterPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    boxShadow: '0px 6px 14px rgba(122, 46, 72, 0.08)',
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    boxShadow: shadows.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  panelTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6EEF2',
    boxShadow: 'inset 0px 2px 4px rgba(122, 46, 72, 0.15)',
  },
  checkDone: { boxShadow: '0px 4px 10px rgba(47, 158, 107, 0.35), inset 0px 1px 0px rgba(255,255,255,0.5)' },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 4,
    boxShadow: shadows.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  tileNumber: { fontSize: 30, fontWeight: '800', color: colors.primaryDeep, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  moodWho: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  moodOrb: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4F7',
    marginVertical: spacing.xs,
    boxShadow: 'inset 0px -4px 8px rgba(201, 61, 104, 0.10), inset 0px 3px 0px rgba(255,255,255,1), 0px 8px 16px rgba(122, 46, 72, 0.12)',
  },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  moodCell: { width: '25%', alignItems: 'center', gap: 6 },
  moodButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7F9',
    boxShadow: '0px 6px 12px rgba(122, 46, 72, 0.12), inset 0px -3px 6px rgba(201, 61, 104, 0.08), inset 0px 2px 0px rgba(255,255,255,1)',
  },
  moodButtonSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    boxShadow: '0px 8px 18px rgba(232, 87, 126, 0.35), inset 0px 2px 0px rgba(255,255,255,0.8)',
    transform: [{ translateY: -2 }],
  },
  moodCaption: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
    boxShadow: shadows.button,
  },
});
