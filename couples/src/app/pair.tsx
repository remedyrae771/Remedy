import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, ErrorText, Input, Loading, Muted, Screen, Title, styles } from '../components/ui';
import { clearPendingInvite, getPendingInvite } from '../lib/invite';
import { errorText, supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export default function Pair() {
  const { refresh, signOut, profile } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState<'create' | 'join' | 'auto' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const joinWith = async (value: string) => {
    setError(null);
    const { error: e } = await supabase.rpc('join_couple', { code: value.trim() });
    if (e) {
      setError(errorText(e));
      return false;
    }
    await clearPendingInvite();
    await refresh();
    return true;
  };

  // Пришли по ссылке-приглашению — присоединяемся сразу.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    getPendingInvite().then(async (pending) => {
      if (!pending) return;
      setCode(pending);
      setLoading('auto');
      const ok = await joinWith(pending);
      if (!ok) await clearPendingInvite();
      setLoading(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setError(null);
    setLoading('create');
    const { error: e } = await supabase.rpc('create_couple');
    if (e) setError(errorText(e));
    else await refresh();
    setLoading(null);
  };

  const join = async () => {
    if (code.trim().length < 6) {
      setError('Код состоит из 6 символов.');
      return;
    }
    setLoading('join');
    await joinWith(code);
    setLoading(null);
  };

  if (loading === 'auto') {
    return (
      <Screen>
        <Title subtitle="Секунду, соединяем вас">Присоединяемся к паре 💞</Title>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title subtitle="Объединитесь с партнёром, чтобы видеть общие данные">
        Привет{profile?.display_name ? `, ${profile.display_name}` : ''}!
      </Title>

      <Card>
        <Text style={[styles.body, { fontWeight: '700' }]}>Я первый(ая)</Text>
        <Text style={styles.body}>
          Создайте пару — появится ссылка-приглашение. Отправьте её партнёру, и он присоединится в один клик.
        </Text>
        <Button title="Создать пару и получить ссылку" onPress={create} loading={loading === 'create'} />
      </Card>

      <Card>
        <Text style={[styles.body, { fontWeight: '700' }]}>Меня пригласили</Text>
        <Muted>Просто откройте ссылку от партнёра. Или введите код из приглашения:</Muted>
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
