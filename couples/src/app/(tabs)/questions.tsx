import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Input, Muted, Screen, SectionLabel, Title, styles } from '../../components/ui';
import { dayIndex } from '../../lib/dates';
import { DECKS, shuffle } from '../../lib/games';
import { errorText, supabase } from '../../lib/supabase';
import type { Answer, Question } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, radius, spacing } from '../../theme';

type Tab = 'daily' | 'games' | 'archive';

export default function Questions() {
  const [tab, setTab] = useState<Tab>('daily');

  return (
    <Screen>
      <Title subtitle="Узнавайте друг друга лучше каждый день">Вопросы и игры</Title>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Chip label="Вопрос дня" selected={tab === 'daily'} onPress={() => setTab('daily')} />
        <Chip label="Игры" selected={tab === 'games'} onPress={() => setTab('games')} />
        <Chip label="Архив ответов" selected={tab === 'archive'} onPress={() => setTab('archive')} />
      </View>
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
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Muted>{question.category}</Muted>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{question.text}</Text>
      </Card>

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

function Games() {
  const [deckId, setDeckId] = useState<string | null>(null);
  const deck = DECKS.find((d) => d.id === deckId);
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  const start = (id: string) => {
    const d = DECKS.find((x) => x.id === id)!;
    setDeckId(id);
    setOrder(shuffle(d.cards));
    setIndex(0);
  };

  if (!deck) {
    return (
      <>
        <Pressable onPress={() => router.push('/game')}>
          <Card style={[styles.row, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <Text style={{ fontSize: 32 }}>🎯</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.body, { fontWeight: '700' }]}>Кто лучше знает</Text>
              <Muted>Онлайн-игра: угадайте ответы друг друга и набирайте очки</Muted>
            </View>
            <Text style={{ color: colors.primary, fontSize: 20 }}>›</Text>
          </Card>
        </Pressable>
        <Muted>Игры для вас двоих — играйте вместе вживую или по видеосвязи.</Muted>
        {DECKS.map((d) => (
          <Pressable key={d.id} onPress={() => start(d.id)}>
            <Card style={styles.row}>
              <Text style={{ fontSize: 32 }}>{d.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{d.title}</Text>
                <Muted>{d.cards.length} карточек</Muted>
              </View>
              <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
            </Card>
          </Pressable>
        ))}
      </>
    );
  }

  const finished = index >= order.length;

  return (
    <>
      <SectionLabel>
        {deck.emoji} {deck.title}
      </SectionLabel>
      <View
        style={{
          backgroundColor: colors.primary,
          borderRadius: radius.lg,
          padding: spacing.xl,
          minHeight: 220,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' }}>
          {finished ? 'Колода закончилась 🎉' : order[index]}
        </Text>
        {!finished && (
          <Text style={{ color: '#fff', opacity: 0.7, textAlign: 'center', marginTop: spacing.md }}>
            {index + 1} / {order.length}
          </Text>
        )}
      </View>
      {finished ? (
        <Button title="Перемешать и сыграть ещё" onPress={() => start(deck.id)} />
      ) : (
        <Button title="Следующая карточка" onPress={() => setIndex(index + 1)} />
      )}
      <Button title="← Все игры" variant="ghost" onPress={() => setDeckId(null)} />
    </>
  );
}

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
