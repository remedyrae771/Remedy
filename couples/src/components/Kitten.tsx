import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSvgId } from './Gradient';
import type { PetMood } from './Pet';

/**
 * Котёнок, вторая версия: пушистый контур с клочками шерсти, текстура, глаза с узором
 * радужки и тёмным ободком, носик-сердечко, пухлая мордочка с точками усов, лапки с пальчиками.
 * Три окраса. Система координат как у остальных питомцев: viewBox "-6 -12 172 172", земля y≈156.
 */

export type KittenCoat = 'ginger' | 'british' | 'siamese';

type CoatPalette = {
  light: string;
  base: string;
  shade: string;
  stripe: string | null;
  white: string;
  whiteShade: string;
  ear: string;
  iris: [string, string, string];
  /** Тёмные «пятна» сиамской кошки: уши, маска, лапки, хвост */
  point: string | null;
  chubby: number;
};

export const KITTEN_COATS: { coat: KittenCoat; label: string }[] = [
  { coat: 'ginger', label: 'Рыжий' },
  { coat: 'british', label: 'Британец' },
  { coat: 'siamese', label: 'Сиамский' },
];

const COATS: Record<KittenCoat, CoatPalette> = {
  ginger: {
    light: '#FFDDB4', base: '#F2A65A', shade: '#C46E26', stripe: '#B9621B',
    white: '#FFFDF9', whiteShade: '#F3DECB', ear: '#F7A6B6',
    iris: ['#EAF7A8', '#9BD15E', '#3D7A26'], point: null, chubby: 0,
  },
  british: {
    light: '#D3DCE8', base: '#A3AFBF', shade: '#6F7C8F', stripe: null,
    white: '#EEF2F7', whiteShade: '#C9D2DE', ear: '#E8B4C0',
    iris: ['#FFE9A8', '#F2B33D', '#A9661A'], point: null, chubby: 4,
  },
  siamese: {
    light: '#FFF8EC', base: '#F1E2CB', shade: '#C9B08E', stripe: null,
    white: '#FFFDF8', whiteShade: '#EEDFC8', ear: '#E9B7A6',
    iris: ['#D9F0FF', '#7FBFF2', '#2A64AE'], point: '#5E4334', chubby: 0,
  },
};

const DARK = '#2A1A12';
const mirror = (x: number) => 160 - x;

function Ear({ side, droop, uid, p }: { side: 'left' | 'right'; droop: boolean; uid: string; p: CoatPalette }) {
  const s = side === 'left' ? 1 : -1;
  const X = (x: number) => (side === 'left' ? x : mirror(x));
  const outer = `M${X(30)} 54 Q${X(25)} 14 ${X(41)} 3 Q${X(47)} 1 ${X(52)} 7 Q${X(63)} 19 ${X(73)} 34 Z`;
  const inner = `M${X(38)} 46 Q${X(35)} 22 ${X(44)} 13 Q${X(56)} 24 ${X(64)} 35 Z`;
  return (
    <G transform={droop ? `rotate(${-22 * s} ${X(52)} 44)` : undefined}>
      <Path d={outer} fill={p.point ? `url(#${uid}point)` : `url(#${uid}head)`} />
      <Path d={inner} fill={`url(#${uid}ear)`} />
      {/* кисточки шерсти */}
      <G stroke="#FFFBF5" strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.95}>
        <Path d={`M${X(42)} 43 Q${X(39)} 31 ${X(42)} 21`} />
        <Path d={`M${X(47)} 44 Q${X(46)} 32 ${X(49)} 24`} />
        <Path d={`M${X(52)} 44 Q${X(52)} 35 ${X(55)} 28`} />
        <Path d={`M${X(57)} 43 Q${X(58)} 37 ${X(60)} 32`} />
      </G>
    </G>
  );
}

/** Глаз: тёмный ободок, радужка с волокнами, зрачок, два блика, тень века. */
function Eye({ cx, cy, sad, uid }: { cx: number; cy: number; sad: boolean; uid: string }) {
  const pupil = sad ? { rx: 8.6, ry: 11 } : { rx: 6.6, ry: 10.2 };
  const fibers = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return `M${cx + Math.cos(a) * 7.5} ${cy + Math.sin(a) * 8} L${cx + Math.cos(a) * 12.4} ${cy + Math.sin(a) * 13}`;
  });
  return (
    <G>
      <Ellipse cx={cx} cy={cy + 0.5} rx={16} ry={16.4} fill={DARK} opacity={0.9} />
      <Ellipse cx={cx} cy={cy} rx={14.2} ry={14.8} fill={`url(#${uid}iris)`} />
      <G stroke="#FFFFFF" strokeWidth={0.8} opacity={0.22}>
        {fibers.map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>
      <Ellipse cx={cx} cy={cy} rx={14.2} ry={14.8} fill="none" stroke={DARK} strokeWidth={1.6} opacity={0.55} />
      <Ellipse cx={cx} cy={cy + 0.6} rx={pupil.rx} ry={pupil.ry} fill="#0E0705" />
      <Ellipse cx={cx + 5.2} cy={cy - 6.4} rx={5.2} ry={4.6} fill="#FFFFFF" />
      <Circle cx={cx - 5} cy={cy + 6.4} r={2.3} fill="#FFFFFF" opacity={0.9} />
      {sad ? <Path d={`M${cx - 10} ${cy + 9} Q${cx} ${cy + 15} ${cx + 10} ${cy + 9}`} stroke="#FFFFFF" strokeWidth={1.5} fill="none" opacity={0.75} /> : null}
      <Path d={`M${cx - 16} ${cy - 7} Q${cx} ${cy - 22} ${cx + 16} ${cy - 8}`} stroke="#000000" strokeWidth={2.6} fill="none" opacity={0.12} />
    </G>
  );
}

function Eyes({ mood, blink, uid }: { mood: PetMood; blink: boolean; uid: string }) {
  const line = { stroke: DARK, strokeWidth: 3.8, strokeLinecap: 'round' as const, fill: 'none' };
  if (mood === 'happy') {
    return (
      <G {...line}>
        <Path d="M42 75 Q57 58 72 75" />
        <Path d="M88 75 Q103 58 118 75" />
      </G>
    );
  }
  if (mood === 'sleepy' || blink) {
    return (
      <G {...line}>
        <Path d="M43 72 Q57 84 71 72" />
        <Path d="M89 72 Q103 84 117 72" />
        <G strokeWidth={2} opacity={0.75}>
          <Path d="M45 75 l-4 3" />
          <Path d="M50 78 l-2 4" />
          <Path d="M115 75 l4 3" />
          <Path d="M110 78 l2 4" />
        </G>
      </G>
    );
  }
  const sad = mood === 'sad';
  return (
    <G>
      <Eye cx={57} cy={72} sad={sad} uid={uid} />
      <Eye cx={103} cy={72} sad={sad} uid={uid} />
      {sad ? (
        <G stroke={DARK} strokeWidth={2.4} strokeLinecap="round" opacity={0.55}>
          <Path d="M42 52 L57 48" />
          <Path d="M118 52 L103 48" />
        </G>
      ) : null}
    </G>
  );
}

function Mouth({ mood }: { mood: PetMood }) {
  const line = { stroke: DARK, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (mood) {
    case 'happy':
      return (
        <G>
          <Path d="M80 94 v2" {...line} />
          <Path d="M72 97 Q80 112 88 97 Q80 101 72 97 Z" fill="#D9486C" stroke={DARK} strokeWidth={2} strokeLinejoin="round" />
          <Ellipse cx={80} cy={104.5} rx={4.2} ry={2.8} fill="#FF97AE" />
        </G>
      );
    case 'sad':
      return (
        <G>
          <Path d="M80 94 v3.5" {...line} />
          <Path d="M73 102 Q80 96.5 87 102" {...line} />
        </G>
      );
    case 'sleepy':
      return <Ellipse cx={80} cy={99} rx={2.6} ry={3.2} fill={DARK} opacity={0.75} />;
    default:
      return (
        <G>
          <Path d="M80 94 v3" {...line} />
          <Path d="M72.5 97.5 Q76.5 102 80 97 Q83.5 102 87.5 97.5" {...line} />
        </G>
      );
  }
}

export function KittenArt({ mood, size = 160, blink = false, coat = 'ginger' }: { mood: PetMood; size?: number; blink?: boolean; coat?: KittenCoat }) {
  const uid = useSvgId('kit');
  const p = COATS[coat] ?? COATS.ginger;
  const ref = (name: string) => `${uid}${name}`;
  const sad = mood === 'sad';
  const w = p.chubby; // британец — с щёчками пошире

  // Пушистый контур головы: щёки с клочками шерсти.
  const head = `M80 24 C 113 24 ${136 + w} 44 ${136 + w} 70 C ${136 + w} 75 ${140 + w} 77 ${144 + w} 80
    C ${139 + w} 82 ${139 + w} 84 ${141 + w} 87 C ${136 + w} 88 ${135 + w} 90 ${134 + w} 93
    C ${127 + w} 107 106 117 80 117 C 54 117 ${33 - w} 107 ${26 - w} 93
    C ${25 - w} 90 ${24 - w} 88 ${19 - w} 87 C ${21 - w} 84 ${21 - w} 82 ${16 - w} 80
    C ${20 - w} 77 ${24 - w} 75 ${24 - w} 70 C ${24 - w} 44 47 24 80 24 Z`;

  return (
    <Svg width={size} height={size} viewBox="-6 -12 172 172">
      <Defs>
        <RadialGradient id={ref('head')} cx="0.38" cy="0.3" rx="0.78" ry="0.78" fx="0.32" fy="0.22">
          <Stop offset="0" stopColor={p.light} />
          <Stop offset="0.55" stopColor={p.base} />
          <Stop offset="1" stopColor={p.shade} />
        </RadialGradient>
        <RadialGradient id={ref('body')} cx="0.4" cy="0.2" rx="0.85" ry="0.85">
          <Stop offset="0" stopColor={p.light} />
          <Stop offset="0.6" stopColor={p.base} />
          <Stop offset="1" stopColor={p.shade} />
        </RadialGradient>
        <RadialGradient id={ref('white')} cx="0.45" cy="0.3" rx="0.7" ry="0.7">
          <Stop offset="0" stopColor={p.white} />
          <Stop offset="1" stopColor={p.whiteShade} />
        </RadialGradient>
        <LinearGradient id={ref('ear')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.point ? '#C98B80' : p.ear} />
          <Stop offset="1" stopColor={p.point ? '#E7B7A8' : '#FBD3DC'} />
        </LinearGradient>
        <RadialGradient id={ref('point')} cx="0.5" cy="0.4" rx="0.7" ry="0.7">
          <Stop offset="0" stopColor={p.point ?? p.base} />
          <Stop offset="1" stopColor={p.point ? '#3E2A20' : p.shade} />
        </RadialGradient>
        <RadialGradient id={ref('mask')} cx="0.5" cy="0.45" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor={p.point ?? '#000'} stopOpacity={0.75} />
          <Stop offset="0.7" stopColor={p.point ?? '#000'} stopOpacity={0.35} />
          <Stop offset="1" stopColor={p.point ?? '#000'} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={ref('iris')} cx="0.45" cy="0.6" rx="0.6" ry="0.6">
          <Stop offset="0" stopColor={p.iris[0]} />
          <Stop offset="0.5" stopColor={p.iris[1]} />
          <Stop offset="1" stopColor={p.iris[2]} />
        </RadialGradient>
        <LinearGradient id={ref('nose')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.point ? '#9A6B60' : '#F8A3B7'} />
          <Stop offset="1" stopColor={p.point ? '#6E4A40' : '#D6637D'} />
        </LinearGradient>
        <RadialGradient id={ref('blush')} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#FF7E9E" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FF7E9E" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={ref('tear')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E3F5FF" />
          <Stop offset="1" stopColor="#7CC4F0" />
        </LinearGradient>
      </Defs>

      {/* тело: сидящий котёнок с бочками */}
      <Ellipse cx={80} cy={131} rx={39} ry={27} fill={`url(#${ref('body')})`} />
      <Ellipse cx={48} cy={140} rx={13} ry={15} fill={`url(#${ref('body')})`} />
      <Ellipse cx={112} cy={140} rx={13} ry={15} fill={`url(#${ref('body')})`} />
      {p.stripe ? (
        <G stroke={p.stripe} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.42}>
          <Path d="M45 124 Q51 126 53 132" />
          <Path d="M44 134 Q50 135 52 140" />
          <Path d={`M${mirror(45)} 124 Q${mirror(51)} 126 ${mirror(53)} 132`} />
          <Path d={`M${mirror(44)} 134 Q${mirror(50)} 135 ${mirror(52)} 140`} />
        </G>
      ) : null}
      {/* пушистая грудка */}
      <Path
        d="M61 110 Q80 101 99 110 L97 119 L101 125 L95 129 L98 137 L89 135 L86 146 L80 140 L74 146 L71 135 L62 137 L65 129 L59 125 L63 119 Z"
        fill={`url(#${ref('white')})`}
      />
      {/* лапки с пальчиками */}
      {[65, 95].map((x) => (
        <G key={x}>
          <Ellipse cx={x} cy={149} rx={12.5} ry={9} fill={p.point ? `url(#${ref('point')})` : `url(#${ref('body')})`} />
          <Ellipse cx={x} cy={152} rx={10.5} ry={6} fill={p.point ? `url(#${ref('point')})` : `url(#${ref('white')})`} />
          <G stroke={p.point ? '#2E1E16' : p.whiteShade} strokeWidth={1.5} strokeLinecap="round">
            <Path d={`M${x - 3.6} 150.5 v4.5`} />
            <Path d={`M${x + 3.6} 150.5 v4.5`} />
          </G>
        </G>
      ))}

      <Ear side="left" droop={sad} uid={uid} p={p} />
      <Ear side="right" droop={sad} uid={uid} p={p} />

      {/* тень от головы на тело */}
      <Ellipse cx={80} cy={113} rx={32} ry={7} fill={p.shade} opacity={0.35} />
      <Path d={head} fill={`url(#${ref('head')})`} />

      {/* полоски и «М» на лбу (рыжий) */}
      {p.stripe ? (
        <G stroke={p.stripe} strokeWidth={3.3} strokeLinecap="round" fill="none" opacity={0.5}>
          <Path d="M68 31 Q70 39 68 46" />
          <Path d="M80 28 L80 44" />
          <Path d="M92 31 Q90 39 92 46" />
          <Path d="M27 70 Q35 69 40 73" />
          <Path d="M28 79 Q35 78 40 81" />
          <Path d={`M${mirror(27)} 70 Q${mirror(35)} 69 ${mirror(40)} 73`} />
          <Path d={`M${mirror(28)} 79 Q${mirror(35)} 78 ${mirror(40)} 81`} />
        </G>
      ) : null}

      {/* текстура шерсти: короткие штрихи на макушке */}
      <G stroke="#FFFFFF" strokeWidth={1.1} strokeLinecap="round" opacity={0.28}>
        <Path d="M56 36 l-2 -4" />
        <Path d="M61 33 l-1 -4" />
        <Path d="M99 33 l1 -4" />
        <Path d="M104 36 l2 -4" />
        <Path d="M50 41 l-3 -3" />
        <Path d="M110 41 l3 -3" />
      </G>

      {/* сиамская маска */}
      {p.point ? <Ellipse cx={80} cy={88} rx={34} ry={26} fill={`url(#${ref('mask')})`} /> : null}

      {/* пухлая мордочка с точками усов */}
      <Ellipse cx={71} cy={96} rx={12} ry={9.5} fill={`url(#${ref('white')})`} />
      <Ellipse cx={89} cy={96} rx={12} ry={9.5} fill={`url(#${ref('white')})`} />
      <Ellipse cx={80} cy={105} rx={9} ry={6} fill={`url(#${ref('white')})`} />
      <G fill={p.point ? '#4A3328' : '#C99E86'} opacity={0.55}>
        {[[66, 93], [70, 97], [65, 98], [94, 93], [90, 97], [95, 98]].map(([x, y]) => (
          <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} />
        ))}
      </G>

      {/* блик на макушке */}
      <Ellipse cx={60} cy={41} rx={18} ry={8} fill="#FFFFFF" opacity={0.26} transform="rotate(-20 60 41)" />

      <Ellipse cx={44} cy={91} rx={10} ry={6} fill={`url(#${ref('blush')})`} />
      <Ellipse cx={116} cy={91} rx={10} ry={6} fill={`url(#${ref('blush')})`} />

      <Eyes mood={mood} blink={blink} uid={uid} />

      {/* носик-сердечко */}
      <Path d="M80 92.8 C 76 89.5 72.6 88.8 73.4 86.2 C 74.2 84 77.6 84.2 80 86.6 C 82.4 84.2 85.8 84 86.6 86.2 C 87.4 88.8 84 89.5 80 92.8 Z" fill={`url(#${ref('nose')})`} />
      <Ellipse cx={77} cy={86.4} rx={1.8} ry={0.9} fill="#FFFFFF" opacity={0.7} />

      <Mouth mood={mood} />

      {/* усы */}
      <G stroke={p.point ? '#FFF6EA' : '#FFFFFF'} strokeWidth={1.2} strokeLinecap="round" opacity={0.92} fill="none">
        <Path d="M62 94 Q44 88 24 86" />
        <Path d="M62 98 Q44 97 22 99" />
        <Path d="M63 102 Q46 105 26 111" />
        <Path d={`M${mirror(62)} 94 Q${mirror(44)} 88 ${mirror(24)} 86`} />
        <Path d={`M${mirror(62)} 98 Q${mirror(44)} 97 ${mirror(22)} 99`} />
        <Path d={`M${mirror(63)} 102 Q${mirror(46)} 105 ${mirror(26)} 111`} />
      </G>

      {sad ? <Path d="M48 90 Q44.5 98 48 101.5 Q51.5 98 48 90 Z" fill={`url(#${ref('tear')})`} /> : null}
    </Svg>
  );
}

/** Хвост: пушистый, у рыжего — с кольцами, у сиамского — тёмный. Основание в точке (0, 0). */
export function KittenTail({ coat = 'ginger' }: { coat?: KittenCoat }) {
  const uid = useSvgId('ktail');
  const p = COATS[coat] ?? COATS.ginger;
  const d = 'M0 0 C 16 2 27 -8 27 -21 C 27 -29 21 -32 17 -28';
  return (
    <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
      <Defs>
        <LinearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={p.point ?? p.base} />
          <Stop offset="1" stopColor={p.point ? '#3E2A20' : p.light} />
        </LinearGradient>
      </Defs>
      <Path d={d} stroke={p.point ? '#2E1E16' : p.shade} strokeWidth={14} strokeLinecap="round" fill="none" />
      <Path d={d} stroke={`url(#${uid})`} strokeWidth={11} strokeLinecap="round" fill="none" />
      {p.stripe ? <Path d={d} stroke={p.stripe} strokeWidth={11} strokeLinecap="butt" strokeDasharray="3.5 6.5" fill="none" opacity={0.55} /> : null}
    </Svg>
  );
}
