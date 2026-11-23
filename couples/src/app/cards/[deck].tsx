import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlossPressable } from '../../components/Glossy';
import { GradientFill } from '../../components/Gradient';
import { buildOrder, DECKS, MIX_ID, splitChoice, type PlayCard } from '../../lib/games';
import { colors, radius, shadows, spacing } from '../../theme';

const STORAGE = (deck: string) => `remedy.cards.${deck}`;
const SWIPE = 90;

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

const MIX = { id: MIX_ID, title: 'Вперемешку', emoji: '🎲', description: 'Понемногу из каждой колоды', colors: ['#F7849F', '#7D63C9'] as [string, string], kind: 'prompt' as const };

export default function CardsScreen() {
  const { deck: deckId } = useLocalSearchParams<{ deck: string }>();
  const deck = DECKS.find((d) => d.id === deckId) ?? MIX;
  const { width, height } = useWindowDimensions();
  const cardW = Math.min(width - spacing.lg * 2, 420);
  const cardH = Math.min(cardW * 1.3, height * 0.56);

  const [order, setOrder] = useState<PlayCard[]>([]);
  const [index, setIndex] = useState(0);
  const [pan] = useState(() => new Animated.ValueXY());
  const [enter] = useState(() => new Animated.Value(1));
  const busy = useRef(false);

  // Восстанавливаем прогресс колоды или начинаем новую раздачу.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE(deck.id))
      .then((raw) => {
        if (!alive) return;
        const saved = raw ? (JSON.parse(raw) as { order: PlayCard[]; index: number }) : null;
        if (saved?.order?.length) {
          setOrder(saved.order);
          setIndex(Math.min(saved.index, saved.order.length));
        } else {
          setOrder(buildOrder(deck.id));
          setIndex(0);
        }
      })
      .catch(() => {
        setOrder(buildOrder(deck.id));
        setIndex(0);
      });
    return () => {
      alive = false;
    };
  }, [deck.id]);

  useEffect(() => {
    if (order.length) AsyncStorage.setItem(STORAGE(deck.id), JSON.stringify({ order, index })).catch(() => {});
  }, [order, index, deck.id]);

  const finished = order.length > 0 && index >= order.length;

  /** Перелистнуть: 1 — следующая, -1 — предыдущая. Не зависит от текущего состояния — подходит и для свайпа. */
  const [move] = useState(() => (dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    haptic(() => Haptics.selectionAsync());
    Animated.timing(pan, { toValue: { x: dir * -600, y: 30 }, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => {
      setIndex((i) => Math.max(0, i + dir));
      pan.setValue({ x: 0, y: 0 });
      enter.setValue(0);
      Animated.spring(enter, { toValue: 1, friction: 7, tension: 80, useNativeDriver: false }).start(() => {
        busy.current = false;
      });
    });
  });

  const next = () => move(1);
  const back = () => {
    if (index > 0) move(-1);
  };
  const reshuffle = () => {
    setOrder(buildOrder(deck.id));
    setIndex(0);
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 80, useNativeDriver: false }).start();
  };

  // Свайп: влево — следующая, вправо — предыдущая.
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy * 0.2 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE) move(1);
        else if (g.dx > SWIPE) move(-1); // на первой карточке просто вернётся на место
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
      },
    }),
  );

  const card = order[index];
  const cardDeck = DECKS.find((d) => d.id === card?.deckId) ?? deck;
  const choice = card && cardDeck.kind === 'choice' ? splitChoice(card.text) : null;
  const rotate = pan.x.interpolate({ inputRange: [-cardW, 0, cardW], outputRange: ['-14deg', '0deg', '14deg'] });
  const progress = order.length ? Math.min(index, order.length) / order.length : 0;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen options={{ title: `${deck.emoji} ${deck.title}` }} />
      <GradientFill colors={[colors.backgroundTop, colors.background, colors.backgroundBottom]} />

      <View style={s.top}>
        <Text style={s.desc}>{deck.description}</Text>
        <View style={s.progressRow}>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.max(4, progress * 100)}%` }]}>
              <GradientFill colors={deck.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
            </View>
          </View>
          <Text style={s.counter}>{order.length ? `${Math.min(index + 1, order.length)} / ${order.length}` : ''}</Text>
        </View>
      </View>

      <View style={s.stage}>
        {/* «стопка»: две карточки позади */}
        {!finished
          ? [2, 1].map((n) => (
              <View
                key={n}
                style={[
                  s.card,
                  { width: cardW, height: cardH, position: 'absolute', transform: [{ translateY: n * 10 }, { scale: 1 - n * 0.04 }, { rotate: `${n % 2 ? 3 : -3}deg` }], opacity: 1 - n * 0.25 },
                ]}
              >
                <GradientFill colors={deck.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} opacity={0.55} />
              </View>
            ))
          : null}

        {finished ? (
          <View style={[s.card, s.cardFace, { width: cardW, height: cardH }]}>
            <GradientFill colors={deck.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <Text style={{ fontSize: 64 }}>🎉</Text>
            <Text style={s.cardText}>Колода пройдена!</Text>
            <Text style={s.cardHint}>Перемешайте и сыграйте ещё раз или выберите другую колоду</Text>
          </View>
        ) : card ? (
          <Animated.View
            {...responder.panHandlers}
            style={[
              s.card,
              s.cardFace,
              {
                width: cardW,
                height: cardH,
                opacity: enter,
                transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
              },
            ]}
          >
            <GradientFill colors={cardDeck.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <GradientFill colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} radial center={{ x: 0.2, y: 0.1 }} />
            <Text style={s.cardEmoji}>{cardDeck.emoji}</Text>
            {choice ? (
              <View style={{ width: '100%', gap: spacing.md, alignItems: 'center' }}>
                <View style={s.choice}>
                  <Text style={s.choiceText}>{choice[0]}</Text>
                </View>
                <View style={s.or}>
                  <Text style={s.orText}>или</Text>
                </View>
                <View style={s.choice}>
                  <Text style={s.choiceText}>{choice[1]}</Text>
                </View>
              </View>
            ) : (
              <Text style={s.cardText}>{card.text}</Text>
            )}
            <Text style={s.cardFooter}>{deck.id === MIX_ID ? cardDeck.title : 'Свайп ← следующая'}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={s.controls}>
        <GlossPressable onPress={back} disabled={index === 0 || finished} style={[s.round, (index === 0 || finished) && { opacity: 0.4 }]} accessibilityLabel="Предыдущая">
          <Text style={s.roundText}>‹</Text>
        </GlossPressable>
        <GlossPressable onPress={reshuffle} style={s.round} accessibilityLabel="Перемешать">
          <Text style={{ fontSize: 22 }}>🔀</Text>
        </GlossPressable>
        {finished ? (
          <GlossPressable tone="primary" onPress={() => router.back()} style={s.main}>
            <Text style={s.mainText}>Другая колода</Text>
          </GlossPressable>
        ) : (
          <GlossPressable tone="primary" onPress={next} style={s.main} accessibilityLabel="Следующая карточка">
            <Text style={s.mainText}>Дальше ›</Text>
          </GlossPressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  desc: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(201, 61, 104, 0.12)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  counter: { fontSize: 13, fontWeight: '700', color: colors.muted, fontVariant: ['tabular-nums'], minWidth: 54, textAlign: 'right' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 32, overflow: 'hidden', boxShadow: shadows.raised },
  cardFace: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  cardEmoji: { fontSize: 54, position: 'absolute', top: spacing.xl },
  cardText: { color: '#FFFFFF', fontSize: 28, lineHeight: 36, fontWeight: '800', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 6 },
  cardHint: { color: 'rgba(255,255,255,0.9)', fontSize: 16, textAlign: 'center' },
  cardFooter: { position: 'absolute', bottom: spacing.lg, color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  choice: {
    width: '100%',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  choiceText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  or: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 6px 14px rgba(0,0,0,0.18)' },
  orText: { color: colors.primaryDeep, fontWeight: '900', fontSize: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  round: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  roundText: { fontSize: 30, fontWeight: '700', color: colors.text, marginTop: -3 },
  main: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  mainText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(140, 30, 70, 0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
