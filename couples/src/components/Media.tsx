import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signedUrl } from '../lib/media';
import type { Message } from '../lib/types';
import { GradientFill } from './Gradient';

/** Временная ссылка на файл (или локальный файл, пока он загружается). */
export function useMediaUrl(message: Message) {
  const [url, setUrl] = useState<string | null>(message.local_uri ?? null);
  useEffect(() => {
    let alive = true;
    if (message.media_path) {
      signedUrl(message.media_path).then((u) => {
        if (alive && u) setUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [message.media_path]);
  return url;
}

function boxSize(message: Message) {
  const w = message.media_width || 4;
  const h = message.media_height || 3;
  const width = 230;
  const height = Math.min(320, Math.max(140, (width * h) / w));
  return { width, height };
}

/** Фото или видео внутри ленты сообщений. */
export function MediaBubble({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const url = useMediaUrl(message);
  const { width, height } = boxSize(message);
  const isVideo = message.media_type === 'video';

  return (
    <Pressable onPress={onOpen} disabled={!url || message.sending} style={[s.box, { width, height }]}>
      {isVideo ? (
        <>
          <GradientFill colors={['#3A2340', '#7D2350']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={s.play}>
            <Text style={{ color: '#fff', fontSize: 26, marginLeft: 4 }}>▶</Text>
          </View>
          <Text style={s.videoLabel}>🎬 Видео</Text>
        </>
      ) : url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      {!url || message.sending ? (
        <View style={s.overlay}>
          <ActivityIndicator color="#fff" />
          {message.sending ? <Text style={s.overlayText}>Отправка…</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls />;
}

/** Просмотр на весь экран. */
export function MediaViewer({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const url = useMediaUrl(message ?? ({ id: '', media_path: null } as unknown as Message));
  return (
    <Modal visible={Boolean(message)} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.viewer}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {!url ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : message?.media_type === 'video' ? (
              <VideoPlayer url={url} />
            ) : (
              <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            )}
          </View>
          {message?.body ? <Text style={s.caption}>{message.body}</Text> : null}
        </SafeAreaView>
        <Pressable onPress={onClose} style={s.close} hitSlop={12} accessibilityLabel="Закрыть">
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  box: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#F3E6EC',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 6px 14px rgba(122, 46, 72, 0.15)',
  },
  play: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: { position: 'absolute', left: 12, bottom: 10, color: '#fff', fontWeight: '700', fontSize: 13 },
  overlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  overlayText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  viewer: { flex: 1, backgroundColor: '#0D0A0C' },
  close: {
    position: 'absolute',
    top: 54,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { color: '#fff', fontSize: 16, textAlign: 'center', padding: 16 },
});
