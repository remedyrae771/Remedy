import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Уникальный и безопасный для SVG id (useId содержит двоеточия). */
export function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Градиентная заливка на весь родительский блок. Работает и на телефоне, и в браузере
 * (через SVG). Родителю нужен overflow: 'hidden', если у него скруглённые углы.
 */
export function GradientFill({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  radial = false,
  center = { x: 0.5, y: 0.4 },
  opacity = 1,
  style,
}: {
  colors: readonly string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  radial?: boolean;
  center?: { x: number; y: number };
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useSvgId('grad');
  const stops = colors.map((c, i) => (
    <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} stopOpacity={radial && i === colors.length - 1 ? 0 : 1} />
  ));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {radial ? (
            <RadialGradient id={id} cx={center.x} cy={center.y} rx={0.6} ry={0.6} fx={center.x} fy={center.y}>
              {stops}
            </RadialGradient>
          ) : (
            <LinearGradient id={id} x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
              {stops}
            </LinearGradient>
          )}
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
      </Svg>
    </View>
  );
}
