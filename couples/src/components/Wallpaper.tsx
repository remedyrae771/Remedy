import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Message } from '../lib/types';
import { colors } from '../theme';
import { useSvgId } from './Gradient';
import { useMediaUrl } from './Media';

export type WallpaperId = 'default' | 'hearts' | 'night' | 'clouds' | 'paws' | 'sunset' | 'lavender';

export const WALLPAPERS: { id: WallpaperId; name: string; dark?: boolean }[] = [
  { id: 'default', name: 'Нежные' },
  { id: 'hearts', name: 'Сердечки' },
  { id: 'night', name: 'Звёздная ночь', dark: true },
  { id: 'clouds', name: 'Облака' },
  { id: 'paws', name: 'Лапки' },
  { id: 'sunset', name: 'Закат' },
  { id: 'lavender', name: 'Лаванда' },
];

/** Тёмные обои — подписи в чате делаем светлыми. */
export const isDarkWallpaper = (id: string | null | undefined) => WALLPAPERS.some((w) => w.id === id && w.dark);

const GRADIENTS: Record<WallpaperId, string[]> = {
  default: [colors.backgroundTop, colors.background, colors.backgroundBottom],
  hearts: ['#FFE4EC', '#FFD3E1', '#FBE3F1'],
  night: ['#1B1740', '#3B2A6E', '#6A3A86'],
  clouds: ['#D9EEFF', '#EAF5FF', '#FDEFF6'],
  paws: ['#FFEEDD', '#FFE3D3', '#FBE3EA'],
  sunset: ['#FFE0B5', '#FFC3B0', '#F7A8C4'],
  lavender: ['#F1E6FF', '#EDE4FA', '#FBE7F3'],
};

/** Детерминированный «случайный» генератор: узор одинаковый при каждой отрисовке. */
function scatter(seed: number, count: number) {
  let h = seed;
  const next = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return ((h >>> 8) % 10000) / 10000;
  };
  return Array.from({ length: count }, () => ({ x: next() * 400, y: next() * 800, s: 0.6 + next() * 0.8, r: next() * 40 - 20, o: 0.25 + next() * 0.45 }));
}

const HEART = 'M0 -4 C -3 -9 -11 -7 -11 0 C -11 6 -4 10 0 14 C 4 10 11 6 11 0 C 11 -7 3 -9 0 -4 Z';
const SPARKLE = 'M0 -10 Q2 -2 10 0 Q2 2 0 10 Q-2 2 -10 0 Q-2 -2 0 -10 Z';

function Pattern({ id }: { id: WallpaperId }) {
  const items = useMemo(() => scatter(id.length * 7919 + 17, id === 'night' ? 70 : 34), [id]);
  switch (id) {
    case 'hearts':
      return (
        <G>
          {items.map((p, i) => (
            <Path key={i} d={HEART} fill={i % 3 ? '#F7849F' : '#FFFFFF'} opacity={p.o * 0.7} transform={`translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.s})`} />
          ))}
        </G>
      );
    case 'night':
      return (
        <G>
          {items.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={p.s * 1.6} fill="#FFFFFF" opacity={p.o + 0.2} />
          ))}
          {items.slice(0, 6).map((p, i) => (
            <Path key={`s${i}`} d={SPARKLE} fill="#FFF6C7" opacity={0.8} transform={`translate(${p.x} ${p.y * 0.8}) scale(${p.s * 0.6})`} />
          ))}
          <Circle cx={320} cy={110} r={42} fill="#FFF3C4" opacity={0.95} />
          <Circle cx={340} cy={98} r={38} fill="#2E2460" />
        </G>
      );
    case 'clouds':
      return (
        <G fill="#FFFFFF">
          {items.slice(0, 9).map((p, i) => (
            <G key={i} opacity={0.75} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
              <Ellipse cx={0} cy={0} rx={38} ry={16} />
              <Circle cx={-14} cy={-10} r={16} />
              <Circle cx={10} cy={-14} r={20} />
            </G>
          ))}
        </G>
      );
    case 'paws':
      return (
        <G fill="#D99A6C">
          {items.slice(0, 22).map((p, i) => (
            <G key={i} opacity={p.o * 0.45} transform={`translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.s * 0.9})`}>
              <Ellipse cx={0} cy={6} rx={9} ry={7.5} />
              <Circle cx={-9} cy={-4} r={3.6} />
              <Circle cx={-3.5} cy={-9} r={3.6} />
              <Circle cx={3.5} cy={-9} r={3.6} />
              <Circle cx={9} cy={-4} r={3.6} />
            </G>
          ))}
        </G>
      );
    case 'sunset':
      return (
        <G>
          <Circle cx={200} cy={520} r={90} fill="#FFF1C9" opacity={0.85} />
          <Path d="M0 600 Q100 540 200 590 T400 570 V800 H0 Z" fill="#F38AA9" opacity={0.45} />
          <Path d="M0 680 Q120 620 240 670 T400 650 V800 H0 Z" fill="#E86A92" opacity={0.4} />
          {items.slice(0, 8).map((p, i) => (
            <Path key={i} d="M-8 0 Q-4 -5 0 0 Q4 -5 8 0" stroke="#B85277" strokeWidth={1.6} fill="none" opacity={0.45} transform={`translate(${p.x} ${p.y * 0.55}) scale(${p.s})`} />
          ))}
        </G>
      );
    case 'lavender':
      return (
        <G>
          {items.map((p, i) => (
            <Path key={i} d={SPARKLE} fill={i % 2 ? '#B9A6F2' : '#F7A8C4'} opacity={p.o * 0.6} transform={`translate(${p.x} ${p.y}) scale(${p.s * 0.8})`} />
          ))}
        </G>
      );
    default:
      return null;
  }
}

/** Фото партнёров в качестве обоев: путь в хранилище превращаем во временную ссылку. */
function PhotoWallpaper({ path }: { path: string }) {
  const url = useMediaUrl({ id: path, media_path: path } as Message);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {/* светлая вуаль — чтобы сообщения читались на любом фото */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 246, 244, 0.35)' }]} />
    </View>
  );
}

/** Обои чата на весь фон. value — id готовых обоев или 'photo:<путь>'. */
export default function Wallpaper({ value }: { value: string | null | undefined }) {
  const gid = useSvgId('wp');
  if (value?.startsWith('photo:')) return <PhotoWallpaper path={value.slice(6)} />;
  const id: WallpaperId = WALLPAPERS.some((w) => w.id === value) ? (value as WallpaperId) : 'default';
  const stops = GRADIENTS[id];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0.3" y2="1">
            {stops.map((c, i) => (
              <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={400} height={800} fill={`url(#${gid})`} />
        <Pattern id={id} />
      </Svg>
    </View>
  );
}
