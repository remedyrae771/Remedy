import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Muted, styles } from '../../components/ui';
import { formatTime } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import type { Message } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, radius, spacing } from '../../theme';

const PAGE = 100;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function Chat() {
  const { coupleId, userId, partner } = useCouple();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);

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

    const channel = supabase
      .channel(`messages-${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    const { data, error } = await supabase
      .from('messages')
      .insert({ couple_id: coupleId, body })
      .select()
      .single<Message>();
    if (error) {
      setText(body);
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [data, ...prev]));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={styles.title}>{partner?.display_name || 'Чат'}</Text>
        {partner?.mood ? <Muted>сейчас: {partner.mood}</Muted> : null}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
          ListEmptyComponent={
            loaded ? (
              <View style={{ transform: [{ scaleY: -1 }], alignItems: 'center', padding: spacing.xl }}>
                <Muted>Напишите что-нибудь приятное 💌</Muted>
              </View>
            ) : undefined
          }
          renderItem={({ item, index }) => {
            const mine = item.sender_id === userId;
            const older = messages[index + 1];
            const showDay = !older || dayLabel(older.created_at) !== dayLabel(item.created_at);

            if (item.kind === 'thinking') {
              return (
                <View style={{ alignItems: 'center', marginVertical: spacing.sm }}>
                  {showDay ? <DaySeparator label={dayLabel(item.created_at)} /> : null}
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    {mine ? 'Вы думаете о партнёре 💭' : `${partner?.display_name || 'Партнёр'} думает о вас 💭`}
                  </Text>
                  <Muted>{formatTime(item.created_at)}</Muted>
                </View>
              );
            }

            return (
              <View>
                {showDay ? <DaySeparator label={dayLabel(item.created_at)} /> : null}
                <View
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    backgroundColor: mine ? colors.primary : colors.partnerBubble,
                    borderRadius: radius.md,
                    borderBottomRightRadius: mine ? 4 : radius.md,
                    borderBottomLeftRadius: mine ? radius.md : 4,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ color: mine ? '#fff' : colors.text, fontSize: 16 }}>{item.body}</Text>
                  <Text style={{ color: mine ? '#ffffffaa' : colors.muted, fontSize: 11, alignSelf: 'flex-end' }}>
                    {formatTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View style={[styles.row, { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }]}>
          <Input
            placeholder="Сообщение…"
            value={text}
            onChangeText={setText}
            multiline
            style={{ flex: 1, maxHeight: 120 }}
          />
          <Button title="➤" onPress={send} disabled={!text.trim()} style={{ paddingHorizontal: spacing.lg }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12, marginVertical: spacing.sm }}>{label}</Text>
  );
}
