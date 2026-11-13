import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Couple, Profile } from '../lib/types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  couple: Couple | null;
  partner: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'display_name' | 'mood' | 'mood_note' | 'mood_updated_at' | 'partner_nickname' | 'notify_prefs' | 'chat_wallpaper'>>) => Promise<void>;
  updateCouple: (patch: Partial<Pick<Couple, 'started_on' | 'pet_name' | 'pet_kind'>>) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  // Для какого пользователя уже загружены профиль и пара (undefined — ещё ни для какого).
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setCouple(null);
      setPartner(null);
      setLoadedFor(null);
      return;
    }

    const { data: me } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle<Profile>();
    setProfile(me ?? null);

    if (me?.couple_id) {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('couples').select('*').eq('id', me.couple_id).maybeSingle<Couple>(),
        supabase.from('profiles').select('*').eq('couple_id', me.couple_id).neq('id', userId).maybeSingle<Profile>(),
      ]);
      setCouple(c ?? null);
      setPartner(p ?? null);
    } else {
      setCouple(null);
      setPartner(null);
    }
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  // Следим за изменениями профилей пары (партнёр присоединился, сменил настроение).
  const coupleId = profile?.couple_id ?? null;
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`couple-profiles-${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `couple_id=eq.${coupleId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, refresh]);

  const updateProfile = useCallback<AuthState['updateProfile']>(
    async (patch) => {
      if (!userId) return;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single<Profile>();
      if (error) throw error;
      setProfile(data);
    },
    [userId],
  );

  const updateCouple = useCallback<AuthState['updateCouple']>(
    async (patch) => {
      if (!couple) return;
      const { data, error } = await supabase.from('couples').update(patch).eq('id', couple.id).select().single<Couple>();
      if (error) throw error;
      setCouple(data);
    },
    [couple],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      couple,
      partner,
      loading: !sessionLoaded || (Boolean(session) && loadedFor !== userId),
      refresh,
      updateProfile,
      updateCouple,
      signOut,
    }),
    [session, profile, couple, partner, sessionLoaded, loadedFor, userId, refresh, updateProfile, updateCouple, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Данные пары для экранов внутри приложения (гарантированно есть пара). */
export function useCouple() {
  const { session, profile, couple, partner } = useAuth();
  if (!session || !profile?.couple_id) throw new Error('useCouple requires a paired user');
  return {
    userId: session.user.id,
    coupleId: profile.couple_id,
    profile,
    couple,
    partner,
    /** Имя партнёра для показа: моё прозвище для него, иначе его собственное имя. */
    partnerName: profile.partner_nickname?.trim() || partner?.display_name?.trim() || 'Партнёр',
  };
}
