import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { colors } from '../theme';
import { isSupabaseConfigured } from '../lib/supabase';
import SetupNeeded from '../components/SetupNeeded';
// Импорт ради побочного эффекта: сохраняет код приглашения из адреса (?join=…) при запуске.
import '../lib/invite';
import { registerServiceWorker } from '../lib/push';

registerServiceWorker();

function RootNavigator() {
  const { session, profile, loading } = useAuth();

  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (loading) return <Loading />;

  const signedIn = Boolean(session);
  const paired = Boolean(profile?.couple_id);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="join" />

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !paired}>
        <Stack.Screen name="pair" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && paired}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="list/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Настройки', presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
