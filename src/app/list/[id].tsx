import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Input, Muted, styles } from '../../components/ui';
import { errorText, supabase } from '../../lib/supabase';
import type { List, ListItem } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, radius, spacing } from '../../theme';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coupleId, userId, partner } = useCouple();
  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: l }, { data: i }] = await Promise.all([
      supabase.from('lists').select('*').eq('id', id).maybeSingle<List>(),
      supabase.from('list_items').select('*').eq('list_id', id).order('created_at'),
    ]);
    setList(l ?? null);
    setItems((i as ListItem[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const add = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    setError(null);
    const { error: e } = await supabase.from('list_items').insert({ list_id: id, couple_id: coupleId, text: value });
    if (e) {
      setError(errorText(e));
      setText(value);
    }
    load();
  };

  const toggle = async (item: ListItem) => {
    Haptics.selectionAsync();
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)));
    await supabase.from('list_items').update({ done: !item.done }).eq('id', item.id);
  };

  const remove = async (item: ListItem) => {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    await supabase.from('list_items').delete().eq('id', item.id);
  };

  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen options={{ title: list ? `${list.emoji} ${list.title}` : '' }} />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Muted>Список пуст. Добавьте первый пункт ниже.</Muted>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggle(item)}
            onLongPress={() => remove(item)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: item.done ? colors.success : colors.border,
                backgroundColor: item.done ? colors.success : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.done ? <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text> : null}
            </View>
            <Text
              style={[
                styles.body,
                { flex: 1 },
                item.done && { textDecorationLine: 'line-through', color: colors.muted },
              ]}
            >
              {item.text}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {item.created_by === userId ? 'я' : partner?.display_name || 'партнёр'}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          items.length > 0 ? <Muted style={{ marginTop: spacing.sm }}>Нажмите — отметить, удерживайте — удалить.</Muted> : undefined
        }
      />
      <SafeAreaView edges={['bottom']} style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
        <ErrorText>{error}</ErrorText>
        <View style={styles.row}>
          <Input
            placeholder="Новый пункт…"
            value={text}
            onChangeText={setText}
            onSubmitEditing={add}
            returnKeyType="done"
            submitBehavior="submit"
            style={{ flex: 1 }}
          />
          <Button title="+" onPress={add} style={{ paddingHorizontal: spacing.lg }} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
