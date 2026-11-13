import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSvgId } from './Gradient';
import type { PetMood } from './Pet';

/**
 * Рыжий полосатый котёнок: большая голова, крупные зелёные глаза со зрачками и бликами,
 * белая мордочка, усы, кисточки в ушах, пушистая грудка. Система координат та же,
 * что у остальных питомцев: viewBox "-6 -12 172 172", земля на y≈156.
 */

const FUR = { light: '#FFD9AE', base: '#F3A65C', shade: '#C9742C', stripe: '#C2681F' };
const DARK = '#2B1A12';

/** Отражение пути по горизонтали относительно центра мордочки (x = 80). */
const mirror = (x: number) => 160 - x;

function Ear({ side, droop, uid }: { side: 'left' | 'right'; droop: boolean; uid: string }) {
  const s = side === 'left' ? 1 : -1;
  const X = (x: number) => (side === 'left' ? x : mirror(x));
  const outer = `M${X(30)} 52 Q${X(26)} 12 ${X(42)} 2 Q${X(60)} 16 ${X(72)} 34 Z`;
  const inner = `M${X(38)} 44 Q${X(36)} 20 ${X(45)} 13 Q${X(57)} 24 ${X(64)} 34 Z`;
  return (
    <G transform={droop ? `rotate(${-22 * s} ${X(52)} 42)` : undefined}>
      <Path d={outer} fill={`url(#${uid}head)`} />
      <Path d={inner} fill={`url(#${uid}ear)`} />
      {/* кисточки шерсти внутри уха */}
      <G stroke="#FFF6EC" strokeWidth={1.6} strokeLinecap="round" opacity={0.9}>
        <Path d={`M${X(45)} 40 Q${X(43)} 30 ${X(45)} 22`} fill="none" />
        <Path d={`M${X(50)} 40 Q${X(50)} 31 ${X(52)} 25`} fill="none" />
        <Path d={`M${X(55)} 40 Q${X(56)} 33 ${X(58)} 29`} fill="none" />
      </G>
    </G>
  );
}

function OpenEye({ cx, cy, sad, uid }: { cx: number; cy: number; sad: boolean; uid: string }) {
  const pupil = sad ? { rx: 8.4, ry: 11 } : { rx: 6.8, ry: 10 };
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={15.2} ry={15.8} fill={DARK} />
      <Ellipse cx={cx} cy={cy} rx={13.6} ry={14.2} fill={`url(#${uid}iris)`} />
      <Ellipse cx={cx} cy={cy + 0.5} rx={pupil.rx} ry={pupil.ry} fill="#120A07" />
      {/* блики: большой сверху и маленький снизу — «живые» глаза */}
      <Circle cx={cx + 5} cy={cy - 6} r={5} fill="#FFFFFF" />
      <Circle cx={cx - 5} cy={cy + 6} r={2.3} fill="#FFFFFF" opacity={0.85} />
      {sad ? <Path d={`M${cx - 9} ${cy + 9} Q${cx} ${cy + 14} ${cx + 9} ${cy + 9}`} stroke="#FFFFFF" strokeWidth={1.4} fill="none" opacity={0.7} /> : null}
      {/* мягкая тень века */}
      <Path d={`M${cx - 15} ${cy - 8} Q${cx} ${cy - 21} ${cx + 15} ${cy - 9}`} stroke={FUR.shade} strokeWidth={2.4} fill="none" opacity={0.35} />
    </G>
  );
}

function Eyes({ mood, blink, uid }: { mood: PetMood; blink: boolean; uid: string }) {
  const line = { stroke: DARK, strokeWidth: 3.8, strokeLinecap: 'round' as const, fill: 'none' };
  if (mood === 'happy') {
    return (
      <G {...line}>
        <Path d="M42 75 Q57 59 72 75" />
        <Path d="M88 75 Q103 59 118 75" />
      </G>
    );
  }
  if (mood === 'sleepy' || blink) {
    return (
      <G {...line}>
        <Path d="M43 72 Q57 83 71 72" />
        <Path d="M89 72 Q103 83 117 72" />
        <G strokeWidth={2} opacity={0.8}>
          <Path d="M44 73 l-4 3" />
          <Path d="M116 73 l4 3" />
        </G>
      </G>
    );
  }
  return (
    <G>
      <OpenEye cx={57} cy={72} sad={mood === 'sad'} uid={uid} />
      <OpenEye cx={103} cy={72} sad={mood === 'sad'} uid={uid} />
      {mood === 'sad' ? (
        <G stroke={DARK} strokeWidth={2.4} strokeLinecap="round" opacity={0.6}>
          <Path d="M43 53 L58 49" />
          <Path d="M117 53 L102 49" />
        </G>
      ) : null}
    </G>
  );
}

function Mouth({ mood }: { mood: PetMood }) {
  const line = { stroke: DARK, strokeWidth: 2.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (mood) {
    case 'happy':
      return (
        <G>
          <Path d="M80 92.5 v2.5" {...line} />
          <Path d="M72.5 96 Q80 110 87.5 96 Q80 99.5 72.5 96 Z" fill="#D9486C" stroke={DARK} strokeWidth={2.2} strokeLinejoin="round" />
          <Ellipse cx={80} cy={103} rx={4} ry={2.6} fill="#FF8FA8" />
        </G>
      );
    case 'sad':
      return (
        <G>
          <Path d="M80 92.5 v3.5" {...line} />
          <Path d="M73 101 Q80 95.5 87 101" {...line} />
        </G>
      );
    case 'sleepy':
      return <Ellipse cx={80} cy={98} rx={2.6} ry={3.2} fill={DARK} opacity={0.75} />;
    default:
      return (
        <G>
          <Path d="M80 92.5 v3" {...line} />
          <Path d="M72.5 96.5 Q76.5 101 80 96 Q83.5 101 87.5 96.5" {...line} />
        </G>
      );
  }
}

export function KittenArt({ mood, size = 160, blink = false }: { mood: PetMood; size?: number; blink?: boolean }) {
  const uid = useSvgId('kit');
  // Уникальный префикс id: несколько котят на одном экране не путают свои градиенты.
  const ref = (name: string) => `${uid}${name}`;

  const sad = mood === 'sad';

  return (
    <Svg width={size} height={size} viewBox="-6 -12 172 172">
      <Defs>
        <RadialGradient id={ref('head')} cx="0.38" cy="0.3" rx="0.75" ry="0.75" fx="0.33" fy="0.24">
          <Stop offset="0" stopColor={FUR.light} />
          <Stop offset="0.55" stopColor={FUR.base} />
          <Stop offset="1" stopColor={FUR.shade} />
        </RadialGradient>
        <RadialGradient id={ref('body')} cx="0.4" cy="0.2" rx="0.85" ry="0.85">
          <Stop offset="0" stopColor={FUR.light} />
          <Stop offset="0.6" stopColor={FUR.base} />
          <Stop offset="1" stopColor={FUR.shade} />
        </RadialGradient>
        <LinearGradient id={ref('ear')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F59AAE" />
          <Stop offset="1" stopColor="#FBC9D2" />
        </LinearGradient>
        <RadialGradient id={ref('white')} cx="0.45" cy="0.3" rx="0.7" ry="0.7">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#F6E3D2" />
        </RadialGradient>
        <RadialGradient id={ref('iris')} cx="0.45" cy="0.55" rx="0.6" ry="0.6">
          <Stop offset="0" stopColor="#E3F5A0" />
          <Stop offset="0.45" stopColor="#97CF5C" />
          <Stop offset="1" stopColor="#3E7A2A" />
        </RadialGradient>
        <LinearGradient id={ref('nose')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F7A1B5" />
          <Stop offset="1" stopColor="#D9677F" />
        </LinearGradient>
        <RadialGradient id={ref('blush')} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
          <Stop offset="0" stopColor="#FF7E9E" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#FF7E9E" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={ref('tear')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E3F5FF" />
          <Stop offset="1" stopColor="#7CC4F0" />
        </LinearGradient>
      </Defs>

      <KittenBody uid={uid} />

      {/* уши за головой */}
      <G>
        <Ear side="left" droop={sad} uid={uid} />
        <Ear side="right" droop={sad} uid={uid} />
      </G>

      {/* голова с пушистыми щёчками */}
      <Path
        d="M80 25 C 112 25 134 44 134 70 C 134 76 138 79 141 82 C 135 84 134 86 133 89 C 128 104 108 116 80 116 C 52 116 32 104 27 89 C 26 86 25 84 19 82 C 22 79 26 76 26 70 C 26 44 48 25 80 25 Z"
        fill={`url(#${ref('head')})`}
      />
      {/* полоски «М» на лбу и на щеках */}
      <G stroke={FUR.stripe} strokeWidth={3.4} strokeLinecap="round" fill="none" opacity={0.55}>
        <Path d="M69 32 Q71 40 69 47" />
        <Path d="M80 29 L80 45" />
        <Path d="M91 32 Q89 40 91 47" />
        <Path d="M28 70 Q36 69 41 73" />
        <Path d="M29 79 Q36 78 41 81" />
        <Path d={`M${mirror(28)} 70 Q${mirror(36)} 69 ${mirror(41)} 73`} />
        <Path d={`M${mirror(29)} 79 Q${mirror(36)} 78 ${mirror(41)} 81`} />
      </G>
      {/* светлая мордочка и подбородок */}
      <Ellipse cx={71} cy={95} rx={12} ry={9.5} fill={`url(#${ref('white')})`} />
      <Ellipse cx={89} cy={95} rx={12} ry={9.5} fill={`url(#${ref('white')})`} />
      <Ellipse cx={80} cy={104} rx={9} ry={6} fill={`url(#${ref('white')})`} />
      {/* блик на макушке */}
      <Ellipse cx={60} cy={40} rx={18} ry={8} fill="#FFFFFF" opacity={0.28} transform="rotate(-20 60 40)" />

      <Ellipse cx={46} cy={90} rx={10} ry={6} fill={`url(#${ref('blush')})`} />
      <Ellipse cx={114} cy={90} rx={10} ry={6} fill={`url(#${ref('blush')})`} />

      <Eyes mood={mood} blink={blink} uid={uid} />

      {/* носик с ноздрями и бликом */}
      <Path d="M73.5 85.5 Q80 82.5 86.5 85.5 Q84.5 91 80 92.5 Q75.5 91 73.5 85.5 Z" fill={`url(#${ref('nose')})`} />
      <Ellipse cx={78} cy={86} rx={2.2} ry={1} fill="#FFFFFF" opacity={0.75} />
      <Circle cx={77.6} cy={89.4} r={0.9} fill={DARK} opacity={0.45} />
      <Circle cx={82.4} cy={89.4} r={0.9} fill={DARK} opacity={0.45} />

      <Mouth mood={mood} />

      {/* усы */}
      <G stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" opacity={0.9}>
        <Path d="M62 93 L26 86" />
        <Path d="M62 97 L25 97" />
        <Path d="M63 101 L28 108" />
        <Path d={`M${mirror(62)} 93 L${mirror(26)} 86`} />
        <Path d={`M${mirror(62)} 97 L${mirror(25)} 97`} />
        <Path d={`M${mirror(63)} 101 L${mirror(28)} 108`} />
      </G>

      {sad ? <Path d="M49 89 Q45.5 97 49 100.5 Q52.5 97 49 89 Z" fill={`url(#${ref('tear')})`} /> : null}
    </Svg>
  );
}

function KittenBody({ uid }: { uid: string }) {
  return (
    <G>
      <Ellipse cx={80} cy={130} rx={37} ry={27} fill={`url(#${uid}body)`} />
      {/* полоски на боках */}
      <G stroke={FUR.stripe} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.45}>
        <Path d="M47 122 Q53 124 55 130" />
        <Path d="M46 132 Q52 133 54 138" />
        <Path d={`M${mirror(47)} 122 Q${mirror(53)} 124 ${mirror(55)} 130`} />
        <Path d={`M${mirror(46)} 132 Q${mirror(52)} 133 ${mirror(54)} 138`} />
      </G>
      {/* пушистая грудка */}
      <Path
        d="M62 110 Q80 102 98 110 L96 121 L100 127 L94 131 L96 139 L88 137 L85 147 L80 141 L75 147 L72 137 L64 139 L66 131 L60 127 L64 121 Z"
        fill={`url(#${uid}white)`}
      />
      {/* передние лапки с белыми «носочками» */}
      <Ellipse cx={66} cy={149} rx={12} ry={8.5} fill={`url(#${uid}body)`} />
      <Ellipse cx={94} cy={149} rx={12} ry={8.5} fill={`url(#${uid}body)`} />
      <Ellipse cx={66} cy={152} rx={10} ry={5.5} fill={`url(#${uid}white)`} />
      <Ellipse cx={94} cy={152} rx={10} ry={5.5} fill={`url(#${uid}white)`} />
      <G stroke="#D8BBA5" strokeWidth={1.4} strokeLinecap="round">
        <Path d="M62.5 150 v4" />
        <Path d="M69.5 150 v4" />
        <Path d="M90.5 150 v4" />
        <Path d="M97.5 150 v4" />
      </G>
    </G>
  );
}

/** Хвост котёнка: пушистый, с тёмными кольцами. Основание в точке (0, 0). */
export function KittenTail() {
  const uid = useSvgId('ktail');
  const d = 'M0 0 C 16 2 27 -8 27 -21 C 27 -29 21 -32 17 -28';
  return (
    <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
      <Defs>
        <LinearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={FUR.base} />
          <Stop offset="1" stopColor={FUR.light} />
        </LinearGradient>
      </Defs>
      <Path d={d} stroke={FUR.shade} strokeWidth={13} strokeLinecap="round" fill="none" />
      <Path d={d} stroke={`url(#${uid})`} strokeWidth={10.5} strokeLinecap="round" fill="none" />
      <Path d={d} stroke={FUR.stripe} strokeWidth={10.5} strokeLinecap="butt" strokeDasharray="3.5 6.5" fill="none" opacity={0.55} />
    </Svg>
  );
}
