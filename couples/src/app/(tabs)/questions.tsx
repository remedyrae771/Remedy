import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientFill } from '../../components/Gradient';
import { Button, Card, ErrorText, Input, Muted, Screen, SectionLabel, Segmented, Title, styles } from '../../components/ui';
import { dayIndex } from '../../lib/dates';
import { DECKS, MIX_ID } from '../../lib/games';
import { errorText, supabase } from '../../lib/supabase';
import type { Answer, Question } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, gradients, radius, shadows, spacing } from '../../theme';

type Tab = 'daily' | 'games' | 'archive';

export default function Questions() {
  const [tab, setTab] = useState<Tab>('daily');

  return (
    <Screen>
      <Title emoji="💬" subtitle="Узнавайте друг друга лучше каждый день">Вопросы и игры</Title>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { key: 'daily', label: 'Вопрос дня' },
          { key: 'games', label: 'Игры' },
          { key: 'archive', label: 'Архив' },
        ]}
      />
      {tab === 'daily' && <DailyQuestion />}
      {tab === 'games' && <Games />}
      {tab === 'archive' && <Archive />}
    </Screen>
  );
}

function useQuestionsAndAnswers() {
  const { coupleId } = useCouple();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [{ data: q }, { data: a }] = await Promise.all([
      supabase.from('questions').select('*').order('id'),
      supabase.from('answers').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
    ]);
    setQuestions((q as Question[]) ?? []);
    setAnswers((a as Answer[]) ?? []);
    setLoaded(true);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`answers-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `couple_id=eq.${coupleId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  return { questions, answers, loaded, reload: load };
}

function DailyQuestion() {
  const { coupleId, userId, partner, partnerName } = useCouple();
  const { questions, answers, loaded, reload } = useQuestionsAndAnswers();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partnerDone, setPartnerDone] = useState(false);

  const question = questions.length ? questions[dayIndex() % questions.length] : null;
  const mine = answers.find((a) => a.question_id === question?.id && a.user_id === userId);
  const theirs = answers.find((a) => a.question_id === question?.id && a.user_id !== userId);

  useEffect(() => {
    if (!question) return;
    supabase.rpc('partner_answered', { q: question.id }).then(({ data }) => setPartnerDone(Boolean(data)));
  }, [question, answers]);

  if (!loaded) return <Muted>Загрузка…</Muted>;
  if (!question) return <Muted>Вопросы не найдены. Проверьте, что SQL-миграция выполнена.</Muted>;

  const submit = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    const { error: e } = await supabase
      .from('answers')
      .insert({ couple_id: coupleId, question_id: question.id, body: draft.trim() });
    setSaving(false);
    if (e) return setError(errorText(e));
    setDraft('');
    reload();
  };


  return (
    <>
      <View style={gs.questionCard}>
        <GradientFill colors={gradients.question} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <GradientFill colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} radial center={{ x: 0.15, y: 0.1 }} />
        <View style={gs.categoryChip}>
          <Text style={gs.categoryText}>{question.category}</Text>
        </View>
        <Text style={gs.quoteMark}>“</Text>
        <Text style={gs.questionText}>{question.text}</Text>
      </View>

      {mine ? (
        <>
          <SectionLabel>Ваш ответ</SectionLabel>
          <Card>
            <Text style={styles.body}>{mine.body}</Text>
          </Card>
          <SectionLabel>Ответ: {partnerName}</SectionLabel>
          <Card>
            {theirs ? (
              <Text style={styles.body}>{theirs.body}</Text>
            ) : (
              <Muted>{partner ? 'Ждём ответа 💭 Вы увидите его, как только партнёр ответит.' : 'Партнёр ещё не присоединился.'}</Muted>
            )}
          </Card>
        </>
      ) : (
        <Card>
          {partnerDone ? <Text style={styles.body}>🔒 {partnerName} уже ответил(а). Ответьте, чтобы увидеть!</Text> : null}
          <Input
            placeholder="Ваш ответ…"
            value={draft}
            onChangeText={setDraft}
            multiline
            style={{ minHeight: 96, textAlignVertical: 'top' }}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Ответить" onPress={submit} loading={saving} disabled={!draft.trim()} />
        </Card>
      )}
      <Muted>Новый вопрос появляется каждый день — одинаковый для вас обоих.</Muted>
    </>
  );
}

function DeckTile({ title, emoji, count, colors: tint, onPress, wide }: { title: string; emoji: string; count: string; colors: readonly string[]; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [gs.tile, wide && gs.tileWide, pressed && { transform: [{ scale: 0.96 }] }]}>
      <GradientFill colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <GradientFill colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} radial center={{ x: 0.2, y: 0.1 }} />
      <Text style={gs.tileEmoji}>{emoji}</Text>
      <Text style={gs.tileTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={gs.tileCount}>{count}</Text>
    </Pressable>
  );
}

function Games() {
  const open = (deck: string) => router.push({ pathname: '/cards/[deck]', params: { deck } });
  return (
    <>
      <Pressable onPress={() => router.push('/game')} style={({ pressed }) => [gs.feature, pressed && { transform: [{ scale: 0.98 }] }]}>
        <GradientFill colors={['#FFE7DA', '#FBD3E0', '#EBD9F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={{ fontSize: 44 }}>🎯</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={gs.featureTitle}>Кто лучше знает</Text>
          <Text style={gs.featureText}>Онлайн-игра на очки: угадайте ответы друг друга</Text>
        </View>
        <Text style={{ color: colors.primary, fontSize: 26, fontWeight: '700' }}>›</Text>
      </Pressable>

      <SectionLabel>Карточки для двоих</SectionLabel>
      <Muted>Играйте вживую или по видеосвязи: читайте карточку, отвечайте, листайте свайпом.</Muted>
      <View style={gs.grid}>
        <DeckTile wide title="Вперемешку" emoji="🎲" count={`по 6 из каждой колоды`} colors={['#F7849F', '#7D63C9']} onPress={() => open(MIX_ID)} />
        {DECKS.map((d) => (
          <DeckTile key={d.id} title={d.title} emoji={d.emoji} count={`${d.cards.length} карточек`} colors={d.colors} onPress={() => open(d.id)} />
        ))}
      </View>
    </>
  );
}

const gs = StyleSheet.create({
  questionCard: { borderRadius: radius.lg, overflow: 'hidden', padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.sm, minHeight: 200, justifyContent: 'center', boxShadow: shadows.raised },
  categoryChip: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.22)' },
  categoryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  quoteMark: { color: 'rgba(255,255,255,0.35)', fontSize: 72, lineHeight: 72, fontWeight: '900', marginBottom: -30 },
  questionText: { color: '#FFFFFF', fontSize: 25, lineHeight: 33, fontWeight: '800' },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    boxShadow: shadows.raised,
  },
  featureTitle: { fontSize: 19, fontWeight: '800', color: colors.text },
  featureText: { fontSize: 14, color: colors.text, opacity: 0.75 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: '47.5%',
    aspectRatio: 0.85,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    justifyContent: 'flex-end',
    gap: 4,
    boxShadow: shadows.raised,
  },
  tileWide: { width: '100%', aspectRatio: 2.6 },
  tileEmoji: { fontSize: 44, position: 'absolute', top: spacing.md, left: spacing.lg },
  tileTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 4 },
  tileCount: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
});

function Archive() {
  const { userId } = useCouple();
  const { questions, answers, loaded } = useQuestionsAndAnswers();

  const items = useMemo(() => {
    const byQuestion = new Map<number, { mine?: Answer; theirs?: Answer; latest: string }>();
    for (const a of answers) {
      const entry = byQuestion.get(a.question_id) ?? { latest: a.created_at };
      if (a.user_id === userId) entry.mine = a;
      else entry.theirs = a;
      if (a.created_at > entry.latest) entry.latest = a.created_at;
      byQuestion.set(a.question_id, entry);
    }
    return [...byQuestion.entries()]
      .filter(([, v]) => v.mine)
      .sort((a, b) => b[1].latest.localeCompare(a[1].latest))
      .map(([qid, v]) => ({ question: questions.find((q) => q.id === qid), ...v }));
  }, [answers, questions, userId]);

  if (!loaded) return <Muted>Загрузка…</Muted>;
  if (items.length === 0) return <Muted>Здесь появятся вопросы, на которые вы ответили.</Muted>;

  return (
    <>
      {items.map((item) => (
        <Card key={item.question?.id ?? item.latest}>
          <Text style={[styles.body, { fontWeight: '700' }]}>{item.question?.text}</Text>
          <Text style={styles.body}>🙋 {item.mine?.body}</Text>
          <Text style={[styles.body, !item.theirs && { color: colors.muted }]}>
            💞 {item.theirs?.body ?? 'ещё не ответил(а)'}
          </Text>
        </Card>
      ))}
    </>
  );
}
