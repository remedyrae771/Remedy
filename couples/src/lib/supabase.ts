import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Обновляем токен только пока приложение на экране.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Человекочитаемое сообщение об ошибке Supabase/Postgres. */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const known: Record<string, string> = {
    'invalid code': 'Код не найден. Проверьте, правильно ли он введён.',
    'couple is full': 'В этой паре уже двое.',
    'already in a couple': 'Вы уже состоите в паре.',
    'Invalid login credentials': 'Неверная почта или пароль.',
    'User already registered': 'Пользователь с такой почтой уже зарегистрирован.',
  };
  for (const [key, text] of Object.entries(known)) {
    if (message.includes(key)) return text;
  }
  return message;
}
