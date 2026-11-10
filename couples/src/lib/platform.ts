import * as Clipboard from 'expo-clipboard';
import { Alert, Platform, Share } from 'react-native';

/** Адрес веб-версии: по нему открываются приглашения. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://remedyrae771.github.io/Remedy').replace(/\/$/, '');

/** Реферальная ссылка-приглашение для партнёра. */
export function inviteLink(code: string): string {
  return `${WEB_URL}/join?code=${encodeURIComponent(code)}`;
}

export function inviteMessage(code: string, name?: string): string {
  const from = name ? `${name} приглашает тебя` : 'Приглашаю тебя';
  return `${from} в Remedy 💞 — наше пространство на двоих. Открой ссылку и зарегистрируйся, мы сразу окажемся в паре:\n${inviteLink(code)}`;
}

/**
 * Поделиться текстом: системное меню «Поделиться», а где его нет (веб на компьютере) —
 * копирование в буфер. Возвращает 'shared' | 'copied' | 'failed'.
 */
export async function shareOrCopy(message: string, copyText = message): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ text: message });
        return 'shared';
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return 'failed';
      }
    }
    try {
      await Clipboard.setStringAsync(copyText);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'failed' : 'shared';
  } catch {
    return 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/** Подтверждение опасного действия: Alert на телефоне, confirm() в браузере. */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
