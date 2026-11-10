import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Card, ErrorText, Input, Screen, Title, styles } from '../components/ui';
import { getPendingInvite, inviteFromUrl } from '../lib/invite';
import { errorText, supabase } from '../lib/supabase';
import { colors, spacing } from '../theme';

export default function SignIn() {
  const [modeChoice, setMode] = useState<'signIn' | 'signUp' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { invited: invitedParam } = useLocalSearchParams<{ invited?: string }>();
  const [storedInvite, setStoredInvite] = useState(false);
  const invited = invitedParam === '1' || storedInvite || Boolean(inviteFromUrl);
  // Приглашённому по умолчанию показываем регистрацию.
  const mode = modeChoice ?? (invited ? 'signUp' : 'signIn');

  useEffect(() => {
    getPendingInvite().then((code) => setStoredInvite(Boolean(code)));
  }, [invitedParam]);


  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError('Введите почту и пароль (не короче 6 символов).');
      return;
    }
    if (mode === 'signUp' && !name.trim()) {
      setError('Как вас зовут?');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signIn') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (e) throw e;
        if (!data.session) setNotice('Мы отправили письмо для подтверждения. Подтвердите почту и войдите.');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginVertical: spacing.xl }}>
          <Text style={{ fontSize: 64 }}>💞</Text>
        </View>
        <Title subtitle="Пространство только для вас двоих">Remedy</Title>
        {invited ? (
          <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
            <Text style={[styles.body, { fontWeight: '700' }]}>Вас пригласили в пару 💌</Text>
            <Text style={styles.body}>
              Создайте аккаунт или войдите — и вы сразу окажетесь вместе с тем, кто прислал ссылку.
            </Text>
          </Card>
        ) : null}
        <Card>
          {mode === 'signUp' && (
            <Input placeholder="Ваше имя" value={name} onChangeText={setName} autoComplete="name" />
          )}
          <Input
            placeholder="Почта"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            placeholder="Пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          />
          <ErrorText>{error}</ErrorText>
          {notice ? <Text style={styles.muted}>{notice}</Text> : null}
          <Button title={mode === 'signIn' ? 'Войти' : 'Создать аккаунт'} onPress={submit} loading={loading} />
          <Button
            variant="ghost"
            title={mode === 'signIn' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
