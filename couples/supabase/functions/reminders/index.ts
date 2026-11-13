// Edge Function «reminders»: напоминания по расписанию (pg_cron вызывает её раз в час).
//
//   09:00 по времени пары — важные даты сегодня/завтра, годовщина, круглые даты, открывшиеся капсулы
//   20:00 по времени пары — «вопрос дня ждёт ответа», «питомец скучает»
//
// Каждое напоминание записывается в reminder_log, поэтому повторный вызов в тот же день ничего
// не отправит. Ключи VAPID берутся из push_vapid (их создаёт функция notify).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const APP_URL = 'https://remedyrae771.github.io/Remedy/couples/';
const MORNING_HOUR = 9;
const EVENING_HOUR = 20;
const MILESTONES = [100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];

type Push = { userIds: string[]; title: string; body: string; url: string; tag: string };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Местные дата и час в часовом поясе пары. */
function localNow(timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
const addDays = (iso: string, n: number) => new Date(toUTC(iso) + n * 864e5).toISOString().slice(0, 10);

/** Ближайшее наступление ежегодной даты начиная с today. */
function nextYearly(iso: string, today: string) {
  const [, m, d] = iso.split('-');
  const year = Number(today.slice(0, 4));
  let candidate = `${year}-${m}-${d}`;
  if (candidate < today) candidate = `${year + 1}-${m}-${d}`;
  return candidate;
}

function pluralYears(n: number) {
  const a = n % 100;
  const l = n % 10;
  if (a > 10 && a < 20) return 'лет';
  if (l === 1) return 'год';
  if (l >= 2 && l <= 4) return 'года';
  return 'лет';
}

let vapidReady = false;
async function ensureVapid() {
  if (vapidReady) return true;
  const { data } = await supabase.from('push_vapid').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (!data) return false;
  webpush.setVapidDetails('https://remedyrae771.github.io', data.public_key, data.private_key);
  vapidReady = true;
  return true;
}

async function sendPush(push: Push) {
  if (!push.userIds.length || !(await ensureVapid())) return 0;
  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', push.userIds);
  let sent = 0;
  const payload = JSON.stringify({ title: push.title, body: push.body, url: push.url, tag: push.tag });
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 6 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id);
      }
    }),
  );
  return sent;
}

/** Записать в журнал; true — если такого напоминания сегодня ещё не было. */
async function claim(coupleId: string, kind: string, ref: string, day: string) {
  const { data } = await supabase
    .from('reminder_log')
    .upsert({ couple_id: coupleId, kind, ref, day }, { onConflict: 'couple_id,kind,ref,day', ignoreDuplicates: true })
    .select();
  return Boolean(data?.length);
}

type Couple = { id: string; timezone: string; started_on: string | null; pet_name: string | null };
type Member = { id: string; display_name: string; partner_nickname: string | null };

async function morning(c: Couple, members: Member[], today: string): Promise<Array<Push & { ref: string; kind: string }>> {
  const all = members.map((m) => m.id);
  const out: Array<Push & { ref: string; kind: string }> = [];
  const when = (days: number) => (days === 0 ? 'Сегодня' : 'Завтра');

  const { data: events } = await supabase.from('events').select('*').eq('couple_id', c.id);
  for (const e of events ?? []) {
    const date = e.repeats_yearly ? nextYearly(e.date, today) : e.date;
    const days = daysBetween(today, date);
    if (days !== 0 && days !== 1) continue;
    out.push({ kind: 'event', ref: `${e.id}:${date}:${days}`, userIds: all, title: `${e.emoji} ${when(days)}: ${e.title}`, body: days === 0 ? 'Не забудьте поздравить друг друга 💞' : 'Самое время подготовить сюрприз 🎁', url: `${APP_URL}dates`, tag: `event-${e.id}` });
  }

  if (c.started_on) {
    const anniversary = nextYearly(c.started_on, today);
    const years = Number(anniversary.slice(0, 4)) - Number(c.started_on.slice(0, 4));
    const days = daysBetween(today, anniversary);
    if (years > 0 && (days === 0 || days === 1)) {
      out.push({ kind: 'anniversary', ref: `${anniversary}:${days}`, userIds: all, title: `💞 ${when(days)} ваша годовщина — ${years} ${pluralYears(years)}!`, body: 'С любовью, ваш Remedy', url: APP_URL, tag: 'anniversary' });
    }
    const together = daysBetween(c.started_on, today);
    for (const m of MILESTONES) {
      const days2 = m - together;
      if (days2 === 0 || days2 === 1) {
        out.push({ kind: 'milestone', ref: `${m}:${days2}`, userIds: all, title: `✨ ${when(days2)} ${m} дней вместе!`, body: 'Круглая дата — отметьте её 🥂', url: APP_URL, tag: 'milestone' });
      }
    }
  }

  const { data: capsules } = await supabase.from('capsules').select('id, author_id').eq('couple_id', c.id).eq('open_on', today);
  for (const cap of capsules ?? []) {
    const author = members.find((m) => m.id === cap.author_id);
    for (const r of members.filter((m) => m.id !== cap.author_id)) {
      const name = r.partner_nickname?.trim() || author?.display_name || 'Партнёр';
      out.push({ kind: 'capsule', ref: `${cap.id}:${r.id}`, userIds: [r.id], title: '💌 Капсула времени открылась', body: `${name} оставил(а) вам письмо. Откройте его!`, url: `${APP_URL}capsules`, tag: `capsule-${cap.id}` });
    }
  }
  return out;
}

async function evening(c: Couple, members: Member[], today: string): Promise<Array<Push & { ref: string; kind: string }>> {
  const out: Array<Push & { ref: string; kind: string }> = [];

  // Вопрос дня считается так же, как в приложении: дни с 01.01.2024 по счёту вопросов.
  const { data: questions } = await supabase.from('questions').select('id').order('id');
  if (questions?.length) {
    const q = questions[daysBetween('2024-01-01', today) % questions.length].id;
    const { data: answers } = await supabase.from('answers').select('user_id').eq('couple_id', c.id).eq('question_id', q);
    const answered = new Set((answers ?? []).map((a) => a.user_id));
    for (const m of members) {
      if (answered.has(m.id)) continue;
      const partner = members.find((x) => x.id !== m.id);
      const partnerDone = partner && answered.has(partner.id);
      out.push({
        kind: 'question',
        ref: m.id,
        userIds: [m.id],
        title: partnerDone ? `💬 ${m.partner_nickname?.trim() || partner!.display_name || 'Партнёр'} уже ответил(а) на вопрос дня` : '💬 Вопрос дня ждёт вашего ответа',
        body: partnerDone ? 'Ответьте — и увидите ответы друг друга' : 'Пара минут, чтобы узнать друг друга лучше',
        url: `${APP_URL}questions`,
        tag: 'question',
      });
    }
  }

  // Активны сегодня, если кто-то открывал приложение или писал в чат (по местной дате).
  const { count } = await supabase.from('activity_days').select('user_id', { count: 'exact', head: true }).eq('couple_id', c.id).eq('day', today);
  const { data: lastMsg } = await supabase.from('messages').select('created_at').eq('couple_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const lastMsgDay = lastMsg ? new Intl.DateTimeFormat('en-CA', { timeZone: c.timezone || 'Asia/Almaty' }).format(new Date(lastMsg.created_at)) : null;
  if (!count && lastMsgDay !== today) {
    const pet = c.pet_name || 'Пушок';
    out.push({ kind: 'pet', ref: '', userIds: members.map((m) => m.id), title: `🐱 ${pet} скучает…`, body: 'Загляните в Remedy и погладьте его 💗', url: APP_URL, tag: 'pet' });
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dry = body?.dry === true; // проверка: что было бы отправлено (только количество, без текстов)

    const { data: couples } = await supabase.from('couples').select('id, timezone, started_on, pet_name');
    const { data: profiles } = await supabase.from('profiles').select('id, display_name, partner_nickname, couple_id').not('couple_id', 'is', null);

    let planned = 0;
    let sent = 0;
    for (const c of (couples ?? []) as Couple[]) {
      const members = (profiles ?? []).filter((p) => p.couple_id === c.id) as Member[];
      if (!members.length) continue;
      const { date, hour } = localNow(c.timezone || 'Asia/Almaty');
      const slot = body?.slot ?? (hour === MORNING_HOUR ? 'morning' : hour === EVENING_HOUR ? 'evening' : null);
      if (slot !== 'morning' && slot !== 'evening') continue;
      if (body?.slot && !dry) continue; // принудительный слот — только для проверки

      const pushes = slot === 'morning' ? await morning(c, members, date) : await evening(c, members, date);
      planned += pushes.length;
      if (dry) continue;
      for (const p of pushes) {
        if (await claim(c.id, p.kind, p.ref, date)) sent += await sendPush(p);
      }
    }
    return json({ planned, sent, dry });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
