import { Text, View } from 'react-native';
import { shadows } from '../theme';
import { GradientFill } from './Gradient';

export const AVATAR_TINTS = {
  me: ['#F7849F', '#C93D68'],
  partner: ['#B9A6F2', '#7D63C9'],
  empty: ['#E4DCE2', '#C7B9C2'],
} as const;

const initial = (name: string | null | undefined) => (name?.trim()?.[0] ?? '♥').toUpperCase();

/** Круглая объёмная аватарка с первой буквой имени; online — зелёная точка «в сети». */
export default function Avatar({
  name,
  tint,
  size = 44,
  online = false,
}: {
  name: string | null | undefined;
  tint: readonly string[];
  size?: number;
  online?: boolean;
}) {
  return (
    <View>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: '#FFFFFF',
          boxShadow: shadows.soft,
        }}
      >
        <GradientFill colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initial(name)}</Text>
      </View>
      {online ? (
        <View
          accessibilityLabel="в сети"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size,
            backgroundColor: '#3BC47F',
            borderWidth: 2.5,
            borderColor: '#FFFFFF',
          }}
        />
      ) : null}
    </View>
  );
}
