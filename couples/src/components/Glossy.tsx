import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { GradientFill } from './Gradient';

/** Тона объёмных глянцевых кнопок: заливка сверху вниз, «бортик» снизу и цвет мягкой тени. */
export const GLOSS = {
  primary: { fill: ['#FF9FBA', '#EF6E94', '#D4486F'], edge: '#A9325A', glow: 'rgba(201, 61, 104, 0.38)', text: '#FFFFFF' },
  light: { fill: ['#FFFFFF', '#FFF7FA', '#FBE5ED'], edge: '#E9C2D0', glow: 'rgba(122, 46, 72, 0.16)', text: '#B23A63' },
  rose: { fill: ['#FFE9F0', '#FFD3E0', '#F8B5CA'], edge: '#E293AD', glow: 'rgba(201, 61, 104, 0.22)', text: '#A82E58' },
  green: { fill: ['#8EE3B5', '#4CC488', '#2F9E6B'], edge: '#21774F', glow: 'rgba(47, 158, 107, 0.35)', text: '#FFFFFF' },
  danger: { fill: ['#FFFFFF', '#FFF5F5', '#FBE3E3'], edge: '#EDC1C1', glow: 'rgba(180, 40, 40, 0.14)', text: '#C0392B' },
} as const;

export type GlossTone = keyof typeof GLOSS;

/** Тень объёмной кнопки: плотный бортик + мягкая тень. При нажатии бортик «уходит» под кнопку. */
export function glossShadow(tone: GlossTone, pressed = false, depth = 4) {
  const t = GLOSS[tone];
  const d = pressed ? 1 : depth;
  return `0px ${d}px 0px ${t.edge}, 0px ${pressed ? 3 : depth + 6}px ${pressed ? 6 : 16}px ${t.glow}`;
}

/** Заливка и глянцевый блик сверху. Родителю нужен overflow: 'hidden' и скругление. */
export function GlossFace({ tone, radius = 999 }: { tone: GlossTone; radius?: number }) {
  return (
    <>
      <GradientFill colors={GLOSS[tone].fill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 3, right: 3, top: 2, height: '50%', borderRadius: radius, overflow: 'hidden' }}
      >
        <GradientFill colors={tone === 'primary' || tone === 'green' ? ['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.06)'] : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.1)']} />
      </View>
    </>
  );
}

/**
 * Объёмная глянцевая кнопка: при касании вдавливается вниз на высоту бортика.
 * style — размеры и отступы; скругление задаётся через radius.
 */
export function GlossPressable({
  tone = 'light',
  radius = 999,
  depth = 4,
  style,
  children,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  tone?: GlossTone;
  radius?: number;
  depth?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable
      disabled={disabled}
      {...rest}
      style={({ pressed }) => {
        const down = pressed && !disabled;
        return [
          {
            borderRadius: radius,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.55)',
            boxShadow: glossShadow(tone, down, depth),
            transform: [{ translateY: down ? depth - 1 : 0 }],
            marginBottom: depth,
          },
          style,
        ];
      }}
    >
      <GlossFace tone={tone} radius={radius} />
      {children}
    </Pressable>
  );
}
