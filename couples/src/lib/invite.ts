import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'remedy.pendingInvite';

/** Код из ссылки-приглашения хранится до тех пор, пока человек не войдёт и не присоединится. */
export async function savePendingInvite(code: string) {
  await AsyncStorage.setItem(KEY, code.trim().toUpperCase());
}

export async function getPendingInvite(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function clearPendingInvite() {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Код из ссылки вида …/couples/?join=КОД. Читается один раз при запуске, до того как
 * навигация успеет перенаправить на экран входа и убрать параметр из адреса.
 */
export const inviteFromUrl: string | null = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('join');
  return code ? code.trim().toUpperCase() : null;
})();

if (inviteFromUrl) {
  savePendingInvite(inviteFromUrl).catch(() => {});
}
