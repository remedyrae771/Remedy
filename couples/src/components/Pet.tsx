import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import type { PetKind } from '../lib/types';
import { useSvgId } from './Gradient';
import { KittenArt, KittenTail } from './Kitten';

function GroundShadow() {
  const id = useSvgId('shadow');
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#7A2E48" stopOpacity={0.32} />
          <Stop offset="0.6" stopColor="#7A2E48" stopOpacity={0.12} />
          <Stop offset="1" stopColor="#7A2E48" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={50} cy={15} rx={50} ry={15} fill={`url(#${id})`} />
    </Svg>
  );
}

export type PetMood = 'happy' | 'ok' | 'sad' | 'sleepy';

const useNative = Platform.OS !== 'web';

/** Палитра объёма: свет → основной → тень, плюс светлое брюшко и внутренняя часть ушей. */
type Palette = { light: string; base: string; shade: string; belly: string; bellyShade: string; ear: string; feature: string };

const PALETTE: Record<PetKind, Palette> = {
  cat: { light: '#FFD9B8', base: '#F4AE7C', shade: '#D98552', belly: '#FFF1E4', bellyShade: '#F6D5B8', ear: '#F7B3B8', feature: '#4A2C22' },
  dog: { light: '#F2C894', base: '#D69A5E', shade: '#AE7038', belly: '#FBEBD3', bellyShade: '#EBCFA4', ear: '#8A5A36', feature: '#3B2418' },
  bunny: { light: '#FFFFFF', base: '#F2E7EE', shade: '#D6C3D0', belly: '#FFFFFF', bellyShade: '#F1E3EB', ear: '#F8BCD0', feature: '#4A3442' },
  bear: { light: '#D9A585', base: '#B57B58', shade: '#87543A', belly: '#EDCDB3', bellyShade: '#D9AE8E', ear: '#E3B89B', feature: '#33201A' },
};

export const PET_KINDS: { kind: PetKind; label: string }[] = [
  { kind: 'cat', label: 'Котик' },
  { kind: 'dog', label: 'Щенок' },
  { kind: 'bunny', label: 'Зайчик' },
  { kind: 'bear', label: 'Мишка' },
];

// Система координат питомца: viewBox "-6 -12 172 172" (голова в 80,70; тело в 80,122).
const VB_X = -6;
const VB_Y = -12;
const VB = 172;

function Ears({ kind, p, g }: { kind: PetKind; p: Palette; g: (n: string) => string }) {
  switch (kind) {
    case 'cat':
      return (
        <G>
          <Path d="M36 50 Q38 16 48 10 Q58 22 68 36 Z" fill={g('head')} />
          <Path d="M44 40 Q46 24 50 20 Q56 28 60 35 Z" fill={p.ear} opacity={0.9} />
          <Path d="M124 50 Q122 16 112 10 Q102 22 92 36 Z" fill={g('head')} />
          <Path d="M116 40 Q114 24 110 20 Q104 28 100 35 Z" fill={p.ear} opacity={0.9} />
        </G>
      );
    case 'dog':
      return (
        <G>
          <Path d="M40 40 Q18 44 20 78 Q24 96 36 92 Q46 70 50 46 Z" fill={g('ear')} />
          <Path d="M120 40 Q142 44 140 78 Q136 96 124 92 Q114 70 110 46 Z" fill={g('ear')} />
        </G>
      );
    case 'bunny':
      return (
        <G>
          <Path d="M54 36 Q40 -2 50 -10 Q64 -6 68 32 Z" fill={g('head')} />
          <Path d="M56 30 Q48 4 53 -2 Q61 2 63 28 Z" fill={p.ear} />
          <Path d="M106 36 Q120 -2 110 -10 Q96 -6 92 32 Z" fill={g('head')} />
          <Path d="M104 30 Q112 4 107 -2 Q99 2 97 28 Z" fill={p.ear} />
        </G>
      );
    case 'bear':
      return (
        <G>
          <Circle cx={42} cy={32} r={16} fill={g('head')} />
          <Circle cx={42} cy={33} r={8.5} fill={p.ear} />
          <Circle cx={118} cy={32} r={16} fill={g('head')} />
          <Circle cx={118} cy={33} r={8.5} fill={p.ear} />
        </G>
      );
  }
}

function Eye({ cx, cy, g }: { cx: number; cy: number; g: (n: string) => string }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={6.8} ry={8} fill={g('eye')} />
      <Circle cx={cx + 2.2} cy={cy - 3} r={2.6} fill="#FFFFFF" />
      <Circle cx={cx - 2} cy={cy + 2.8} r={1.2} fill="#FFFFFF" opacity={0.8} />
    </G>
  );
}

function Face({ mood, blink, p, g }: { mood: PetMood; blink: boolean; p: Palette; g: (n: string) => string }) {
  const closed = mood === 'sleepy' || (blink && mood !== 'happy');
  const line = { stroke: p.feature, strokeWidth: 3.6, strokeLinecap: 'round' as const, fill: 'none' };

  let eyes;
  if (mood === 'happy') {
    eyes = (
      <G {...line}>
        <Path d="M55 67 Q62 57 69 67" />
        <Path d="M91 67 Q98 57 105 67" />
      </G>
    );
  } else if (closed) {
    eyes = (
      <G {...line}>
        <Path d="M55 66 Q62 72 69 66" />
        <Path d="M91 66 Q98 72 105 66" />
      </G>
    );
  } else {
    eyes = (
      <G>
        <Eye cx={62} cy={66} g={g} />
        <Eye cx={98} cy={66} g={g} />
        {mood === 'sad' ? (
          <G stroke={p.feature} strokeWidth={2.6} strokeLinecap="round" opacity={0.75}>
            <Path d="M53 55 L67 51" />
            <Path d="M107 55 L93 51" />
          </G>
        ) : null}
      </G>
    );
  }

  const mouth = {
    happy: <Path d="M71 80 Q80 94 89 80 Q80 85 71 80 Z" fill="#E8577E" stroke={p.feature} strokeWidth={2.6} strokeLinejoin="round" />,
    ok: <Path d="M73 81 Q76.5 85.5 80 81 Q83.5 85.5 87 81" {...line} strokeWidth={2.6} />,
    sad: <Path d="M73 87 Q80 80 87 87" {...line} strokeWidth={2.6} />,
    sleepy: <Ellipse cx={80} cy={84} rx={3.4} ry={4} fill={p.feature} opacity={0.75} />,
  }[mood];

  return (
    <G>
      {eyes}
      {/* нос с бликом */}
      <Path d="M75.5 73.5 Q80 71.5 84.5 73.5 Q82.5 78 80 78.5 Q77.5 78 75.5 73.5 Z" fill={g('nose')} />
      <Ellipse cx={78.6} cy={73.6} rx={1.8} ry={0.9} fill="#FFFFFF" opacity={0.7} />
      {mouth}
      {/* мягкий румянец */}
      <Ellipse cx={48} cy={80} rx={11} ry={7} fill={g('blush')} opacity={mood === 'sad' ? 0.4 : 1} />
      <Ellipse cx={112} cy={80} rx={11} ry={7} fill={g('blush')} opacity={mood === 'sad' ? 0.4 : 1} />
      {mood === 'sad' ? <Path d="M52 74 Q49 81 52 84 Q55 81 52 74 Z" fill={g('tear')} /> : null}
    </G>
  );
}

/** Статичный рисунок питомца с объёмом (градиенты, блики, мягкая тень). */
export function PetArt({ kind, mood, size = 160, blink = false }: { kind: PetKind; mood: PetMood; size?: number; blink?: boolean }) {
  if (kind === 'cat') return <KittenArt mood={mood} size={size} blink={blink} />;
  return <GenericPetArt kind={kind} mood={mood} size={size} blink={blink} />;
}

function GenericPetArt({ kind, mood, size, blink }: { kind: PetKind; mood: PetMood; size: number; blink: boolean }) {
  const p = PALETTE[kind] ?? PALETTE.cat;
  const uid = useSvgId('pet');
  const g = (name: string) => `url(#${uid}${name})`;
  const id = (name: string) => `${uid}${name}`;

  return (
    <Svg width={size} height={size} viewBox={`${VB_X} ${VB_Y} ${VB} ${VB}`}>
      <Defs>
        <RadialGradient id={id('head')} cx="0.38" cy="0.32" rx="0.75" ry="0.75" fx="0.32" fy="0.25">
          <Stop offset="0" stopColor={p.light} />
          <Stop offset="0.55" stopColor={p.base} />
          <Stop offset="1" stopColor={p.shade} />
        </RadialGradient>
        <RadialGradient id={id('body')} cx="0.4" cy="0.25" rx="0.8" ry="0.8">
          <Stop offset="0" stopColor={p.light} />
          <Stop offset="0.6" stopColor={p.base} />
          <Stop offset="1" stopColor={p.shade} />
        </RadialGradient>
        <RadialGradient id={id('belly')} cx="0.45" cy="0.3" rx="0.7" ry="0.7">
          <Stop offset="0" stopColor={p.belly} />
          <Stop offset="1" stopColor={p.bellyShade} />
        </RadialGradient>
        <LinearGradient id={id('ear')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.ear} />
          <Stop offset="1" stopColor={p.shade} />
        </LinearGradient>
        <RadialGradient id={id('eye')} cx="0.4" cy="0.35" rx="0.7" ry="0.7">
          <Stop offset="0" stopColor="#6B4A3E" />
          <Stop offset="1" stopColor="#1C110D" />
        </RadialGradient>
        <LinearGradient id={id('nose')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F28BA5" />
          <Stop offset="1" stopColor="#C9566F" />
        </LinearGradient>
        <RadialGradient id={id('blush')} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#FF8FAB" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#FF8FAB" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={id('tear')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D8F1FF" />
          <Stop offset="1" stopColor="#7CC4F0" />
        </LinearGradient>
      </Defs>

      {/* тело, лапки, брюшко */}
      <Ellipse cx={80} cy={124} rx={44} ry={32} fill={g('body')} />
      <Ellipse cx={80} cy={130} rx={25} ry={20} fill={g('belly')} />
      <Ellipse cx={55} cy={148} rx={13} ry={8} fill={g('body')} />
      <Ellipse cx={105} cy={148} rx={13} ry={8} fill={g('body')} />
      <G stroke={p.shade} strokeWidth={1.6} strokeLinecap="round" opacity={0.5}>
        <Path d="M51 148 v3" />
        <Path d="M56 148.5 v3" />
        <Path d="M101 148 v3" />
        <Path d="M106 148.5 v3" />
      </G>

      {/* голова */}
      <Ears kind={kind} p={p} g={g} />
      <Ellipse cx={80} cy={110} rx={30} ry={7} fill={p.shade} opacity={0.35} />
      <Circle cx={80} cy={70} r={46} fill={g('head')} />
      {kind === 'dog' || kind === 'bear' ? <Ellipse cx={80} cy={82} rx={21} ry={15} fill={g('belly')} /> : null}
      {/* блик сверху — даёт ощущение объёма */}
      <Ellipse cx={62} cy={42} rx={17} ry={9} fill="#FFFFFF" opacity={0.35} transform="rotate(-25 62 42)" />
      <Face mood={mood} blink={blink} p={p} g={g} />
    </Svg>
  );
}

/** Хвост рисуется отдельным слоем, чтобы им можно было вилять вокруг основания. */
function Tail({ kind }: { kind: PetKind }) {
  if (kind === 'cat') return <KittenTail />;
  return <GenericTail kind={kind} />;
}

function GenericTail({ kind }: { kind: PetKind }) {
  const p = PALETTE[kind] ?? PALETTE.cat;
  const uid = useSvgId('tail');
  const fill = `url(#${uid})`;
  return (
    <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
      <Defs>
        <RadialGradient id={uid} cx="0.4" cy="0.3" rx="0.8" ry="0.8">
          <Stop offset="0" stopColor={p.light} />
          <Stop offset="1" stopColor={p.shade} />
        </RadialGradient>
      </Defs>
      {kind === 'cat' ? (
        <G>
          <Path d="M0 0 C 20 -2 34 -20 26 -38 C 22 -46 12 -44 14 -36" stroke={p.shade} strokeWidth={12} strokeLinecap="round" fill="none" />
          <Path d="M0 0 C 20 -2 34 -20 26 -38 C 22 -46 12 -44 14 -36" stroke={p.base} strokeWidth={9} strokeLinecap="round" fill="none" />
          <Path d="M4 -4 C 18 -6 28 -18 24 -32" stroke={p.light} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
        </G>
      ) : kind === 'dog' ? (
        <G>
          <Path d="M0 0 C 14 -4 24 -14 28 -30" stroke={p.shade} strokeWidth={11} strokeLinecap="round" fill="none" />
          <Path d="M0 0 C 14 -4 24 -14 28 -30" stroke={p.base} strokeWidth={8} strokeLinecap="round" fill="none" />
        </G>
      ) : (
        <Circle cx={kind === 'bunny' ? 6 : 4} cy={-4} r={kind === 'bunny' ? 12 : 9} fill={fill} />
      )}
    </Svg>
  );
}

type Heart = { id: number; x: number; anim: Animated.Value };

/**
 * Живой питомец: дышит, моргает, виляет хвостом, сплющивается и подпрыгивает от касания,
 * во сне над ним всплывают «Z».
 */
export default function Pet({
  kind,
  mood,
  size = 160,
  onPat,
}: {
  kind: PetKind;
  mood: PetMood;
  size?: number;
  onPat?: () => void;
}) {
  const [breathe] = useState(() => new Animated.Value(0));
  const [jump] = useState(() => new Animated.Value(0));
  const [squish] = useState(() => new Animated.Value(0));
  const [wag] = useState(() => new Animated.Value(0));
  const [zzz] = useState(() => new Animated.Value(0));
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [blink, setBlink] = useState(false);
  const [delight, setDelight] = useState(false);
  const nextId = useRef(0);
  const delightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shownMood: PetMood = delight ? 'happy' : mood;

  // Дыхание
  useEffect(() => {
    const speed = mood === 'sleepy' ? 2600 : mood === 'sad' ? 2200 : 1500;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(breathe, { toValue: 0, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, mood]);

  // Хвост
  useEffect(() => {
    const speed = mood === 'happy' ? 260 : mood === 'ok' ? 520 : 1400;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wag, { toValue: 1, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(wag, { toValue: 0, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [wag, mood]);

  // «Z» во сне
  useEffect(() => {
    if (mood !== 'sleepy') return;
    const loop = Animated.loop(Animated.timing(zzz, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: useNative }));
    loop.start();
    return () => loop.stop();
  }, [zzz, mood]);

  // Моргание через случайные промежутки
  useEffect(() => {
    if (mood === 'sleepy') return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        t = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, 2200 + Math.random() * 2800);
    };
    schedule();
    return () => clearTimeout(t);
  }, [mood]);

  useEffect(() => () => {
    if (delightTimer.current) clearTimeout(delightTimer.current);
  }, []);

  const pat = () => {
    onPat?.();
    setDelight(true);
    if (delightTimer.current) clearTimeout(delightTimer.current);
    delightTimer.current = setTimeout(() => setDelight(false), 1600);

    squish.setValue(0);
    jump.setValue(0);
    Animated.sequence([
      Animated.timing(squish, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: useNative }),
      Animated.parallel([
        Animated.spring(squish, { toValue: 0, friction: 3, tension: 120, useNativeDriver: useNative }),
        Animated.sequence([
          Animated.timing(jump, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: useNative }),
          Animated.spring(jump, { toValue: 0, friction: 4, useNativeDriver: useNative }),
        ]),
      ]),
    ]).start();

    const id = nextId.current++;
    const heart: Heart = { id, x: (Math.random() - 0.5) * size * 0.7, anim: new Animated.Value(0) };
    setHearts((h) => [...h, heart]);
    Animated.timing(heart.anim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: useNative }).start(() =>
      setHearts((h) => h.filter((x) => x.id !== id)),
    );
  };

  const k = size / VB;
  const amplitude = mood === 'happy' ? 6 : 3;
  const translateY = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] }),
    jump.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.16] }),
  );
  const scaleX = Animated.add(
    squish.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }),
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -0.01] }),
  );
  const scaleY = Animated.add(
    squish.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }),
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0, 0.025] }),
  );
  const shadowScale = jump.interpolate({ inputRange: [0, 1], outputRange: [1, 0.65] });
  const tailRotate = wag.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '14deg'] });

  // Хвост крепится к правому боку тела (у котёнка тело ниже и уже).
  const anchor = kind === 'cat' ? { x: 110, y: 140 } : { x: 112, y: 128 };
  const tailSide = 100 * k;
  const tailLeft = (anchor.x - VB_X) * k - tailSide / 2;
  const tailTop = (anchor.y - VB_Y) * k - tailSide / 2;

  return (
    <Pressable onPress={pat} accessibilityRole="button" accessibilityLabel="Погладить питомца" hitSlop={8}>
      <View style={{ width: size, height: size }}>
        {/* мягкая тень на полу: размытое пятно, которое сжимается, когда питомец подпрыгивает */}
        <Animated.View
          style={{
            position: 'absolute',
            left: size * 0.12,
            right: size * 0.12,
            bottom: -size * 0.03,
            height: size * 0.16,
            transform: [{ scaleX: shadowScale }, { scaleY: shadowScale }],
          }}
        >
          <GroundShadow />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, transform: [{ translateY }] }}>
          <Animated.View
            style={{
              position: 'absolute',
              left: tailLeft,
              top: tailTop,
              width: tailSide,
              height: tailSide,
              transform: [{ rotate: tailRotate }],
            }}
          >
            <Tail kind={kind} />
          </Animated.View>
          <Animated.View style={{ transform: [{ scaleX }, { scaleY }], transformOrigin: 'bottom' }}>
            <PetArt kind={kind} mood={shownMood} size={size} blink={blink} />
          </Animated.View>
        </Animated.View>

        {mood === 'sleepy'
          ? [0, 1, 2].map((i) => {
              const phase = Animated.modulo(Animated.add(zzz, i / 3), 1);
              return (
                <Animated.Text
                  key={i}
                  style={{
                    position: 'absolute',
                    right: size * 0.06,
                    top: size * 0.14,
                    fontSize: size * (0.08 + i * 0.015),
                    fontWeight: '800',
                    color: '#8C7BB8',
                    opacity: phase.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [
                      { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.22] }) },
                      { translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.08] }) },
                    ],
                  }}
                >
                  Z
                </Animated.Text>
              );
            })
          : null}

        {hearts.map((h) => (
          <Animated.Text
            key={h.id}
            style={{
              position: 'absolute',
              top: size * 0.22,
              left: size / 2 - 12 + h.x,
              fontSize: 26,
              opacity: h.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: h.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.5] }) },
                { scale: h.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.15, 0.9] }) },
              ],
            }}
          >
            {'💗'}
          </Animated.Text>
        ))}
      </View>
    </Pressable>
  );
}

/** Короткая реплика питомца для облачка. */
export function petSpeech(mood: PetMood): string {
  return {
    happy: 'Я так счастлив! 💞',
    ok: 'Мне хорошо с вами',
    sad: 'Я скучаю…',
    sleepy: 'Сплю… тсс',
  }[mood];
}

/** Подпись под питомцем по его настроению. */
export function petMoodText(name: string, mood: PetMood): string {
  return {
    happy: `${name} счастлив! Вы сегодня молодцы 💞`,
    ok: `${name} в хорошем настроении`,
    sad: `${name} скучает. Уделите друг другу немного внимания`,
    sleepy: `${name} сладко спит`,
  }[mood];
}
