import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Loading } from '../components/ui';
import { clearPendingInvite, savePendingInvite } from '../lib/invite';
import { useAuth } from '../providers/AuthProvider';

/**
 * Точка входа по ссылке-приглашению: /join?code=ABC123.
 * Запоминаем код и отправляем человека на регистрацию; присоединение к паре
 * произойдёт автоматически на экране pair после входа.
 */
export default function Join() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (code) await savePendingInvite(String(code));
      if (!session) router.replace({ pathname: '/sign-in', params: code ? { invited: '1' } : {} });
      else if (!profile?.couple_id) router.replace('/pair');
      else {
        await clearPendingInvite();
        router.replace('/');
      }
    })();
  }, [code, session, profile?.couple_id, loading]);

  return <Loading />;
}
