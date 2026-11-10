import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, ErrorText, Input, Screen, Title, styles } from '../components/ui';
import { errorText, supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export default function Pair() {
  const { refresh, signOut, profile } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setLoading('create');
    const { error: e } = await supabase.rpc('create_couple');
    if (e) setError(errorText(e));
    else await refresh();
    setLoading(null);
  };

  const join = async () => {
    setError(null);
    if (code.trim().length < 6) {
      setError('Код состоит из 6 символов.');
      return;
    }
    setLoading('join');
    const { error: e } = await supabase.rpc('join_couple', { code: code.trim() });
    if (e) setError(errorText(e));
    else await refresh();
    setLoading(null);
  };

  return (
    <Screen>
      <Title subtitle="Объединитесь с партнёром, чтобы видеть общие данные">
        Привет{profile?.display_name ? `, ${profile.display_name}` : ''}!
      </Title>

      <Card>
        <Text style={styles.body}>Первый из вас создаёт пару и отправляет код партнёру.</Text>
        <Button title="Создать пару" onPress={create} loading={loading === 'create'} />
      </Card>

      <Card>
        <Text style={styles.body}>Уже есть код от партнёра?</Text>
        <Input
          placeholder="Например, A1B2C3"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <Button title="Присоединиться" variant="secondary" onPress={join} loading={loading === 'join'} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button title="Выйти из аккаунта" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
