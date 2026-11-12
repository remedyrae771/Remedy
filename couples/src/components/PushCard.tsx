import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push';
import { colors, shadows, spacing } from '../theme';
import { Button, Muted, styles } from './ui';

const TEXT: Record<PushState, { title: string; body: string }> = {
  off: { title: 'Включите уведомления 🔔', body: 'Узнавайте сразу, когда партнёр пишет, думает о вас или ответил на вопрос дня.' },
  on: { title: 'Уведомления включены 🔔', body: 'Сообщения, «Думаю о тебе», ответы на вопрос дня и смена настроения партнёра.' },
  'needs-install': {
    title: 'Уведомления на iPhone 🔔',
    body: 'Добавьте Remedy на экран «Домой»: в Safari нажмите «Поделиться» → «На экран „Домой“», откройте приложение с иконки и включите уведомления здесь.',
  },
  denied: {
    title: 'Уведомления запрещены',
    body: 'Разрешите их в настройках телефона: Настройки → Уведомления → Remedy. Затем вернитесь сюда.',
  },
  unsupported: { title: 'Уведомления недоступны', body: 'Этот браузер не умеет получать уведомления. Откройте Remedy в Safari или Chrome.' },
};

/** Карточка включения push-уведомлений. compact — для главного экрана: скрывается, когда всё включено. */
export default function PushCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  if (!state || hidden) return null;
  if (compact && (state === 'on' || state === 'unsupported')) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      setError((e as Error).message || 'Не получилось включить уведомления.');
    } finally {
      setBusy(false);
    }
  };

  const { title, body } = TEXT[state];
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: spacing.lg,
        gap: spacing.sm,
        boxShadow: shadows.card,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.9)',
      }}
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, flex: 1 }}>{title}</Text>
        {compact ? (
          <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Скрыть">
            <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.body, { fontSize: 15 }]}>{body}</Text>
      {state === 'off' || state === 'on' ? (
        <Button
          title={state === 'on' ? 'Выключить уведомления' : 'Включить уведомления'}
          variant={state === 'on' ? 'secondary' : 'primary'}
          onPress={toggle}
          loading={busy}
        />
      ) : null}
      {error ? <Muted>{error}</Muted> : null}
    </View>
  );
}
