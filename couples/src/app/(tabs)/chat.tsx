import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Avatar, { AVATAR_TINTS } from '../../components/Avatar';
import { GradientFill } from '../../components/Gradient';
import Appear from '../../components/Appear';
import { MediaBubble, MediaViewer } from '../../components/Media';
import { VoiceBubble, VoiceRecorder } from '../../components/Voice';
import { PetArt } from '../../components/Pet';
import { formatTime, lastSeenText } from '../../lib/dates';
import { pickMedia, uploadMedia, uploadVoice } from '../../lib/media';
import { moodLabel } from '../../lib/moods';
import { supabase } from '../../lib/supabase';
import type { Message } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { usePresence } from '../../providers/PresenceProvider';
import { colors, gradients, radius, shadows, spacing } from '../../theme';

const PAGE = 200;
const GROUP_MS = 3 * 60 * 1000;
const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const QUICK_PHRASES = ['🤗 Обнимаю', '😘 Целую', '💖 Люблю тебя', '🥺 Скучаю', '☀️ Доброе утро', '🌙 Спокойной ночи'];
const QUICK_EMOJI = ['💖', '😘', '🤗', '😂', '🥺', '😍', '🔥', '🌹', '🍕', '☕️', '🌙', '✨'];

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

/** Сообщение только из эмодзи (до трёх) показываем крупно, без пузыря. */
const EMOJI_ONLY = (() => {
  try {
    return new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Component}|\\u200d|\\ufe0f|\\s){1,12}$', 'u');
  } catch {
    return null;
  }
})();
function isEmojiOnly(text: string) {
  const t = text.trim();
  if (!t || !EMOJI_ONLY || !EMOJI_ONLY.test(t) || /^[\d#*\s]+$/.test(t)) return false;
  return Array.from(t.replace(/\s|‍|️/g, '')).length <= 3;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const sameGroup = (a: Message | undefined, b: Message | undefined) =>
  Boolean(
    a &&
      b &&
      a.kind !== 'thinking' &&
      b.kind !== 'thinking' &&
      a.sender_id === b.sender_id &&
      Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < GROUP_MS &&
      dayLabel(a.created_at) === dayLabel(b.created_at),
  );

export default function Chat() {
  const { coupleId, userId, partner, couple, partnerName } = useCouple();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [partnerReadAt, setPartnerReadAt] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Сообщения, пришедшие или отправленные при открытом чате, — их появление анимируем.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const markFresh = useCallback((id: string) => setFreshIds((prev) => new Set(prev).add(id)), []);
  const [recording, setRecording] = useState(false);
  const { partnerOnline } = usePresence();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const lastMarked = useRef('');

  // Загрузка и подписка: новые сообщения, реакции, прочтение, «печатает…»
  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        setMessages((data as Message[]) ?? []);
        setLoaded(true);
      });
    supabase
      .from('chat_reads')
      .select('user_id, last_read_at')
      .eq('couple_id', coupleId)
      .then(({ data }) => {
        const theirs = (data ?? []).find((r) => r.user_id !== userId);
        if (theirs) setPartnerReadAt(theirs.last_read_at);
      });

    const channel = supabase
      .channel(`chat-${coupleId}`, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
        markFresh(msg.id);
        if (msg.sender_id !== userId) setPartnerTyping(false);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const row = payload.new as { user_id?: string; last_read_at?: string };
        if (row?.user_id && row.user_id !== userId && row.last_read_at) setPartnerReadAt(row.last_read_at);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user === userId) return;
        setPartnerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPartnerTyping(false), 3500);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [coupleId, userId, markFresh]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Отмечаем прочитанным, пока чат открыт и пришло новое сообщение партнёра.
  const latestTheirs = useMemo(() => messages.find((m) => m.sender_id !== userId)?.created_at ?? '', [messages, userId]);
  useEffect(() => {
    if (!focused || !latestTheirs || latestTheirs === lastMarked.current) return;
    lastMarked.current = latestTheirs;
    supabase
      .from('chat_reads')
      .upsert({ user_id: userId, couple_id: coupleId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .then(() => {});
  }, [focused, latestTheirs, userId, coupleId]);

  const onChangeText = (value: string) => {
    setText(value);
    const now = Date.now();
    if (value && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user: userId } });
    }
  };

  const send = async (raw?: string) => {
    const body = (raw ?? text).trim();
    if (!body) return;
    if (!raw) setText('');
    setEmojiOpen(false);
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    const { data, error } = await supabase.from('messages').insert({ couple_id: coupleId, body, reply_to: reply }).select().single<Message>();
    if (error) {
      if (!raw) setText(body);
      return;
    }
    markFresh(data.id);
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [data, ...prev]));
  };

  const sendMedia = async () => {
    setMediaError(null);
    setEmojiOpen(false);
    let picked;
    try {
      picked = await pickMedia();
    } catch (e) {
      setMediaError((e as Error).message);
      return;
    }
    if (!picked) return;

    // Сразу показываем файл в ленте с пометкой «Отправка…», пока он загружается.
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    const tempId = `temp-${Date.now()}`;
    const temp: Message = {
      id: tempId,
      couple_id: coupleId,
      sender_id: userId,
      body: '',
      kind: 'media',
      created_at: new Date().toISOString(),
      media_type: picked.type,
      media_width: picked.width,
      media_height: picked.height,
      local_uri: picked.uri,
      sending: true,
    };
    markFresh(tempId);
    setMessages((prev) => [temp, ...prev]);
    try {
      const path = await uploadMedia(coupleId, picked);
      const { data, error } = await supabase
        .from('messages')
        .insert({
          couple_id: coupleId,
          body: '',
          kind: 'media',
          reply_to: reply,
          media_path: path,
          media_type: picked.type,
          media_width: Math.round(picked.width),
          media_height: Math.round(picked.height),
        })
        .select()
        .single<Message>();
      if (error) throw new Error('Не получилось отправить. Попробуйте ещё раз.');
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === data.id) ? withoutTemp : [{ ...data, local_uri: picked.uri }, ...withoutTemp];
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMediaError((e as Error).message);
    }
  };

  const sendVoice = async (uri: string, seconds: number) => {
    setRecording(false);
    setMediaError(null);
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    const tempId = `temp-${Date.now()}`;
    const temp: Message = {
      id: tempId,
      couple_id: coupleId,
      sender_id: userId,
      body: '',
      kind: 'voice',
      created_at: new Date().toISOString(),
      media_type: 'audio',
      media_duration: seconds,
      local_uri: uri,
      sending: true,
    };
    markFresh(tempId);
    setMessages((prev) => [temp, ...prev]);
    try {
      const path = await uploadVoice(coupleId, uri);
      const { data, error } = await supabase
        .from('messages')
        .insert({ couple_id: coupleId, body: '', kind: 'voice', reply_to: reply, media_path: path, media_type: 'audio', media_duration: Math.round(seconds * 10) / 10 })
        .select()
        .single<Message>();
      if (error) throw new Error('Не получилось отправить голосовое. Попробуйте ещё раз.');
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === data.id) ? withoutTemp : [data, ...withoutTemp];
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMediaError((e as Error).message);
    }
  };

  /** Короткое описание сообщения для цитаты в ответе. */
  const snippet = (m: Message) =>
    m.kind === 'voice'
      ? '🎤 Голосовое сообщение'
      : m.kind === 'media'
        ? m.media_type === 'video'
          ? '🎬 Видео'
          : '📷 Фото'
        : m.kind === 'thinking'
          ? '💭 Думаю о тебе'
          : m.body;
  const authorName = (m: Message) => (m.sender_id === userId ? 'Вы' : partnerName);

  const react = async (message: Message, emoji: string) => {
    setPicker(null);
    haptic(() => Haptics.selectionAsync());
    // Сразу показываем реакцию, сервер подтвердит через realtime.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m;
        const reactions = { ...(m.reactions ?? {}) };
        if (reactions[userId] === emoji) delete reactions[userId];
        else reactions[userId] = emoji;
        return { ...m, reactions };
      }),
    );
    const { data } = await supabase.rpc('react_message', { message_id: message.id, emoji });
    if (data) setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, reactions: data as Record<string, string> } : m)));
  };

  const myLast = messages.find((m) => m.sender_id === userId && m.kind !== 'thinking' && !m.sending);
  const moodPart = partner?.mood ? ` · ${partner.mood} ${moodLabel(partner.mood).toLowerCase()}` : '';
  // Когда партнёр был в сети: отметка присутствия или самое свежее его действие
  // (сообщение, смена настроения, прочтение чата) — что из этого позже.
  const lastTheirMessage = messages.find((m) => m.sender_id !== userId)?.created_at ?? null;
  const lastSeen = [partner?.last_seen_at, partner?.mood_updated_at, lastTheirMessage, partnerReadAt]
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const status = partnerTyping
    ? 'печатает…'
    : !partner
      ? 'ещё не присоединился'
      : partnerOnline
        ? `в сети${moodPart}`
        : lastSeen
          ? `${lastSeenText(lastSeen)}${partner.mood ? ` · ${partner.mood}` : ''}`
          : partner.mood
            ? `сейчас ${partner.mood} ${moodLabel(partner.mood).toLowerCase()}`
            : 'ваш человек 💞';

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    const mine = item.sender_id === userId;
    const older = messages[index + 1];
    const newer = messages[index - 1];
    const showDay = !older || dayLabel(older.created_at) !== dayLabel(item.created_at);
    const groupedWithNewer = sameGroup(item, newer);
    const groupedWithOlder = sameGroup(item, older);

    const day = showDay ? (
      <View style={s.dayPill}>
        <Text style={s.dayText}>{dayLabel(item.created_at)}</Text>
      </View>
    ) : null;

    if (item.kind === 'thinking') {
      return (
        <View style={{ alignItems: 'center', marginVertical: spacing.sm }}>
          {day}
          <View style={s.thinking}>
            <GradientFill colors={['#FFE6EE', '#F6DDF7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <Text style={{ fontSize: 22 }}>💭</Text>
            <Text style={s.thinkingText}>{mine ? 'Вы отправили «Думаю о тебе»' : `${partnerName} думает о вас`}</Text>
            <Text style={s.thinkingTime}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
    }

    const reactions = Object.values(item.reactions ?? {});
    const original = item.reply_to ? messages.find((m) => m.id === item.reply_to) : undefined;
    const big = item.kind === 'text' && !item.reply_to && isEmojiOnly(item.body);
    const quoteOnBubble = mine && item.kind !== 'media';
    const quote = item.reply_to ? (
      <View style={[s.quote, quoteOnBubble ? s.quoteMine : s.quoteTheirs]}>
        <Text style={[s.quoteName, { color: quoteOnBubble ? '#fff' : colors.primaryDeep }]} numberOfLines={1}>
          {original ? authorName(original) : 'Сообщение'}
        </Text>
        <Text style={[s.quoteText, { color: quoteOnBubble ? 'rgba(255,255,255,0.9)' : colors.muted }]} numberOfLines={2}>
          {original ? snippet(original) : 'Сообщение недоступно'}
        </Text>
      </View>
    ) : null;
    const isLastMine = myLast?.id === item.id;
    const read = isLastMine && partnerReadAt && partnerReadAt >= item.created_at;

    // Только что пришедшие сообщения плавно выплывают снизу (список перевёрнут — отсюда знак минус).
    const fresh = freshIds.has(item.id);
    const Wrap = fresh ? Appear : View;
    return (
      <Wrap {...(fresh ? { distance: -16 } : {})} style={{ marginTop: groupedWithOlder ? 2 : spacing.sm }}>
        {day}
        <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {picker === item.id ? (
            <View style={[s.picker, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              {REACTIONS.map((e) => (
                <Pressable key={e} onPress={() => react(item, e)} hitSlop={4} style={({ pressed }) => [s.pickerItem, pressed && { transform: [{ scale: 1.25 }] }]}>
                  <Text style={{ fontSize: 24, opacity: item.reactions?.[userId] && item.reactions[userId] !== e ? 0.5 : 1 }}>{e}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  setPicker(null);
                  setReplyTo(item);
                }}
                hitSlop={4}
                style={s.replyAction}
                accessibilityLabel="Ответить"
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primaryDeep }}>↩︎ Ответить</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onLongPress={() => {
              haptic(() => Haptics.selectionAsync());
              setPicker(picker === item.id ? null : item.id);
            }}
            onPress={() => picker && setPicker(null)}
            delayLongPress={300}
            style={{ maxWidth: '80%' }}
          >
            {item.kind === 'voice' ? (
              <View
                style={[
                  s.bubble,
                  mine ? s.bubbleMine : s.bubbleTheirs,
                  mine ? { borderBottomRightRadius: groupedWithNewer ? 8 : 6 } : { borderBottomLeftRadius: groupedWithNewer ? 8 : 6 },
                ]}
              >
                {mine ? <GradientFill colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} /> : null}
                {quote}
                <VoiceBubble message={item} mine={mine} />
                <Text style={[s.time, { color: mine ? 'rgba(255,255,255,0.8)' : colors.muted }]}>{formatTime(item.created_at)}</Text>
              </View>
            ) : item.kind === 'media' ? (
              <View>
                {quote ? <View style={[s.bubble, s.bubbleTheirs, { marginBottom: 4 }]}>{quote}</View> : null}
                <MediaBubble message={item} onOpen={() => (picker ? setPicker(null) : setViewer(item))} />
                <Text style={[s.time, { color: colors.muted, marginTop: 3, marginRight: 4 }]}>{formatTime(item.created_at)}</Text>
              </View>
            ) : big ? (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 48, lineHeight: 58 }}>{item.body}</Text>
                <Text style={[s.time, { color: colors.muted }]}>{formatTime(item.created_at)}</Text>
              </View>
            ) : (
              <View
                style={[
                  s.bubble,
                  mine ? s.bubbleMine : s.bubbleTheirs,
                  mine
                    ? { borderTopRightRadius: groupedWithOlder ? 8 : 22, borderBottomRightRadius: groupedWithNewer ? 8 : 6 }
                    : { borderTopLeftRadius: groupedWithOlder ? 8 : 22, borderBottomLeftRadius: groupedWithNewer ? 8 : 6 },
                ]}
              >
                {mine ? <GradientFill colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} /> : null}
                {quote}
                <Text style={[s.bubbleText, { color: mine ? '#fff' : colors.text }]}>{item.body}</Text>
                <Text style={[s.time, { color: mine ? 'rgba(255,255,255,0.8)' : colors.muted }]}>{formatTime(item.created_at)}</Text>
              </View>
            )}
            {reactions.length ? (
              <View style={[s.reactions, mine ? { alignSelf: 'flex-start', marginLeft: 8 } : { alignSelf: 'flex-end', marginRight: 8 }]}>
                <Text style={{ fontSize: 14 }}>{reactions.join('')}</Text>
              </View>
            ) : null}
          </Pressable>

          {isLastMine && !groupedWithNewer ? <Text style={s.receipt}>{read ? 'Прочитано ✓✓' : 'Отправлено ✓'}</Text> : null}
        </View>
      </Wrap>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <GradientFill colors={[colors.backgroundTop, colors.background, colors.backgroundBottom]} />

      <View style={s.header}>
        <Avatar name={partnerName} tint={partner ? AVATAR_TINTS.partner : AVATAR_TINTS.empty} size={46} online={partnerOnline} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>
            {partnerName}
          </Text>
          <Text
            style={[
              s.headerStatus,
              partnerOnline && { color: '#2E9E64', fontWeight: '600' },
              partnerTyping && { color: colors.primary, fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {status}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          extraData={{ picker, partnerReadAt, freshIds }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            partnerTyping ? (
              <View style={[s.bubble, s.bubbleTheirs, { alignSelf: 'flex-start', marginTop: spacing.sm }]}>
                <Text style={{ color: colors.muted, fontSize: 18, letterSpacing: 2 }}>•••</Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            loaded ? (
              <View style={{ transform: [{ scaleY: -1 }], alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
                <PetArt kind={couple?.pet_kind ?? 'cat'} mood="happy" size={120} />
                <Text style={[s.headerName, { textAlign: 'center' }]}>Здесь начнётся ваша переписка</Text>
                <Text style={[s.headerStatus, { textAlign: 'center' }]}>Напишите что-нибудь приятное или выберите фразу ниже 💌</Text>
              </View>
            ) : undefined
          }
        />

        <View style={s.composerWrap}>
          {!text ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
              {QUICK_PHRASES.map((p) => (
                <Pressable key={p} onPress={() => send(p)} style={({ pressed }) => [s.quick, pressed && { transform: [{ scale: 0.95 }] }]}>
                  <Text style={s.quickText}>{p}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {emojiOpen ? (
            <View style={s.emojiRow}>
              {QUICK_EMOJI.map((e) => (
                <Pressable key={e} onPress={() => setText((t) => t + e)} hitSlop={4} style={({ pressed }) => [s.emojiCell, pressed && { transform: [{ scale: 1.2 }] }]}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {mediaError ? <Text style={s.mediaError}>{mediaError}</Text> : null}

          {replyTo ? (
            <View style={s.replyBar}>
              <View style={{ flex: 1 }}>
                <Text style={s.quoteName} numberOfLines={1}>
                  ↩︎ Ответ: {authorName(replyTo)}
                </Text>
                <Text style={[s.quoteText, { color: colors.muted }]} numberOfLines={1}>
                  {snippet(replyTo)}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityLabel="Отменить ответ">
                <Text style={{ fontSize: 16, color: colors.muted, fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
          ) : null}

          {recording ? (
            <VoiceRecorder
              onSend={sendVoice}
              onCancel={() => setRecording(false)}
              onError={(message) => {
                setRecording(false);
                setMediaError(message);
              }}
            />
          ) : (
          <View style={s.composer}>
            <Pressable onPress={sendMedia} hitSlop={8} style={s.emojiToggle} accessibilityLabel="Отправить фото или видео">
              <Text style={{ fontSize: 22 }}>📎</Text>
            </Pressable>
            <Pressable onPress={() => setEmojiOpen((v) => !v)} hitSlop={8} style={s.emojiToggle} accessibilityLabel="Эмодзи">
              <Text style={{ fontSize: 22 }}>{emojiOpen ? '⌨️' : '😊'}</Text>
            </Pressable>
            <TextInput
              value={text}
              onChangeText={onChangeText}
              placeholder="Сообщение…"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={1}
              style={s.input}
              onKeyPress={(e) => {
                const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                  (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                  send();
                }
              }}
            />
            {text.trim() ? (
              <Pressable onPress={() => send()} accessibilityLabel="Отправить" style={({ pressed }) => [s.send, pressed && { transform: [{ scale: 0.92 }] }]}>
                <GradientFill colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginLeft: 2 }}>➤</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setMediaError(null);
                  setEmojiOpen(false);
                  setRecording(true);
                }}
                accessibilityLabel="Записать голосовое"
                style={({ pressed }) => [s.send, pressed && { transform: [{ scale: 0.92 }] }]}
              >
                <GradientFill colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <Text style={{ fontSize: 20 }}>🎤</Text>
              </Pressable>
            )}
          </View>
          )}
        </View>
      </KeyboardAvoidingView>
      <MediaViewer message={viewer} onClose={() => setViewer(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    boxShadow: shadows.card,
  },
  headerName: { fontSize: 18, fontWeight: '800', color: colors.text },
  headerStatus: { fontSize: 13, color: colors.muted },
  dayPill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.8)',
    marginVertical: spacing.sm,
    boxShadow: '0px 2px 6px rgba(122, 46, 72, 0.08)',
  },
  dayText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  bubble: {
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 7,
    borderRadius: 22,
    overflow: 'hidden',
    gap: 2,
  },
  bubbleMine: { boxShadow: '0px 6px 14px rgba(201, 61, 104, 0.25)' },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    boxShadow: '0px 6px 14px rgba(122, 46, 72, 0.10), inset 0px 1px 0px rgba(255,255,255,1)',
  },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  time: { fontSize: 11, alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  reactions: {
    marginTop: -8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    boxShadow: '0px 3px 8px rgba(122, 46, 72, 0.15)',
  },
  receipt: { fontSize: 11, color: colors.muted, marginTop: 3, marginRight: 4 },
  picker: {
    flexDirection: 'row',
    gap: 2,
    padding: 6,
    marginBottom: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    boxShadow: '0px 10px 24px rgba(122, 46, 72, 0.22)',
  },
  pickerItem: { paddingHorizontal: 4 },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    boxShadow: '0px 6px 14px rgba(122, 46, 72, 0.12)',
  },
  thinkingText: { fontSize: 15, fontWeight: '700', color: colors.primaryDeep },
  thinkingTime: { fontSize: 11, color: colors.muted },
  replyAction: { justifyContent: 'center', paddingHorizontal: 8, marginLeft: 2, borderLeftWidth: 1, borderLeftColor: colors.border },
  quote: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 2, marginBottom: 4, borderRadius: 4 },
  quoteMine: { borderLeftColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.15)' },
  quoteTheirs: { borderLeftColor: colors.primary, backgroundColor: 'rgba(232, 87, 126, 0.08)' },
  quoteName: { fontSize: 12, fontWeight: '700', color: colors.primaryDeep },
  quoteText: { fontSize: 13 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    boxShadow: shadows.soft,
  },
  composerWrap: { paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  quick: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    boxShadow: shadows.soft,
  },
  quickText: { fontSize: 14, fontWeight: '600', color: colors.text },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  emojiCell: { width: '16.66%', alignItems: 'center', paddingVertical: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: 6,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    boxShadow: shadows.card,
  },
  emojiToggle: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  mediaError: { color: colors.danger, fontSize: 13, textAlign: 'center', marginHorizontal: spacing.lg },
  input: { flex: 1, fontSize: 16, lineHeight: 20, color: colors.text, minHeight: 40, maxHeight: 120, paddingVertical: 10, paddingHorizontal: 4 },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.button,
  },
});
