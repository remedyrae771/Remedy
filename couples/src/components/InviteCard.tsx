import { useState } from 'react';
import { Text, View } from 'react-native';
import { copyText, inviteLink, inviteMessage, shareOrCopy } from '../lib/platform';
import { colors, radius, spacing } from '../theme';
import { Button, Card, Muted, styles } from './ui';

/** Приглашение партнёра по ссылке — как реферальная ссылка. */
export default function InviteCard({ code, inviterName }: { code: string; inviterName?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const link = inviteLink(code);

  const share = async () => {
    const result = await shareOrCopy(inviteMessage(code, inviterName), link);
    if (result === 'copied') setStatus('Ссылка скопирована — отправьте её партнёру в любом мессенджере.');
    else if (result === 'shared') setStatus('Отправлено! Как только партнёр зарегистрируется, вы окажетесь в паре.');
  };

  const copy = async () => {
    setStatus((await copyText(link)) ? 'Ссылка скопирована 📋' : 'Не получилось скопировать. Выделите ссылку вручную.');
  };

  return (
    <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
      <Text style={[styles.body, { fontWeight: '700', fontSize: 18 }]}>Пригласите партнёра 💌</Text>
      <Text style={styles.body}>
        Отправьте ссылку. Партнёр откроет её, зарегистрируется — и вы сразу окажетесь в одной паре.
      </Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
        }}
      >
        <Text selectable style={{ color: colors.primary, fontSize: 14 }}>
          {link}
        </Text>
      </View>
      <Button title="Отправить приглашение" onPress={share} />
      <Button title="Скопировать ссылку" variant="secondary" onPress={copy} />
      {status ? <Muted>{status}</Muted> : null}
      <Muted>Или пусть партнёр введёт код вручную: {code}</Muted>
    </Card>
  );
}
