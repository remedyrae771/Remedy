import { Children, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing } from '../theme';
import Appear from './Appear';
import { GlossFace, GlossPressable, glossShadow } from './Glossy';
import { GradientFill } from './Gradient';

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <GradientFill colors={[colors.backgroundTop, colors.background, colors.backgroundBottom]} />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
          {/* Блоки экрана появляются «лесенкой» при открытии */}
          {Children.map(children, (child, i) => (
            <Appear delay={Math.min(i, 8) * 55}>{child}</Appear>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Шапка экрана: объёмный значок-эмодзи, крупный заголовок и подпись. */
export function Title({ children, subtitle, emoji }: { children: ReactNode; subtitle?: string; emoji?: string }) {
  return (
    <View style={{ marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {emoji ? (
        <View style={styles.titleOrb}>
          <Text style={{ fontSize: 28 }}>{emoji}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{children}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** Переключатель разделов: «таблетка» с подсвеченным выбранным пунктом. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (key: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [styles.segmentItem, active && { boxShadow: glossShadow('primary', pressed, 3), borderColor: 'rgba(255,255,255,0.55)' }, pressed && { transform: [{ translateY: active ? 2 : 1 }] }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {active ? <GlossFace tone="primary" /> : null}
            <Text style={[styles.segmentText, active && { color: '#FFFFFF' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.muted}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const textColor = { primary: '#fff', secondary: colors.primary, ghost: colors.muted, danger: colors.danger }[variant];
  const content = loading ? (
    <ActivityIndicator color={textColor} />
  ) : (
    <Text style={[styles.buttonText, { color: textColor }, variant === 'primary' && styles.buttonTextOnColor]}>{title}</Text>
  );

  if (variant === 'ghost') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [styles.button, { opacity: isDisabled ? 0.5 : pressed ? 0.6 : 1 }, style]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <GlossPressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      tone={variant === 'primary' ? 'primary' : variant === 'danger' ? 'danger' : 'light'}
      style={[styles.button, { opacity: isDisabled ? 0.55 : 1 }, style]}
    >
      {content}
    </GlossPressable>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} />;
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <GlossPressable onPress={onPress} tone={selected ? 'primary' : 'light'} depth={3} style={styles.chip}>
      <Text style={[styles.chipText, selected && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
    </GlossPressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  titleOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4F7',
    boxShadow: 'inset 0px -4px 8px rgba(201, 61, 104, 0.12), inset 0px 3px 0px rgba(255,255,255,1), 0px 8px 16px rgba(122, 46, 72, 0.12)',
  },
  // «желобок», в котором лежит выпуклая выбранная кнопка
  segment: {
    flexDirection: 'row',
    padding: 5,
    paddingBottom: 8,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: '#F7E4EB',
    boxShadow: 'inset 0px 2px 5px rgba(122, 46, 72, 0.14), inset 0px -1px 0px rgba(255,255,255,0.9), 0px 1px 0px rgba(255,255,255,0.9)',
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    gap: spacing.sm,
    boxShadow: shadows.card,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  muted: { color: colors.muted, fontSize: 14 },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextOnColor: { textShadowColor: 'rgba(140, 30, 70, 0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    boxShadow: 'inset 0px 2px 4px rgba(122, 46, 72, 0.06)',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
