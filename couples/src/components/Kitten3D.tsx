import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { KittenSim, type KittenMood, type KittenSnap } from '../lib/kittenSim';
import { KITTEN_SPRITES as SP, KITTEN_STILL, KITTEN_STILL_RATIO, type KittenClip } from '../lib/kittenSprites';
import { useSvgId } from './Gradient';

const useNative = Platform.OS !== 'web';
const CLIPS = Object.entries(SP.clips) as [KittenClip, (typeof SP.clips)[KittenClip]][];

function Shadow({ width, opacity }: { width: number; opacity: number }) {
  const id = useSvgId('k3shadow');
  return (
    <Svg width={width} height={width * 0.22} viewBox="0 0 100 22" style={{ opacity }}>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#7A2E48" stopOpacity={0.3} />
          <Stop offset="0.6" stopColor="#7A2E48" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#7A2E48" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={50} cy={11} rx={50} ry={11} fill={`url(#${id})`} />
    </Svg>
  );
}

type Heart = { id: number; x: number; anim: Animated.Value };

/**
 * Пушистый 3D-котик: сам гуляет по комнатке, бегает, прыгает, садится и спит по настроению.
 * Касание — мяукает (и засчитывает поглаживание), три касания подряд — подпрыгивает, спящий просыпается.
 */
export default function Kitten3D({
  mood,
  onPat,
  height = 190,
  scale = 1,
}: {
  mood: KittenMood;
  onPat?: () => void;
  /** Высота комнатки, где гуляет котик */
  height?: number;
  /** Размер по стадии роста */
  scale?: number;
}) {
  const [sim] = useState(() => new KittenSim(SP.clips));
  const [snap, setSnap] = useState<KittenSnap>(() => sim.snapshot());
  const [width, setWidth] = useState(0);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [zzz] = useState(() => new Animated.Value(0));
  const [loaded, setLoaded] = useState<Partial<Record<KittenClip, boolean>>>({});
  const nextId = useRef(0);

  // высота котика на экране и масштаб листа
  const d = (height * 0.8 * scale) / SP.catH;
  const cw = SP.cellW * d;
  const ch = SP.cellH * d;
  const floor = height - 10;

  useEffect(() => {
    sim.setMood(mood);
  }, [sim, mood]);

  useEffect(() => {
    if (!width) return;
    const margin = cw * 0.36;
    sim.setBounds(margin, width - margin, SP.pxPerM * d);
  }, [sim, width, cw, d]);

  useEffect(() => {
    if (!width) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      setSnap(sim.step((now - last) / 1000));
      last = now;
    }, 1000 / 30);
    return () => clearInterval(id);
  }, [sim, width]);

  const sleeping = snap.clip === 'sleepF';
  useEffect(() => {
    if (!sleeping) return;
    const loop = Animated.loop(Animated.timing(zzz, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: useNative }));
    loop.start();
    return () => loop.stop();
  }, [zzz, sleeping]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const pat = () => {
    const what = sim.pat(Date.now());
    if (what === 'wake') return;
    onPat?.();
    const id = nextId.current++;
    const heart: Heart = { id, x: snap.x + (Math.random() - 0.5) * cw * 0.35, anim: new Animated.Value(0) };
    setHearts((h) => [...h, heart]);
    Animated.timing(heart.anim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: useNative }).start(() =>
      setHearts((h) => h.filter((x) => x.id !== id)),
    );
  };

  const info = SP.clips[snap.clip];
  const col = snap.frame % info.cols;
  const row = Math.floor(snap.frame / info.cols);
  // на листе котик смотрит влево; вправо — зеркалим вокруг центра ячейки
  const anchor = snap.dir === 1 ? SP.cellW - SP.anchorX : SP.anchorX;
  const left = snap.x - anchor * d;
  const top = floor - SP.floorY * d;
  const shadowW = cw * 0.42 * (1 - snap.air * 0.35);
  const stillH = SP.catH * d * 1.08;

  return (
    <View onLayout={onLayout} style={{ alignSelf: 'stretch', height }}>
      {/* заранее грузим все листы, чтобы смена движения не мигала */}
      {CLIPS.map(([name, c]) => (
        <Image
          key={name}
          source={c.src}
          onLoad={() => setLoaded((l) => (l[name] ? l : { ...l, [name]: true }))}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        />
      ))}
      {width ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: snap.x - shadowW / 2, top: floor - shadowW * 0.11 }}>
            <Shadow width={shadowW} opacity={1 - snap.air * 0.5} />
          </View>
          {loaded[snap.clip] ? (
            <Pressable
              onPress={pat}
              accessibilityRole="button"
              accessibilityLabel="Погладить котика"
              style={{ position: 'absolute', left, top, width: cw, height: ch, overflow: 'hidden', transform: snap.dir === 1 ? [{ scaleX: -1 }] : [] }}
            >
              <Image
                source={info.src}
                resizeMode="stretch"
                style={{ position: 'absolute', width: info.cols * cw, height: info.rows * ch, left: -col * cw, top: -row * ch }}
              />
            </Pressable>
          ) : (
            // пока грузится анимация — лёгкий стоп-кадр, чтобы место не пустовало
            <Pressable
              onPress={pat}
              accessibilityRole="button"
              accessibilityLabel="Погладить котика"
              style={{ position: 'absolute', left: snap.x - (stillH * KITTEN_STILL_RATIO) / 2, top: floor - stillH, width: stillH * KITTEN_STILL_RATIO, height: stillH }}
            >
              <Image source={KITTEN_STILL} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
            </Pressable>
          )}
        </>
      ) : null}

      {sleeping
        ? [0, 1, 2].map((i) => {
            const phase = Animated.modulo(Animated.add(zzz, i / 3), 1);
            return (
              <Animated.Text
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: snap.x + cw * 0.12,
                  top: floor - ch * 0.62,
                  fontSize: 16 + i * 3,
                  fontWeight: '800',
                  color: '#8C7BB8',
                  opacity: phase.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.25] }) },
                    { translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
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
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: floor - ch * 0.62,
            left: h.x - 12,
            fontSize: 26,
            opacity: h.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: h.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.4] }) },
              { scale: h.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.15, 0.9] }) },
            ],
          }}
        >
          {'💗'}
        </Animated.Text>
      ))}
    </View>
  );
}
