import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pickMedia, uploadMedia } from '../lib/media';
import { useAuth } from '../providers/AuthProvider';
import { colors, gradients, radius, shadows, spacing } from '../theme';
import { GradientFill } from './Gradient';
import Wallpaper, { WALLPAPERS } from './Wallpaper';

/** Мини-превью: обои и два пузыря сообщений, чтобы сразу было видно, как будет выглядеть чат. */
function Preview({ value, selected, name, onPress }: { value: string; selected: boolean; name: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tileWrap, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button" accessibilityState={{ selected }}>
      <View style={[s.tile, selected && s.tileSelected]}>
        <Wallpaper value={value} />
        <View style={[s.bubble, s.theirs]} />
        <View style={[s.bubble, s.mine]}>
          <GradientFill colors={gradients.primary} />
        </View>
        {selected ? (
          <View style={s.check}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text style={[s.name, selected && { color: colors.primaryDeep, fontWeight: '800' }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

/** Выбор обоев чата: готовые или своё фото. Сохраняется в профиле — у каждого партнёра свои. */
export default function WallpaperPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile, updateProfile } = useAuth();
  const current = profile?.chat_wallpaper ?? 'default';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (value: string) => {
    setError(null);
    try {
      await updateProfile({ chat_wallpaper: value === 'default' ? null : value });
    } catch {
      setError('Не получилось сохранить обои.');
    }
  };

  const choosePhoto = async () => {
    if (!profile?.couple_id) return;
    setError(null);
    try {
      const picked = await pickMedia({ imagesOnly: true });
      if (!picked) return;
      setBusy(true);
      const path = await uploadMedia(profile.couple_id, picked);
      await updateProfile({ chat_wallpaper: `photo:${path}` });
    } catch (e) {
      setError((e as Error).message || 'Не получилось загрузить фото.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>Обои чата</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Закрыть">
            <Text style={{ fontSize: 20, color: colors.muted, fontWeight: '700' }}>✕</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>Видны только вам — у партнёра могут быть свои</Text>
        <ScrollView contentContainerStyle={s.grid}>
          {WALLPAPERS.map((w) => (
            <Preview key={w.id} value={w.id} name={w.name} selected={current === w.id || (w.id === 'default' && !profile?.chat_wallpaper)} onPress={() => choose(w.id)} />
          ))}
          {current.startsWith('photo:') ? <Preview value={current} name="Ваше фото" selected onPress={() => {}} /> : null}
          <Pressable onPress={choosePhoto} disabled={busy} style={({ pressed }) => [s.tileWrap, pressed && { transform: [{ scale: 0.96 }] }]}>
            <View style={[s.tile, s.photoTile]}>{busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ fontSize: 30 }}>🖼️</Text>}</View>
            <Text style={s.name}>{busy ? 'Загрузка…' : 'Своё фото'}</Text>
          </Pressable>
        </ScrollView>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30, 10, 20, 0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '80%',
    boxShadow: '0px -10px 30px rgba(122, 46, 72, 0.18)',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingBottom: spacing.lg },
  tileWrap: { width: '30%', alignItems: 'center', gap: 6 },
  tile: { width: '100%', aspectRatio: 0.62, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', boxShadow: shadows.soft },
  tileSelected: { borderColor: colors.primary, boxShadow: '0px 6px 16px rgba(232, 87, 126, 0.35)' },
  photoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4F7', borderStyle: 'dashed', borderColor: colors.primaryLight },
  bubble: { position: 'absolute', height: 14, borderRadius: 7, overflow: 'hidden' },
  theirs: { left: 8, top: '38%', width: '55%', backgroundColor: '#FFFFFF' },
  mine: { right: 8, top: '55%', width: '50%' },
  check: { position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 12, color: colors.text, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', paddingBottom: spacing.sm },
});
