import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { PetKind } from '../lib/types';

export type PetMood = 'happy' | 'ok' | 'sad' | 'sleepy';

const useNative = Platform.OS !== 'web';

const PALETTE: Record<PetKind, { body: string; inner: string; dark: string }> = {
  cat: { body: '#F6B98A', inner: '#FBD9BE', dark: '#5A3A2E' },
  dog: { body: '#D9A066', inner: '#F1D3A8', dark: '#4A2F22' },
  bunny: { body: '#F3E6EC', inner: '#F8C9D8', dark: '#4E3A44' },
  bear: { body: '#B98262', inner: '#DDB79A', dark: '#3E2A20' },
};

export const PET_KINDS: { kind: PetKind; label: string }[] = [
  { kind: 'cat', label: 'Котик' },
  { kind: 'dog', label: 'Щенок' },
  { kind: 'bunny', label: 'Зайчик' },
  { kind: 'bear', label: 'Мишка' },
];

function Ears({ kind, c }: { kind: PetKind; c: (typeof PALETTE)[PetKind] }) {
  switch (kind) {
    case 'cat':
      return (
        <G>
          <Path d="M38 44 L46 14 L66 36 Z" fill={c.body} />
          <Path d="M44 38 L48 22 L58 34 Z" fill={c.inner} />
          <Path d="M122 44 L114 14 L94 36 Z" fill={c.body} />
          <Path d="M116 38 L112 22 L102 34 Z" fill={c.inner} />
        </G>
      );
    case 'dog':
      return (
        <G>
          <Ellipse cx={36} cy={62} rx={13} ry={26} fill={c.dark} opacity={0.75} transform="rotate(18 36 62)" />
          <Ellipse cx={124} cy={62} rx={13} ry={26} fill={c.dark} opacity={0.75} transform="rotate(-18 124 62)" />
        </G>
      );
    case 'bunny':
      return (
        <G>
          <Ellipse cx={58} cy={18} rx={11} ry={28} fill={c.body} transform="rotate(-10 58 18)" />
          <Ellipse cx={58} cy={20} rx={5} ry={19} fill={c.inner} transform="rotate(-10 58 20)" />
          <Ellipse cx={102} cy={18} rx={11} ry={28} fill={c.body} transform="rotate(10 102 18)" />
          <Ellipse cx={102} cy={20} rx={5} ry={19} fill={c.inner} transform="rotate(10 102 20)" />
        </G>
      );
    case 'bear':
      return (
        <G>
          <Circle cx={44} cy={32} r={15} fill={c.body} />
          <Circle cx={44} cy={32} r={8} fill={c.inner} />
          <Circle cx={116} cy={32} r={15} fill={c.body} />
          <Circle cx={116} cy={32} r={8} fill={c.inner} />
        </G>
      );
  }
}

function Face({ mood, dark }: { mood: PetMood; dark: string }) {
  const eyes = {
    happy: (
      <G stroke={dark} strokeWidth={3.5} strokeLinecap="round" fill="none">
        <Path d="M56 66 Q63 58 70 66" />
        <Path d="M90 66 Q97 58 104 66" />
      </G>
    ),
    ok: (
      <G fill={dark}>
        <Circle cx={63} cy={65} r={5.5} />
        <Circle cx={97} cy={65} r={5.5} />
        <Circle cx={65} cy={63} r={1.8} fill="#fff" />
        <Circle cx={99} cy={63} r={1.8} fill="#fff" />
      </G>
    ),
    sad: (
      <G>
        <G fill={dark}>
          <Circle cx={63} cy={67} r={5} />
          <Circle cx={97} cy={67} r={5} />
        </G>
        <G stroke={dark} strokeWidth={2.5} strokeLinecap="round">
          <Path d="M55 60 L68 55" />
          <Path d="M105 60 L92 55" />
        </G>
      </G>
    ),
    sleepy: (
      <G stroke={dark} strokeWidth={3.5} strokeLinecap="round" fill="none">
        <Path d="M56 65 Q63 71 70 65" />
        <Path d="M90 65 Q97 71 104 65" />
      </G>
    ),
  }[mood];

  const mouth = {
    happy: <Path d="M72 80 Q80 92 88 80" stroke={dark} strokeWidth={3} fill="#E8577E" strokeLinecap="round" />,
    ok: <Path d="M73 81 Q76.5 85 80 81 Q83.5 85 87 81" stroke={dark} strokeWidth={2.5} fill="none" strokeLinecap="round" />,
    sad: <Path d="M73 86 Q80 79 87 86" stroke={dark} strokeWidth={2.5} fill="none" strokeLinecap="round" />,
    sleepy: <Ellipse cx={80} cy={83} rx={3.5} ry={4} fill={dark} opacity={0.8} />,
  }[mood];

  return (
    <G>
      {eyes}
      <Ellipse cx={80} cy={75} rx={4} ry={3} fill={dark} />
      {mouth}
      <Ellipse cx={50} cy={80} rx={8} ry={5} fill="#F28BA5" opacity={mood === 'sad' ? 0.25 : 0.55} />
      <Ellipse cx={110} cy={80} rx={8} ry={5} fill="#F28BA5" opacity={mood === 'sad' ? 0.25 : 0.55} />
    </G>
  );
}

export function PetArt({ kind, mood, size = 160 }: { kind: PetKind; mood: PetMood; size?: number }) {
  const c = PALETTE[kind] ?? PALETTE.cat;
  return (
    <Svg width={size} height={size} viewBox="-6 -12 172 172">
      <Ellipse cx={80} cy={152} rx={46} ry={6} fill="#000" opacity={0.08} />
      {/* тело и лапки */}
      <Ellipse cx={80} cy={122} rx={44} ry={32} fill={c.body} />
      <Ellipse cx={80} cy={128} rx={26} ry={20} fill={c.inner} />
      <Ellipse cx={56} cy={148} rx={12} ry={7} fill={c.body} />
      <Ellipse cx={104} cy={148} rx={12} ry={7} fill={c.body} />
      {/* голова */}
      <Ears kind={kind} c={c} />
      <Circle cx={80} cy={70} r={46} fill={c.body} />
      {kind === 'dog' || kind === 'bear' ? <Ellipse cx={80} cy={82} rx={20} ry={14} fill={c.inner} /> : null}
      <Face mood={mood} dark={c.dark} />
      {mood === 'sleepy' ? (
        <G>
          <Path d="M126 30 h10 l-10 12 h10" stroke={c.dark} strokeWidth={2.5} fill="none" strokeLinejoin="round" opacity={0.6} />
          <Path d="M140 14 h7 l-7 8 h7" stroke={c.dark} strokeWidth={2} fill="none" strokeLinejoin="round" opacity={0.4} />
        </G>
      ) : null}
    </Svg>
  );
}

type Heart = { id: number; x: number; anim: Animated.Value };

/** Питомец, который покачивается и выпускает сердечки, когда его гладят. */
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
  const [hearts, setHearts] = useState<Heart[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const speed = mood === 'sleepy' ? 2600 : mood === 'sad' ? 2200 : 1400;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(breathe, { toValue: 0, duration: speed, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, mood]);

  const pat = () => {
    onPat?.();
    jump.setValue(0);
    Animated.sequence([
      Animated.timing(jump, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: useNative }),
      Animated.spring(jump, { toValue: 0, friction: 3.5, useNativeDriver: useNative }),
    ]).start();

    const id = nextId.current++;
    const heart: Heart = { id, x: (Math.random() - 0.5) * size * 0.6, anim: new Animated.Value(0) };
    setHearts((h) => [...h, heart]);
    Animated.timing(heart.anim, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: useNative }).start(() =>
      setHearts((h) => h.filter((x) => x.id !== id)),
    );
  };

  const amplitude = mood === 'happy' ? 6 : 3;
  const translateY = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] }),
    jump.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }),
  );
  const scaleY = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  return (
    <Pressable onPress={pat} accessibilityRole="button" accessibilityLabel="Погладить питомца" hitSlop={8}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
        <Animated.View style={{ transform: [{ translateY }, { scaleY }] }}>
          <PetArt kind={kind} mood={mood} size={size} />
        </Animated.View>
        {hearts.map((h) => (
          <Animated.Text
            key={h.id}
            style={{
              position: 'absolute',
              top: size * 0.25,
              left: size / 2 - 10 + h.x,
              fontSize: 22,
              opacity: h.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: h.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.45] }) },
                { scale: h.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 0.9] }) },
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

/** Подпись под питомцем по его настроению. */
export function petMoodText(name: string, mood: PetMood): string {
  return {
    happy: `${name} счастлив! Вы сегодня молодцы 💞`,
    ok: `${name} в хорошем настроении`,
    sad: `${name} скучает. Уделите друг другу немного внимания`,
    sleepy: `${name} сладко спит`,
  }[mood];
}
