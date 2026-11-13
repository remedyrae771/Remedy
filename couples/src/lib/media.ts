import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const MEDIA_BUCKET = 'chat-media';
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // лимит хранилища на один файл

export type PickedMedia = {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  width: number;
  height: number;
  size?: number;
  file?: Blob;
};

/** Открыть галерею (на iPhone в браузере там же можно снять фото или видео). */
export async function pickMedia(): Promise<PickedMedia | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Разрешите доступ к фото в настройках телефона.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
    allowsMultipleSelection: false,
    videoMaxDuration: 180,
  });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  const type: 'image' | 'video' = a.type === 'video' || a.mimeType?.startsWith('video/') ? 'video' : 'image';
  return {
    uri: a.uri,
    type,
    mimeType: a.mimeType ?? (type === 'video' ? 'video/mp4' : 'image/jpeg'),
    width: a.width || 1,
    height: a.height || 1,
    size: a.fileSize ?? a.file?.size,
    file: a.file,
  };
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Загружает файл в папку пары и возвращает путь в хранилище. */
export async function uploadMedia(coupleId: string, media: PickedMedia): Promise<string> {
  if (media.size && media.size > MAX_MEDIA_BYTES) {
    throw new Error('Файл больше 50 МБ. Выберите видео покороче.');
  }
  const ext = EXT[media.mimeType] ?? (media.type === 'video' ? 'mp4' : 'jpg');
  const path = `${coupleId}/${randomId()}.${ext}`;
  const body: Blob | ArrayBuffer = media.file ?? (await (await fetch(media.uri)).arrayBuffer());
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: media.mimeType, upsert: false });
  if (error) throw new Error(error.message.includes('exceeded') ? 'Файл слишком большой.' : 'Не получилось загрузить файл. Проверьте интернет.');
  return path;
}

// Временные ссылки живут час; кэшируем, чтобы не запрашивать их при каждой перерисовке.
const urlCache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3600_000 });
  return data.signedUrl;
}
