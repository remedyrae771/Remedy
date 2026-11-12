// Edge Function «notify»: отправляет push-уведомления партнёру.
//
//   GET  /functions/v1/notify            → { publicKey } — публичный VAPID-ключ для подписки в приложении
//   POST /functions/v1/notify {table,id} → вызывается триггерами базы (0004_push.sql)
//
// Развернуть: Supabase → Edge Functions → Deploy a new function → Via Editor,
// имя «notify», вставить этот файл, затем в настройках функции выключить «Verify JWT».
// Секреты задавать не нужно: SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase передаёт сам,
// а ключи VAPID функция создаёт при первом запуске и хранит в таблице push_vapid.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const APP_URL = 'https://remedyrae771.github.io/Remedy/couples/';
const FRESH_MS = 2 * 60 * 1000; // уведомляем только о свежих событиях — повторный вызов ничего не разошлёт
const MOOD_LABELS: Record<string, string> = {
  '🥰': 'влюблён(а)',
  '😊': 'хорошо',
  '😌': 'спокойно',
  '😴': 'устал(а)',
  '😔': 'грустно',
  '😤': 'злится',
  '🤒': 'болеет',
  '🤗': 'хочет обнимашек',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let vapidCache: { publicKey: string; privateKey: string } | null = null;

async function getVapid() {
  if (vapidCache) return vapidCache;
  const { data } = await supabase.from('push_vapid').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (data) {
    vapidCache = { publicKey: data.public_key, privateKey: data.private_key };
  } else {
    const keys = webpush.generateVAPIDKeys();
    // Если две функции создали ключи одновременно, остаются первые записанные.
    await supabase.from('push_vapid').upsert(
      { id: 1, public_key: keys.publicKey, private_key: keys.privateKey },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    const { data: saved } = await supabase.from('push_vapid').select('public_key, private_key').eq('id', 1).single();
    vapidCache = { publicKey: saved!.public_key, privateKey: saved!.private_key };
  }
  webpush.setVapidDetails('https://remedyrae771.github.io', vapidCache.publicKey, vapidCache.privateKey);
  return vapidCache;
}

type Notice = { coupleId: string; actorId: string; at: string; title: string; body: string; url: string; tag: string };

async function displayName(userId: string) {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return data?.display_name?.trim() || 'Партнёр';
}

/** Перечитывает событие из базы и превращает его в текст уведомления. */
async function buildNotice(table: string, id: string): Promise<Notice | null> {
  if (table === 'messages') {
    const { data: m } = await supabase.from('messages').select('*').eq('id', id).maybeSingle();
    if (!m) return null;
    const name = await displayName(m.sender_id);
    return m.kind === 'thinking'
      ? { coupleId: m.couple_id, actorId: m.sender_id, at: m.created_at, title: `💭 ${name} думает о тебе`, body: 'Открой Remedy и ответь чем-нибудь тёплым', url: `${APP_URL}chat`, tag: 'thinking' }
      : { coupleId: m.couple_id, actorId: m.sender_id, at: m.created_at, title: `💌 ${name}`, body: String(m.body).slice(0, 180), url: `${APP_URL}chat`, tag: 'chat' };
  }
  if (table === 'answers') {
    const { data: a } = await supabase.from('answers').select('*').eq('id', id).maybeSingle();
    if (!a) return null;
    const name = await displayName(a.user_id);
    return { coupleId: a.couple_id, actorId: a.user_id, at: a.created_at, title: `💬 ${name} ответил(а) на вопрос дня`, body: 'Ответьте тоже — и увидите ответы друг друга', url: `${APP_URL}questions`, tag: 'question' };
  }
  if (table === 'profiles') {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!p?.couple_id || !p.mood || !p.mood_updated_at) return null;
    const name = p.display_name?.trim() || 'Партнёр';
    const label = MOOD_LABELS[p.mood] ? `: ${MOOD_LABELS[p.mood]}` : '';
    return { coupleId: p.couple_id, actorId: p.id, at: p.mood_updated_at, title: `${p.mood} ${name}${label}`, body: p.mood_note ? `«${p.mood_note}»` : 'Загляните, как дела у партнёра', url: APP_URL, tag: 'mood' };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (req.method === 'GET') {
      const { publicKey } = await getVapid();
      return json({ publicKey });
    }

    const { table, id } = await req.json();
    if (typeof table !== 'string' || typeof id !== 'string') return json({ error: 'bad request' }, 400);

    const notice = await buildNotice(table, id);
    if (!notice) return json({ sent: 0, reason: 'not found' });
    if (Date.now() - new Date(notice.at).getTime() > FRESH_MS) return json({ sent: 0, reason: 'stale' });

    const { data: partners } = await supabase.from('profiles').select('id').eq('couple_id', notice.coupleId).neq('id', notice.actorId);
    const ids = (partners ?? []).map((p) => p.id);
    if (!ids.length) return json({ sent: 0, reason: 'no partner' });

    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', ids);
    if (!subs?.length) return json({ sent: 0, reason: 'no subscriptions' });

    await getVapid();
    const payload = JSON.stringify({ title: notice.title, body: notice.body, url: notice.url, tag: notice.tag });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Подписка больше не действует (приложение удалено, уведомления выключены) — убираем её.
          if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id);
          else console.error('push failed', status, (e as Error).message);
        }
      }),
    );
    return json({ sent });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
