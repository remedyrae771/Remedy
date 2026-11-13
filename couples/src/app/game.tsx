import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Avatar, { AVATAR_TINTS } from '../components/Avatar';
import { GradientFill } from '../components/Gradient';
import { Button, ErrorText, Muted, Screen } from '../components/ui';
import { GAME_QUESTIONS, pickQuestion } from '../lib/game';
import { supabase } from '../lib/supabase';
import { useCouple } from '../providers/AuthProvider';
import { colors, gradients, radius, shadows, spacing } from '../theme';

type Round = {
  id: string;
  subject_id: string;
  question_idx: number;
  guess: number | null;
  correct: boolean | null;
  guessed_at: string | null;
  created_at: string;
};

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

/** Варианты ответа; highlight подсвечивает верный ответ и ошибочную догадку. */
function Options({
  idx,
  busy,
  onPick,
  highlight,
}: {
  idx: number;
  busy: boolean;
  onPick?: (i: number) => void;
  highlight?: { answer: number; guess: number };
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {GAME_QUESTIONS[idx].options.map((o, i) => {
        const isAnswer = highlight?.answer === i;
        const isWrongGuess = highlight && highlight.guess === i && highlight.answer !== i;
        return (
          <Pressable
            key={i}
            disabled={!onPick || busy}
            onPress={() => onPick?.(i)}
            style={({ pressed }) => [s.option, isAnswer && s.optionRight, isWrongGuess && s.optionWrong, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <Text style={[s.optionText, (isAnswer || isWrongGuess) && { color: '#fff' }]}>
              {isAnswer ? '✓ ' : isWrongGuess ? '✗ ' : ''}
              {o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Game() {
  const { coupleId, userId, profile, partnerName } = useCouple();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [secrets, setSecrets] = useState<Record<string, number>>({});
  const [newQuestion, setNewQuestion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ correct: boolean; answer: number; idx: number; guess: number } | null>(null);

  const myName = profile.display_name || 'Вы';

  const load = useCallback(async () => {
    const [{ data: r }, { data: sec }] = await Promise.all([
      supabase.from('game_rounds').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(50),
      supabase.from('game_secrets').select('round_id, answer'),
    ]);
    setRounds((r as Round[]) ?? []);
    setSecrets(Object.fromEntries(((sec as { round_id: string; answer: number }[]) ?? []).map((x) => [x.round_id, x.answer])));
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`game-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const toGuess = rounds.find((r) => r.subject_id !== userId && !r.guessed_at);
  const myPending = rounds.find((r) => r.subject_id === userId && !r.guessed_at);
  const finished = rounds.filter((r) => r.guessed_at);

  // Очки получает тот, кто угадал (партнёр загадавшего).
  const score = useMemo(() => {
    let me = 0;
    let them = 0;
    for (const r of finished) {
      if (!r.correct) continue;
      if (r.subject_id === userId) them++;
      else me++;
    }
    return { me, them };
  }, [finished, userId]);

  const startRound = () => {
    setError(null);
    setReveal(null);
    setNewQuestion(pickQuestion(rounds.slice(0, 10).map((r) => r.question_idx)));
  };

  const commit = async (answer: number) => {
    if (newQuestion === null) return;
    setBusy(true);
    setError(null);
    const { data: round, error: e1 } = await supabase.from('game_rounds').insert({ couple_id: coupleId, question_idx: newQuestion }).select().single<Round>();
    if (e1 || !round) {
      setBusy(false);
      return setError('Не получилось начать раунд.');
    }
    const { error: e2 } = await supabase.from('game_secrets').insert({ round_id: round.id, answer });
    setBusy(false);
    if (e2) return setError('Не получилось сохранить ответ.');
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    setNewQuestion(null);
    load();
  };

  const guess = async (round: Round, choice: number) => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('game_guess', { round_id: round.id, choice });
    setBusy(false);
    if (e || !data) return setError('Не получилось отправить догадку.');
    const result = data as { correct: boolean; answer: number };
    haptic(() => Haptics.notificationAsync(result.correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning));
    setReveal({ ...result, idx: round.question_idx, guess: choice });
    load();
  };

  return (
    <Screen edges={['bottom']}>
      {/* Счёт */}
      <View style={s.scoreboard}>
        <GradientFill colors={gradients.stage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={s.player}>
          <Avatar name={myName} tint={AVATAR_TINTS.me} size={52} />
          <Text style={s.playerName} numberOfLines={1}>
            {myName}
          </Text>
          <Text style={s.points}>{score.me}</Text>
        </View>
        <Text style={s.vs}>🎯</Text>
        <View style={s.player}>
          <Avatar name={partnerName} tint={AVATAR_TINTS.partner} size={52} />
          <Text style={s.playerName} numberOfLines={1}>
            {partnerName}
          </Text>
          <Text style={s.points}>{score.them}</Text>
        </View>
      </View>
      <Muted style={{ alignItems: 'center' }}>Очко получает тот, кто угадал ответ партнёра</Muted>

      {reveal ? (
        <View style={[s.card, { alignItems: 'stretch' }]}>
          <Text style={s.big}>{reveal.correct ? '🎉 Угадали!' : '🙈 Не угадали'}</Text>
          <Text style={s.question}>{GAME_QUESTIONS[reveal.idx].q}</Text>
          <Options idx={reveal.idx} busy={busy} highlight={{ answer: reveal.answer, guess: reveal.guess }} />
          <Button title="Дальше" onPress={() => setReveal(null)} />
        </View>
      ) : toGuess ? (
        <View style={s.card}>
          <Text style={s.kicker}>{partnerName} загадал(а) ответ</Text>
          <Text style={s.question}>{GAME_QUESTIONS[toGuess.question_idx].q}</Text>
          <Muted>Как думаете, что выбрал(а) {partnerName}?</Muted>
          <Options idx={toGuess.question_idx} busy={busy} onPick={(i) => guess(toGuess, i)} />
        </View>
      ) : newQuestion !== null ? (
        <View style={s.card}>
          <Text style={s.kicker}>Ответьте честно о себе</Text>
          <Text style={s.question}>{GAME_QUESTIONS[newQuestion].q}</Text>
          <Muted>{partnerName} попробует угадать ваш ответ</Muted>
          <Options idx={newQuestion} busy={busy} onPick={commit} />
          <Button title="Другой вопрос" variant="ghost" onPress={startRound} />
        </View>
      ) : myPending ? (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 40 }}>⏳</Text>
          <Text style={s.question}>{GAME_QUESTIONS[myPending.question_idx].q}</Text>
          <Muted>Ваш ответ: «{GAME_QUESTIONS[myPending.question_idx].options[secrets[myPending.id] ?? 0]}». Ждём, пока {partnerName} угадает — мы пришлём уведомление.</Muted>
        </View>
      ) : (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 44 }}>🎯</Text>
          <Text style={s.question}>Кто лучше знает друг друга?</Text>
          <Muted>Вы отвечаете на вопрос о себе, а {partnerName} угадывает. Потом наоборот.</Muted>
          <Button title="Загадать вопрос" onPress={startRound} style={{ alignSelf: 'stretch' }} />
        </View>
      )}
      <ErrorText>{error}</ErrorText>

      {finished.length ? <Text style={s.section}>История</Text> : null}
      {finished.slice(0, 15).map((r) => {
        const subject = r.subject_id === userId ? myName : partnerName;
        const guesser = r.subject_id === userId ? partnerName : myName;
        const answer = secrets[r.id];
        return (
          <View key={r.id} style={s.history}>
            <Text style={{ fontSize: 22 }}>{r.correct ? '💚' : '💔'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.historyQ} numberOfLines={2}>
                {GAME_QUESTIONS[r.question_idx]?.q}
              </Text>
              <Muted>
                {subject}: «{answer !== undefined ? GAME_QUESTIONS[r.question_idx]?.options[answer] : '…'}» · {guesser} {r.correct ? 'угадал(а)' : 'не угадал(а)'}
              </Muted>
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    boxShadow: shadows.raised,
  },
  player: { alignItems: 'center', gap: 4, width: 110 },
  playerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  points: { fontSize: 36, fontWeight: '900', color: colors.primaryDeep, fontVariant: ['tabular-nums'] },
  vs: { fontSize: 30 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, boxShadow: shadows.card },
  kicker: { fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  question: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  big: { fontSize: 28, fontWeight: '900', textAlign: 'center', color: colors.text },
  option: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#FFF6F8',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0px 4px 10px rgba(122, 46, 72, 0.06), inset 0px 1px 0px rgba(255,255,255,1)',
  },
  optionRight: { backgroundColor: colors.success, borderColor: colors.success },
  optionWrong: { backgroundColor: colors.danger, borderColor: colors.danger },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm },
  history: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, boxShadow: shadows.soft },
  historyQ: { fontSize: 14, fontWeight: '700', color: colors.text },
});
