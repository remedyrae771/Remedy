import AsyncStorage from '@react-native-async-storage/async-storage';

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
