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

/** Вид уведомления — по нему работают настройки «какие уведомления присылать» (profiles.notify_prefs). */
type Category = 'messages' | 'thinking' | 'reactions' | 'mood' | 'question' | 'game' | 'moments' | 'capsules' | 'dates' | 'lists';
type Notice = { coupleId: string; actorId: string; at: string; title: string; body: string; url: string; tag: string; category: Category };

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
      ? { coupleId: m.couple_id, actorId: m.sender_id, at: m.created_at, title: `💭 ${name} думает о тебе`, body: 'Открой Remedy и ответь чем-нибудь тёплым', url: `${APP_URL}chat`, tag: 'thinking', category: 'thinking' }
      : m.kind === 'voice'
        ? { coupleId: m.couple_id, actorId: m.sender_id, at: m.created_at, title: `💌 ${name}`, body: '🎤 Голосовое сообщение', url: `${APP_URL}chat`, tag: 'chat', category: 'messages' }
      : m.kind === 'media'
        ? { coupleId: m.couple_id, actorId: m.sender_id, at: m.created_at, title: `💌 ${name}`, body: (m.media_type === 'video' ? '🎬 Видео' : '📷 Фото') + (m.body ? ` · ${String(m.body).slice(0, 140)}` : ''), url: `${APP_URL}chat`, tag: 'chat', category: 'messages' }
        : { coupleId: m.couple_id, actorId: m.sender_id, at: m.created_at, title: m.reply_to ? `↩︎ ${name} ответил(а) вам` : `💌 ${name}`, body: String(m.body).slice(0, 180), url: `${APP_URL}chat`, tag: 'chat', category: 'messages' };
  }
  if (table === 'game_rounds') {
    const { data: r } = await supabase.from('game_rounds').select('*').eq('id', id).maybeSingle();
    if (!r) return null;
    if (!r.guessed_at) {
      const name = await displayName(r.subject_id);
      return { coupleId: r.couple_id, actorId: r.subject_id, at: r.created_at, title: `🎯 ${name} загадал(а) вопрос`, body: 'Угадай, что ответил(а)! Игра «Кто лучше знает»', url: `${APP_URL}game`, tag: 'game', category: 'game' };
    }
    // Угадал партнёр загадавшего — уведомляем загадавшего.
    const { data: guesser } = await supabase.from('profiles').select('id, display_name').eq('couple_id', r.couple_id).neq('id', r.subject_id).maybeSingle();
    if (!guesser) return null;
    const name = guesser.display_name?.trim() || 'Партнёр';
    return { coupleId: r.couple_id, actorId: guesser.id, at: r.guessed_at, title: r.correct ? `🎯 ${name} угадал(а)!` : `🙈 ${name} не угадал(а)`, body: r.correct ? 'Вы отлично знаете друг друга 💞' : 'Загляните, что он(а) выбрал(а)', url: `${APP_URL}game`, tag: 'game', category: 'game' };
  }
  if (table === 'answers') {
    const { data: a } = await supabase.from('answers').select('*').eq('id', id).maybeSingle();
    if (!a) return null;
    const name = await displayName(a.user_id);
    return { coupleId: a.couple_id, actorId: a.user_id, at: a.created_at, title: `💬 ${name} ответил(а) на вопрос дня`, body: 'Ответьте тоже — и увидите ответы друг друга', url: `${APP_URL}questions`, tag: 'question', category: 'question' };
  }
  if (table === 'profiles') {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!p?.couple_id || !p.mood || !p.mood_updated_at) return null;
    const name = p.display_name?.trim() || 'Партнёр';
    const label = MOOD_LABELS[p.mood] ? `: ${MOOD_LABELS[p.mood]}` : '';
    return { coupleId: p.couple_id, actorId: p.id, at: p.mood_updated_at, title: `${p.mood} ${name}${label}`, body: p.mood_note ? `«${p.mood_note}»` : 'Загляните, как дела у партнёра', url: APP_URL, tag: 'mood', category: 'mood' };
  }
  if (table === 'moments') {
    const { data: m } = await supabase.from('moments').select('*').eq('id', id).maybeSingle();
    if (!m) return null;
    const name = await displayName(m.created_by);
    const what = m.media_type === 'video' ? 'видео' : 'фото';
    return { coupleId: m.couple_id, actorId: m.created_by, at: m.created_at, title: `📸 ${name} добавил(а) момент в альбом`, body: m.title ? `«${m.title}» — ${what}` : `Новое ${what} в «Наших моментах»`, url: `${APP_URL}album`, tag: 'moment', category: 'moments' };
  }
  if (table === 'capsules') {
    const { data: c } = await supabase.from('capsules').select('id, couple_id, author_id, open_on, created_at').eq('id', id).maybeSingle();
    if (!c) return null;
    const name = await displayName(c.author_id);
    const [y, mo, d] = String(c.open_on).split('-').map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { coupleId: c.couple_id, actorId: c.author_id, at: c.created_at, title: `💌 ${name} запечатал(а) для вас письмо`, body: `Капсула времени откроется ${date}. Наберитесь терпения 🤫`, url: `${APP_URL}capsules`, tag: `capsule-${c.id}`, category: 'capsules' };
  }
  if (table === 'events') {
    const { data: e } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (!e) return null;
    const name = await displayName(e.created_by);
    return { coupleId: e.couple_id, actorId: e.created_by, at: e.created_at, title: `${e.emoji || '📅'} ${name} добавил(а) важную дату`, body: String(e.title).slice(0, 120), url: `${APP_URL}dates`, tag: `event-${e.id}`, category: 'dates' };
  }
  if (table === 'list_items') {
    const { data: it } = await supabase.from('list_items').select('*, lists(title, emoji)').eq('id', id).maybeSingle();
    if (!it) return null;
    const name = await displayName(it.created_by);
    const list = (it as { lists?: { title?: string; emoji?: string } }).lists;
    return { coupleId: it.couple_id, actorId: it.created_by, at: it.created_at, title: `${list?.emoji || '📝'} ${name} добавил(а) в «${list?.title || 'список'}»`, body: String(it.text).slice(0, 140), url: `${APP_URL}list/${it.list_id}`, tag: `list-${it.list_id}`, category: 'lists' };
  }
  return null;
}

/** Реакция на сообщение: проверяем, что она действительно стоит, и шлём автору сообщения. */
async function buildReaction(messageId: string, actorId: string): Promise<(Notice & { emoji: string }) | null> {
  const { data: m } = await supabase.from('messages').select('*').eq('id', messageId).maybeSingle();
  const emoji = m?.reactions?.[actorId];
  if (!m || !emoji || m.sender_id === actorId) return null;
  const name = await displayName(actorId);
  const what = m.kind === 'voice' ? 'голосовое' : m.kind === 'media' ? (m.media_type === 'video' ? 'видео' : 'фото') : `«${String(m.body).slice(0, 60)}»`;
  return { coupleId: m.couple_id, actorId, at: new Date().toISOString(), title: `${emoji} ${name} отреагировал(а)`, body: `На ваше сообщение ${what}`, url: `${APP_URL}chat`, tag: `reaction-${m.id}`, category: 'reactions', emoji };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (req.method === 'GET') {
      const { publicKey } = await getVapid();
      return json({ publicKey });
    }

    const { table, id, actor } = await req.json();
    if (typeof table !== 'string' || typeof id !== 'string') return json({ error: 'bad request' }, 400);

    let notice: Notice | null;
    if (table === 'reaction') {
      if (typeof actor !== 'string') return json({ error: 'bad request' }, 400);
      const r = await buildReaction(id, actor);
      if (!r) return json({ sent: 0, reason: 'not found' });
      // Одна и та же реакция на одно сообщение — не чаще раза в день (если её снимают и ставят снова).
      const { data: fresh } = await supabase
        .from('reminder_log')
        .upsert({ couple_id: r.coupleId, kind: 'reaction', ref: `${id}:${actor}:${r.emoji}`, day: new Date().toISOString().slice(0, 10) }, { onConflict: 'couple_id,kind,ref,day', ignoreDuplicates: true })
        .select();
      if (!fresh?.length) return json({ sent: 0, reason: 'duplicate' });
      notice = r;
    } else {
      notice = await buildNotice(table, id);
    }
    if (!notice) return json({ sent: 0, reason: 'not found' });
    if (Date.now() - new Date(notice.at).getTime() > FRESH_MS) return json({ sent: 0, reason: 'stale' });

    const { data: partners } = await supabase
      .from('profiles')
      .select('id, partner_nickname, notify_prefs')
      .eq('couple_id', notice.coupleId)
      .neq('id', notice.actorId);
    // Учитываем настройки получателя: выключенный вид уведомлений не присылаем.
    const ids = (partners ?? []).filter((p) => (p.notify_prefs ?? {})[notice!.category] !== false).map((p) => p.id);
    if (!ids.length) return json({ sent: 0, reason: 'no recipients' });

    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', ids);
    if (!subs?.length) return json({ sent: 0, reason: 'no subscriptions' });

    await getVapid();
    // Получатель мог задать своё имя для партнёра («Зайка») — подставляем его вместо настоящего.
    const actorName = await displayName(notice.actorId);
    const payloadFor = (userId: string) => {
      const nick = (partners ?? []).find((p) => p.id === userId)?.partner_nickname?.trim();
      const swap = (t: string) => (nick ? t.split(actorName).join(nick) : t);
      return JSON.stringify({ title: swap(notice!.title), body: swap(notice!.body), url: notice!.url, tag: notice!.tag });
    };
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadFor(s.user_id), { TTL: 60 * 60 * 24 });
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
