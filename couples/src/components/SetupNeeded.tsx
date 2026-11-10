import { Text } from 'react-native';
import { Card, Screen, Title, styles } from './ui';

/** Показывается, если не заданы ключи Supabase в .env. */
export default function SetupNeeded() {
  return (
    <Screen>
      <Title subtitle="Приложению нужен бэкенд Supabase">Почти готово 💞</Title>
      <Card>
        <Text style={styles.body}>
          1. Создайте проект на supabase.com.{'\n'}
          2. Выполните SQL из supabase/migrations/0001_init.sql.{'\n'}
          3. Скопируйте .env.example в .env и укажите EXPO_PUBLIC_SUPABASE_URL и
          EXPO_PUBLIC_SUPABASE_ANON_KEY.{'\n'}
          4. Перезапустите npx expo start.
        </Text>
      </Card>
    </Screen>
  );
}
