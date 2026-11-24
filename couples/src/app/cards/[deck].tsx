import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlossPressable } from '../../components/Glossy';
import { GradientFill } from '../../components/Gradient';
import { buildOrder, DECKS, MIX_ID, splitChoice, type PlayCard } from '../../lib/games';
import { colors, radius, shadows, spacing } from '../../theme';

const STORAGE = (deck: string) => `remedy.cards.${deck}`;
const SWIPE = 90;
/** Куда улетает карточка (дальше любого экрана) */
const FLY = 700;
const NATIVE = Platform.OS !== 'web';
/** В браузере карточки рисуются отдельным слоем видеокарты — тень и градиент не перерисовываются на каждом кадре. */
const GPU = (Platform.OS === 'web' ? { willChange: 'transform', backfaceVisibility: 'hidden', userSelect: 'none', touchAction: 'pan-y', cursor: 'grab' } : {}) as unknown as ViewStyle;

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

const MIX = { id: MIX_ID, title: 'Вперемешку', emoji: '🎲', description: 'Понемногу из каждой колоды', colors: ['#F7849F', '#7D63C9'] as [string, string], kind: 'prompt' as const };

/** Лицевая сторона карточки: градиент колоды, эмодзи и текст (или два варианта «это или то»). */
function CardFace({ card, deck }: { card: PlayCard; deck: { id: string; title: string } }) {
  const cardDeck = DECKS.find((d) => d.id === card.deckId) ?? MIX;
  const choice = cardDeck.kind === 'choice' ? splitChoice(card.text) : null;
  return (
    <>
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
    </>
  );
}

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
  /** Следующая перерисовка — возврат назад: предыдущая карточка прилетает слева. */
  const backIn = useRef(false);

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

  // Сразу после смены карточки (до отрисовки кадра) возвращаем стопку на место —
  // улетевшая карточка уже убрана, а следующая уже лежит на её месте, поэтому ничего не мигает.
  useLayoutEffect(() => {
    if (backIn.current) {
      backIn.current = false;
      pan.setValue({ x: -FLY, y: 40 });
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 9, tension: 70, useNativeDriver: NATIVE }).start(() => {
        busy.current = false;
      });
    } else {
      pan.setValue({ x: 0, y: 0 });
      busy.current = false;
    }
  }, [index, pan]);

  const finished = order.length > 0 && index >= order.length;

  /** Перелистнуть: 1 — следующая, -1 — предыдущая. Не зависит от текущего состояния — подходит и для свайпа. */
  const [move] = useState(() => (dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    haptic(() => Haptics.selectionAsync());
    if (dir === 1) {
      Animated.timing(pan, { toValue: { x: -FLY, y: 40 }, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start(() =>
        setIndex((i) => i + 1),
      );
    } else {
      backIn.current = true;
      setIndex((i) => Math.max(0, i - 1));
    }
  });

  const next = () => move(1);
  const back = () => {
    if (index > 0) move(-1);
  };
  const reshuffle = () => {
    setOrder(buildOrder(deck.id));
    setIndex(0);
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 8, tension: 70, useNativeDriver: NATIVE }).start();
  };

  // Свайп: влево — следующая, вправо — предыдущая.
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy * 0.2 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE || g.vx < -0.6) move(1);
        else if (g.dx > SWIPE || g.vx > 0.6) {
          // назад: верхняя карточка возвращается, а предыдущая прилетает слева
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 8, useNativeDriver: NATIVE }).start();
          move(-1);
        } else Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 7, tension: 80, useNativeDriver: NATIVE }).start();
      },
    }),
  );

  const progress = order.length ? Math.min(index, order.length) / order.length : 0;
  const rotate = pan.x.interpolate({ inputRange: [-cardW, 0, cardW], outputRange: ['-12deg', '0deg', '12deg'] });
  // карточки под верхней приподнимаются, пока её уводят
  const lift = pan.x.interpolate({ inputRange: [-cardW, 0, cardW], outputRange: [1, 0, 1], extrapolate: 'clamp' });
  const under = (depth: 1 | 2) => ({
    transform: [
      { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [depth * 14, (depth - 1) * 14] }) },
      { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1 - depth * 0.05, 1 - (depth - 1) * 0.05] }) },
    ],
    opacity: depth === 2 ? lift.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1,
  });

  // видимая стопка: верхняя и две под ней (рисуем снизу вверх, ключ — номер карточки)
  const stack = [index + 2, index + 1, index].filter((i) => i < order.length);

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
        {finished ? (
          <View style={[s.card, s.cardFace, { width: cardW, height: cardH }]}>
            <GradientFill colors={deck.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <Text style={{ fontSize: 64 }}>🎉</Text>
            <Text style={s.cardText}>Колода пройдена!</Text>
            <Text style={s.cardHint}>Перемешайте и сыграйте ещё раз или выберите другую колоду</Text>
          </View>
        ) : null}
        {stack.map((i) => {
          const depth = i - index;
          const top = depth === 0;
          return (
            <Animated.View
              key={i}
              {...(top ? responder.panHandlers : {})}
              pointerEvents={top ? 'auto' : 'none'}
              style={[
                s.card,
                s.cardFace,
                GPU,
                { width: cardW, height: cardH, position: 'absolute' },
                top
                  ? {
                      opacity: enter,
                      transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                    }
                  : under(depth as 1 | 2),
              ]}
            >
              <CardFace card={order[i]} deck={deck} />
            </Animated.View>
          );
        })}
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
