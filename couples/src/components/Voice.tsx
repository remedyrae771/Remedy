import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDuration, webVoiceMimeType } from '../lib/media';
import type { Message } from '../lib/types';
import { colors, gradients, shadows, spacing } from '../theme';
import { GradientFill } from './Gradient';
import { useMediaUrl } from './Media';

const BARS = 28;

/** Псевдо-«волна» из id сообщения: одинаковая у обоих партнёров и при каждой отрисовке. */
function waveform(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: BARS }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const base = 0.35 + ((h >>> 16) % 1000) / 1000 * 0.65;
    const envelope = Math.sin((Math.PI * (i + 1)) / (BARS + 1));
    return Math.max(0.18, base * (0.55 + envelope * 0.45));
  });
}

function Bars({ seed, progress, mine }: { seed: string; progress: number; mine: boolean }) {
  const bars = useMemo(() => waveform(seed), [seed]);
  const on = mine ? '#FFFFFF' : colors.primary;
  const off = mine ? 'rgba(255,255,255,0.45)' : 'rgba(201, 61, 104, 0.28)';
  return (
    <View style={s.bars}>
      {bars.map((v, i) => (
        <View key={i} style={[s.bar, { height: 4 + v * 22, backgroundColor: i / BARS < progress ? on : off }]} />
      ))}
    </View>
  );
}

/** Плеер создаётся только после первого нажатия — в ленте может быть много голосовых. */
function ActivePlayer({ url, message, mine }: { url: string; message: Message; mine: boolean }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const started = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (!started.current && status.isLoaded) {
      started.current = true;
      player.play();
    }
  }, [player, status.isLoaded]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
    }
  }, [player, status.didJustFinish]);

  const duration = status.duration || Number(message.media_duration) || 0;
  const progress = duration ? Math.min(1, status.currentTime / duration) : 0;

  return (
    <View style={s.row}>
      <Pressable onPress={() => (status.playing ? player.pause() : player.play())} style={[s.play, mine ? s.playMine : s.playTheirs]} accessibilityLabel={status.playing ? 'Пауза' : 'Слушать'}>
        <Text style={[s.playIcon, { color: mine ? colors.primaryDeep : '#fff' }]}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={{ gap: 2 }}>
        <Bars seed={message.id} progress={progress} mine={mine} />
        <Text style={[s.duration, { color: mine ? 'rgba(255,255,255,0.85)' : colors.muted }]}>
          {status.playing || status.currentTime > 0 ? formatDuration(status.currentTime) : formatDuration(duration)}
        </Text>
      </View>
    </View>
  );
}

/** Голосовое сообщение в ленте. */
export function VoiceBubble({ message, mine }: { message: Message; mine: boolean }) {
  const url = useMediaUrl(message);
  const [active, setActive] = useState(false);

  if (active && url) return <ActivePlayer url={url} message={message} mine={mine} />;
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => setActive(true)}
        disabled={!url || message.sending}
        style={[s.play, mine ? s.playMine : s.playTheirs, (!url || message.sending) && { opacity: 0.6 }]}
        accessibilityLabel="Слушать"
      >
        <Text style={[s.playIcon, { color: mine ? colors.primaryDeep : '#fff' }]}>{message.sending ? '…' : '▶'}</Text>
      </Pressable>
      <View style={{ gap: 2 }}>
        <Bars seed={message.id} progress={0} mine={mine} />
        <Text style={[s.duration, { color: mine ? 'rgba(255,255,255,0.85)' : colors.muted }]}>
          {message.sending ? 'Отправка…' : formatDuration(Number(message.media_duration))}
        </Text>
      </View>
    </View>
  );
}

const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  web: { ...RecordingPresets.HIGH_QUALITY.web, mimeType: webVoiceMimeType() },
};

/**
 * Панель записи голосового: запись начинается сразу при появлении панели.
 * onSend получает адрес файла и длительность в секундах.
 */
export function VoiceRecorder({ onSend, onCancel, onError }: { onSend: (uri: string, seconds: number) => void; onCancel: () => void; onError: (message: string) => void }) {
  const recorder = useAudioRecorder(RECORD_OPTIONS);
  const state = useAudioRecorderState(recorder, 200);
  const [ready, setReady] = useState(false);
  const [pulse] = useState(() => new Animated.Value(0));
  const finished = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) throw new Error('Разрешите доступ к микрофону, чтобы записывать голосовые.');
        if (Platform.OS !== 'web') await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!alive) return;
        recorder.record();
        setReady(true);
      } catch (e) {
        onError((e as Error).message || 'Не получилось включить микрофон.');
      }
    })();
    return () => {
      alive = false;
      if (!finished.current) recorder.stop().catch(() => {});
    };
    // запись запускается один раз при открытии панели
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const finish = async (send: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const seconds = (state.durationMillis ?? 0) / 1000;
    try {
      await recorder.stop();
    } catch {
      // запись уже остановлена
    }
    if (Platform.OS !== 'web') setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (send && uri && seconds >= 0.5) onSend(uri, seconds);
    else onCancel();
  };

  return (
    <View style={s.recorder}>
      <Pressable onPress={() => finish(false)} hitSlop={10} style={s.cancel} accessibilityLabel="Отменить запись">
        <Text style={{ fontSize: 18, color: colors.muted, fontWeight: '700' }}>✕</Text>
      </Pressable>
      <Animated.View style={[s.dot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }]} />
      <Text style={s.timer}>{ready ? formatDuration((state.durationMillis ?? 0) / 1000) : 'Микрофон…'}</Text>
      <Text style={s.hint} numberOfLines={1}>
        Идёт запись
      </Text>
      <Pressable onPress={() => finish(true)} disabled={!ready} style={[s.send, !ready && { opacity: 0.5 }]} accessibilityLabel="Отправить голосовое">
        <GradientFill colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginLeft: 2 }}>➤</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playMine: { backgroundColor: '#FFFFFF' },
  playTheirs: { backgroundColor: colors.primary },
  playIcon: { fontSize: 15, fontWeight: '800', marginLeft: 2 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  bar: { width: 3, borderRadius: 2 },
  duration: { fontSize: 11, fontVariant: ['tabular-nums'] },
  recorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: 6,
    paddingLeft: spacing.sm,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    boxShadow: shadows.card,
  },
  cancel: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#E5484D' },
  timer: { fontSize: 17, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  hint: { flex: 1, color: colors.muted, fontSize: 14 },
  send: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', boxShadow: shadows.button },
});
