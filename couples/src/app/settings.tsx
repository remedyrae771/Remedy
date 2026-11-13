import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import InviteCard from '../components/InviteCard';
import NotifyPrefs from '../components/NotifyPrefs';
import PushCard from '../components/PushCard';
import { PET_KINDS, PetArt } from '../components/Pet';
import { Button, Card, ErrorText, Input, Muted, Screen, SectionLabel, styles } from '../components/ui';
import { formatUserDate, parseUserDate } from '../lib/dates';
import { confirmAction } from '../lib/platform';
import { errorText, supabase } from '../lib/supabase';
import type { PetKind } from '../lib/types';
import { useAuth, useCouple } from '../providers/AuthProvider';
import { colors, radius, spacing } from '../theme';

export default function Settings() {
  const { updateProfile, updateCouple, signOut, refresh, session } = useAuth();
  const { profile, couple, partner, partnerName } = useCouple();
  const [name, setName] = useState(profile.display_name);
  const [startedOn, setStartedOn] = useState(couple?.started_on ? formatUserDate(couple.started_on) : '');
  const [petName, setPetName] = useState(couple?.pet_name ?? 'Пушок');
  const [nickname, setNickname] = useState(profile.partner_nickname ?? '');
  const [nickSaved, setNickSaved] = useState(false);
  const [nickSaving, setNickSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saveNickname = async () => {
    setNickSaving(true);
    setNickSaved(false);
    setError(null);
    try {
      await updateProfile({ partner_nickname: nickname.trim() || null });
      setNickSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setNickSaving(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    const iso = startedOn.trim() ? parseUserDate(startedOn) : null;
    if (startedOn.trim() && !iso) return setError('Дата в формате ДД.ММ.ГГГГ.');
    setSaving(true);
    try {
      if (name.trim() !== profile.display_name) await updateProfile({ display_name: name.trim() });
      if (iso !== (couple?.started_on ?? null)) await updateCouple({ started_on: iso });
      if (petName.trim() && petName.trim() !== couple?.pet_name) await updateCouple({ pet_name: petName.trim() });
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const pickKind = async (kind: PetKind) => {
    try {
      await updateCouple({ pet_kind: kind });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const leave = () =>
    confirmAction('Выйти из пары?', 'Вы перестанете видеть общие данные. Чтобы вернуться, понадобится новое приглашение.', 'Выйти', async () => {
      const { error: e } = await supabase.rpc('leave_couple');
      if (e) setError(errorText(e));
      else await refresh();
    });

  return (
    <Screen edges={['bottom']}>
      <SectionLabel>Питомец</SectionLabel>
      <Card>
        <Muted>Кто живёт у вас дома</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' }}>
          {PET_KINDS.map(({ kind, label }) => {
            const selected = (couple?.pet_kind ?? 'cat') === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => pickKind(kind)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  alignItems: 'center',
                  padding: spacing.xs,
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  minWidth: 72,
                }}
              >
                <PetArt kind={kind} mood="happy" size={60} />
                <Text style={[styles.muted, selected && { color: colors.primary, fontWeight: '600' }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Muted>Имя питомца</Muted>
        <Input value={petName} onChangeText={setPetName} placeholder="Пушок" maxLength={24} />
      </Card>

      <SectionLabel>Уведомления</SectionLabel>
      <PushCard />
      <NotifyPrefs />

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
      {partner ? (
        <Card>
          <Text style={styles.body}>Вы и {partnerName} — пара 💞</Text>
          <Muted>Как вы называете партнёра</Muted>
          <Input
            value={nickname}
            onChangeText={(t) => {
              setNickname(t);
              setNickSaved(false);
            }}
            placeholder={partner.display_name || 'Например, Зайка'}
            maxLength={30}
          />
          <Muted>
            Это имя увидите только вы — в приложении и в уведомлениях. Оставьте пустым, чтобы показывалось «{partner.display_name || 'Партнёр'}».
          </Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {['Зайка', 'Солнце', 'Любимая', 'Любимый', 'Котик', 'Жаным'].map((n) => (
              <Pressable key={n} onPress={() => { setNickname(n); setNickSaved(false); }} style={[styles.chip, nickname === n && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Text style={[styles.chipText, nickname === n && { color: '#fff' }]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {nickSaved ? <Muted>Сохранено ✓</Muted> : null}
          <Button title="Сохранить имя" variant="secondary" onPress={saveNickname} loading={nickSaving} />
          <Button title="Выйти из пары" variant="danger" onPress={leave} />
        </Card>
      ) : (
        <>
          {couple ? <InviteCard code={couple.invite_code} inviterName={profile.display_name} /> : null}
          <Button title="Выйти из пары" variant="danger" onPress={leave} />
        </>
      )}

      <SectionLabel>Аккаунт</SectionLabel>
      <Card>
        <Muted>{session?.user.email}</Muted>
        <Button title="Выйти из аккаунта" variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}
