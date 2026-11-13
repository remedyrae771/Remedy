import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

const PresenceContext = createContext({ partnerOnline: false });

const TOUCH_EVERY_MS = 5 * 60 * 1000;

/**
 * «В сети» и «был(а) в сети»:
 *  - пока приложение открыто, держим присутствие в realtime-канале пары — партнёр видит «в сети»;
 *  - время последнего визита пишем в profiles.last_seen_at раз в 5 минут и при сворачивании.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  const coupleId = profile?.couple_id ?? null;
  const [partnerOnline, setPartnerOnline] = useState(false);

  useEffect(() => {
    if (!userId || !coupleId) return;

    const touch = () => {
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then(() => {});
    };

    const channel = supabase.channel(`presence-${coupleId}`, { config: { presence: { key: userId } } });
    const sync = () => {
      const state = channel.presenceState();
      setPartnerOnline(Object.keys(state).some((key) => key !== userId));
    };
    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && AppState.currentState === 'active') channel.track({ at: Date.now() });
      });

    touch();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') touch();
    }, TOUCH_EVERY_MS);

    // В браузере AppState следит за видимостью вкладки, на телефоне — за сворачиванием приложения.
    const sub = AppState.addEventListener('change', (state) => {
      touch();
      if (state === 'active') channel.track({ at: Date.now() });
      else channel.untrack();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
      touch();
      supabase.removeChannel(channel);
      setPartnerOnline(false);
    };
  }, [userId, coupleId]);

  return <PresenceContext.Provider value={{ partnerOnline }}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  return useContext(PresenceContext);
}
