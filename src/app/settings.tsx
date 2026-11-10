import { useState } from 'react';
import { Alert, Share, Text } from 'react-native';
import { Button, Card, ErrorText, Input, Muted, Screen, SectionLabel, styles } from '../components/ui';
import { formatUserDate, parseUserDate } from '../lib/dates';
import { errorText, supabase } from '../lib/supabase';
import { useAuth, useCouple } from '../providers/AuthProvider';

export default function Settings() {
  const { updateProfile, updateCouple, signOut, refresh, session } = useAuth();
  const { profile, couple, partner } = useCouple();
  const [name, setName] = useState(profile.display_name);
  const [startedOn, setStartedOn] = useState(couple?.started_on ? formatUserDate(couple.started_on) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setError(null);
    setSaved(false);
    const iso = startedOn.trim() ? parseUserDate(startedOn) : null;
    if (startedOn.trim() && !iso) return setError('Дата в формате ДД.ММ.ГГГГ.');
    setSaving(true);
    try {
      if (name.trim() !== profile.display_name) await updateProfile({ display_name: name.trim() });
      if (iso !== (couple?.started_on ?? null)) await updateCouple({ started_on: iso });
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    Alert.alert(
      'Выйти из пары?',
      'Вы перестанете видеть общие данные. Чтобы вернуться, понадобится код пары.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            const { error: e } = await supabase.rpc('leave_couple');
            if (e) setError(errorText(e));
            else await refresh();
          },
        },
      ],
    );
  };

  return (
    <Screen edges={['bottom']}>
      <SectionLabel>Профиль</SectionLabel>
      <Card>
        <Muted>Ваше имя</Muted>
        <Input value={name} onChangeText={setName} placeholder="Имя" />
        <Muted>Дата начала отношений</Muted>
        <Input
          value={startedOn}
          onChangeText={setStartedOn}
          placeholder="ДД.ММ.ГГГГ"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <ErrorText>{error}</ErrorText>
        {saved ? <Muted>Сохранено ✓</Muted> : null}
        <Button title="Сохранить" onPress={save} loading={saving} />
      </Card>

      <SectionLabel>Пара</SectionLabel>
      <Card>
        <Text style={styles.body}>
          {partner ? `Вы вместе с ${partner.display_name || 'партнёром'} 💞` : 'Партнёр ещё не присоединился'}
        </Text>
        {couple ? (
          <>
            <Muted>Код пары: {couple.invite_code}</Muted>
            {!partner ? (
              <Button
                title="Поделиться кодом"
                variant="secondary"
                onPress={() => Share.share({ message: `Присоединяйся ко мне в Remedy 💞 Код пары: ${couple.invite_code}` })}
              />
            ) : null}
          </>
        ) : null}
        <Button title="Выйти из пары" variant="danger" onPress={leave} />
      </Card>

      <SectionLabel>Аккаунт</SectionLabel>
      <Card>
        <Muted>{session?.user.email}</Muted>
        <Button title="Выйти из аккаунта" variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}
