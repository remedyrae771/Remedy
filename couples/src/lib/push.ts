import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { supabase } from './supabase';

/** Push-уведомления в веб-версии (браузер или приложение на экране «Домой»). */

const APP_PATH = '/Remedy/couples/';
const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL}/functions/v1/notify`;
const API_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

export type PushState =
  | 'unsupported' // браузер не умеет push
  | 'needs-install' // iPhone: работает только с иконки на экране «Домой»
  | 'denied' // пользователь запретил уведомления в настройках
  | 'off'
  | 'on';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function isIOS() {
  return isWeb && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (!isWeb) return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function supported() {
  return isWeb && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  return navigator.serviceWorker.register(`${APP_PATH}sw.js`, { scope: APP_PATH });
}

export async function getPushState(): Promise<PushState> {
  if (!isWeb) return 'unsupported';
  if (!supported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(APP_PATH);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Включить уведомления. Вызывать только из нажатия кнопки — так требует iPhone. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return getPushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await registration();
  await navigator.serviceWorker.ready;

  const res = await fetch(FUNCTION_URL, { headers: { apikey: API_KEY } });
  if (!res.ok) throw new Error('Сервер уведомлений пока не настроен. Попробуйте позже.');
  const { publicKey } = (await res.json()) as { publicKey: string };

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));

  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return getPushState();
  const reg = await navigator.serviceWorker.getRegistration(APP_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'off';
}

/** При запуске держим service worker зарегистрированным (обновляет его после выхода новой версии). */
export function registerServiceWorker() {
  if (supported()) registration().catch(() => {});
}
