import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Input, Muted, Screen, Title, styles } from '../../components/ui';
import { errorText, supabase } from '../../lib/supabase';
import type { List } from '../../lib/types';
import { useCouple } from '../../providers/AuthProvider';
import { colors, spacing } from '../../theme';

const TEMPLATES = [
  { emoji: '🎁', title: 'Список желаний' },
  { emoji: '💡', title: 'Идеи для свиданий' },
  { emoji: '🎬', title: 'Фильмы посмотреть' },
  { emoji: '✈️', title: 'Куда поехать' },
  { emoji: '🛒', title: 'Покупки' },
  { emoji: '🏡', title: 'Дела по дому' },
];

const EMOJIS = ['📝', '🎁', '💡', '🎬', '✈️', '🛒', '🏡', '🍽️', '📚', '🎯'];

type ListWithCounts = List & { list_items: { done: boolean }[] };

export default function Lists() {
  const { coupleId } = useCouple();
  const [lists, setLists] = useState<ListWithCounts[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lists')
      .select('*, list_items(done)')
      .eq('couple_id', coupleId)
      .order('created_at');
    setLists((data as ListWithCounts[]) ?? []);
  }, [coupleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async (t: string, e: string) => {
    setError(null);
    if (!t.trim()) return setError('Введите название.');
    const { data, error: err } = await supabase
      .from('lists')
      .insert({ couple_id: coupleId, title: t.trim(), emoji: e })
      .select()
      .single<List>();
    if (err) return setError(errorText(err));
    setTitle('');
    setShowForm(false);
    router.push({ pathname: '/list/[id]', params: { id: data.id } });
  };

  const remove = (list: List) => {
    Alert.alert('Удалить список?', `«${list.title}» и все его пункты будут удалены у вас обоих.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('lists').delete().eq('id', list.id);
          load();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Title subtitle="Желания, планы и идеи — общие на двоих">Списки</Title>

      {lists.map((list) => {
        const total = list.list_items.length;
        const done = list.list_items.filter((i) => i.done).length;
        return (
          <Pressable
            key={list.id}
            onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id } })}
            onLongPress={() => remove(list)}
          >
            <Card style={styles.row}>
              <Text style={{ fontSize: 32 }}>{list.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{list.title}</Text>
                <Muted>{total === 0 ? 'пусто' : `${done} из ${total} выполнено`}</Muted>
              </View>
              <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
            </Card>
          </Pressable>
        );
      })}

      {showForm ? (
        <Card>
          <Input placeholder="Название списка" value={title} onChangeText={setTitle} autoFocus />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
            ))}
          </View>
          <ErrorText>{error}</ErrorText>
          <Button title="Создать" onPress={() => create(title, emoji)} />
          <Button title="Отмена" variant="ghost" onPress={() => setShowForm(false)} />
        </Card>
      ) : (
        <Button title="+ Новый список" onPress={() => setShowForm(true)} />
      )}

      {lists.length === 0 && !showForm && (
        <>
          <Muted>Или начните с готового:</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {TEMPLATES.map((t) => (
              <Chip key={t.title} label={`${t.emoji} ${t.title}`} onPress={() => create(t.title, t.emoji)} />
            ))}
          </View>
        </>
      )}

      {lists.length > 0 && <Muted>Удерживайте список, чтобы удалить его.</Muted>}
    </Screen>
  );
}
